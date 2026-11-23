import LZString from 'lz-string'
import { addDays, clamp, isValidISO, uid } from './calc'
import { defaultState, emptyAthlete, emptyScenario, OBJECTIVES } from './data'
import { isKnownMovement, RM_KEYS } from './movements'
import { DEFAULT_CONFIG } from './risk'
import { COMPETENCIES } from './strategy'
import type {
  AppState,
  Athlete,
  Competency,
  Format,
  Objective,
  RiskConfig,
  RuleStatus,
  Scenario,
  Session,
  SplitRule,
  StrategyState,
  TestResult,
  Wod,
  WodItem,
} from './types'

/**
 * Tout ce qui vient d'un lien, d'un fichier ou du stockage local passe par ici :
 * on ne fait confiance à aucune forme, on reconstruit un état valide.
 */

type Raw = Record<string, unknown>

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback
}

function n(v: unknown, min: number, max: number, fallback: number): number {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? clamp(x, min, max) : fallback
}

function optLoad(v: unknown): number | undefined {
  const x = n(v, 0, 1000, 0)
  return x > 0 ? x : undefined
}

const FORMATS: Format[] = ['for_time', 'amrap', 'rounds', 'technique']

export function sanitizeItem(raw: unknown): WodItem | null {
  if (!isObj(raw)) return null
  const movementId = str(raw.movementId, 40)
  if (!isKnownMovement(movementId)) return null
  const item: WodItem = {
    id: str(raw.id, 40) || uid(),
    movementId,
    qty: n(raw.qty, 0, 100000, 0),
    athletes: Math.round(n(raw.athletes, 0, 3, 0)),
    sync: raw.sync === true,
  }
  const loadM = optLoad(raw.loadM)
  const loadF = optLoad(raw.loadF)
  if (loadM) item.loadM = loadM
  if (loadF) item.loadF = loadF
  const note = str(raw.note, 120)
  if (note) item.note = note
  return item
}

export function sanitizeWod(raw: unknown): Wod | null {
  if (!isObj(raw)) return null
  const items = Array.isArray(raw.items)
    ? raw.items.slice(0, 20).map(sanitizeItem).filter((x): x is WodItem => x !== null)
    : []
  const objective = OBJECTIVES.includes(raw.objective as Objective) ? (raw.objective as Objective) : 'sync'
  const format = FORMATS.includes(raw.format as Format) ? (raw.format as Format) : 'rounds'
  const wod: Wod = {
    id: str(raw.id, 40) || uid(),
    name: str(raw.name, 80) || 'Mini-WOD',
    objective,
    format,
    rounds: Math.round(n(raw.rounds, 0, 50, 1)),
    capMin: n(raw.capMin, 0, 180, 8),
    rpe: n(raw.rpe, 1, 10, 6),
    restSec: n(raw.restSec, 0, 3600, 0),
    teamSize: Math.round(n(raw.teamSize, 1, 3, 3)),
    items,
  }
  const note = str(raw.note, 300)
  if (note) wod.note = note
  const templateId = str(raw.templateId, 40)
  if (templateId) wod.templateId = templateId
  if (isObj(raw.baseline)) {
    const baseline: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw.baseline)) {
      if (isKnownMovement(k)) baseline[k] = n(v, 0, 1e7, 0)
    }
    wod.baseline = baseline
  }
  return wod
}

function sanitizeTest(raw: unknown): TestResult | null {
  if (!isObj(raw)) return null
  const movementId = str(raw.movementId, 40)
  if (!isKnownMovement(movementId)) return null
  const t: TestResult = {
    id: str(raw.id, 40) || uid(),
    date: isValidISO(raw.date) ? raw.date : '',
    movementId,
    result: str(raw.result, 80),
    note: str(raw.note, 200),
  }
  const partnerId = str(raw.partnerId, 40)
  if (partnerId) t.partnerId = partnerId
  return t
}

