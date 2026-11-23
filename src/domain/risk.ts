import {
  clamp,
  cloneWod,
  dayName,
  daysBetween,
  emptyTagPoints,
  itemPoints,
  loadFor,
  movementTotals,
  num,
  perAthleteRepsByTag,
  perAthleteUnits,
  prescribedTotal,
  relativeLoad,
  roundTo,
  rounds,
  weekDays,
} from './calc'
import { movement, RM_LABEL } from './movements'
import type {
  Assessment,
  Athlete,
  Level,
  Movement,
  RiskConfig,
  Session,
  Severity,
  Warning,
  Wod,
  WodItem,
} from './types'

/**
 * FATIGUE GUARD — outil heuristique de planification.
 * Il ne prédit ni les blessures ni une probabilité de fatigue validée
 * scientifiquement : il additionne des points de volume, les pondère par
 * l'intensité, la proximité de la compétition et le contexte, puis applique
 * des règles explicites. Tous les seuils sont dans `RiskConfig`.
 */
export const DEFAULT_CONFIG: RiskConfig = {
  amber: 100,
  red: 160,
  dayAmber: 200,
  dayRed: 300,
  weekAmber: 300,
  weekRed: 450,
  proximity: { '0': 2.2, '1': 2.0, '2': 1.6, '3': 1.2, '4': 1.05 },
  inactivityFactor: 1.15,
  lowRecoveryFactor: 1.15,
  durationWeight: 0.8,
  rpeExponent: 1.6,
  burpeeAmber: 30,
  burpeeRed: 50,
  gymAmber: 40,
  gymRed: 70,
  squatHeavyRel: 0.7,
  maxRel: 0.9,
}

export interface RiskContext {
  daysOut: number
  athletes: Athlete[]
  config: RiskConfig
}

const ORDER: Record<Level, number> = { green: 0, amber: 1, red: 2 }

export function maxLevel(a: Level, b: Level): Level {
  return ORDER[a] >= ORDER[b] ? a : b
}

export function levelFromSeverity(s: Severity): Level {
  return s === 'red' ? 'red' : s === 'amber' ? 'amber' : 'green'
}

export function proximityFactor(daysOut: number, cfg: RiskConfig): number {
  if (!Number.isFinite(daysOut) || daysOut < 0) return 1
  const f = num(cfg.proximity[String(Math.round(daysOut))])
  return f > 0 ? f : 1
}

export function rpeFactor(rpe: number, cfg: RiskConfig): number {
  const r = clamp(num(rpe) || 1, 1, 10)
  return Math.pow(r / 6, cfg.rpeExponent)
}

export function hasRecentBreak(athletes: Athlete[]): Athlete | undefined {
  return athletes.find((a) => num(a.breakWeeks) >= 2)
}

export function lowRecoveryAthletes(athletes: Athlete[]): Athlete[] {
  return athletes.filter((a) => {
    const r = a.recovery
    return (r.sleep > 0 && r.sleep <= 2) || r.soreness >= 4 || (r.energy > 0 && r.energy <= 2)
  })
}

export function contextFactor(athletes: Athlete[], cfg: RiskConfig): number {
  let f = 1
  if (hasRecentBreak(athletes)) f *= cfg.inactivityFactor
  if (lowRecoveryAthletes(athletes).length) f *= cfg.lowRecoveryFactor
  return f
}

export function whenLabel(daysOut: number): string {
  if (daysOut === 0) return 'le jour de la compétition'
  if (daysOut === 1) return 'la veille de la compétition'
  if (daysOut === 2) return 'à 48 h de la compétition'
  if (daysOut > 2) return `à J-${daysOut}`
  return 'après la compétition'
}

/** Plafond de RPE conseillé selon les jours restants. */
export function rpeCap(daysOut: number): number {
  if (daysOut <= 1) return 4
  if (daysOut === 2) return 5
  if (daysOut === 3) return 6
  return 7
}

// ---------- Outils de modification (utilisés par les correctifs en un clic) ----------

function scaleQty(item: WodItem, factor: number): number {
  const q = num(item.qty)
  if (q <= 0) return q
  const mv = movement(item.movementId)
  const raw = q * factor
  if (mv.unit === 'm' && q >= 20) return Math.max(10, roundTo(raw, 10))
  return Math.max(1, Math.round(raw))
}

export function scaleItems(wod: Wod, pred: (item: WodItem, mv: Movement) => boolean, factor: number): Wod {
  const next = cloneWod(wod)
  next.items = next.items.map((item) =>
    pred(item, movement(item.movementId)) ? { ...item, qty: scaleQty(item, factor) } : item,
  )
  return next
}

function capPerAthleteByTag(wod: Wod, tag: 'burpee' | 'pull', cap: number): Wod {
  const current = perAthleteRepsByTag(wod, tag)
  if (current <= cap || current <= 0) return wod
  return scaleItems(wod, (_i, mv) => mv.unit === 'reps' && mv.tags.includes(tag), cap / current)
}

