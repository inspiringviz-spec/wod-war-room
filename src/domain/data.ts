import { addDays, daysBetween, instantiate, uid } from './calc'
import { ALL_EQUIPMENT } from './movements'
import { DEFAULT_CONFIG } from './risk'
import { generateTeamSession } from './teamSession'
import type { AppState, Athlete, Objective, Scenario, Session, StrategyState, Wod } from './types'

export const COMPETITION_DATE = '2026-11-28'

export interface HistoricalWod {
  id: string
  code: string
  title: string
  theme: string
  wod: Wod
  /** Ce qui figure dans les notes d'origine. */
  known: string[]
  /** Points non précisés par les notes : à confirmer, jamais supposés. */
  open: { id: string; text: string }[]
  templateId: string
}

export const HISTORICAL: HistoricalWod[] = [
  {
    id: 'h1',
    code: 'WOD 1',
    title: 'Gymnastics & Engine',
    theme: 'Gym à la barre, burpees synchro, vélo',
    templateId: 'tpl-a',
    wod: {
      id: 'h1',
      name: 'WOD 1 · Gymnastics & Engine',
      objective: 'rehearsal',
      format: 'for_time',
      rounds: 1,
      capMin: 17,
      rpe: 9,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'h1-t2b', movementId: 't2b', qty: 60, athletes: 2, sync: true },
        { id: 'h1-bbj', movementId: 'burpee_bj', qty: 30, athletes: 2, sync: true },
        { id: 'h1-echo', movementId: 'echo', qty: 90, athletes: 0, sync: false },
        { id: 'h1-bbjo', movementId: 'burpee_bjo', qty: 30, athletes: 2, sync: true },
        { id: 'h1-pu', movementId: 'pullup', qty: 60, athletes: 0, sync: false },
      ],
    },
    known: [
      'For Time, time cap de 17 minutes.',
      '60 Toes-to-Bar synchronisés à 2 athlètes.',
      '30 Burpee Box Jumps synchronisés à 2 athlètes.',
      '90 calories Echo Bike.',
      '30 Burpee Box Jump Overs synchronisés à 2 athlètes.',
      '60 Pull-Ups.',
    ],
    open: [
      { id: 'h1-echo-split', text: 'Répartition des 90 calories : libre entre les athlètes ou relais imposés ?' },
      { id: 'h1-pu-split', text: 'Répartition des 60 pull-ups : libre, ou un nombre imposé par athlète ?' },
      { id: 'h1-pairs', text: 'Le binôme synchro peut-il changer d’un mouvement à l’autre ?' },
      { id: 'h1-standards', text: 'Hauteur de box et standards de mouvement (non notés).' },
    ],
  },
  {
    id: 'h2',
    code: 'WOD 2',
    title: 'SkiErg & Sandbag',
    theme: 'Moteur, grip Fat Grip, sandbag',
    templateId: 'tpl-b',
    wod: {
      id: 'h2',
      name: 'WOD 2 · SkiErg & Sandbag',
      objective: 'rehearsal',
      format: 'amrap',
      rounds: 1,
      capMin: 9,
      rpe: 9,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'h2-ski', movementId: 'ski', qty: 0, athletes: 0, sync: false, note: 'Distance maximale' },
        { id: 'h2-snatch', movementId: 'db_snatch', qty: 10, athletes: 2, sync: true, note: 'Fat Grip' },
        { id: 'h2-carry', movementId: 'sb_carry', qty: 10, athletes: 0, sync: false },
        { id: 'h2-squat', movementId: 'sb_squat', qty: 10, loadM: 50, loadF: 30, athletes: 0, sync: false },
      ],
    },
    known: [
      'AMRAP de 9 minutes.',
      'SkiErg : distance maximale.',
      '10 DB Hang Snatches avec Fat Grip, synchronisés à 2 athlètes.',
      '10 m Sandbag Bear Hug Carry.',
      '10 Sandbag Bear Hug Squats, 50/30 kg.',
      '« +10 répétitions à chaque tour », d’après les notes d’origine.',
    ],
    open: [
      { id: 'h2-ski-score', text: 'Scoring du SkiErg : la distance est-elle le score, et un athlète skie-t-il pendant que les autres font le circuit ?' },
      { id: 'h2-progression', text: '« +10 reps à chaque tour » : sur quels mouvements s’applique la progression ?' },
      { id: 'h2-db-load', text: 'Charge des haltères (non notée).' },
      { id: 'h2-carry-load', text: 'Le portage se fait-il avec le même sandbag que les squats (50/30 kg) ?' },
      { id: 'h2-who', text: 'Qui porte et qui squatte : un athlète, ou reps partagées ?' },
    ],
  },
  {
    id: 'h3',
    code: 'WOD Final',
    title: 'Strength & Gymnastics',
    theme: 'Force, overhead, ring muscle-ups',
    templateId: 'tpl-c',
    wod: {
      id: 'h3',
      name: 'WOD Final · Strength & Gymnastics',
      objective: 'rehearsal',
      format: 'for_time',
      rounds: 1,
      capMin: 15,
      rpe: 9,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'h3-dbcj', movementId: 'db_cj', qty: 40, loadM: 22.5, loadF: 15, athletes: 3, sync: false, note: 'Fat Grip' },
        { id: 'h3-lunge', movementId: 'oh_lunge', qty: 30, loadM: 60, loadF: 40, athletes: 2, sync: false },
        { id: 'h3-bob', movementId: 'burpee_bar', qty: 30, athletes: 3, sync: false },
        { id: 'h3-bs', movementId: 'back_squat', qty: 20, loadM: 120, loadF: 80, athletes: 0, sync: false },
        { id: 'h3-rmu', movementId: 'rmu', qty: 20, athletes: 0, sync: false },
      ],
    },
    known: [
      'For Time, time cap de 15 minutes.',
      '40 DB Hang Clean & Jerks avec Fat Grip, 22,5/15 kg, 3 athlètes.',
      '30 Overhead Lunges, 60/40 kg, 2 athlètes.',
      '30 Burpees Over Bar, 3 athlètes.',
      '20 Back Squats, 120/80 kg.',
      '20 Ring Muscle-Ups.',
    ],
    open: [
      { id: 'h3-sync', text: '« 3 athlètes » et « 2 athlètes » : mouvements synchronisés ou reps partagées ? (non précisé)' },
      { id: 'h3-lunge', text: 'Overhead lunges à 2 : une barre chacun ou une barre partagée ? Reps ou mètres ?' },
      { id: 'h3-bs', text: 'Back squats 120/80 kg : qui squatte, et le partage est-il libre ?' },
      { id: 'h3-rmu', text: 'Ring muscle-ups : partage libre entre athlètes ? Une adaptation est-elle prévue ?' },
    ],
  },
]