export function sanitizeAthlete(raw: unknown, index: number): Athlete | null {
  if (!isObj(raw)) return null
  const base = emptyAthlete(str(raw.id, 40) || `a${index + 1}`, str(raw.name, 40) || `Athlète ${index + 1}`, raw.sex === 'M' ? 'M' : 'F')
  base.level = str(raw.level, 60)
  base.experience = str(raw.experience, 120)
  base.conditioning = str(raw.conditioning, 160)
  base.breakWeeks = n(raw.breakWeeks, 0, 104, 0)
  base.notes = str(raw.notes, 400)
  base.strengths = str(raw.strengths, 300)
  base.blockers = str(raw.blockers, 300)
  if (isObj(raw.rm)) {
    for (const key of RM_KEYS) {
      const v = n(raw.rm[key], 0, 1000, 0)
      if (v > 0) base.rm[key] = v
    }
  }
  if (isObj(raw.unbroken)) {
    for (const [k, v] of Object.entries(raw.unbroken)) {
      if (isKnownMovement(k) && v !== null && v !== '') base.unbroken[k] = Math.round(n(v, 0, 1000, 0))
    }
  }
  if (isObj(raw.competency)) {
    for (const [k, v] of Object.entries(raw.competency)) {
      if (isKnownMovement(k) && COMPETENCIES.includes(v as Competency) && v !== 'unknown') {
        base.competency[k] = v as Competency
      }
    }
  }
  if (isObj(raw.recovery)) {
    base.recovery = {
      sleep: Math.round(n(raw.recovery.sleep, 0, 5, 0)),
      soreness: Math.round(n(raw.recovery.soreness, 0, 5, 0)),
      energy: Math.round(n(raw.recovery.energy, 0, 5, 0)),
      pain: str(raw.recovery.pain, 160),
    }
  }
  if (Array.isArray(raw.tests)) {
    base.tests = raw.tests.slice(0, 60).map(sanitizeTest).filter((x): x is TestResult => x !== null)
  }
  return base
}

function sanitizeSession(raw: unknown): Session | null {
  if (!isObj(raw) || !isValidISO(raw.date)) return null
  const wod = sanitizeWod(raw.wod)
  if (!wod) return null
  const s: Session = { id: str(raw.id, 40) || uid(), date: raw.date, wod, done: raw.done === true }
  const rpe = n(raw.actualRpe, 0, 10, 0)
  if (rpe > 0) s.actualRpe = rpe
  const result = str(raw.result, 80)
  if (result) s.result = result
  const debrief = str(raw.debrief, 400)
  if (debrief) s.debrief = debrief
  return s
}

function sanitizeScenario(raw: unknown): Scenario {
  const out = emptyScenario()
  if (!isObj(raw)) return out
  if (isObj(raw.assign)) {
    for (const [k, v] of Object.entries(raw.assign)) {
      if (Array.isArray(v)) out.assign[k.slice(0, 40)] = v.filter((x): x is string => typeof x === 'string').slice(0, 3)
    }
  }
  if (isObj(raw.split)) {
    for (const [k, v] of Object.entries(raw.split)) {
      if (!isObj(v)) continue
      const row: Record<string, number> = {}
      for (const [id, w] of Object.entries(v)) row[id.slice(0, 40)] = n(w, 0, 100000, 0)
      out.split[k.slice(0, 40)] = row
    }
  }
  if (isObj(raw.notes)) {
    for (const [k, v] of Object.entries(raw.notes)) {
      const s = str(v, 200)
      if (s) out.notes[k.slice(0, 40)] = s
    }
  }
  return out
}

function sanitizeConfig(raw: unknown): RiskConfig {
  const d = DEFAULT_CONFIG
  if (!isObj(raw)) return { ...d, proximity: { ...d.proximity } }
  const proximity: Record<string, number> = { ...d.proximity }
  if (isObj(raw.proximity)) {
    for (const key of Object.keys(d.proximity)) proximity[key] = n(raw.proximity[key], 0.5, 5, d.proximity[key])
  }
  const amber = n(raw.amber, 10, 1000, d.amber)
  const weekAmber = n(raw.weekAmber, 20, 5000, d.weekAmber)
  const dayAmber = n(raw.dayAmber, 20, 3000, d.dayAmber)
  return {
    amber,
    red: Math.max(amber + 1, n(raw.red, 10, 2000, d.red)),
    dayAmber,
    dayRed: Math.max(dayAmber + 1, n(raw.dayRed, 30, 6000, d.dayRed)),
    weekAmber,
    weekRed: Math.max(weekAmber + 1, n(raw.weekRed, 20, 10000, d.weekRed)),
    proximity,
    inactivityFactor: n(raw.inactivityFactor, 1, 2, d.inactivityFactor),
    lowRecoveryFactor: n(raw.lowRecoveryFactor, 1, 2, d.lowRecoveryFactor),
    durationWeight: n(raw.durationWeight, 0, 5, d.durationWeight),
    rpeExponent: n(raw.rpeExponent, 0.5, 3, d.rpeExponent),
    burpeeAmber: n(raw.burpeeAmber, 5, 500, d.burpeeAmber),
    burpeeRed: n(raw.burpeeRed, 5, 1000, d.burpeeRed),
    gymAmber: n(raw.gymAmber, 5, 500, d.gymAmber),
    gymRed: n(raw.gymRed, 5, 1000, d.gymRed),
    squatHeavyRel: n(raw.squatHeavyRel, 0.3, 1, d.squatHeavyRel),
    maxRel: n(raw.maxRel, 0.5, 1.5, d.maxRel),
  }
}

