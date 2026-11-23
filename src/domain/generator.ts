import { clamp, movementTotals, num, roundTo, uid } from './calc'
import { OBJECTIVE_LABEL } from './data'
import { movement } from './movements'
import type { Equipment, Format, Objective, Wod, WodItem } from './types'

export type Intensity = 'light' | 'moderate' | 'high'

export interface GeneratorInput {
  objective: Objective
  minutes: number
  teamSize: number
  equipment: Equipment[]
  intensity: Intensity
  /** Change la sélection des mouvements : même demande, autre proposition. */
  variant: number
}

interface Candidate {
  m: string
  qty: number
  athletes: number
  sync: boolean
  loadM?: number
  loadF?: number
}

const c = (m: string, qty: number, athletes: number, sync = false, loadM?: number, loadF?: number): Candidate => ({
  m,
  qty,
  athletes,
  sync,
  loadM,
  loadF,
})

/** Volumes de base par tour, volontairement modestes (semaine de compétition). */
const POOLS: Record<Objective, Candidate[]> = {
  sync: [c('t2b', 10, 2, true), c('burpee_bj', 8, 2, true), c('db_snatch', 10, 2, true, 15, 10), c('pullup', 12, 3), c('burpee_bjo', 6, 2, true), c('sync_drill', 10, 2, true)],
  gym: [c('t2b', 10, 2, true), c('pullup', 12, 3), c('c2b', 9, 3), c('rmu_drill', 6, 3), c('burpee', 9, 3), c('sync_drill', 8, 2, true)],
  engine: [c('ski', 150, 3), c('echo', 12, 3), c('burpee', 9, 3), c('sb_carry', 10, 1, false, 30, 20), c('row', 200, 3), c('du', 40, 3), c('run', 200, 3)],
  strength: [c('db_cj', 10, 3, false, 22.5, 15), c('oh_lunge', 8, 2, false, 20, 15), c('back_squat', 5, 1, false, 40, 30), c('sb_squat', 8, 1, false, 30, 20), c('thruster', 6, 3, false, 30, 20), c('kb_swing', 12, 3, false, 16, 12)],
  transitions: [c('ski', 100, 3), c('db_snatch', 8, 2, true, 15, 10), c('sb_carry', 10, 1, false, 30, 20), c('burpee_bar', 6, 3), c('burpee_bj', 6, 2, true), c('echo', 9, 3)],
  rehearsal: [c('db_cj', 12, 3, false, 22.5, 15), c('oh_lunge', 10, 2, false, 20, 15), c('burpee_bar', 9, 3), c('back_squat', 6, 1, false, 40, 30), c('rmu_drill', 6, 3), c('t2b', 12, 2, true), c('echo', 15, 3)],
  recovery: [c('mobility', 5, 3), c('row', 300, 3), c('air_squat', 10, 3), c('sync_drill', 8, 2, true), c('ski', 100, 3)],
}

const FALLBACK: Candidate[] = [c('burpee', 6, 3), c('air_squat', 12, 3), c('sync_drill', 8, 2, true)]

const FORMAT: Record<Objective, Format> = {
  sync: 'rounds',
  gym: 'rounds',
  engine: 'amrap',
  strength: 'rounds',
  transitions: 'rounds',
  rehearsal: 'for_time',
  recovery: 'technique',
}

const RPE: Record<Intensity, number> = { light: 4.5, moderate: 6, high: 7.5 }
const VOLUME: Record<Intensity, number> = { light: 0.8, moderate: 1, high: 1.2 }

export function generateWod(input: GeneratorInput): Wod {
  const minutes = clamp(Math.round(num(input.minutes)) || 8, 3, 40)
  const team = clamp(Math.round(num(input.teamSize)) || 3, 1, 3)
  const have = new Set<Equipment>([...input.equipment, 'none'])
  const pool = POOLS[input.objective].filter((x) => have.has(movement(x.m).equipment))
  const source = pool.length ? pool : FALLBACK
  const count = Math.min(source.length, input.objective === 'recovery' ? 3 : minutes <= 6 ? 3 : 4)
  const start = Math.abs(Math.round(num(input.variant))) % source.length

  const picked: Candidate[] = []
  for (let i = 0; i < source.length && picked.length < count; i++) {
    picked.push(source[(start + i) % source.length])
  }

  const format = FORMAT[input.objective]
  const single = format === 'for_time' || format === 'technique'
  const nRounds = single ? 1 : clamp(Math.round(minutes / 3.5), 1, 5)
  const factor = VOLUME[input.intensity] * (single ? clamp(minutes / 8, 0.6, 1.6) : 1)

  const items: WodItem[] = picked.map((p) => {
    const mv = movement(p.m)
    const raw = p.qty * factor
    const qty = mv.unit === 'm' ? Math.max(10, roundTo(raw, 10)) : Math.max(1, Math.round(raw))
    const athletes = team === 1 ? 1 : Math.min(p.athletes, team)
    return {
      id: uid(),
      movementId: p.m,
      qty,
      athletes,
      sync: p.sync && athletes >= 2,
      loadM: p.loadM,
      loadF: p.loadF,
    }
  })

  const wod: Wod = {
    id: uid(),
    name: `${OBJECTIVE_LABEL[input.objective]} · ${minutes} min`,
    objective: input.objective,
    format,
    rounds: nRounds,
    capMin: minutes,
    rpe: input.objective === 'recovery' ? Math.min(RPE[input.intensity], 4) : RPE[input.intensity],
    restSec: 0,
    teamSize: team,
    items,
  }
  wod.baseline = movementTotals(wod)
  return wod
}
