import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  instantiate,
  itemPoints,
  loadFactor,
  movementTotals,
  perAthleteUnits,
  prescribedTotal,
  relativeLoad,
  teamUnits,
  weekDays,
} from './calc'
import { COMPETITION_DATE, defaultAthletes, defaultSessions, defaultState, HISTORICAL, TEMPLATES, template } from './data'
import { generateWod } from './generator'
import { ALL_EQUIPMENT } from './movements'
import { assessSession, assessWeek, DEFAULT_CONFIG, lightenDay, readiness, saferAlternative } from './risk'
import type { RiskContext } from './risk'
import { buildBrief } from './brief'
import { decodeAthlete, decodeProposal, decodeState, decodeWod, encodeAthlete, encodeProposal, encodeState, encodeWod, mergeAthlete, parseJSONState, sanitizeState, sanitizeWod } from './share'
import { isValidTeamCode, mergeDoc, newTeamCode, normalizeTeamCode, sanitizeDoc, sectionHashes, stampChanges, toDoc } from './sync'
import { generateTeamSession } from './teamSession'
import { bottlenecks, distribution, pairInsights } from './strategy'
import type { Wod } from './types'

const athletes = defaultAthletes()
const ctx = (daysOut: number): RiskContext => ({ daysOut, athletes, config: DEFAULT_CONFIG })
const tpl = (id: string): Wod => instantiate(template(id)!.wod)

function withItem(wod: Wod, movementId: string, patch: Partial<Wod['items'][number]>): Wod {
  return { ...wod, items: wod.items.map((i) => (i.movementId === movementId ? { ...i, ...patch } : i)) }
}

describe('calculs de WOD', () => {
  const a = tpl('tpl-a')
  const t2b = a.items[0]
  const pullups = a.items[2]

  it('synchro : chaque athlète fait toutes les reps', () => {
    expect(prescribedTotal(t2b, a)).toBe(24)
    expect(perAthleteUnits(t2b, a)).toBe(24)
    expect(teamUnits(t2b, a)).toBe(48)
  })

  it('partagé : les reps sont réparties', () => {
    expect(perAthleteUnits(pullups, a)).toBe(8)
    expect(teamUnits(pullups, a)).toBe(24)
  })

  it('athlètes non précisés : répartition sur toute l’équipe', () => {
    const h1 = HISTORICAL[0].wod
    const echo = h1.items.find((i) => i.movementId === 'echo')!
    expect(perAthleteUnits(echo, h1)).toBe(30)
  })

  it('zéro tour : volume nul, sans NaN', () => {
    const zero = { ...a, rounds: 0 }
    expect(perAthleteUnits(t2b, zero)).toBe(0)
    const res = assessSession(zero, ctx(5))
    expect(res.volume).toBe(0)
    expect(Number.isFinite(res.score)).toBe(true)
    expect(res.warnings.some((w) => w.id === 'zero-rounds')).toBe(true)
  })

  it('valeurs aberrantes : négatif, NaN, texte → 0', () => {
    const odd = withItem(a, 't2b', { qty: -5 })
    expect(perAthleteUnits(odd.items[0], odd)).toBe(0)
    const nan = withItem(a, 't2b', { qty: Number.NaN })
    expect(Number.isFinite(assessSession(nan, ctx(5)).score)).toBe(true)
    const inf = { ...a, rounds: Number.POSITIVE_INFINITY }
    expect(Number.isFinite(assessSession(inf, ctx(5)).score)).toBe(true)
  })

  it('répétitions inhabituelles (1 rep, 997 reps, décimales)', () => {
    expect(perAthleteUnits({ ...pullups, qty: 1 }, a)).toBeCloseTo(2 / 3)
    expect(teamUnits({ ...t2b, qty: 997 }, a)).toBe(997 * 2 * 2)
    expect(perAthleteUnits({ ...t2b, qty: 7.5 }, a)).toBe(15)
  })

  it('charge relative : 1RM connu, inconnu, charge extrême', () => {
    const h3 = HISTORICAL[2].wod
    const lunge = h3.items.find((i) => i.movementId === 'oh_lunge')!
    const rl = relativeLoad(lunge, athletes)
    expect(rl.rel).toBeCloseTo(0.8)
    expect(rl.who).toBe('Anas')
    expect(rl.missing).toBe(true) // 1RM des deux athlètes féminines non renseigné

    const squat = h3.items.find((i) => i.movementId === 'back_squat')!
    const rs = relativeLoad(squat, athletes)
    expect(rs.rel).toBeNull()
    expect(rs.heavyUnknown).toBe(true)
    expect(loadFactor(rs)).toBe(1.5)

    const extreme = relativeLoad({ ...lunge, loadM: 900 }, athletes)
    expect(loadFactor(extreme)).toBe(2.2)
    expect(itemPoints({ ...lunge, loadM: 900 }, h3, athletes)).toBeGreaterThan(0)
  })

  it('1RM manquant et charge légère : pas de pénalité, mais signalé', () => {
    const c = tpl('tpl-c')
    const res = assessSession(c, ctx(4))
    expect(res.warnings.some((w) => w.id.startsWith('rm-missing-'))).toBe(true)
    expect(res.level).toBe('green')
  })

  it('dates : semaine de J-5 au jour J', () => {
    const days = weekDays(COMPETITION_DATE)
    expect(days).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'])
    expect(daysBetween('2026-11-23', COMPETITION_DATE)).toBe(5)
    expect(addDays('2026-11-28', 3)).toBe('2026-12-01')
  })

  it('volume de référence figé à la création', () => {
    expect(movementTotals(a)).toEqual({ t2b: 24, burpee_bj: 16, pullup: 24 })
    expect(a.baseline).toEqual({ t2b: 24, burpee_bj: 16, pullup: 24 })
  })
})

