import { movement, unitLabel } from './movements'
import type { Athlete, Equipment, Tag, Wod, WodItem } from './types'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Nombre fini et positif, sinon 0. */
export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step
}

export function rounds(wod: Wod): number {
  return num(wod.rounds)
}

/** Nombre d'athlètes impliqués sur un item (0 = non précisé → toute l'équipe). */
export function participants(item: WodItem, wod: Wod): number {
  const team = Math.max(1, Math.round(num(wod.teamSize)) || 3)
  const n = Math.round(num(item.athletes))
  if (n <= 0) return team
  return n
}

/** Volume prescrit sur toute la séance (qty × rounds). */
export function prescribedTotal(item: WodItem, wod: Wod): number {
  return num(item.qty) * rounds(wod)
}

/**
 * Volume réalisé par un athlète impliqué.
 * Synchro : chacun fait toutes les reps. Partagé : les reps sont réparties.
 */
export function perAthleteUnits(item: WodItem, wod: Wod): number {
  const total = prescribedTotal(item, wod)
  if (item.sync) return total
  return total / participants(item, wod)
}

/** Volume total cumulé par l'équipe. */
export function teamUnits(item: WodItem, wod: Wod): number {
  const total = prescribedTotal(item, wod)
  return item.sync ? total * participants(item, wod) : total
}

export function movementTotals(wod: Wod): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of wod.items) {
    out[item.movementId] = (out[item.movementId] ?? 0) + prescribedTotal(item, wod)
  }
  return out
}

export interface RelativeLoad {
  /** Charge / 1RM la plus élevée parmi les athlètes dont le 1RM est connu. */
  rel: number | null
  who: string | null
  /** Au moins un athlète concerné n'a pas de 1RM renseigné. */
  missing: boolean
  /** 1RM inconnu et charge au-dessus du seuil « probablement lourd ». */
  heavyUnknown: boolean
}

export function loadFor(item: WodItem, sex: 'M' | 'F'): number {
  return num(sex === 'M' ? item.loadM : item.loadF)
}

export function relativeLoad(item: WodItem, athletes: Athlete[]): RelativeLoad {
  const mv = movement(item.movementId)
  const out: RelativeLoad = { rel: null, who: null, missing: false, heavyUnknown: false }
  if (!mv.rm) return out
  for (const a of athletes) {
    const load = loadFor(item, a.sex)
    if (load <= 0) continue
    const rm = num(a.rm[mv.rm])
    if (rm > 0) {
      const r = load / rm
      if (out.rel === null || r > out.rel) {
        out.rel = r
        out.who = a.name
      }
    } else {
      out.missing = true
      if (mv.heavyAbs && load >= mv.heavyAbs[a.sex]) out.heavyUnknown = true
    }
  }
  return out
}

/** Facteur de charge : 1 si inconnu, croît avec la charge relative. */
export function loadFactor(rl: RelativeLoad): number {
  if (rl.rel !== null) return clamp(0.6 + rl.rel, 0.7, 2.2)
  if (rl.heavyUnknown) return 1.5
  return 1
}

export function itemPoints(item: WodItem, wod: Wod, athletes: Athlete[]): number {
  const mv = movement(item.movementId)
  return perAthleteUnits(item, wod) * mv.cost * loadFactor(relativeLoad(item, athletes))
}

export const ALL_TAGS: Tag[] = [
  'grip',
  'shoulder',
  'overhead',
  'legs',
  'eccentric',
  'impact',
  'core',
  'engine',
  'pull',
  'burpee',
  'squat',
  'skill',
]

export function emptyTagPoints(): Record<Tag, number> {
  const out = {} as Record<Tag, number>
  for (const t of ALL_TAGS) out[t] = 0
  return out
}

export function tagPoints(wod: Wod, athletes: Athlete[]): Record<Tag, number> {
  const out = emptyTagPoints()
  for (const item of wod.items) {
    const pts = itemPoints(item, wod, athletes)
    for (const tag of movement(item.movementId).tags) out[tag] += pts
  }
  return out
}

/** Reps par athlète impliqué pour une famille de mouvements. */
export function perAthleteRepsByTag(wod: Wod, tag: Tag): number {
  let total = 0
  for (const item of wod.items) {
    const mv = movement(item.movementId)
    if (mv.unit !== 'reps' || !mv.tags.includes(tag)) continue
    total += perAthleteUnits(item, wod)
  }
  return total
}

export function equipmentList(wod: Wod): Equipment[] {
  const set = new Set<Equipment>()
  for (const item of wod.items) {
    const eq = movement(item.movementId).equipment
    if (eq !== 'none') set.add(eq)
  }
  return [...set]
}

export function formatLoad(item: WodItem): string {
  const m = num(item.loadM)
  const f = num(item.loadF)
  if (m && f) return `${m}/${f} kg`
  if (m) return `${m} kg`
  if (f) return `${f} kg`
  return ''
}

export function formatQty(item: WodItem): string {
  const mv = movement(item.movementId)
  const q = num(item.qty)
  if (q === 0) return mv.unit === 'm' ? 'Distance max' : '—'
  if (mv.unit === 'reps') return `${q}`
  return `${q} ${unitLabel(mv.unit, q)}`
}

export function formatWho(item: WodItem): string {
  const n = Math.round(num(item.athletes))
  if (item.sync) return n > 0 ? `synchro à ${n}` : 'synchro'
  if (n <= 0) return 'répartition non précisée'
  if (n === 1) return '1 athlète'
  return `partagé à ${n}`
}

export function itemLine(item: WodItem): string {
  const mv = movement(item.movementId)
  const load = formatLoad(item)
  return `${formatQty(item)} ${mv.name}${load ? ` · ${load}` : ''}`
}

export function formatLabel(wod: Wod): string {
  const cap = num(wod.capMin)
  switch (wod.format) {
    case 'amrap':
      return `AMRAP ${cap} min`
    case 'for_time':
      return `For Time · cap ${cap} min`
    case 'rounds':
      return `${rounds(wod)} tours · cap ${cap} min`
    default:
      return `Technique · ${cap} min`
  }
}

export function cloneWod(wod: Wod): Wod {
  return {
    ...wod,
    items: wod.items.map((i) => ({ ...i })),
    baseline: wod.baseline ? { ...wod.baseline } : undefined,
  }
}

/** Copie indépendante avec de nouveaux identifiants et un volume de référence figé. */
export function instantiate(wod: Wod): Wod {
  const copy = cloneWod(wod)
  copy.id = uid()
  copy.items = copy.items.map((i) => ({ ...i, id: uid() }))
  copy.baseline = movementTotals(copy)
  return copy
}

// ---------- Dates ----------

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map((x) => Number(x))
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1)
}

export function isValidISO(iso: unknown): iso is string {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(parseISO(iso))
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, n: number): string {
  return toISO(parseISO(iso) + n * 86400000)
}

/** Jours entre `from` et `to` (positif si `to` est dans le futur). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to) - parseISO(from)) / 86400000)
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function dayName(iso: string): string {
  return DAY_NAMES[new Date(parseISO(iso)).getUTCDay()]
}

export function shortDate(iso: string): string {
  const d = new Date(parseISO(iso))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** Les 6 jours de la semaine de compétition (J-5 → jour J). */
export function weekDays(competitionDate: string): string[] {
  return [5, 4, 3, 2, 1, 0].map((n) => addDays(competitionDate, -n))
}