function isHeavyLeg(mv: Movement): boolean {
  return mv.loaded && mv.tags.includes('squat') && Boolean(mv.rm)
}

/** Ramène les charges des mouvements à 1RM de référence à `pct` du 1RM (ou −40 % si 1RM inconnu). */
export function lightenLoads(wod: Wod, athletes: Athlete[], pct: number, only?: (mv: Movement) => boolean): Wod {
  const next = cloneWod(wod)
  next.items = next.items.map((item) => {
    const mv = movement(item.movementId)
    if (!mv.rm || (only && !only(mv))) return item
    const out = { ...item }
    for (const sex of ['M', 'F'] as const) {
      const load = loadFor(item, sex)
      if (load <= 0) continue
      const rms = athletes
        .filter((a) => a.sex === sex)
        .map((a) => num(a.rm[mv.rm!]))
        .filter((x) => x > 0)
      let target = load
      if (rms.length) {
        target = Math.floor((Math.min(...rms) * pct) / 2.5) * 2.5
      } else if (mv.heavyAbs && load >= mv.heavyAbs[sex]) {
        // 1RM inconnu : on repasse nettement sous le seuil « probablement lourd ».
        target = Math.floor(Math.min(load * 0.6, mv.heavyAbs[sex] * 0.75) / 2.5) * 2.5
      }
      target = Math.max(2.5, target)
      if (target < load) {
        if (sex === 'M') out.loadM = target
        else out.loadF = target
      }
    }
    return out
  })
  return next
}

function capHeavyLegReps(wod: Wod, cap: number): Wod {
  const next = cloneWod(wod)
  const r = Math.max(1, rounds(wod))
  next.items = next.items.map((item) => {
    if (!isHeavyLeg(movement(item.movementId))) return item
    const perRound = Math.max(1, Math.floor(cap / r))
    return num(item.qty) > perRound ? { ...item, qty: perRound } : item
  })
  return next
}

function restoreBaseline(wod: Wod, onlyMovement?: string): Wod {
  if (!wod.baseline) return wod
  const next = cloneWod(wod)
  const r = rounds(wod)
  if (r <= 0) return next
  const now = movementTotals(wod)
  next.items = next.items.map((item) => {
    if (onlyMovement && item.movementId !== onlyMovement) return item
    const base = num(wod.baseline?.[item.movementId])
    const cur = num(now[item.movementId])
    if (base <= 0 || cur <= base) return item
    return { ...item, qty: scaleQty(item, base / cur) }
  })
  return next
}

function pct(n: number): string {
  return `${Math.round(n * 100)} %`
}

// ---------- Évaluation d'une séance ----------