describe('Fatigue Guard : calibration', () => {
  it('les trois modèles sont verts de lundi à mercredi', () => {
    for (const id of ['tpl-a', 'tpl-b', 'tpl-c']) {
      for (const d of [5, 4, 3]) {
        const res = assessSession(tpl(id), ctx(d))
        expect(`${id} J-${d} ${res.level}`).toBe(`${id} J-${d} green`)
      }
    }
  })

  it('le plan par défaut est vert chaque jour et sur la semaine', () => {
    const week = assessWeek({
      competitionDate: COMPETITION_DATE,
      sessions: defaultSessions(COMPETITION_DATE),
      athletes,
      config: DEFAULT_CONFIG,
    })
    for (const d of week.days) expect(`${d.date} ${d.level}`).toBe(`${d.date} green`)
    expect(week.level).toBe('green')
    expect(week.total).toBeLessThan(DEFAULT_CONFIG.weekAmber)
    expect(readiness(week, athletes, DEFAULT_CONFIG).level).toBe('green')
  })

  it('les WODs de compétition à pleine intensité sont rouges', () => {
    for (const h of HISTORICAL.filter((x) => x.id !== 'h2')) {
      expect(assessSession(h.wod, ctx(3)).level).toBe('red')
    }
  })

  it('le score augmente quand la compétition approche', () => {
    const scores = [5, 4, 3, 2, 1].map((d) => assessSession(tpl('tpl-a'), ctx(d)).score)
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1])
  })

  it('l’arrêt récent majore le score', () => {
    const rested = athletes.map((a) => ({ ...a, breakWeeks: 0 }))
    const withBreak = assessSession(tpl('tpl-a'), ctx(5)).score
    const without = assessSession(tpl('tpl-a'), { ...ctx(5), athletes: rested }).score
    expect(withBreak / without).toBeCloseTo(DEFAULT_CONFIG.inactivityFactor)
  })

  it('seuils configurables : un seuil plus bas change le niveau', () => {
    const strict = { ...DEFAULT_CONFIG, amber: 30, red: 60 }
    expect(assessSession(tpl('tpl-a'), { ...ctx(5), config: strict }).level).toBe('red')
  })
})

