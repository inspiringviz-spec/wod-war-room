import { movementTotals, num, roundTo, uid } from './calc'
import { movement } from './movements'
import { assessSession, scaleItems } from './risk'
import type { Athlete, Competency, Equipment, Format, Objective, RiskConfig, Wod, WodItem } from './types'

/**
 * Séance d'équipe en trois parties, une par WOD de l'an dernier.
 * Le générateur s'appuie sur ce que les athlètes ont déclaré : il remplace les
 * mouvements non acquis par un drill, réduit ce qui est difficile, fait tourner
 * les binômes pour tester la synchro et ajuste le volume au jour choisi.
 * Il ne désigne jamais de « meilleur » binôme et n'invente aucun niveau.
 */

export type SessionLength = 30 | 45 | 60
export type SessionIntensity = 'light' | 'moderate'

export interface TeamSessionInput {
  athletes: Athlete[]
  daysOut: number
  config: RiskConfig
  minutes: SessionLength
  intensity: SessionIntensity
  equipment: Equipment[]
}

export interface TeamSessionResult {
  parts: Wod[]
  /** Pourquoi la séance est construite ainsi, en clair. */
  reasons: string[]
  restMin: number
}

interface Slot {
  m: string
  qty: number
  athletes: number
  sync?: boolean
  loadM?: number
  loadF?: number
  /** Remplacements si le matériel manque. */
  alts?: Slot[]
  /** Variante technique si le mouvement n'est pas acquis. */
  drill?: { m: string; qty: number }
}

interface Blueprint {
  name: string
  ref: string
  objective: Objective
  format: Format
  rounds: number
  cap: Record<SessionLength, number>
  rpeDelta: number
  goal: string
  slots: Slot[]
}

const BLUEPRINTS: Blueprint[] = [
  {
    name: 'Partie 1 · Gym & synchro',
    ref: 'WOD 1',
    objective: 'sync',
    format: 'rounds',
    rounds: 3,
    cap: { 30: 6, 45: 8, 60: 9 },
    rpeDelta: 0,
    goal: 'Trouver le rythme synchro sur la barre et la box, et la bonne taille de séries.',
    slots: [
      { m: 't2b', qty: 8, athletes: 2, sync: true },
      { m: 'burpee_bj', qty: 5, athletes: 2, sync: true, alts: [{ m: 'burpee', qty: 6, athletes: 2, sync: true }] },
      { m: 'echo', qty: 12, athletes: 3, alts: [{ m: 'row', qty: 150, athletes: 3 }, { m: 'ski', qty: 150, athletes: 3 }, { m: 'run', qty: 150, athletes: 3 }] },
      { m: 'pullup', qty: 6, athletes: 3 },
    ],
  },
  {
    name: 'Partie 2 · Ski & sandbag',
    ref: 'WOD 2',
    objective: 'transitions',
    format: 'amrap',
    rounds: 3,
    cap: { 30: 6, 45: 7, 60: 8 },
    rpeDelta: 0,
    goal: 'Roder les relais et les changements de poste : qui skie, qui porte, qui enchaîne.',
    slots: [
      { m: 'ski', qty: 150, athletes: 3, alts: [{ m: 'row', qty: 150, athletes: 3 }, { m: 'echo', qty: 10, athletes: 3 }] },
      { m: 'db_snatch', qty: 10, athletes: 2, sync: true, loadM: 15, loadF: 10 },
      { m: 'sb_carry', qty: 10, athletes: 3, loadM: 30, loadF: 20 },
      { m: 'sb_squat', qty: 8, athletes: 3, loadM: 30, loadF: 20 },
    ],
  },
  {
    name: 'Partie 3 · Final allégé',
    ref: 'WOD Final',
    objective: 'rehearsal',
    format: 'for_time',
    rounds: 1,
    cap: { 30: 6, 45: 8, 60: 9 },
    rpeDelta: -0.5,
    goal: 'Dérouler l’ordre du final à charges légères pour répartir les rôles, sans fatigue.',
    slots: [
      { m: 'db_cj', qty: 15, athletes: 3, loadM: 22.5, loadF: 15 },
      { m: 'oh_lunge', qty: 10, athletes: 2, loadM: 20, loadF: 15 },
      { m: 'burpee_bar', qty: 9, athletes: 3, alts: [{ m: 'burpee', qty: 9, athletes: 3 }] },
      { m: 'back_squat', qty: 6, athletes: 3, loadM: 40, loadF: 30 },
      { m: 'rmu', qty: 4, athletes: 3, drill: { m: 'rmu_drill', qty: 6 } },
    ],
  },
]