export function assessSession(wod: Wod, ctx: RiskContext, rpeOverride?: number): Assessment {
  const cfg = ctx.config
  const { athletes, daysOut } = ctx
  const rpe = clamp(num(rpeOverride ?? wod.rpe) || 1, 1, 10)

  const breakdown = wod.items.map((item) => ({
    itemId: item.id,
    label: movement(item.movementId).name,
    points: itemPoints(item, wod, athletes),
  }))
  const volume = breakdown.reduce((s, b) => s + b.points, 0)
  const duration = num(wod.capMin) * cfg.durationWeight
  const rf = rpeFactor(rpe, cfg)
  const prox = proximityFactor(daysOut, cfg)
  const context = contextFactor(athletes, cfg)
  const hasWork = volume > 0 || num(wod.capMin) > 0
  const score = hasWork ? (volume + duration) * rf * prox * context : 0
  const scoreLevel: Level = score >= cfg.red ? 'red' : score >= cfg.amber ? 'amber' : 'green'

  const tags = emptyTagPoints()
  for (const item of wod.items) {
    const pts = itemPoints(item, wod, athletes)
    for (const tag of movement(item.movementId).tags) tags[tag] += pts
  }

  const warnings: Warning[] = []
  const when = whenLabel(daysOut)
  const close = daysOut >= 0 && daysOut <= 3

  // --- Validation (jamais bloquante) ---
  if (rounds(wod) === 0 && wod.items.length > 0) {
    warnings.push({
      id: 'zero-rounds',
      severity: 'info',
      title: '0 tour : la séance ne contient aucun travail',
      explanation: 'Le nombre de tours est à zéro, le volume calculé est donc nul.',
      contributors: [],
      suggestions: ['Indiquez au moins 1 tour.'],
      fixLabel: 'Passer à 1 tour',
      fix: (w) => ({ ...cloneWod(w), rounds: 1 }),
    })
  }
  for (const item of wod.items) {
    const mv = movement(item.movementId)
    if (item.sync && Math.round(num(item.athletes)) === 1) {
      warnings.push({
        id: `sync-solo-${item.id}`,
        severity: 'info',
        title: `Règle contradictoire : ${mv.name} synchro avec 1 athlète`,
        explanation: 'Un mouvement synchronisé demande au moins deux athlètes.',
        contributors: [mv.name],
        suggestions: ['Passez à 2 athlètes ou retirez la synchro.'],
        fixLabel: 'Passer à 2 athlètes',
        fix: (w) => {
          const n = cloneWod(w)
          n.items = n.items.map((i) => (i.id === item.id ? { ...i, athletes: 2 } : i))
          return n
        },
      })
    }
    if (num(item.athletes) > num(wod.teamSize) && num(wod.teamSize) > 0) {
      warnings.push({
        id: `too-many-${item.id}`,
        severity: 'info',
        title: `${mv.name} : plus d'athlètes que dans l'équipe`,
        explanation: `L'item demande ${item.athletes} athlètes pour une équipe de ${wod.teamSize}.`,
        contributors: [mv.name],
        suggestions: ["Ajustez le nombre d'athlètes de l'item ou la taille de l'équipe."],
      })
    }
  }

  // --- Charges relatives ---
  for (const item of wod.items) {
    const mv = movement(item.movementId)
    if (!mv.rm) continue
    const rl = relativeLoad(item, athletes)
    const reps = prescribedTotal(item, wod)
    if (reps <= 0) continue
    const rmName = RM_LABEL[mv.rm]

    if (rl.rel !== null && rl.rel >= cfg.maxRel) {
      warnings.push({
        id: `max-${item.id}`,
        severity: 'red',
        title: `${mv.name} : charge proche du maximum`,
        explanation: `La charge prévue représente ${pct(rl.rel)} du 1RM ${rmName} de ${rl.who}. Une tentative maximale cette semaine n'apporte rien pour samedi et coûte de la fraîcheur.`,
        contributors: [`${mv.name} à ${pct(rl.rel)} du 1RM`],
        suggestions: ['Restez à 60–70 % du 1RM et soignez la vitesse de barre.'],
        fixLabel: 'Ramener à 70 % du 1RM',
        fix: (w) => lightenLoads(w, athletes, 0.7, (m) => m.id === mv.id),
      })
    } else if (isHeavyLeg(mv)) {
      const heavy = (rl.rel !== null && rl.rel >= cfg.squatHeavyRel) || rl.heavyUnknown
      if (heavy) {
        const detail =
          rl.rel !== null
            ? `${pct(rl.rel)} du 1RM ${rmName} de ${rl.who}`
            : `charge élevée, 1RM ${rmName} non renseigné`
        const severity: Severity | null =
          daysOut >= 0 && daysOut <= 2 ? 'red' : reps > 15 ? 'red' : close ? 'amber' : reps > 8 ? 'amber' : null
        if (severity) {
          warnings.push({
            id: `heavy-legs-${item.id}`,
            severity,
            title:
              daysOut >= 0 && daysOut <= 2
                ? `${mv.name} lourd ${when} : la récupération peut être compromise`
                : `${mv.name} lourd : volume à surveiller`,
            explanation: `${reps} reps prévues (${detail}). Le travail lourd des jambes crée des courbatures qui mettent plusieurs jours à disparaître.`,
            contributors: [`${reps} × ${mv.name}`, detail],
            suggestions: ['Gardez le geste, baissez la charge à 50 % et limitez-vous à 6 reps techniques.'],
            fixLabel: 'Alléger à 50 % · 6 reps max',
            fix: (w) => capHeavyLegReps(lightenLoads(w, athletes, 0.5, (m) => m.id === mv.id), 6),
          })
        }
      }
    }
    if (rl.missing && !rl.heavyUnknown) {
      warnings.push({
        id: `rm-missing-${item.id}`,
        severity: 'info',
        title: `${mv.name} : 1RM ${rmName} non renseigné`,
        explanation: "Sans 1RM, la charge relative n'est pas évaluée pour tous les athlètes. L'indicateur peut sous-estimer cette séance.",
        contributors: [mv.name],
        suggestions: ['Renseignez le 1RM dans le profil (sans le tester cette semaine).'],
      })
    }
  }

  // --- Intensité ---
  const cap = rpeCap(daysOut)
  let rpeSeverity: Severity | null = null
  if (rpe >= 9) rpeSeverity = 'red'
  else if (rpe >= 8) rpeSeverity = close ? 'red' : 'amber'
  else if (daysOut === 1 || daysOut === 0) rpeSeverity = rpe >= 7 ? 'red' : rpe >= 6 ? 'amber' : null
  else if (daysOut === 2 && rpe >= 7) rpeSeverity = 'amber'
  if (rpeSeverity && hasWork) {
    warnings.push({
      id: 'intensity',
      severity: rpeSeverity,
      title: `Intensité RPE ${rpe} trop élevée ${when}`,
      explanation:
        rpe >= 9
          ? "Un effort maximal ou jusqu'à l'échec cette semaine consomme la fraîcheur dont vous aurez besoin samedi."
          : `À ce stade, l'objectif est de garder les sensations, pas de créer de la fatigue. RPE conseillé : ${cap} ou moins.`,
      contributors: [`RPE prévu ${rpe}`, `RPE conseillé ≤ ${cap}`],
      suggestions: [`Visez un RPE ${cap} : rythme de course contrôlé, aucune série à l'échec.`],
      fixLabel: `Passer à RPE ${cap}`,
      fix: (w) => ({ ...cloneWod(w), rpe: Math.min(num(w.rpe) || cap, cap) }),
    })
  }

  // --- Burpees ---
  const burpees = perAthleteRepsByTag(wod, 'burpee')
  if (burpees > cfg.burpeeAmber) {
    const target = Math.max(6, Math.round(cfg.burpeeAmber * 0.8))
    warnings.push({
      id: 'burpees',
      severity: burpees > cfg.burpeeRed ? 'red' : 'amber',
      title: `${Math.round(burpees)} burpees par athlète : volume élevé`,
      explanation: 'Les burpees répétés à effort soutenu fatiguent fortement les épaules, les jambes et le système cardio.',
      contributors: [`${Math.round(burpees)} burpees par athlète impliqué`],
      suggestions: [`Limitez-vous à environ ${target} burpees par athlète, à rythme régulier.`],
      fixLabel: `Réduire à ~${target} par athlète`,
      fix: (w) => capPerAthleteByTag(w, 'burpee', target),
    })
  }

  // --- Volume gymnastique en tirage ---
  const pulls = perAthleteRepsByTag(wod, 'pull')
  if (pulls > cfg.gymAmber) {
    const target = Math.max(8, Math.round(cfg.gymAmber * 0.75))
    warnings.push({
      id: 'gym-volume',
      severity: pulls > cfg.gymRed ? 'red' : 'amber',
      title: `${Math.round(pulls)} reps de gym à la barre par athlète`,
      explanation: 'Un gros volume de toes-to-bar, pull-ups ou muscle-ups use le grip et la peau des mains, deux choses qui ne se récupèrent pas en quelques jours.',
      contributors: [`${Math.round(pulls)} reps de tirage par athlète impliqué`],
      suggestions: [`Restez autour de ${target} reps par athlète, en petites séries propres.`],
      fixLabel: `Réduire à ~${target} par athlète`,
      fix: (w) => capPerAthleteByTag(w, 'pull', target),
    })
  }

  // --- Grip + overhead ---
  if (tags.grip >= 25 && tags.overhead >= 15) {
    warnings.push({
      id: 'grip-overhead',
      severity: 'amber',
      title: 'Grip et overhead cumulés',
      explanation: "Cette séance combine une fatigue de grip importante avec du volume au-dessus de la tête : les épaules et les avant-bras sont sollicités sans relâche.",
      contributors: [`Grip : ${Math.round(tags.grip)} pts`, `Overhead : ${Math.round(tags.overhead)} pts`],
      suggestions: ['Réduisez le volume overhead ou séparez grip et overhead sur deux jours.'],
      fixLabel: 'Réduire l’overhead de 40 %',
      fix: (w) => scaleItems(w, (_i, mv) => mv.tags.includes('overhead'), 0.6),
    })
  }

  // --- Excentrique jambes ---
  if (tags.eccentric >= 40 && close) {
    warnings.push({
      id: 'eccentric',
      severity: 'amber',
      title: 'Beaucoup de travail excentrique des jambes',
      explanation: 'Sauts, fentes et squats freinés provoquent des courbatures tardives (24 à 72 h).',
      contributors: [`Excentrique : ${Math.round(tags.eccentric)} pts`],
      suggestions: ['Réduisez sauts, fentes et squats d’un tiers ; descendez de la box en marchant.'],
      fixLabel: 'Réduire d’un tiers',
      fix: (w) => scaleItems(w, (_i, mv) => mv.tags.includes('eccentric'), 0.67),
    })
  }

  // --- Hausse de volume par rapport au modèle ---
  if (wod.baseline) {
    const now = movementTotals(wod)
    for (const [mvId, baseRaw] of Object.entries(wod.baseline)) {
      const base = num(baseRaw)
      const cur = num(now[mvId])
      if (base <= 0 || cur <= base) continue
      const inc = (cur - base) / base
      const mv = movement(mvId)
      const isBurpee = mv.tags.includes('burpee')
      if (inc >= (isBurpee ? 0.3 : 0.5)) {
        warnings.push({
          id: `increase-${mvId}`,
          severity: 'amber',
          title: `Volume de ${mv.name} augmenté de ${pct(inc)}`,
          explanation: `Vous êtes passé de ${Math.round(base)} à ${Math.round(cur)} par rapport au modèle. Cela peut créer une fatigue inutile avant samedi.`,
          contributors: [`${mv.name} : ${Math.round(base)} → ${Math.round(cur)}`],
          suggestions: ['Revenez au volume du modèle : il a été calibré pour cette semaine.'],
          fixLabel: 'Revenir au volume du modèle',
          fix: (w) => restoreBaseline(w, mvId),
        })
      }
    }
  }

  // --- Durée ---
  const capMin = num(wod.capMin)
  if (capMin > 30 || (capMin > 20 && close)) {
    warnings.push({
      id: 'duration',
      severity: 'amber',
      title: `Séance longue (${capMin} min) ${when}`,
      explanation: 'Cette semaine, des blocs courts suffisent pour garder les repères.',
      contributors: [`Durée ${capMin} min`],
      suggestions: ['Limitez le bloc principal à 12 minutes.'],
      fixLabel: 'Limiter à 12 min',
      fix: (w) => ({ ...cloneWod(w), capMin: 12 }),
    })
  }

  // --- Reprise après arrêt ---
  const paused = hasRecentBreak(athletes)
  if (paused && hasWork) {
    const demanding = score >= cfg.amber * 0.9
    warnings.push({
      id: 'inactivity',
      severity: demanding ? 'amber' : 'info',
      title: demanding
        ? `Reprise récente de ${paused.name} : charge à modérer`
        : `Reprise récente de ${paused.name} prise en compte`,
      explanation: `Après ${paused.breakWeeks} semaines d’arrêt, une charge plus prudente s’impose : la tolérance au volume baisse plus vite que les sensations. Le score est majoré de ${pct(cfg.inactivityFactor - 1)}.`,
      contributors: [`${paused.breakWeeks} semaines d’arrêt (${paused.name})`],
      suggestions: ['Ne cherchez pas à rattraper le retard : réduisez le volume plutôt que d’ajouter des séances.'],
      fixLabel: demanding ? 'Réduire le volume de 25 %' : undefined,
      fix: demanding ? (w) => scaleItems(w, () => true, 0.75) : undefined,
    })
  }

  // --- Récupération déclarée ---
  const painful = athletes.filter((a) => a.recovery.pain.trim().length > 0)
  if (painful.length && hasWork) {
    warnings.push({
      id: 'pain',
      severity: 'amber',
      title: `Douleur signalée : ${painful.map((a) => a.name).join(', ')}`,
      explanation: `${painful.map((a) => `${a.name} : ${a.recovery.pain.trim()}`).join(' · ')}. L'application ne pose pas de diagnostic : adaptez les mouvements concernés et consultez un professionnel de santé si la douleur persiste.`,
      contributors: painful.map((a) => `${a.name} : ${a.recovery.pain.trim()}`),
      suggestions: ['Retirez ou remplacez les mouvements qui réveillent la douleur.', 'En cas de doute, faites valider par un kiné ou un médecin.'],
    })
  }
  const tired = lowRecoveryAthletes(athletes)
  if (tired.length && hasWork) {
    const demanding = score >= cfg.amber * 0.5
    warnings.push({
      id: 'recovery',
      severity: demanding ? 'amber' : 'info',
      title: `Récupération basse : ${tired.map((a) => a.name).join(', ')}`,
      explanation: `Sommeil, courbatures ou énergie déclarés défavorables. Le score est majoré de ${pct(cfg.lowRecoveryFactor - 1)}.`,
      contributors: tired.map((a) => a.name),
      suggestions: ['Allégez la séance ou remplacez-la par de la mobilité.'],
      fixLabel: demanding ? 'Réduire le volume de 25 %' : undefined,
      fix: demanding ? (w) => scaleItems(w, () => true, 0.75) : undefined,
    })
  }

  // --- Mouvements non acquis ---
  const seen = new Set<string>()
  for (const item of wod.items) {
    if (seen.has(item.movementId)) continue
    seen.add(item.movementId)
    if (athletes.length && athletes.every((a) => a.competency[item.movementId] === 'not_yet')) {
      const mv = movement(item.movementId)
      warnings.push({
        id: `not-yet-${item.movementId}`,
        severity: 'info',
        title: `${mv.name} : aucun athlète ne le valide actuellement`,
        explanation: 'Travaillez une variante technique plutôt que des tentatives répétées.',
        contributors: [mv.name],
        suggestions: ['Remplacez par un drill ou une progression.'],
      })
    }
  }

  // --- Charge globale ---
  if (scoreLevel !== 'green') {
    const top = [...breakdown].sort((a, b) => b.points - a.points).slice(0, 3)
    warnings.push({
      id: 'global-load',
      severity: scoreLevel,
      title: scoreLevel === 'red' ? `Charge globale très élevée ${when}` : `Charge globale élevée ${when}`,
      explanation: `Score ${Math.round(score)} (seuils : ${cfg.amber} attention, ${cfg.red} risque élevé). Volume ${Math.round(volume)} pts + durée ${Math.round(duration)} pts, × intensité ${rf.toFixed(2)} × proximité ${prox.toFixed(2)} × contexte ${context.toFixed(2)}.`,
      contributors: top.filter((t) => t.points > 0).map((t) => `${t.label} : ${Math.round(t.points)} pts`),
      suggestions: ['Réduisez le volume des mouvements les plus coûteux ou baissez l’intensité.'],
      fixLabel: 'Réduire le volume de 25 %',
      fix: (w) => scaleItems(w, () => true, 0.75),
    })
  }

  let level: Level = scoreLevel
  for (const w of warnings) level = maxLevel(level, levelFromSeverity(w.severity))

  const rank: Record<Severity, number> = { red: 0, amber: 1, info: 2 }
  warnings.sort((a, b) => rank[a.severity] - rank[b.severity])

  return {
    score,
    level,
    scoreLevel,
    volume,
    duration,
    rpeFactor: rf,
    proximity: prox,
    context,
    daysOut,
    warnings,
    tagPoints: tags,
    breakdown,
  }
}