export function sanitizeState(raw: unknown): AppState | null {
  if (!isObj(raw)) return null
  const base = defaultState()
  const athletes = Array.isArray(raw.athletes)
    ? raw.athletes.slice(0, 3).map(sanitizeAthlete).filter((x): x is Athlete => x !== null)
    : []
  // Identifiants uniques, sinon les affectations deviennent ambiguës.
  const seen = new Set<string>()
  for (const a of athletes) {
    while (seen.has(a.id)) a.id = uid()
    seen.add(a.id)
  }
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.slice(0, 40).map(sanitizeSession).filter((x): x is Session => x !== null)
    : null

  const strategies: Record<string, StrategyState> = {}
  if (isObj(raw.strategies)) {
    for (const [k, v] of Object.entries(raw.strategies)) {
      if (!isObj(v)) continue
      strategies[k.slice(0, 40)] = {
        active: v.active === 'B' ? 'B' : 'A',
        A: sanitizeScenario(v.A),
        B: sanitizeScenario(v.B),
      }
    }
  }
  const rules: Record<string, RuleStatus> = {}
  if (isObj(raw.rules)) {
    for (const [k, v] of Object.entries(raw.rules)) {
      if (v === 'confirmed' || v === 'rejected') rules[k.slice(0, 40)] = v
    }
  }
  const splitRules: Record<string, SplitRule> = {}
  if (isObj(raw.splitRules)) {
    for (const [k, v] of Object.entries(raw.splitRules)) {
      if (v === 'free' || v === 'equal') splitRules[k.slice(0, 40)] = v
    }
  }

  const competitionDate = isValidISO(raw.competitionDate) ? raw.competitionDate : base.competitionDate
  const out: AppState = {
    v: 1,
    teamName: str(raw.teamName, 30).trim(),
    competitionDate,
    athletes: athletes.length ? athletes : base.athletes,
    sessions: sessions ?? base.sessions,
    draft: sanitizeWod(raw.draft) ?? base.draft,
    draftDate: isValidISO(raw.draftDate) ? raw.draftDate : addDays(competitionDate, -5),
    strategies,
    rules,
    splitRules,
    config: sanitizeConfig(raw.config),
  }
  const draftSessionId = str(raw.draftSessionId, 40)
  if (draftSessionId && out.sessions.some((s) => s.id === draftSessionId)) out.draftSessionId = draftSessionId
  return out
}

// ---------- Liens de partage ----------

export function encodePayload(value: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(value))
}

export function decodePayload(data: string): unknown {
  try {
    const json = LZString.decompressFromEncodedURIComponent(data)
    if (!json) return null
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function encodeState(state: AppState): string {
  return encodePayload(state)
}

export function decodeState(data: string): AppState | null {
  return sanitizeState(decodePayload(data))
}

export function encodeWod(wod: Wod): string {
  return encodePayload(wod)
}

export function decodeWod(data: string): Wod | null {
  return sanitizeWod(decodePayload(data))
}

// --- Avis d'un athlète : son profil seul, à envoyer au capitaine ---

export function encodeAthlete(athlete: Athlete): string {
  return encodePayload(athlete)
}

export function decodeAthlete(data: string): Athlete | null {
  return sanitizeAthlete(decodePayload(data), 0)
}

/** Intègre l'avis reçu dans l'équipe : même identifiant, sinon même prénom. */
export function mergeAthlete(athletes: Athlete[], incoming: Athlete): Athlete[] | null {
  let index = athletes.findIndex((a) => a.id === incoming.id)
  if (index === -1) index = athletes.findIndex((a) => a.name.trim().toLowerCase() === incoming.name.trim().toLowerCase())
  if (index === -1) return null
  return athletes.map((a, i) => (i === index ? { ...incoming, id: a.id } : a))
}

// --- Proposition de séance : les parties seules, sans les profils ---

export interface SessionProposal {
  date: string
  parts: Wod[]
}

export function encodeProposal(p: SessionProposal): string {
  return encodePayload(p)
}

export function decodeProposal(data: string): SessionProposal | null {
  const raw = decodePayload(data)
  if (!isObj(raw) || !isValidISO(raw.date) || !Array.isArray(raw.parts)) return null
  const parts = raw.parts.slice(0, 8).map(sanitizeWod).filter((x): x is Wod => x !== null)
  if (!parts.length) return null
  return { date: raw.date, parts }
}

export function parseJSONState(text: string): AppState | null {
  try {
    return sanitizeState(JSON.parse(text))
  } catch {
    return null
  }
}

export function baseUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function planLink(state: AppState): string {
  return `${baseUrl()}#/import/${encodeState(state)}`
}

export function athleteLink(athlete: Athlete): string {
  return `${baseUrl()}#/avis/${encodeAthlete(athlete)}`
}

export function proposalLink(p: SessionProposal): string {
  return `${baseUrl()}#/seance/${encodeProposal(p)}`
}

export function wodLink(wod: Wod): string {
  return `${baseUrl()}#/wod/${encodeWod(wod)}`
}