const VOLUME: Record<SessionLength, number> = { 30: 0.75, 45: 1, 60: 1.15 }
const REST: Record<SessionLength, number> = { 30: 3, 45: 5, 60: 6 }

function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

function comp(a: Athlete, movementId: string): Competency {
  return a.competency[movementId] ?? 'unknown'
}

function resolveEquipment(slot: Slot, have: Set<Equipment>): Slot | null {
  if (have.has(movement(slot.m).equipment)) return slot
  for (const alt of slot.alts ?? []) {
    if (have.has(movement(alt.m).equipment)) return { ...alt, loadM: alt.loadM, loadF: alt.loadF }
  }
  return null
}

function scaleQty(m: string, qty: number, factor: number): number {
  const mv = movement(m)
  const raw = qty * factor
  if (mv.unit === 'm') return Math.max(10, roundTo(raw, 10))
  return Math.max(1, Math.round(raw))
}

/** Charge plafonnée à 50 % du plus petit 1RM connu de la catégorie. */
function cappedLoad(m: string, sex: 'M' | 'F', base: number | undefined, athletes: Athlete[]): number | undefined {
  const mv = movement(m)
  if (!base || !mv.rm) return base
  const rms = athletes
    .filter((a) => a.sex === sex)
    .map((a) => num(a.rm[mv.rm!]))
    .filter((x) => x > 0)
  if (!rms.length) return base
  const half = Math.floor((Math.min(...rms) * 0.5) / 2.5) * 2.5
  return Math.max(2.5, Math.min(base, half))
}