// ---------- Alternative plus sûre ----------

export interface SaferResult {
  wod: Wod
  before: Assessment
  after: Assessment
  changes: string[]
}

export function diffWods(a: Wod, b: Wod): string[] {
  const out: string[] = []
  if (num(a.rpe) !== num(b.rpe)) out.push(`Intensité : RPE ${a.rpe} → ${b.rpe}`)
  if (num(a.capMin) !== num(b.capMin)) out.push(`Durée : ${a.capMin} → ${b.capMin} min`)
  if (num(a.rounds) !== num(b.rounds)) out.push(`Tours : ${a.rounds} → ${b.rounds}`)
  for (const ia of a.items) {
    const ib = b.items.find((i) => i.id === ia.id)
    if (!ib) continue
    const name = movement(ia.movementId).name
    if (num(ia.qty) !== num(ib.qty)) out.push(`${name} : ${ia.qty} → ${ib.qty}`)
    if (num(ia.loadM) !== num(ib.loadM) || num(ia.loadF) !== num(ib.loadF)) {
      out.push(`${name} : ${num(ia.loadM)}/${num(ia.loadF)} kg → ${num(ib.loadM)}/${num(ib.loadF)} kg`)
    }
  }
  return out
}

/**
 * Construit une version plus prudente de la séance : même structure, mêmes
 * mouvements, mais intensité, charges et volumes ramenés sous les seuils.
 */