export function historical(id: string): HistoricalWod | undefined {
  return HISTORICAL.find((h) => h.id === id)
}

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  sync: 'Synchronisation',
  gym: 'Gymnastique',
  engine: 'Moteur',
  strength: 'Technique de force',
  transitions: 'Transitions',
  rehearsal: 'Répétition de compétition',
  recovery: 'Activation / récupération',
}

export const OBJECTIVES: Objective[] = ['sync', 'gym', 'engine', 'strength', 'transitions', 'rehearsal', 'recovery']

export interface Template {
  id: string
  tag: string
  blurb: string
  rpeText: string
  inspiredBy?: string
  wod: Wod
}

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-a',
    tag: 'Modèle A',
    blurb: 'Synchro à deux sur la barre et la box, pull-ups partagés.',
    rpeText: 'RPE 6–7',
    inspiredBy: 'WOD 1',
    wod: {
      id: 'tpl-a',
      templateId: 'tpl-a',
      name: 'Synchro & Gymnastics',
      objective: 'sync',
      format: 'rounds',
      rounds: 2,
      capMin: 8,
      rpe: 6.5,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'a1', movementId: 't2b', qty: 12, athletes: 2, sync: true },
        { id: 'a2', movementId: 'burpee_bj', qty: 8, athletes: 2, sync: true },
        { id: 'a3', movementId: 'pullup', qty: 12, athletes: 3, sync: false },
      ],
    },
  },
  {
    id: 'tpl-b',
    tag: 'Modèle B',
    blurb: 'SkiErg en relais, snatches synchro, sandbag à charge modérée.',
    rpeText: 'RPE 6–7',
    inspiredBy: 'WOD 2',
    wod: {
      id: 'tpl-b',
      templateId: 'tpl-b',
      name: 'Engine & Sandbag',
      objective: 'engine',
      format: 'amrap',
      rounds: 3,
      capMin: 8,
      rpe: 6.5,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'b1', movementId: 'ski', qty: 150, athletes: 3, sync: false },
        { id: 'b2', movementId: 'db_snatch', qty: 10, loadM: 15, loadF: 10, athletes: 2, sync: true },
        { id: 'b3', movementId: 'sb_carry', qty: 10, loadM: 30, loadF: 20, athletes: 3, sync: false, note: 'Un athlète différent à chaque tour' },
        { id: 'b4', movementId: 'sb_squat', qty: 10, loadM: 30, loadF: 20, athletes: 3, sync: false, note: 'Charge modérée, en rotation' },
      ],
    },
  },
  {
    id: 'tpl-c',
    tag: 'Modèle C',
    blurb: 'Le WOD final en version courte et légère, pour caler l’ordre et les transitions.',
    rpeText: 'RPE 5–6',
    inspiredBy: 'WOD Final',
    wod: {
      id: 'tpl-c',
      templateId: 'tpl-c',
      name: 'Simulation du final',
      objective: 'rehearsal',
      format: 'for_time',
      rounds: 1,
      capMin: 8,
      rpe: 5.5,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'c1', movementId: 'db_cj', qty: 12, loadM: 22.5, loadF: 15, athletes: 3, sync: false },
        { id: 'c2', movementId: 'oh_lunge', qty: 12, loadM: 20, loadF: 15, athletes: 2, sync: false, note: 'Léger' },
        { id: 'c3', movementId: 'burpee_bar', qty: 9, athletes: 3, sync: false },
        { id: 'c4', movementId: 'back_squat', qty: 6, loadM: 40, loadF: 30, athletes: 1, sync: false, note: 'Léger' },
        { id: 'c5', movementId: 'rmu_drill', qty: 6, athletes: 3, sync: false, note: 'Drills ou transitions' },
      ],
    },
  },
  {
    id: 'tpl-express',
    tag: 'Express',
    blurb: 'Bloc court pour roder la synchro et les changements de poste.',
    rpeText: 'RPE 5–6',
    wod: {
      id: 'tpl-express',
      templateId: 'tpl-express',
      name: 'Synchro express & transitions',
      objective: 'transitions',
      format: 'rounds',
      rounds: 2,
      capMin: 6,
      rpe: 5.5,
      restSec: 0,
      teamSize: 3,
      items: [
        { id: 'e1', movementId: 'ski', qty: 100, athletes: 3, sync: false },
        { id: 'e2', movementId: 'db_snatch', qty: 8, loadM: 15, loadF: 10, athletes: 2, sync: true },
        { id: 'e3', movementId: 'sb_carry', qty: 10, loadM: 30, loadF: 20, athletes: 1, sync: false },
        { id: 'e4', movementId: 'burpee_bj', qty: 6, athletes: 2, sync: true },
      ],
    },
  },
  {
    id: 'tpl-mobility',
    tag: 'Repos actif',
    blurb: 'Mobilité et respiration, sans charge.',
    rpeText: 'RPE 2',
    wod: {
      id: 'tpl-mobility',
      templateId: 'tpl-mobility',
      name: 'Mobilité',
      objective: 'recovery',
      format: 'technique',
      rounds: 1,
      capMin: 15,
      rpe: 2,
      restSec: 0,
      teamSize: 3,
      items: [{ id: 'm1', movementId: 'mobility', qty: 15, athletes: 3, sync: false }],
    },
  },
  {
    id: 'tpl-activation',
    tag: 'Activation',
    blurb: 'Réveil léger la veille : on touche chaque geste, on ne se fatigue pas.',
    rpeText: 'RPE 4',
    wod: {
      id: 'tpl-activation',
      templateId: 'tpl-activation',
      name: 'Activation légère',
      objective: 'recovery',
      format: 'rounds',
      rounds: 2,
      capMin: 8,
      rpe: 4,
      restSec: 60,
      teamSize: 3,
      items: [
        { id: 'v1', movementId: 'ski', qty: 100, athletes: 3, sync: false },
        { id: 'v2', movementId: 't2b', qty: 4, athletes: 2, sync: true },
        { id: 'v3', movementId: 'burpee_bj', qty: 4, athletes: 2, sync: true },
        { id: 'v4', movementId: 'db_cj', qty: 6, loadM: 15, loadF: 10, athletes: 3, sync: false },
      ],
    },
  },
]

