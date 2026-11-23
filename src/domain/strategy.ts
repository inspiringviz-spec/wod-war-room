import { clamp, loadFor, num, prescribedTotal } from './calc'
import { HISTORICAL } from './data'
import type { HistoricalWod } from './data'
import { movement, RM_LABEL } from './movements'
import type { Athlete, Competency, Scenario, Severity, SplitRule, TestResult, Wod, WodItem } from './types'

export const COMPETENCY_LABEL: Record<Competency, string> = {
  comfortable: 'À l’aise',
  manageable: 'Gérable',
  difficult: 'Difficile',
  not_yet: 'Pas encore acquis',
  unknown: 'Inconnu',
}

export const COMPETENCY_SHORT: Record<Competency, string> = {
  comfortable: 'À l’aise',
  manageable: 'Gérable',
  difficult: 'Difficile',
  not_yet: 'Non acquis',
  unknown: '?',
}

export const COMPETENCIES: Competency[] = ['comfortable', 'manageable', 'difficult', 'not_yet', 'unknown']

const RANK: Record<Competency, number> = { comfortable: 0, manageable: 1, difficult: 2, not_yet: 3, unknown: -1 }

export function competencyOf(a: Athlete, movementId: string): Competency {
  return a.competency[movementId] ?? 'unknown'
}

// ---------- Paires ----------

export interface PairInsight {
  ids: [string, string]
  label: string
  members: { id: string; name: string; competency: Competency; unbroken: number | null }[]
  tests: TestResult[]
  status: 'insufficient' | 'declared' | 'tested'
  fact: string
}

export function pairs(athletes: Athlete[]): [Athlete, Athlete][] {
  const out: [Athlete, Athlete][] = []
  for (let i = 0; i < athletes.length; i++) {
    for (let j = i + 1; j < athletes.length; j++) out.push([athletes[i], athletes[j]])
  }
  return out
}

/**
 * Compare les paires sur un mouvement sans jamais désigner de « meilleure »
 * paire : on expose les données disponibles et ce qui manque.
 */
export function pairInsights(athletes: Athlete[], movementId: string): PairInsight[] {
  return pairs(athletes).map(([a, b]) => {
    const members = [a, b].map((x) => ({
      id: x.id,
      name: x.name,
      competency: competencyOf(x, movementId),
      unbroken: movementId in x.unbroken ? num(x.unbroken[movementId]) : null,
    }))
    const tests = [...a.tests.filter((t) => t.movementId === movementId && t.partnerId === b.id), ...b.tests.filter((t) => t.movementId === movementId && t.partnerId === a.id)]
    const known = members.every((m) => m.competency !== 'unknown')
    const status: PairInsight['status'] = tests.length ? 'tested' : known ? 'declared' : 'insufficient'

    let fact = 'Données insuffisantes : évaluez les deux athlètes ou enregistrez un test en binôme.'
    const blocked = members.find((m) => m.competency === 'not_yet')
    if (blocked) {
      fact = `${blocked.name} ne valide pas encore ce mouvement : binôme à écarter en l’état.`
    } else if (known) {
      const [m1, m2] = members
      if (RANK[m1.competency] === RANK[m2.competency]) {
        fact = `Niveaux déclarés équivalents (${COMPETENCY_LABEL[m1.competency].toLowerCase()}). À confirmer par un test synchro.`
      } else {
        const limiting = RANK[m1.competency] > RANK[m2.competency] ? m1 : m2
        fact = `${limiting.name} donnera le rythme (${COMPETENCY_LABEL[limiting.competency].toLowerCase()}). À confirmer par un test synchro.`
      }
    }
    if (tests.length) fact = `${tests.length} test${tests.length > 1 ? 's' : ''} enregistré${tests.length > 1 ? 's' : ''} pour ce binôme.`
    return { ids: [a.id, b.id], label: `${a.name} + ${b.name}`, members, tests, status, fact }
  })
}

// ---------- Répartition de la charge ----------

export interface StrategyIssue {
  severity: Severity
  itemId?: string
  text: string
}

export interface Distribution {
  per: Record<string, { points: number; lines: string[] }>
  total: number
  issues: StrategyIssue[]
  unassigned: number
}

export function effectiveSplitRule(item: WodItem, splitRules: Record<string, SplitRule>): SplitRule {
  return splitRules[item.id] ?? 'unknown'
}