export function saferAlternative(wod: Wod, ctx: RiskContext): SaferResult {
  const before = assessSession(wod, ctx)
  const { athletes, daysOut, config } = ctx
  let w = cloneWod(wod)

  if (rounds(w) === 0 && w.items.length) w.rounds = 1
  const cap = rpeCap(daysOut)
  if (num(w.rpe) > cap) w.rpe = cap
  w = restoreBaseline(w)
  w = lightenLoads(w, athletes, daysOut >= 0 && daysOut <= 2 ? 0.5 : 0.6)
  // On ne touche aux volumes que s'ils dépassent réellement un seuil.
  if (perAthleteRepsByTag(w, 'burpee') > config.burpeeAmber) {
    w = capPerAthleteByTag(w, 'burpee', Math.round(config.burpeeAmber * 0.8))
  }
  if (perAthleteRepsByTag(w, 'pull') > config.gymAmber) {
    w = capPerAthleteByTag(w, 'pull', Math.round(config.gymAmber * 0.75))
  }
  if (w.items.some((i) => relativeLoad(i, athletes).heavyUnknown)) w = capHeavyLegReps(w, 6)
  if (num(w.capMin) > 20) w.capMin = 12

  let after = assessSession(w, ctx)
  for (let i = 0; i < 14 && after.level !== 'green'; i++) {
    const fixable = after.warnings.some((x) => x.severity !== 'info' && x.fix)
    if (!fixable) break
    const scaled = scaleItems(w, () => true, 0.8)
    const changed = scaled.items.some((it, idx) => num(it.qty) !== num(w.items[idx].qty))
    if (changed) {
      w = scaled
    } else if (rounds(w) > 1) {
      w = { ...w, rounds: Math.max(1, Math.round(rounds(w)) - 1) }
    } else if (num(w.rpe) > 3) {
      w = { ...w, rpe: num(w.rpe) - 1 }
    } else if (num(w.capMin) > 6) {
      w = { ...w, capMin: Math.max(6, Math.round(num(w.capMin) * 0.7)) }
    } else {
      break
    }
    after = assessSession(w, ctx)
  }

  return { wod: w, before, after, changes: diffWods(wod, w) }
}