describe('Fatigue Guard : alertes', () => {
  it('+60 % de burpees : alerte avec le pourcentage et retour au modèle', () => {
    const a = tpl('tpl-a')
    const more = withItem(a, 'burpee_bj', { qty: 13 }) // 8 → 13 : +63 %
    const res = assessSession(more, ctx(4))
    const w = res.warnings.find((x) => x.id === 'increase-burpee_bj')
    expect(w).toBeDefined()
    expect(w!.title).toContain('63 %')
    expect(res.level).not.toBe('green')
    const fixed = w!.fix!(more)
    expect(fixed.items[1].qty).toBe(8)
  })

  it('back squats lourds à 48 h : rouge', () => {
    const c = withItem(tpl('tpl-c'), 'back_squat', { loadM: 120, loadF: 80, qty: 10 })
    const res = assessSession(c, ctx(2))
    const w = res.warnings.find((x) => x.id.startsWith('heavy-legs-'))
    expect(w?.severity).toBe('red')
    expect(w!.title).toContain('48 h')
    const fixed = w!.fix!(c)
    const squat = fixed.items.find((i) => i.movementId === 'back_squat')!
    expect(squat.qty).toBeLessThanOrEqual(6)
    expect(squat.loadM!).toBeLessThan(120)
  })

  it('tentative maximale : rouge quel que soit le jour', () => {
    const c = withItem(tpl('tpl-c'), 'oh_lunge', { loadM: 72.5 })
    const w = assessSession(c, ctx(5)).warnings.find((x) => x.id.startsWith('max-'))
    expect(w?.severity).toBe('red')
    const fixed = w!.fix!(c)
    expect(fixed.items.find((i) => i.movementId === 'oh_lunge')!.loadM).toBe(52.5) // 70 % de 75
  })

  it('RPE élevé près de la compétition', () => {
    expect(assessSession({ ...tpl('tpl-a'), rpe: 9 }, ctx(5)).level).toBe('red')
    expect(assessSession({ ...tpl('tpl-activation'), rpe: 6 }, ctx(1)).level).toBe('amber')
    expect(assessSession({ ...tpl('tpl-activation'), rpe: 7 }, ctx(1)).level).toBe('red')
    const w = assessSession({ ...tpl('tpl-a'), rpe: 8 }, ctx(3)).warnings.find((x) => x.id === 'intensity')!
    expect(w.fix!({ ...tpl('tpl-a'), rpe: 8 }).rpe).toBe(6)
  })

  it('gros volume de gym : alerte et réduction', () => {
    const a = withItem(tpl('tpl-a'), 't2b', { qty: 40 })
    const res = assessSession(a, ctx(5))
    const w = res.warnings.find((x) => x.id === 'gym-volume')!
    expect(w.severity).toBe('red')
    const fixed = assessSession(w.fix!(a), ctx(5))
    expect(fixed.warnings.some((x) => x.id === 'gym-volume')).toBe(false)
  })

  it('grip + overhead cumulés', () => {
    const b = { ...tpl('tpl-b'), rounds: 5 }
    expect(assessSession(b, ctx(5)).warnings.some((x) => x.id === 'grip-overhead')).toBe(true)
  })

  it('douleur signalée : orange, sans correctif automatique', () => {
    const hurt = athletes.map((a, i) => (i === 1 ? { ...a, recovery: { ...a.recovery, pain: 'épaule droite' } } : a))
    const res = assessSession(tpl('tpl-c'), { ...ctx(4), athletes: hurt })
    const w = res.warnings.find((x) => x.id === 'pain')!
    expect(w.severity).toBe('amber')
    expect(w.fix).toBeUndefined()
    expect(w.explanation).toContain('épaule droite')
  })

  it('règle contradictoire : synchro avec un seul athlète', () => {
    const a = withItem(tpl('tpl-a'), 't2b', { athletes: 1 })
    const w = assessSession(a, ctx(5)).warnings.find((x) => x.id.startsWith('sync-solo-'))!
    expect(w.severity).toBe('info')
    expect(w.fix!(a).items[0].athletes).toBe(2)
  })

  it('chaque alerte orange ou rouge est expliquée et actionnable', () => {
    const heavy = { ...HISTORICAL[2].wod }
    for (const w of assessSession(heavy, ctx(2)).warnings.filter((x) => x.severity !== 'info')) {
      expect(w.explanation.length).toBeGreaterThan(20)
      expect(w.suggestions.length).toBeGreaterThan(0)
      expect(w.contributors.length).toBeGreaterThan(0)
    }
  })

  it('profils inconnus : aucune exception, aucune valeur inventée', () => {
    const blank = athletes.map((a) => ({ ...a, rm: {}, unbroken: {}, competency: {} }))
    const res = assessSession(HISTORICAL[2].wod, { ...ctx(4), athletes: blank })
    expect(Number.isFinite(res.score)).toBe(true)
    expect(assessSession(tpl('tpl-a'), { ...ctx(4), athletes: [] }).level).toBe('green')
  })
})

