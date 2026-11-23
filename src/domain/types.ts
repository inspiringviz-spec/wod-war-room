export type Sex = 'M' | 'F'

export type Competency = 'comfortable' | 'manageable' | 'difficult' | 'not_yet' | 'unknown'

export type RmKey = 'snatch' | 'cleanJerk' | 'thruster' | 'backSquat' | 'frontSquat' | 'deadlift'

export type Tag =
  | 'grip'
  | 'shoulder'
  | 'overhead'
  | 'legs'
  | 'eccentric'
  | 'impact'
  | 'core'
  | 'engine'
  | 'pull'
  | 'burpee'
  | 'squat'
  | 'skill'

export type Unit = 'reps' | 'cal' | 'm' | 'min'

export type Equipment =
  | 'rig'
  | 'rings'
  | 'box'
  | 'bike'
  | 'ski'
  | 'rower'
  | 'dumbbell'
  | 'barbell'
  | 'sandbag'
  | 'kettlebell'
  | 'wallball'
  | 'rope'
  | 'none'

export type MovementGroup = 'gym' | 'burpee' | 'engine' | 'weights' | 'odd' | 'recovery'

export interface Movement {
  id: string
  name: string
  group: MovementGroup
  unit: Unit
  /** Coût heuristique par unité (1 burpee = 1). */
  cost: number
  tags: Tag[]
  equipment: Equipment
  /** 1RM de référence pour la charge relative. */
  rm?: RmKey
  /** Charge considérée comme « probablement lourde » quand le 1RM est inconnu. */
  heavyAbs?: { M: number; F: number }
  loaded: boolean
}

export interface Recovery {
  /** 1 (mauvais) à 5 (excellent), 0 = non renseigné */
  sleep: number
  /** 1 (aucune) à 5 (très fortes), 0 = non renseigné */
  soreness: number
  /** 1 (à plat) à 5 (en forme), 0 = non renseigné */
  energy: number
  pain: string
}

export interface TestResult {
  id: string
  date: string
  movementId: string
  result: string
  note: string
  partnerId?: string
}

export interface Athlete {
  id: string
  name: string
  sex: Sex
  level: string
  experience: string
  conditioning: string
  breakWeeks: number
  notes: string
  rm: Partial<Record<RmKey, number>>
  /** Max de répétitions enchaînées, par mouvement. */
  unbroken: Record<string, number>
  competency: Record<string, Competency>
  recovery: Recovery
  tests: TestResult[]
}

export type Objective =
  | 'sync'
  | 'gym'
  | 'engine'
  | 'strength'
  | 'transitions'
  | 'rehearsal'
  | 'recovery'

export type Format = 'for_time' | 'amrap' | 'rounds' | 'technique'

export interface WodItem {
  id: string
  movementId: string
  qty: number
  loadM?: number
  loadF?: number
  /** 0 = non précisé (WODs historiques). */
  athletes: number
  sync: boolean
  note?: string
}

export interface Wod {
  id: string
  name: string
  objective: Objective
  format: Format
  /** Pour un AMRAP : nombre de tours estimé. */
  rounds: number
  capMin: number
  rpe: number
  restSec: number
  teamSize: number
  items: WodItem[]
  note?: string
  templateId?: string
  /** Volume d'origine par mouvement (qty × rounds), pour détecter les hausses. */
  baseline?: Record<string, number>
}

export interface Session {
  id: string
  date: string
  wod: Wod
  done: boolean
  actualRpe?: number
  result?: string
  debrief?: string
}

export type SplitRule = 'unknown' | 'free' | 'equal'
export type RuleStatus = 'unknown' | 'confirmed' | 'rejected'

export interface Scenario {
  assign: Record<string, string[]>
  split: Record<string, Record<string, number>>
  notes: Record<string, string>
}

export interface StrategyState {
  active: 'A' | 'B'
  A: Scenario
  B: Scenario
}

export interface RiskConfig {
  amber: number
  red: number
  weekAmber: number
  weekRed: number
  /** Multiplicateur selon les jours restants (clé = jours avant la compétition). */
  proximity: Record<string, number>
  inactivityFactor: number
  lowRecoveryFactor: number
  durationWeight: number
  rpeExponent: number
  burpeeAmber: number
  burpeeRed: number
  gymAmber: number
  gymRed: number
  squatHeavyRel: number
  maxRel: number
}

export interface AppState {
  v: 1
  competitionDate: string
  athletes: Athlete[]
  sessions: Session[]
  draft: Wod
  /** Jour pour lequel le brouillon est évalué. */
  draftDate: string
  /** Séance du planning en cours de modification dans le builder. */
  draftSessionId?: string
  strategies: Record<string, StrategyState>
  rules: Record<string, RuleStatus>
  splitRules: Record<string, SplitRule>
  config: RiskConfig
}

export type Level = 'green' | 'amber' | 'red'
export type Severity = 'info' | 'amber' | 'red'

export interface Warning {
  id: string
  severity: Severity
  title: string
  explanation: string
  contributors: string[]
  suggestions: string[]
  fixLabel?: string
  fix?: (wod: Wod) => Wod
}

export interface Assessment {
  score: number
  level: Level
  scoreLevel: Level
  volume: number
  duration: number
  rpeFactor: number
  proximity: number
  context: number
  daysOut: number
  warnings: Warning[]
  tagPoints: Record<Tag, number>
  breakdown: { itemId: string; label: string; points: number }[]
}