// ---------- Semaine ----------

export interface SessionAssessment {
  session: Session
  assessment: Assessment
}

export interface DayAssessment {
  date: string
  daysOut: number
  sessions: SessionAssessment[]
  score: number
  level: Level
  warnings: Warning[]
}

export interface WeekAssessment {
  days: DayAssessment[]
  total: number
  level: Level
  warnings: Warning[]
}

export interface WeekInput {
  competitionDate: string
  sessions: Session[]
  athletes: Athlete[]
  config: RiskConfig
}

export function assessWeek(input: WeekInput): WeekAssessment {
  const { competitionDate, sessions, athletes, config } = input
  const days: DayAssessment[] = weekDays(competitionDate).map((date) => {
    const daysOut = daysBetween(date, competitionDate)
    const list = sessions
      .filter((s) => s.date === date)
      .map((session) => ({
        session,
        assessment: assessSession(
          session.wod,
          { daysOut, athletes, config },
          session.done && num(session.actualRpe) > 0 ? session.actualRpe : undefined,
        ),
      }))
    const score = list.reduce((s, x) => s + x.assessment.score, 0)
    const warnings: Warning[] = []
    const name = dayName(date).toLowerCase()

    // Total de la séance complète (toutes les parties du jour).
    if (score >= config.dayAmber) {
      warnings.push({
        id: `day-total-${date}`,
        severity: score >= config.dayRed ? 'red' : 'amber',
        title: score >= config.dayRed ? 'Séance complète trop chargée' : 'Séance complète chargée',
        explanation: `Les parties cumulent ${Math.round(score)} pts (seuils : ${config.dayAmber} attention, ${config.dayRed} risque élevé). Chaque partie peut être raisonnable et l’ensemble trop lourd ${whenLabel(daysOut)}.`,
        contributors: list.map((x) => `${x.session.wod.name} : ${Math.round(x.assessment.score)} pts`),
        suggestions: ['Allégez toute la séance, raccourcissez une partie ou retirez-en une.'],
      })
    }
    // Volumes cumulés sur l'ensemble des parties.
    if (list.length > 1) {
      const wods = list.map((x) => x.session.wod)
      const burpees = wods.reduce((s, w) => s + perAthleteRepsByTag(w, 'burpee'), 0)
      const pulls = wods.reduce((s, w) => s + perAthleteRepsByTag(w, 'pull'), 0)
      if (burpees > config.burpeeAmber && !list.some((x) => x.assessment.warnings.some((w) => w.id === 'burpees'))) {
        warnings.push({
          id: `day-burpees-${date}`,
          severity: burpees > config.burpeeRed ? 'red' : 'amber',
          title: `${Math.round(burpees)} burpees par athlète sur l’ensemble de la séance`,
          explanation: 'Aucune partie ne dépasse le seuil seule, mais le cumul fatigue épaules, jambes et cardio.',
          contributors: wods.filter((w) => perAthleteRepsByTag(w, 'burpee') > 0).map((w) => `${w.name} : ${Math.round(perAthleteRepsByTag(w, 'burpee'))}`),
          suggestions: ['Réduisez les burpees dans une des parties.'],
        })
      }
      if (pulls > config.gymAmber && !list.some((x) => x.assessment.warnings.some((w) => w.id === 'gym-volume'))) {
        warnings.push({
          id: `day-pulls-${date}`,
          severity: pulls > config.gymRed ? 'red' : 'amber',
          title: `${Math.round(pulls)} reps de gym à la barre par athlète sur l’ensemble de la séance`,
          explanation: 'Le cumul des parties use le grip et la peau des mains à quelques jours de la compétition.',
          contributors: wods.filter((w) => perAthleteRepsByTag(w, 'pull') > 0).map((w) => `${w.name} : ${Math.round(perAthleteRepsByTag(w, 'pull'))}`),
          suggestions: ['Réduisez le tirage à la barre dans une des parties.'],
        })
      }
    }
    if (daysOut >= 1 && daysOut <= 2 && score >= config.amber * 0.6) {
      warnings.push({
        id: `late-${date}`,
        severity: score >= config.amber ? 'red' : 'amber',
        title: `Séance exigeante ${name}, ${whenLabel(daysOut)}`,
        explanation: 'Les deux derniers jours servent à récupérer. Une séance dure ici se paie samedi.',
        contributors: list.map((x) => `${x.session.wod.name} : ${Math.round(x.assessment.score)} pts`),
        suggestions: ['Remplacez par du repos, de la mobilité ou une activation très courte (RPE 3–4).'],
      })
    }
    if (daysOut === 0 && list.length) {
      warnings.push({
        id: `comp-day-${date}`,
        severity: 'info',
        title: 'Jour de compétition',
        explanation: 'Gardez uniquement l’échauffement prévu pour les épreuves.',
        contributors: [],
        suggestions: [],
      })
    }

    let level: Level = 'green'
    for (const x of list) level = maxLevel(level, x.assessment.level)
    for (const w of warnings) level = maxLevel(level, levelFromSeverity(w.severity))
    return { date, daysOut, sessions: list, score, level, warnings }
  })

  const total = days.reduce((s, d) => s + d.score, 0)
  const warnings: Warning[] = []
  for (let i = 0; i < days.length - 1; i++) {
    if (days[i].score >= config.amber * 0.8 && days[i + 1].score >= config.amber * 0.8) {
      warnings.push({
        id: `consecutive-${days[i].date}`,
        severity: 'amber',
        title: `Deux jours exigeants d’affilée (${dayName(days[i].date).toLowerCase()} et ${dayName(days[i + 1].date).toLowerCase()})`,
        explanation: 'Sans jour plus léger entre les deux, la fatigue s’accumule.',
        contributors: [days[i], days[i + 1]].map((d) => `${dayName(d.date)} : ${Math.round(d.score)} pts`),
        suggestions: ['Allégez l’une des deux journées.'],
      })
    }
  }
  if (total >= config.weekAmber) {
    warnings.push({
      id: 'week-total',
      severity: total >= config.weekRed ? 'red' : 'amber',
      title: total >= config.weekRed ? 'Charge de la semaine très élevée' : 'Charge de la semaine élevée',
      explanation: `Total ${Math.round(total)} pts (seuils : ${config.weekAmber} / ${config.weekRed}). On ne rattrape pas un arrêt en quelques jours : l’objectif est d’arriver frais.`,
      contributors: days.filter((d) => d.score > 0).map((d) => `${dayName(d.date)} : ${Math.round(d.score)} pts`),
      suggestions: ['Supprimez une séance ou réduisez les volumes des jours les plus chargés.'],
    })
  }

  let level: Level = 'green'
  for (const d of days) level = maxLevel(level, d.level)
  for (const w of warnings) level = maxLevel(level, levelFromSeverity(w.severity))
  return { days, total, level, warnings }
}