function individualRel(item: WodItem, a: Athlete): { rel: number | null; load: number; missing: boolean } {
  const mv = movement(item.movementId)
  const load = loadFor(item, a.sex)
  if (!mv.rm || load <= 0) return { rel: null, load, missing: false }
  const rm = num(a.rm[mv.rm])
  if (rm <= 0) return { rel: null, load, missing: true }
  return { rel: load / rm, load, missing: false }
}

export function distribution(
  wod: Wod,
  scenario: Scenario,
  athletes: Athlete[],
  splitRules: Record<string, SplitRule>,
): Distribution {
  const per: Distribution['per'] = {}
  for (const a of athletes) per[a.id] = { points: 0, lines: [] }
  const issues: StrategyIssue[] = []
  let unassigned = 0
  const byId = new Map(athletes.map((a) => [a.id, a]))
  const assignedPerItem: string[][] = []

  for (const item of wod.items) {
    const mv = movement(item.movementId)
    const ids = (scenario.assign[item.id] ?? []).filter((id) => byId.has(id))
    assignedPerItem.push(ids)
    if (ids.length === 0) {
      unassigned++
      continue
    }
    const required = Math.round(num(item.athletes))
    if (required > 0 && ids.length !== required) {
      issues.push({
        severity: 'amber',
        itemId: item.id,
        text: `${mv.name} : les notes indiquent ${required} athlète${required > 1 ? 's' : ''}, ${ids.length} sélectionné${ids.length > 1 ? 's' : ''}.`,
      })
    }
    if (item.sync && ids.length < 2) {
      issues.push({ severity: 'amber', itemId: item.id, text: `${mv.name} : un mouvement synchro demande au moins deux athlètes.` })
    }

    const total = prescribedTotal(item, wod)
    const rule = effectiveSplitRule(item, splitRules)
    const weights = ids.map((id) => {
      if (item.sync || rule !== 'free') return 1
      const w = num(scenario.split[item.id]?.[id])
      return w
    })
    const sumW = weights.reduce((s, w) => s + w, 0)
    if (!item.sync && rule === 'unknown' && ids.length > 1) {
      issues.push({
        severity: 'info',
        itemId: item.id,
        text: `${mv.name} : parts égales par défaut, la règle de partage n’est pas confirmée.`,
      })
    }

    ids.forEach((id, idx) => {
      const a = byId.get(id)!
      const share = item.sync ? total : sumW > 0 ? (total * weights[idx]) / sumW : total / ids.length
      const ir = individualRel(item, a)
      const lf = ir.rel !== null ? clamp(0.6 + ir.rel, 0.7, 2.2) : 1
      per[id].points += share * mv.cost * lf
      if (total > 0) per[id].lines.push(`${Math.round(share)} ${mv.name}`)
      else per[id].lines.push(mv.name)

      const comp = competencyOf(a, mv.id)
      if (comp === 'not_yet') {
        issues.push({ severity: 'red', itemId: item.id, text: `${a.name} ne valide pas encore ${mv.name}.` })
      } else if (comp === 'difficult') {
        issues.push({ severity: 'amber', itemId: item.id, text: `${mv.name} est difficile pour ${a.name}.` })
      } else if (comp === 'unknown') {
        issues.push({ severity: 'info', itemId: item.id, text: `${mv.name} : niveau de ${a.name} à évaluer.` })
      }
      if (ir.rel !== null && mv.rm) {
        const p = Math.round(ir.rel * 100)
        if (ir.rel >= 0.9) {
          issues.push({ severity: 'red', itemId: item.id, text: `${mv.name} à ${ir.load} kg = ${p} % du 1RM ${RM_LABEL[mv.rm]} de ${a.name}.` })
        } else if (ir.rel >= 0.75) {
          issues.push({ severity: 'amber', itemId: item.id, text: `${mv.name} à ${ir.load} kg = ${p} % du 1RM ${RM_LABEL[mv.rm]} de ${a.name}.` })
        }
      } else if (ir.missing && mv.rm) {
        issues.push({ severity: 'info', itemId: item.id, text: `${mv.name} à ${ir.load} kg : 1RM ${RM_LABEL[mv.rm]} de ${a.name} non renseigné.` })
      }
    })
  }

  // Enchaînements de grip pour un même athlète
  for (let i = 0; i < wod.items.length - 1; i++) {
    const m1 = movement(wod.items[i].movementId)
    const m2 = movement(wod.items[i + 1].movementId)
    if (!m1.tags.includes('grip') || !m2.tags.includes('grip')) continue
    for (const id of assignedPerItem[i]) {
      if (assignedPerItem[i + 1].includes(id)) {
        issues.push({
          severity: 'amber',
          itemId: wod.items[i + 1].id,
          text: `${byId.get(id)!.name} enchaîne ${m1.name} puis ${m2.name} : grip sollicité sans pause.`,
        })
      }
    }
  }

  const total = Object.values(per).reduce((s, p) => s + p.points, 0)
  if (total > 0 && athletes.length >= 3) {
    for (const a of athletes) {
      const share = per[a.id].points / total
      if (share > 0.5) {
        issues.push({ severity: 'amber', text: `${a.name} porte ${Math.round(share * 100)} % de la charge estimée.` })
      }
    }
  }

  const rank: Record<Severity, number> = { red: 0, amber: 1, info: 2 }
  issues.sort((a, b) => rank[a.severity] - rank[b.severity])
  return { per, total, issues, unassigned }
}