describe('alternative plus sûre', () => {
  const cases: [string, Wod, number][] = [
    ['WOD 1 complet à J-2', HISTORICAL[0].wod, 2],
    ['WOD final complet à J-1', HISTORICAL[2].wod, 1],
    ['WOD final complet à J-4', HISTORICAL[2].wod, 4],
    ['modèle A gonflé', { ...tpl('tpl-a'), rounds: 6, rpe: 9 }, 3],
    ['modèle B à RPE 10 la veille', { ...tpl('tpl-b'), rpe: 10, rounds: 6 }, 1],
  ]
  for (const [label, wod, d] of cases) {
    it(`${label} → vert`, () => {
      const res = saferAlternative(wod, ctx(d))
      expect(res.before.level).toBe('red')
      expect(res.after.level).toBe('green')
      expect(res.after.score).toBeLessThan(res.before.score)
      expect(res.changes.length).toBeGreaterThan(0)
      expect(res.wod.items.map((i) => i.movementId)).toEqual(wod.items.map((i) => i.movementId))
      for (const i of res.wod.items) expect(Number.isInteger(i.qty) || i.qty === 0).toBe(true)
    })
  }

  it('séance déjà verte : aucun changement', () => {
    const res = saferAlternative(tpl('tpl-c'), ctx(4))
    expect(res.changes).toEqual([])
    expect(res.after.level).toBe('green')
  })

  it('douleur signalée : le niveau résiduel reste orange, sans boucle infinie', () => {
    const hurt = athletes.map((a, i) => (i === 0 ? { ...a, recovery: { ...a.recovery, pain: 'genou' } } : a))
    const res = saferAlternative(HISTORICAL[0].wod, { ...ctx(3), athletes: hurt })
    expect(res.after.level).toBe('amber')
    expect(res.after.warnings.filter((w) => w.severity !== 'info').map((w) => w.id)).toEqual(['pain'])
  })

  it('ne modifie pas la séance d’origine', () => {
    const original = { ...tpl('tpl-a'), rounds: 6, rpe: 9 }
    const snapshot = JSON.stringify(original)
    saferAlternative(original, ctx(2))
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('zéro tour et charges extrêmes', () => {
    const odd = withItem({ ...tpl('tpl-c'), rounds: 0 }, 'back_squat', { loadM: 999, loadF: 999, qty: 500 })
    const res = saferAlternative(odd, ctx(2))
    expect(res.wod.rounds).toBe(1)
    expect(res.after.level).toBe('green')
  })
})

describe('semaine', () => {
  const base = () => defaultSessions(COMPETITION_DATE)
  const week = (sessions = base()) =>
    assessWeek({ competitionDate: COMPETITION_DATE, sessions, athletes, config: DEFAULT_CONFIG })

  it('séance exigeante ajoutée jeudi ou vendredi : alerte', () => {
    for (const date of ['2026-11-26', '2026-11-27']) {
      const sessions = [...base(), { id: 'x', date, wod: tpl('tpl-a'), done: false }]
      const day = week(sessions).days.find((d) => d.date === date)!
      expect(day.level).not.toBe('green')
      expect(day.warnings.some((w) => w.id.startsWith('late-'))).toBe(true)
    }
  })

  it('parties cumulées trop lourdes : alerte sur la séance complète', () => {
    const sessions = [...base(), { id: 'x', date: '2026-11-23', wod: tpl('tpl-b'), done: false }, { id: 'y', date: '2026-11-23', wod: tpl('tpl-a'), done: false }]
    const day = week(sessions).days[0]
    expect(day.warnings.some((w) => w.id.startsWith('day-total-'))).toBe(true)
    expect(day.level).not.toBe('green')
    const lighter = lightenDay(sessions.map((s) => s.wod), ctx(5))
    const total = lighter.reduce((s, w) => s + assessSession(w, ctx(5)).score, 0)
    expect(total).toBeLessThan(DEFAULT_CONFIG.dayAmber)
  })

  it('compenser la pause par du volume : charge hebdomadaire signalée', () => {
    const sessions = base()
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25']) {
      sessions.push({ id: `x${date}`, date, wod: tpl('tpl-b'), done: false })
      sessions.push({ id: `y${date}`, date, wod: tpl('tpl-a'), done: false })
    }
    const w = week(sessions)
    expect(w.warnings.some((x) => x.id === 'week-total')).toBe(true)
    expect(readiness(w, athletes, DEFAULT_CONFIG).score).toBeLessThan(75)
  })

  it('RPE réel d’une séance faite pris en compte', () => {
    const sessions = base()
    const planned = week(sessions).days[0].score
    sessions[0] = { ...sessions[0], done: true, actualRpe: 9 }
    expect(week(sessions).days[0].score).toBeGreaterThan(planned)
  })

  it('semaine vide : fraîcheur maximale moins la reprise', () => {
    const r = readiness(week([]), athletes, DEFAULT_CONFIG)
    expect(r.score).toBe(95)
    expect(r.recoveryProvided).toBe(false)
  })
})

describe('générateur', () => {
  it('produit une séance valide pour chaque objectif, matériel complet', () => {
    for (const objective of ['sync', 'gym', 'engine', 'strength', 'transitions', 'rehearsal', 'recovery'] as const) {
      const wod = generateWod({ objective, minutes: 8, teamSize: 3, equipment: ALL_EQUIPMENT, intensity: 'moderate', variant: 0 })
      expect(wod.items.length).toBeGreaterThanOrEqual(2)
      expect(wod.capMin).toBe(8)
      expect(sanitizeWod(wod)).not.toBeNull()
      expect(assessSession(wod, ctx(4)).level).not.toBe('red')
    }
  })

  it('respecte le matériel disponible', () => {
    const wod = generateWod({ objective: 'engine', minutes: 10, teamSize: 3, equipment: ['ski'], intensity: 'moderate', variant: 0 })
    const ids = wod.items.map((i) => i.movementId)
    expect(ids).not.toContain('echo')
    expect(ids).not.toContain('row')
    expect(ids).not.toContain('sb_carry')
  })

  it('sans matériel : repli sur le poids du corps', () => {
    const wod = generateWod({ objective: 'strength', minutes: 8, teamSize: 3, equipment: [], intensity: 'moderate', variant: 0 })
    expect(wod.items.length).toBeGreaterThan(0)
  })

  it('athlète seul : pas de synchro', () => {
    const wod = generateWod({ objective: 'sync', minutes: 8, teamSize: 1, equipment: ALL_EQUIPMENT, intensity: 'light', variant: 2 })
    expect(wod.items.every((i) => !i.sync && i.athletes === 1)).toBe(true)
  })

  it('la variante change la proposition', () => {
    const a = generateWod({ objective: 'sync', minutes: 8, teamSize: 3, equipment: ALL_EQUIPMENT, intensity: 'moderate', variant: 0 })
    const b = generateWod({ objective: 'sync', minutes: 8, teamSize: 3, equipment: ALL_EQUIPMENT, intensity: 'moderate', variant: 1 })
    expect(a.items.map((i) => i.movementId)).not.toEqual(b.items.map((i) => i.movementId))
  })
})

describe('stratégie', () => {
  it('ne désigne pas de meilleure paire sans données', () => {
    const list = pairInsights(athletes, 't2b')
    expect(list).toHaveLength(3)
    for (const p of list) {
      expect(p.status).toBe('insufficient')
      expect(p.fact).toContain('Données insuffisantes')
    }
  })

  it('paires documentées quand les niveaux sont déclarés', () => {
    const known = athletes.map((a, i) => ({ ...a, competency: { ...a.competency, t2b: i === 2 ? ('difficult' as const) : ('comfortable' as const) } }))
    const list = pairInsights(known, 't2b')
    expect(list[0].status).toBe('declared')
    expect(list[1].fact).toContain('Natalia donnera le rythme')
  })

  it('répartition : synchro = tout pour chacun, partage égal tant que la règle est inconnue', () => {
    const h1 = HISTORICAL[0].wod
    const scenario = { assign: { 'h1-t2b': ['a1', 'a2'], 'h1-pu': ['a1', 'a2', 'a3'] }, split: { 'h1-pu': { a1: 40, a2: 10, a3: 10 } }, notes: {} }
    const locked = distribution(h1, scenario, athletes, {})
    expect(locked.per.a1.lines).toContain('60 Toes-to-Bar')
    expect(locked.per.a1.lines).toContain('20 Pull-Up')
    expect(locked.issues.some((i) => i.text.includes('règle de partage'))).toBe(true)
    const free = distribution(h1, scenario, athletes, { 'h1-pu': 'free' })
    expect(free.per.a1.lines).toContain('40 Pull-Up')
    expect(free.per.a3.lines).toContain('10 Pull-Up')
  })

  it('signale le mauvais nombre d’athlètes et les mouvements non acquis', () => {
    const h3 = HISTORICAL[2].wod
    const d = distribution(h3, { assign: { 'h3-rmu': ['a1'], 'h3-lunge': ['a1'] }, split: {}, notes: {} }, athletes, {})
    expect(d.issues.some((i) => i.severity === 'red' && i.text.includes('Ring Muscle-Up'))).toBe(true)
    expect(d.issues.some((i) => i.text.includes('les notes indiquent 2 athlètes'))).toBe(true)
    expect(d.issues.some((i) => i.text.includes('80 % du 1RM'))).toBe(true)
    expect(d.unassigned).toBe(3)
  })

  it('point bloquant principal : les ring muscle-ups', () => {
    const top = bottlenecks(athletes)[0]
    expect(top.movementId).toBe('rmu')
    expect(top.severity).toBe('red')
  })
})

describe('partage et persistance', () => {
  it('aller-retour du plan complet par lien', () => {
    const state = defaultState()
    state.athletes[1].name = 'Léa'
    state.athletes[1].competency.t2b = 'manageable'
    state.strategies.h1 = { active: 'B', A: { assign: { 'h1-t2b': ['a1', 'a2'] }, split: {}, notes: {} }, B: { assign: {}, split: {}, notes: { 'h1-echo': 'relais de 10 cal' } } }
    state.splitRules['h1-pu'] = 'free'
    const data = encodeState(state)
    expect(data).toMatch(/^[A-Za-z0-9+\-$]+$/)
    expect(data.length).toBeLessThan(6000)
    expect(decodeState(data)).toEqual(JSON.parse(JSON.stringify(state)))
  })

  it('aller-retour d’un mini-WOD par lien', () => {
    const wod = tpl('tpl-b')
    expect(decodeWod(encodeWod(wod))).toEqual(wod)
  })

  it('lien corrompu ou vide : null, jamais d’exception', () => {
    expect(decodeState('')).toBeNull()
    expect(decodeState('pas-un-lien-valide!!')).toBeNull()
    expect(decodeWod('%%%')).toBeNull()
    expect(parseJSONState('{oops')).toBeNull()
    expect(parseJSONState('[1,2,3]')).toBeNull()
    expect(sanitizeState(null)).toBeNull()
  })

  it('données malformées : nettoyées et bornées', () => {
    const state = sanitizeState({
      competitionDate: 'demain',
      athletes: [{ name: 'X'.repeat(500), sex: 'Z', rm: { backSquat: -40, snatch: 'abc' }, competency: { t2b: 'expert', nope: 'comfortable' } }],
      sessions: [{ date: '2026-11-24', wod: { rounds: 9999, rpe: 42, items: [{ movementId: 'inconnu', qty: 5 }, { movementId: 'burpee', qty: -3, athletes: 12 }] } }, { date: 'x' }],
      config: { amber: -5, red: 'beaucoup' },
    })!
    expect(state.competitionDate).toBe(COMPETITION_DATE)
    expect(state.athletes[0].name).toHaveLength(40)
    expect(state.athletes[0].sex).toBe('F')
    expect(state.athletes[0].rm).toEqual({})
    expect(state.athletes[0].competency).toEqual({})
    expect(state.sessions).toHaveLength(1)
    const wod = state.sessions[0].wod
    expect(wod.rounds).toBe(50)
    expect(wod.rpe).toBe(10)
    expect(wod.items).toHaveLength(1)
    expect(wod.items[0]).toMatchObject({ movementId: 'burpee', qty: 0, athletes: 3 })
    expect(state.config.amber).toBe(10)
    expect(state.config.red).toBeGreaterThan(state.config.amber)
  })

  it('aucune performance inventée pour les athlètes 2 et 3', () => {
    for (const a of defaultAthletes().slice(1)) {
      expect(a.rm).toEqual({})
      expect(a.unbroken).toEqual({})
      expect(a.competency).toEqual({})
      expect(a.level).toBe('Entre Inter et RX')
    }
  })

  it('modèles conformes au cahier des charges', () => {
    const [a, b, c] = TEMPLATES
    expect(a.wod.items.map((i) => [i.movementId, i.qty, i.sync])).toEqual([['t2b', 12, true], ['burpee_bj', 8, true], ['pullup', 12, false]])
    expect([a.wod.rounds, a.wod.capMin]).toEqual([2, 8])
    expect(b.wod.items.map((i) => [i.movementId, i.qty])).toEqual([['ski', 150], ['db_snatch', 10], ['sb_carry', 10], ['sb_squat', 10]])
    expect([b.wod.format, b.wod.capMin]).toEqual(['amrap', 8])
    expect(c.wod.items.map((i) => [i.movementId, i.qty])).toEqual([['db_cj', 12], ['oh_lunge', 12], ['burpee_bar', 9], ['back_squat', 6], ['rmu_drill', 6]])
    expect(c.wod.capMin).toBe(8)
  })
})

describe('alternative plus sûre : sobriété', () => {
  it('ne modifie que ce qui déclenche l’alerte', () => {
    const more = withItem(tpl('tpl-a'), 'burpee_bj', { qty: 13 })
    const res = saferAlternative(more, ctx(5))
    expect(res.after.level).toBe('green')
    expect(res.changes).toEqual(['Burpee Box Jump : 13 → 8'])
  })
})

describe('séance d’équipe en 3 parties', () => {
  const gen = (over: Partial<Parameters<typeof generateTeamSession>[0]> = {}) =>
    generateTeamSession({ athletes, daysOut: 4, config: DEFAULT_CONFIG, minutes: 45, intensity: 'moderate', equipment: ALL_EQUIPMENT, ...over })
  const total = (parts: Wod[], d: number, team = athletes) => parts.reduce((s, w) => s + assessSession(w, { ...ctx(d), athletes: team }).score, 0)

  it('trois parties, une par WOD de référence', () => {
    const { parts, reasons, restMin } = gen()
    expect(parts.map((p) => p.name)).toEqual(['Partie 1 · Gym & synchro', 'Partie 2 · Ski & sandbag', 'Partie 3 · Final allégé'])
    expect(parts.map((p) => p.note!.slice(0, 16))).toEqual(['Inspiré du WOD 1', 'Inspiré du WOD 2', 'Inspiré du WOD F'])
    expect(restMin).toBe(5)
    expect(reasons.length).toBeGreaterThan(2)
    for (const p of parts) expect(sanitizeWod(p)).not.toBeNull()
  })

  it('reste verte quel que soit le jour choisi, partie par partie et au total', () => {
    for (const d of [5, 4, 3, 2, 1]) {
      const { parts } = gen({ daysOut: d, intensity: d <= 2 ? 'light' : 'moderate' })
      expect(total(parts, d)).toBeLessThan(DEFAULT_CONFIG.dayAmber)
      for (const p of parts) expect(`J-${d} ${p.name} ${assessSession(p, ctx(d)).scoreLevel}`).toBe(`J-${d} ${p.name} green`)
    }
  })

  it('ring muscle-ups non acquis : remplacés par un drill, avec l’explication', () => {
    const { parts, reasons } = gen()
    const ids = parts[2].items.map((i) => i.movementId)
    expect(ids).toContain('rmu_drill')
    expect(ids).not.toContain('rmu')
    expect(reasons.some((r) => r.includes('Ring Muscle-Up remplacé') && r.includes('Anas') && r.includes('Rebecca et Natalia'))).toBe(true)
  })

  it('ring muscle-ups gardés si une athlète les déclare acquis', () => {
    const team = athletes.map((a) => (a.id === 'a2' ? { ...a, competency: { ...a.competency, rmu: 'comfortable' as const } } : a))
    const { parts } = gen({ athletes: team })
    const rmu = parts[2].items.find((i) => i.movementId === 'rmu')!
    expect(rmu.note).toContain('Sans Anas')
    expect(rmu.note).toContain('À l’aise : Rebecca')
  })

  it('binômes synchro tournants pour tester les trois paires', () => {
    const { parts } = gen()
    const t2b = parts[0].items.find((i) => i.movementId === 't2b')!
    expect(t2b.sync).toBe(true)
    expect(t2b.note).toBe('Binôme tournant : Anas+Rebecca, Anas+Natalia, Rebecca+Natalia')
  })

  it('mouvement difficile : volume réduit ; non acquis : exclu du binôme', () => {
    const team = athletes.map((a) => (a.id === 'a3' ? { ...a, competency: { ...a.competency, t2b: 'not_yet' as const, pullup: 'difficult' as const } } : a))
    const base = gen()
    const adapted = gen({ athletes: team })
    const t2b = adapted.parts[0].items.find((i) => i.movementId === 't2b')!
    expect(t2b.note).toContain('Binôme : Anas + Rebecca')
    expect(adapted.parts[0].items.find((i) => i.movementId === 'pullup')!.qty).toBeLessThan(base.parts[0].items.find((i) => i.movementId === 'pullup')!.qty)
  })

  it('matériel manquant : remplacement ou retrait expliqué', () => {
    const { parts, reasons } = gen({ equipment: ALL_EQUIPMENT.filter((e) => e !== 'bike' && e !== 'sandbag') })
    const ids = parts.flatMap((p) => p.items.map((i) => i.movementId))
    expect(ids).not.toContain('echo')
    expect(ids).toContain('row')
    expect(ids).not.toContain('sb_squat')
    expect(reasons.some((r) => r.includes('Echo Bike remplacé par Rameur'))).toBe(true)
  })

  it('profils vides ou équipe incomplète : aucune exception', () => {
    expect(gen({ athletes: [] }).parts).toHaveLength(3)
    expect(gen({ athletes: athletes.slice(0, 2), equipment: [] }).parts).toHaveLength(3)
  })

  it('plus court et plus léger : moins de volume', () => {
    expect(total(gen({ minutes: 30, intensity: 'light' }).parts, 4)).toBeLessThan(total(gen({ minutes: 60 }).parts, 4))
  })
})

describe('avis, propositions et brief', () => {
  it('avis d’une athlète : aller-retour et intégration sans toucher aux autres', () => {
    const rebecca = { ...athletes[1], strengths: 'burpees, vélo', blockers: 'ring muscle-ups', competency: { t2b: 'manageable' as const } }
    const received = decodeAthlete(encodeAthlete(rebecca))!
    expect(received).toEqual(rebecca)
    const merged = mergeAthlete(athletes, received)!
    expect(merged[1].blockers).toBe('ring muscle-ups')
    expect(merged[0]).toEqual(athletes[0])
    expect(merged[2]).toEqual(athletes[2])
  })

  it('avis reconnu par le prénom si l’identifiant diffère, refusé si inconnu', () => {
    expect(mergeAthlete(athletes, { ...athletes[2], id: 'zzz', level: 'RX' })![2]).toMatchObject({ id: 'a3', level: 'RX' })
    expect(mergeAthlete(athletes, { ...athletes[2], id: 'zzz', name: 'Inconnue' })).toBeNull()
    expect(decodeAthlete('abîmé')).toBeNull()
  })

  it('proposition de séance : aller-retour, lien abîmé refusé', () => {
    const parts = defaultSessions(COMPETITION_DATE).map((s) => s.wod)
    const back = decodeProposal(encodeProposal({ date: '2026-11-24', parts }))!
    expect(back.date).toBe('2026-11-24')
    expect(back.parts).toEqual(parts)
    expect(decodeProposal('nope')).toBeNull()
    expect(decodeProposal(encodeProposal({ date: 'x', parts }))).toBeNull()
  })

  it('brief pour Claude : complet et fidèle aux profils', () => {
    const state = defaultState()
    state.athletes[1].blockers = 'ring muscle-ups'
    const brief = buildBrief(state, '2026-11-24')
    for (const word of ['Anas', 'Rebecca', 'Natalia', 'WOD 1', 'WOD Final', 'J-4', 'Bloque sur : ring muscle-ups', 'Arrêt récent : 2 semaines', 'mini-WODs de maintien', 'DEMANDE']) {
      expect(brief).toContain(word)
    }
    expect(brief.match(/Arrêt récent : (\d+)/)?.[1]).toBe('2')
  })

  it('profil par défaut : deux semaines d’arrêt, la prudence reste active', () => {
    const anas = defaultAthletes()[0]
    expect(anas.name).toBe('Anas')
    expect(anas.breakWeeks).toBe(2)
    expect(assessSession(tpl('tpl-a'), ctx(5)).context).toBeCloseTo(DEFAULT_CONFIG.inactivityFactor)
  })
})

describe('synchronisation d’équipe', () => {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

  it('seules les sections modifiées sont horodatées', () => {
    const before = defaultState()
    const after = clone(before)
    after.athletes[1].blockers = 'ring muscle-ups'
    const res = stampChanges(sectionHashes(before), after, {}, 1000)
    expect(res.changed).toBe(true)
    expect(res.stamps).toEqual({ 'athlete:a2': 1000 })
    expect(stampChanges(res.hashes, after, res.stamps, 2000).changed).toBe(false)
  })

  it('le brouillon du builder ne se synchronise pas', () => {
    const before = defaultState()
    const after = clone(before)
    after.draft.name = 'Brouillon perso'
    after.draftDate = '2026-11-26'
    expect(stampChanges(sectionHashes(before), after, {}, 1000).changed).toBe(false)
  })

  it('équipe vide : le premier téléphone crée le plan', () => {
    const state = defaultState()
    const res = mergeDoc(state, {}, null)
    expect(res.changed).toBe(false)
    expect(res.needsPush).toBe(true)
    expect(Object.keys(toDoc(state, {}).sections).sort()).toEqual(['athlete:a1', 'athlete:a2', 'athlete:a3', 'session', 'settings', 'strategy'])
  })

  it('deux athlètes modifient leur fiche en même temps : rien n’est perdu', () => {
    const base = defaultState()
    const anas = clone(base)
    anas.athletes[0].strengths = 'toes-to-bar'
    const anasStamps = { 'athlete:a1': 1000 }
    const rebecca = clone(base)
    rebecca.athletes[1].blockers = 'ring muscle-ups'
    const rebeccaStamps = { 'athlete:a2': 1500 }

    // Anas publie, Rebecca fusionne puis publie, Anas fusionne.
    const server1 = toDoc(anas, anasStamps)
    const onRebecca = mergeDoc(rebecca, rebeccaStamps, server1)
    expect(onRebecca.changed).toBe(true)
    expect(onRebecca.needsPush).toBe(true)
    expect(onRebecca.state.athletes[0].strengths).toBe('toes-to-bar')
    expect(onRebecca.state.athletes[1].blockers).toBe('ring muscle-ups')

    const server2 = toDoc(onRebecca.state, onRebecca.stamps)
    const onAnas = mergeDoc(anas, anasStamps, server2)
    expect(onAnas.changed).toBe(true)
    expect(onAnas.needsPush).toBe(false)
    expect(onAnas.state.athletes).toEqual(onRebecca.state.athletes)
    expect(mergeDoc(onAnas.state, onAnas.stamps, server2)).toMatchObject({ changed: false, needsPush: false })
  })

  it('même section modifiée deux fois : la plus récente l’emporte, des deux côtés', () => {
    const base = defaultState()
    const older = clone(base)
    older.athletes[2].level = 'Inter'
    const newer = clone(base)
    newer.athletes[2].level = 'RX'
    const server = toDoc(newer, { 'athlete:a3': 2000 })
    expect(mergeDoc(older, { 'athlete:a3': 1000 }, server).state.athletes[2].level).toBe('RX')
    const reverse = mergeDoc(newer, { 'athlete:a3': 2000 }, toDoc(older, { 'athlete:a3': 1000 }))
    expect(reverse.changed).toBe(false)
    expect(reverse.needsPush).toBe(true)
  })

  it('la séance régénérée par un téléphone arrive chez les autres, sans toucher à leur brouillon', () => {
    const local = defaultState()
    local.draft.name = 'Mon brouillon'
    const remote = clone(defaultState())
    remote.sessions = remote.sessions.slice(0, 2)
    const res = mergeDoc(local, {}, toDoc(remote, { session: 5000 }))
    expect(res.state.sessions).toHaveLength(2)
    expect(res.state.draft.name).toBe('Mon brouillon')
    expect(res.stamps.session).toBe(5000)
  })

  it('un téléphone qui rejoint sans avoir rien modifié adopte la séance de l’équipe', () => {
    const team = defaultState()
    const newcomer = defaultState() // même contenu, identifiants différents
    expect(newcomer.sessions.map((x) => x.id)).not.toEqual(team.sessions.map((x) => x.id))
    const res = mergeDoc(newcomer, {}, toDoc(team, {}))
    expect(res.changed).toBe(true)
    expect(res.needsPush).toBe(false)
    expect(res.state.sessions.map((x) => x.id)).toEqual(team.sessions.map((x) => x.id))
  })

  it('un avis rempli avant de rejoindre l’équipe est conservé et envoyé', () => {
    const team = defaultState()
    const newcomer = defaultState()
    newcomer.athletes[2].blockers = 'sandbag lourd'
    const res = mergeDoc(newcomer, { 'athlete:a3': 4000 }, toDoc(team, {}))
    expect(res.state.athletes[2].blockers).toBe('sandbag lourd')
    expect(res.needsPush).toBe(true)
  })

  it('document distant malformé : nettoyé, jamais d’exception', () => {
    expect(sanitizeDoc(null)).toBeNull()
    expect(sanitizeDoc({ sections: [] })).toBeNull()
    const doc = sanitizeDoc({ sections: { session: { t: 9000, d: 'pas une liste' }, 'athlete:a1': { t: 9000, d: { name: 'X'.repeat(200), sex: '?', rm: { snatch: -1 } } }, bidon: { t: 'x', d: 1 } } })!
    expect(Object.keys(doc.sections)).toEqual(['session', 'athlete:a1'])
    const base = defaultState()
    const res = mergeDoc(base, {}, doc)
    expect(res.state.sessions).toEqual(base.sessions)
    expect(res.state.athletes[0].id).toBe('a1')
    expect(res.state.athletes[0].name).toHaveLength(40)
    expect(res.state.athletes[0].rm).toEqual({})
  })

  it('codes d’équipe', () => {
    const code = newTeamCode((n) => Array.from({ length: n }, (_, i) => i * 7))
    expect(code).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/)
    expect(isValidTeamCode(code)).toBe(true)
    expect(isValidTeamCode(newTeamCode())).toBe(true)
    expect(normalizeTeamCode('  ABCD-efgh 1234!! ')).toBe('abcd-efgh1234')
    expect(isValidTeamCode('court')).toBe(false)
    expect(isValidTeamCode('avec espace 123')).toBe(false)
  })
})