/**
 * Allège toutes les parties d'une séance : d'abord l'alternative plus sûre de
 * chaque partie, puis une réduction homogène jusqu'à repasser sous le seuil.
 */
export function lightenDay(wods: Wod[], ctx: RiskContext): Wod[] {
  let out = wods.map((w) => saferAlternative(w, ctx).wod)
  const total = () => out.reduce((s, w) => s + assessSession(w, ctx).score, 0)
  for (let i = 0; i < 12 && total() >= ctx.config.dayAmber * 0.9; i++) {
    const next = out.map((w) => scaleItems(w, () => true, 0.85))
    const changed = next.some((w, k) => w.items.some((it, idx) => num(it.qty) !== num(out[k].items[idx].qty)))
    if (!changed) break
    out = next
  }
  return out
}

// ---------- Indice de fraîcheur ----------

export interface Readiness {
  score: number
  label: string
  level: Level
  parts: { label: string; penalty: number; max: number; detail: string }[]
  recoveryProvided: boolean
}

/**
 * Indice de fraîcheur : repère heuristique (100 = semaine légère et bonne
 * récupération déclarée). Ce n'est pas une mesure médicale.
 */
export function readiness(week: WeekAssessment, athletes: Athlete[], config: RiskConfig): Readiness {
  const heaviest = Math.max(0, ...week.days.map((d) => d.score))
  const loadPenalty = clamp((35 * Math.max(heaviest / config.dayRed, week.total / config.weekRed)), 0, 35)
  const late = week.days.filter((d) => d.daysOut >= 1 && d.daysOut <= 2).reduce((s, d) => s + d.score, 0)
  // Une activation légère (jusqu'à 40 % du seuil d'attention) ne coûte rien.
  const latePenalty = clamp((25 * (late - config.amber * 0.4)) / (config.amber * 0.8), 0, 25)

  let recSum = 0
  let recCount = 0
  for (const a of athletes) {
    const r = a.recovery
    if (r.sleep > 0) {
      recSum += (5 - r.sleep) / 4
      recCount++
    }
    if (r.soreness > 0) {
      recSum += (r.soreness - 1) / 4
      recCount++
    }
    if (r.energy > 0) {
      recSum += (5 - r.energy) / 4
      recCount++
    }
  }
  const pains = athletes.filter((a) => a.recovery.pain.trim()).length
  const recoveryPenalty = clamp((recCount ? (recSum / recCount) * 20 : 0) + Math.min(10, pains * 5), 0, 25)
  const breakPenalty = hasRecentBreak(athletes) ? 5 : 0

  const score = Math.round(clamp(100 - loadPenalty - latePenalty - recoveryPenalty - breakPenalty, 0, 100))
  const level: Level = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  const label = level === 'green' ? 'Frais' : level === 'amber' ? 'À surveiller' : 'Surchargé'
  return {
    score,
    label,
    level,
    recoveryProvided: recCount > 0,
    parts: [
      { label: 'Charge de la séance', penalty: loadPenalty, max: 35, detail: `${Math.round(week.total)} pts planifiés` },
      { label: 'Séances à J-2 / J-1', penalty: latePenalty, max: 25, detail: `${Math.round(late)} pts sur les deux derniers jours` },
      {
        label: 'Récupération déclarée',
        penalty: recoveryPenalty,
        max: 25,
        detail: recCount ? 'Sommeil, courbatures, énergie, douleurs' : 'Non renseignée : aucune pénalité appliquée',
      },
      { label: 'Reprise après arrêt', penalty: breakPenalty, max: 5, detail: breakPenalty ? 'Pause récente de 2 semaines ou plus' : 'Aucune pause récente' },
    ],
  }
}

export { perAthleteUnits }
