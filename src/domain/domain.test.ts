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
import { assessSession, assessWeek, DEFAULT_CONFIG, readiness, saferAlternative } from './risk'
import type { RiskContext } from './risk'
import { decodeState, decodeWod, encodeState, encodeWod, parseJSONState, sanitizeState, sanitizeWod } from './share'
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
    expect(rl.who).toBe('Athlète 1')
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

  it('la pause de trois semaines majore le score', () => {
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

  it('plusieurs séances le même jour : alerte', () => {
    const sessions = [...base(), { id: 'x', date: '2026-11-23', wod: tpl('tpl-b'), done: false }]
    expect(week(sessions).days[0].warnings.some((w) => w.id.startsWith('multi-'))).toBe(true)
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
    expect(list[1].fact).toContain('Athlète 3 donnera le rythme')
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
