import { sanitizeState } from './share'
import type { AppState } from './types'

/**
 * Synchronisation d'équipe : logique pure, sans réseau.
 *
 * Le plan est découpé en sections indépendantes (la fiche de chaque athlète,
 * la séance, la stratégie, les réglages). Chaque section porte l'heure de sa
 * dernière modification ; à la fusion, la plus récente l'emporte. Deux
 * personnes qui modifient des sections différentes ne s'écrasent donc jamais.
 * Le brouillon du builder reste propre à chaque téléphone.
 */

export interface SyncDoc {
  v: 1
  sections: Record<string, { t: number; d: unknown }>
}

export type Stamps = Record<string, number>

export function sectionsOf(state: AppState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const a of state.athletes) out[`athlete:${a.id}`] = a
  out.session = state.sessions
  out.strategy = { strategies: state.strategies, rules: state.rules, splitRules: state.splitRules }
  out.settings = { teamName: state.teamName, competitionDate: state.competitionDate, config: state.config }
  return out
}

export function sectionHashes(state: AppState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sectionsOf(state))) out[k] = JSON.stringify(v)
  return out
}

/** Horodate les sections modifiées depuis `previous`. */
export function stampChanges(previous: Record<string, string>, state: AppState, stamps: Stamps, now: number): { hashes: Record<string, string>; stamps: Stamps; changed: boolean } {
  const hashes = sectionHashes(state)
  const next: Stamps = { ...stamps }
  let changed = false
  for (const [k, h] of Object.entries(hashes)) {
    if (previous[k] !== undefined && previous[k] !== h) {
      next[k] = Math.max(now, (next[k] ?? 0) + 1)
      changed = true
    }
  }
  return { hashes, stamps: next, changed }
}

export function toDoc(state: AppState, stamps: Stamps): SyncDoc {
  const sections: SyncDoc['sections'] = {}
  for (const [k, d] of Object.entries(sectionsOf(state))) sections[k] = { t: stamps[k] ?? 0, d }
  return { v: 1, sections }
}

export function sanitizeDoc(raw: unknown): SyncDoc | null {
  if (typeof raw !== 'object' || raw === null) return null
  const sections = (raw as { sections?: unknown }).sections
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return null
  const out: SyncDoc['sections'] = {}
  for (const [k, v] of Object.entries(sections as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const t = Number((v as { t?: unknown }).t)
    if (!Number.isFinite(t) || t < 0) continue
    out[k.slice(0, 60)] = { t, d: (v as { d?: unknown }).d }
  }
  return { v: 1, sections: out }
}

export interface MergeResult {
  state: AppState
  stamps: Stamps
  /** Le plan local a reçu des modifications venues de l'équipe. */
  changed: boolean
  /** Le plan local contient des sections plus récentes à envoyer. */
  needsPush: boolean
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function mergeDoc(local: AppState, stamps: Stamps, remote: SyncDoc | null): MergeResult {
  const mine = sectionsOf(local)
  const nextStamps: Stamps = { ...stamps }
  const raw: Record<string, unknown> = { ...local }
  let changed = false
  let needsPush = remote === null

  const take = (key: string): unknown | undefined => {
    const r = remote?.sections[key]
    const localT = stamps[key] ?? 0
    if (!r) {
      needsPush = true
      return undefined
    }
    // À égalité (typiquement un téléphone qui rejoint l'équipe sans avoir rien
    // modifié), la version de l'équipe fait foi : tout le monde converge.
    if (r.t >= localT) {
      nextStamps[key] = r.t
      if (JSON.stringify(r.d) !== JSON.stringify(mine[key])) {
        changed = true
        return r.d
      }
      return undefined
    }
    if (localT > r.t) needsPush = true
    return undefined
  }

  raw.athletes = local.athletes.map((a) => {
    const incoming = take(`athlete:${a.id}`)
    return isObj(incoming) ? { ...incoming, id: a.id } : a
  })
  const session = take('session')
  if (Array.isArray(session)) raw.sessions = session
  const strategy = take('strategy')
  if (isObj(strategy)) {
    raw.strategies = strategy.strategies
    raw.rules = strategy.rules
    raw.splitRules = strategy.splitRules
  }
  const settings = take('settings')
  if (isObj(settings)) {
    raw.teamName = settings.teamName
    raw.competitionDate = settings.competitionDate
    raw.config = settings.config
  }

  if (!changed) return { state: local, stamps: nextStamps, changed: false, needsPush }
  // Tout ce qui vient du réseau repasse par le nettoyage habituel.
  const state = sanitizeState(raw)
  if (!state) return { state: local, stamps, changed: false, needsPush }
  return { state, stamps: nextStamps, changed: true, needsPush }
}

// ---------- Code d'équipe ----------

export function normalizeTeamCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64)
}

export function isValidTeamCode(code: string): boolean {
  return /^[a-z0-9-]{8,64}$/.test(code)
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Code aléatoire lisible (sans caractères ambigus), au format xxxx-xxxx-xxxx. */
export function newTeamCode(random: (n: number) => number[] = defaultRandom): string {
  const chars = random(12).map((n) => ALPHABET[n % ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

function defaultRandom(n: number): number[] {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return [...bytes]
}
