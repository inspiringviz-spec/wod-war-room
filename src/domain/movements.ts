import type { Equipment, Movement, MovementGroup, RmKey, Tag } from './types'

/**
 * Catalogue des mouvements. Le « coût » est une pondération heuristique
 * (1 burpee = 1 point), pas une mesure physiologique.
 */
export const MOVEMENTS: Movement[] = [
  // Gymnastique
  { id: 't2b', name: 'Toes-to-Bar', group: 'gym', unit: 'reps', cost: 0.8, tags: ['grip', 'core', 'pull'], equipment: 'rig', loaded: false },
  { id: 'pullup', name: 'Pull-Up', group: 'gym', unit: 'reps', cost: 0.8, tags: ['grip', 'pull', 'shoulder'], equipment: 'rig', loaded: false },
  { id: 'c2b', name: 'Chest-to-Bar', group: 'gym', unit: 'reps', cost: 1.0, tags: ['grip', 'pull', 'shoulder'], equipment: 'rig', loaded: false },
  { id: 'bmu', name: 'Bar Muscle-Up', group: 'gym', unit: 'reps', cost: 1.8, tags: ['grip', 'pull', 'shoulder', 'skill'], equipment: 'rig', loaded: false },
  { id: 'rmu', name: 'Ring Muscle-Up', group: 'gym', unit: 'reps', cost: 2.0, tags: ['grip', 'pull', 'shoulder', 'skill'], equipment: 'rings', loaded: false },
  { id: 'rmu_drill', name: 'Drill / transition RMU', group: 'gym', unit: 'reps', cost: 0.6, tags: ['grip', 'shoulder', 'skill'], equipment: 'rings', loaded: false },
  { id: 'hspu', name: 'Handstand Push-Up', group: 'gym', unit: 'reps', cost: 1.2, tags: ['shoulder', 'overhead', 'skill'], equipment: 'none', loaded: false },
  { id: 'sync_drill', name: 'Drill synchro à vide', group: 'gym', unit: 'reps', cost: 0.2, tags: [], equipment: 'none', loaded: false },
  // Burpees & sauts
  { id: 'burpee', name: 'Burpee', group: 'burpee', unit: 'reps', cost: 1.0, tags: ['burpee', 'impact'], equipment: 'none', loaded: false },
  { id: 'burpee_bj', name: 'Burpee Box Jump', group: 'burpee', unit: 'reps', cost: 1.4, tags: ['burpee', 'legs', 'impact', 'eccentric'], equipment: 'box', loaded: false },
  { id: 'burpee_bjo', name: 'Burpee Box Jump Over', group: 'burpee', unit: 'reps', cost: 1.4, tags: ['burpee', 'legs', 'impact', 'eccentric'], equipment: 'box', loaded: false },
  { id: 'burpee_bar', name: 'Burpee Over Bar', group: 'burpee', unit: 'reps', cost: 1.1, tags: ['burpee', 'impact'], equipment: 'barbell', loaded: false },
  { id: 'box_jump', name: 'Box Jump', group: 'burpee', unit: 'reps', cost: 0.6, tags: ['legs', 'impact', 'eccentric'], equipment: 'box', loaded: false },
  { id: 'air_squat', name: 'Air Squat', group: 'burpee', unit: 'reps', cost: 0.3, tags: ['legs'], equipment: 'none', loaded: false },
  { id: 'du', name: 'Double-Under', group: 'burpee', unit: 'reps', cost: 0.08, tags: ['impact'], equipment: 'rope', loaded: false },
  // Moteur
  { id: 'echo', name: 'Echo Bike', group: 'engine', unit: 'cal', cost: 0.5, tags: ['engine', 'legs'], equipment: 'bike', loaded: false },
  { id: 'ski', name: 'SkiErg', group: 'engine', unit: 'm', cost: 0.02, tags: ['engine', 'shoulder'], equipment: 'ski', loaded: false },
  { id: 'row', name: 'Rameur', group: 'engine', unit: 'm', cost: 0.02, tags: ['engine'], equipment: 'rower', loaded: false },
  { id: 'run', name: 'Course', group: 'engine', unit: 'm', cost: 0.012, tags: ['engine', 'impact'], equipment: 'none', loaded: false },
  // Haltères & barre
  { id: 'db_snatch', name: 'DB Hang Snatch', group: 'weights', unit: 'reps', cost: 0.7, tags: ['grip', 'shoulder', 'overhead'], equipment: 'dumbbell', loaded: true },
  { id: 'db_cj', name: 'DB Hang Clean & Jerk', group: 'weights', unit: 'reps', cost: 0.9, tags: ['grip', 'shoulder', 'overhead'], equipment: 'dumbbell', loaded: true },
  { id: 'oh_lunge', name: 'Overhead Lunge', group: 'weights', unit: 'reps', cost: 1.2, tags: ['legs', 'shoulder', 'overhead', 'eccentric', 'squat'], equipment: 'barbell', rm: 'cleanJerk', heavyAbs: { M: 40, F: 25 }, loaded: true },
  { id: 'back_squat', name: 'Back Squat', group: 'weights', unit: 'reps', cost: 1.2, tags: ['legs', 'squat', 'eccentric'], equipment: 'barbell', rm: 'backSquat', heavyAbs: { M: 80, F: 50 }, loaded: true },
  { id: 'front_squat', name: 'Front Squat', group: 'weights', unit: 'reps', cost: 1.2, tags: ['legs', 'squat', 'eccentric'], equipment: 'barbell', rm: 'frontSquat', heavyAbs: { M: 70, F: 45 }, loaded: true },
  { id: 'thruster', name: 'Thruster', group: 'weights', unit: 'reps', cost: 1.3, tags: ['legs', 'shoulder', 'overhead', 'squat'], equipment: 'barbell', rm: 'thruster', heavyAbs: { M: 50, F: 35 }, loaded: true },
  { id: 'clean_jerk', name: 'Clean & Jerk (barre)', group: 'weights', unit: 'reps', cost: 1.3, tags: ['grip', 'legs', 'shoulder', 'overhead'], equipment: 'barbell', rm: 'cleanJerk', heavyAbs: { M: 60, F: 40 }, loaded: true },
  { id: 'snatch', name: 'Snatch (barre)', group: 'weights', unit: 'reps', cost: 1.2, tags: ['grip', 'shoulder', 'overhead'], equipment: 'barbell', rm: 'snatch', heavyAbs: { M: 45, F: 30 }, loaded: true },
  { id: 'deadlift', name: 'Deadlift', group: 'weights', unit: 'reps', cost: 1.0, tags: ['grip', 'legs'], equipment: 'barbell', rm: 'deadlift', heavyAbs: { M: 100, F: 70 }, loaded: true },
  { id: 'kb_swing', name: 'Kettlebell Swing', group: 'weights', unit: 'reps', cost: 0.6, tags: ['grip', 'legs'], equipment: 'kettlebell', loaded: true },
  { id: 'wall_ball', name: 'Wall Ball', group: 'weights', unit: 'reps', cost: 0.8, tags: ['legs', 'shoulder'], equipment: 'wallball', loaded: true },
  // Sandbag
  { id: 'sb_carry', name: 'Sandbag Bear Hug Carry', group: 'odd', unit: 'm', cost: 0.15, tags: ['core', 'legs'], equipment: 'sandbag', loaded: true },
  { id: 'sb_squat', name: 'Sandbag Bear Hug Squat', group: 'odd', unit: 'reps', cost: 1.1, tags: ['legs', 'squat', 'core', 'eccentric'], equipment: 'sandbag', loaded: true },
  // Récupération
  { id: 'mobility', name: 'Mobilité / respiration', group: 'recovery', unit: 'min', cost: 0, tags: [], equipment: 'none', loaded: false },
]

const BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]))

const FALLBACK: Movement = {
  id: 'unknown',
  name: 'Mouvement inconnu',
  group: 'gym',
  unit: 'reps',
  cost: 0.5,
  tags: [],
  equipment: 'none',
  loaded: false,
}

export function movement(id: string): Movement {
  return BY_ID.get(id) ?? FALLBACK
}

export function isKnownMovement(id: string): boolean {
  return BY_ID.has(id)
}

export const GROUP_LABEL: Record<MovementGroup, string> = {
  gym: 'Gymnastique',
  burpee: 'Burpees & sauts',
  engine: 'Moteur',
  weights: 'Haltères & barre',
  odd: 'Sandbag',
  recovery: 'Récupération',
}

export const GROUP_ORDER: MovementGroup[] = ['gym', 'burpee', 'engine', 'weights', 'odd', 'recovery']

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  rig: 'Barre de traction',
  rings: 'Anneaux',
  box: 'Box',
  bike: 'Echo Bike',
  ski: 'SkiErg',
  rower: 'Rameur',
  dumbbell: 'Haltères',
  barbell: 'Barre olympique',
  sandbag: 'Sandbag',
  kettlebell: 'Kettlebell',
  wallball: 'Wall ball',
  rope: 'Corde à sauter',
  none: 'Poids du corps',
}

export const ALL_EQUIPMENT: Equipment[] = [
  'rig',
  'rings',
  'box',
  'bike',
  'ski',
  'rower',
  'dumbbell',
  'barbell',
  'sandbag',
  'kettlebell',
  'wallball',
  'rope',
]

export const RM_LABEL: Record<RmKey, string> = {
  snatch: 'Snatch',
  cleanJerk: 'Clean & Jerk',
  thruster: 'Thruster',
  backSquat: 'Back Squat',
  frontSquat: 'Front Squat',
  deadlift: 'Deadlift',
}

export const RM_KEYS: RmKey[] = ['snatch', 'cleanJerk', 'thruster', 'backSquat', 'frontSquat', 'deadlift']

export const TAG_LABEL: Record<Tag, string> = {
  grip: 'Grip',
  shoulder: 'Épaules',
  overhead: 'Overhead',
  legs: 'Jambes',
  eccentric: 'Excentrique',
  impact: 'Impacts',
  core: 'Gainage',
  engine: 'Moteur',
  pull: 'Tirage gym',
  burpee: 'Burpees',
  squat: 'Squat',
  skill: 'Technique',
}

/** Mouvements évalués dans la matrice de compétence (ceux des WODs de référence d'abord). */
export const COMPETENCY_MOVEMENTS: string[] = [
  't2b',
  'pullup',
  'c2b',
  'bmu',
  'rmu',
  'burpee_bj',
  'burpee_bar',
  'echo',
  'ski',
  'db_snatch',
  'db_cj',
  'oh_lunge',
  'back_squat',
  'sb_carry',
  'sb_squat',
]

export const UNBROKEN_MOVEMENTS: string[] = ['t2b', 'pullup', 'c2b', 'bmu', 'rmu']

export function unitLabel(unit: Movement['unit'], qty: number): string {
  if (unit === 'cal') return 'cal'
  if (unit === 'm') return 'm'
  if (unit === 'min') return 'min'
  return qty > 1 ? 'reps' : 'rep'
}