export function generateTeamSession(input: TeamSessionInput): TeamSessionResult {
  const { athletes, config, minutes } = input
  const have = new Set<Equipment>([...input.equipment, 'none'])
  const team = Math.min(3, Math.max(1, athletes.length || 3))
  const reasons: string[] = []
  const baseRpe = input.intensity === 'light' ? 5 : 6
  const unknownMovements = new Set<string>()

  let parts: Wod[] = BLUEPRINTS.map((bp) => {
    const items: WodItem[] = []
    for (const raw of bp.slots) {
      const slot = resolveEquipment(raw, have)
      if (!slot) {
        reasons.push(`${movement(raw.m).name} retiré de la ${bp.name.split(' ·')[0].toLowerCase()} : matériel indisponible.`)
        continue
      }
      if (slot.m !== raw.m) {
        reasons.push(`${movement(raw.m).name} remplacé par ${movement(slot.m).name} : matériel indisponible.`)
      }

      let m = slot.m
      let qty = slot.qty * VOLUME[minutes]
      const notes: string[] = []
      const mv = movement(m)

      const capable = athletes.filter((a) => ['comfortable', 'manageable'].includes(comp(a, m)))
      const hard = athletes.filter((a) => comp(a, m) === 'difficult')
      const blocked = athletes.filter((a) => comp(a, m) === 'not_yet')
      const unknown = athletes.filter((a) => comp(a, m) === 'unknown')
      let eligible = athletes.filter((a) => comp(a, m) !== 'not_yet')

      if (blocked.length > 0 && capable.length === 0 && slot.drill && have.has(movement(slot.drill.m).equipment)) {
        const drill = movement(slot.drill.m)
        reasons.push(
          `${mv.name} remplacé par « ${drill.name} » : ${list(blocked.map((a) => a.name))} ne le valide${blocked.length > 1 ? 'nt' : ''} pas encore${
            unknown.length ? ` et le niveau de ${list(unknown.map((a) => a.name))} n’est pas renseigné` : ''
          }.`,
        )
        if (unknown.length) notes.push(`${list(unknown.map((a) => a.name))} : 1 à 2 essais à part si acquis`)
        m = slot.drill.m
        qty = slot.drill.qty * VOLUME[minutes]
        eligible = athletes
      } else {
        if (blocked.length > 0) {
          reasons.push(`${mv.name} : sans ${list(blocked.map((a) => a.name))} (pas encore acquis).`)
          notes.push(`Sans ${list(blocked.map((a) => a.name))}`)
        }
        if (hard.length > 0) {
          qty *= 0.75
          reasons.push(`${mv.name} réduit d’un quart : difficile pour ${list(hard.map((a) => a.name))}.`)
        }
        if (capable.length === 0 && unknown.length > 0 && blocked.length === 0 && mv.cost >= 0.6 && mv.unit === 'reps') {
          qty *= 0.85
          unknownMovements.add(mv.name)
        }
        if (capable.length > 0 && capable.length < athletes.length && !slot.sync) {
          notes.push(`À l’aise : ${list(capable.map((a) => a.name))}`)
        }
      }

      let count = Math.min(slot.athletes, team, Math.max(1, eligible.length))
      let sync = Boolean(slot.sync) && count >= 2
      if (slot.sync && eligible.length < 2) {
        sync = false
        count = Math.max(1, eligible.length)
        reasons.push(`${mv.name} : synchro impossible pour l’instant, un seul athlète le valide.`)
      }
      if (sync && count === 2) {
        if (eligible.length >= 3 && bp.rounds >= 2) {
          const [a, b, c] = eligible
          notes.push(`Binôme tournant : ${a.name}+${b.name}, ${a.name}+${c.name}, ${b.name}+${c.name}`)
        } else if (eligible.length === 2) {
          notes.push(`Binôme : ${eligible[0].name} + ${eligible[1].name}`)
        }
      }

      const loadM = cappedLoad(m, 'M', slot.loadM, athletes)
      const loadF = cappedLoad(m, 'F', slot.loadF, athletes)
      if (m === slot.m && ((slot.loadM && loadM !== slot.loadM) || (slot.loadF && loadF !== slot.loadF))) {
        reasons.push(`${mv.name} : charge plafonnée à 50 % du 1RM connu.`)
      }

      const item: WodItem = { id: uid(), movementId: m, qty: scaleQty(m, 1, qty), athletes: count, sync }
      if (m === slot.m && loadM) item.loadM = loadM
      if (m === slot.m && loadF) item.loadF = loadF
      const note = notes.join(' · ').slice(0, 120)
      if (note) item.note = note
      items.push(item)
    }

    return {
      id: uid(),
      name: bp.name,
      objective: bp.objective,
      format: bp.format,
      rounds: bp.rounds,
      capMin: bp.cap[minutes],
      rpe: baseRpe + bp.rpeDelta,
      restSec: 0,
      teamSize: team,
      items,
      note: `Inspiré du ${bp.ref}. But : ${bp.goal}`,
    }
  })

  if (unknownMovements.size) {
    reasons.push(
      `Volume prudent sur ${list([...unknownMovements])} : personne n’a encore indiqué son niveau. Remplissez « Mon avis » puis régénérez la séance.`,
    )
  }
  if (parts.some((p) => p.items.some((i) => i.sync && (i.note ?? '').startsWith('Binôme tournant')))) {
    reasons.push('Les binômes synchro tournent à chaque tour : vous testez les trois paires et vous notez laquelle tient le mieux le rythme.')
  }

  // Ajustement au jour choisi : la séance doit rester nettement sous le seuil d'attention.
  const ctx = { daysOut: input.daysOut, athletes, config }
  const total = () => parts.reduce((s, w) => s + assessSession(w, ctx).score, 0)
  const before = total()
  for (let i = 0; i < 12 && total() > config.dayAmber * 0.75; i++) {
    const next = parts.map((w) => scaleItems(w, () => true, 0.9))
    const changed = next.some((w, k) => w.items.some((it, idx) => num(it.qty) !== num(parts[k].items[idx].qty)))
    if (!changed) break
    parts = next
  }
  const after = total()
  if (before > 0 && after < before * 0.97) {
    const when = input.daysOut <= 0 ? 'le jour J' : `à J-${input.daysOut}`
    reasons.push(`Volumes réduits d’environ ${Math.round((1 - after / before) * 100)} % parce que la séance a lieu ${when}.`)
  }
  if (input.daysOut >= 0 && input.daysOut <= 2) {
    reasons.push('Séance très proche de la compétition : gardez-la technique, sans chercher le chrono.')
  }
  reasons.unshift(
    `Trois parties courtes, une par WOD de l’an dernier, avec ${REST[minutes]} min de récupération entre chacune. Les volumes sont très inférieurs à ceux de la compétition : on cale la synchro et les rôles, on ne se teste pas.`,
  )

  for (const p of parts) p.baseline = movementTotals(p)
  return { parts, reasons, restMin: REST[minutes] }
}