// ---------- Points bloquants de l'équipe ----------

export interface Bottleneck {
  movementId: string
  wodId: string
  wodCode: string
  qty: number
  score: number
  severity: Severity
  lines: string[]
  headline: string
}

const WEIGHT: Record<Competency, number> = { comfortable: 0, manageable: 0.3, difficult: 2, not_yet: 3, unknown: 1 }

function bottleneckFor(h: HistoricalWod, item: WodItem, athletes: Athlete[]): Bottleneck {
  const mv = movement(item.movementId)
  let score = 0
  const lines: string[] = []
  let blocked = 0
  let hard = 0
  let unknown = 0
  for (const a of athletes) {
    const comp = competencyOf(a, mv.id)
    score += WEIGHT[comp]
    if (comp === 'not_yet') blocked++
    if (comp === 'difficult') hard++
    if (comp === 'unknown') unknown++
    lines.push(`${a.name} : ${COMPETENCY_LABEL[comp].toLowerCase()}`)
    const ir = individualRel(item, a)
    if (ir.rel !== null && mv.rm && ir.rel >= 0.75) {
      score += ir.rel >= 0.9 ? 3 : 2
      lines.push(`${ir.load} kg = ${Math.round(ir.rel * 100)} % du 1RM ${RM_LABEL[mv.rm]} de ${a.name}`)
    } else if (ir.missing && mv.rm && mv.heavyAbs && ir.load >= mv.heavyAbs[a.sex]) {
      score += 1
      lines.push(`${ir.load} kg : 1RM ${RM_LABEL[mv.rm]} de ${a.name} non renseigné`)
    }
  }
  score *= mv.cost * (mv.tags.includes('skill') ? 1.5 : 1)
  const severity: Severity = blocked > 0 ? 'red' : hard > 0 ? 'amber' : 'info'
  let headline = `${mv.name} : à évaluer`
  if (blocked === athletes.length && athletes.length) headline = `${mv.name} : aucun athlète ne le valide`
  else if (blocked > 0) headline = `${mv.name} : non acquis pour ${blocked} athlète${blocked > 1 ? 's' : ''}${unknown ? `, ${unknown} à évaluer` : ''}`
  else if (hard > 0) headline = `${mv.name} : difficile pour ${hard} athlète${hard > 1 ? 's' : ''}`
  else if (unknown === 0) headline = `${mv.name} : maîtrisé par l’équipe`
  return { movementId: mv.id, wodId: h.id, wodCode: h.code, qty: num(item.qty), score, severity, lines, headline }
}

/** Points bloquants classés du plus au moins préoccupant, d'après les profils. */
export function bottlenecks(athletes: Athlete[], wodId?: string): Bottleneck[] {
  const out: Bottleneck[] = []
  for (const h of HISTORICAL) {
    if (wodId && h.id !== wodId) continue
    for (const item of h.wod.items) out.push(bottleneckFor(h, item, athletes))
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Part des cases « Inconnu » dans la matrice de compétence (0 → 1). */
export function unknownShare(athletes: Athlete[], movementIds: string[]): number {
  const cells = athletes.length * movementIds.length
  if (!cells) return 0
  let unknown = 0
  for (const a of athletes) for (const m of movementIds) if (competencyOf(a, m) === 'unknown') unknown++
  return unknown / cells
}