export function template(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/** Conseil selon le jour choisi pour l'unique séance d'équipe. */
export const DAY_GUIDE: Record<number, { title: string; detail: string }> = {
  5: { title: 'Très bon créneau', detail: 'Assez loin de samedi pour un vrai travail à trois, avec le temps de récupérer.' },
  4: { title: 'Bon créneau', detail: 'Quatre jours de récupération : la séance complète en trois parties passe bien.' },
  3: { title: 'Créneau correct', detail: 'Gardez des parties courtes et une intensité modérée.' },
  2: { title: 'Créneau tardif', detail: 'À 48 h, restez sur la technique et la synchro : pas de chrono, pas de charge.' },
  1: { title: 'Veille de compétition', detail: 'Activation très légère de dix minutes, ou repos complet.' },
  0: { title: 'Compétition', detail: 'Échauffement, stratégie, plaisir.' },
}

export function emptyAthlete(id: string, name: string, sex: 'M' | 'F'): Athlete {
  return {
    id,
    name,
    sex,
    level: '',
    experience: '',
    conditioning: '',
    breakWeeks: 0,
    notes: '',
    strengths: '',
    blockers: '',
    rm: {},
    unbroken: {},
    competency: {},
    recovery: { sleep: 0, soreness: 0, energy: 0, pain: '' },
    tests: [],
  }
}

export function defaultAthletes(): Athlete[] {
  const a1 = emptyAthlete('a1', 'Anas', 'M')
  a1.experience = 'Pratique le CrossFit'
  a1.conditioning = '5 km en environ 30 min (récent)'
  a1.breakWeeks = 2
  a1.notes = 'Deux semaines d’arrêt, avec des mini-WODs de maintien.'
  a1.rm = { snatch: 60, cleanJerk: 75, thruster: 87.5 }
  a1.unbroken = { t2b: 15, c2b: 15, bmu: 1, rmu: 0 }
  a1.competency = { t2b: 'comfortable', c2b: 'comfortable', bmu: 'difficult', rmu: 'not_yet' }

  const a2 = emptyAthlete('a2', 'Rebecca', 'F')
  a2.level = 'Entre Inter et RX'
  const a3 = emptyAthlete('a3', 'Natalia', 'F')
  a3.level = 'Entre Inter et RX'
  return [a1, a2, a3]
}

/** Séance d'équipe par défaut : trois parties générées à partir des profils. */
export function defaultSessions(competitionDate: string, date?: string, athletes: Athlete[] = defaultAthletes()): Session[] {
  const day = date ?? addDays(competitionDate, -5)
  const { parts } = generateTeamSession({
    athletes,
    daysOut: daysBetween(day, competitionDate),
    config: DEFAULT_CONFIG,
    minutes: 45,
    intensity: 'moderate',
    equipment: ALL_EQUIPMENT,
  })
  return parts.map((wod) => ({ id: uid(), date: day, wod, done: false }))
}

export function emptyScenario(): Scenario {
  return { assign: {}, split: {}, notes: {} }
}

export function emptyStrategy(): StrategyState {
  return { active: 'A', A: emptyScenario(), B: emptyScenario() }
}

export function defaultState(): AppState {
  return {
    v: 1,
    competitionDate: COMPETITION_DATE,
    athletes: defaultAthletes(),
    sessions: defaultSessions(COMPETITION_DATE),
    draft: instantiate(TEMPLATES[0].wod),
    draftDate: addDays(COMPETITION_DATE, -5),
    strategies: {},
    rules: {},
    splitRules: {},
    config: { ...DEFAULT_CONFIG, proximity: { ...DEFAULT_CONFIG.proximity } },
  }
}
