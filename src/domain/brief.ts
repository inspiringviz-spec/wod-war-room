import { dayName, daysBetween, formatLabel, formatLoad, formatQty, formatWho, shortDate } from './calc'
import { HISTORICAL } from './data'
import { COMPETENCY_MOVEMENTS, movement, RM_KEYS, RM_LABEL, UNBROKEN_MOVEMENTS } from './movements'
import type { AppState, Athlete, Competency, Wod } from './types'

/**
 * Brief en texte clair, à coller dans Claude (ou à envoyer à un coach) pour
 * demander une séance sur mesure. Tout vient de ce que l'équipe a saisi.
 */

function wodLines(wod: Wod): string {
  return wod.items
    .map((i) => {
      const load = formatLoad(i)
      return `  - ${formatQty(i)} ${movement(i.movementId).name}${load ? `, ${load}` : ''} (${formatWho(i)})${i.note ? ` — ${i.note}` : ''}`
    })
    .join('\n')
}

const GROUPS: { key: Competency; label: string }[] = [
  { key: 'comfortable', label: 'À l’aise' },
  { key: 'manageable', label: 'Gérable' },
  { key: 'difficult', label: 'Difficile' },
  { key: 'not_yet', label: 'Pas encore acquis' },
  { key: 'unknown', label: 'Non évalué' },
]

function athleteBlock(a: Athlete): string {
  const lines: string[] = []
  lines.push(`${a.name} (${a.sex === 'M' ? 'homme' : 'femme'}${a.level ? `, niveau : ${a.level}` : ''})`)
  if (a.experience) lines.push(`  Expérience : ${a.experience}`)
  if (a.conditioning) lines.push(`  Conditionnement : ${a.conditioning}`)
  if (a.breakWeeks > 0) lines.push(`  Arrêt récent : ${a.breakWeeks} semaine${a.breakWeeks > 1 ? 's' : ''}`)
  if (a.notes) lines.push(`  Notes : ${a.notes}`)
  const rms = RM_KEYS.filter((k) => a.rm[k]).map((k) => `${RM_LABEL[k]} ${a.rm[k]} kg`)
  if (rms.length) lines.push(`  1RM : ${rms.join(', ')}`)
  const maxes = UNBROKEN_MOVEMENTS.filter((id) => id in a.unbroken).map((id) => `${movement(id).name} ${a.unbroken[id]}`)
  if (maxes.length) lines.push(`  Max enchaînés : ${maxes.join(', ')}`)
  for (const g of GROUPS) {
    const ids = COMPETENCY_MOVEMENTS.filter((id) => (a.competency[id] ?? 'unknown') === g.key)
    if (ids.length) lines.push(`  ${g.label} : ${ids.map((id) => movement(id).name).join(', ')}`)
  }
  if (a.strengths) lines.push(`  Se sent à l’aise sur : ${a.strengths}`)
  if (a.blockers) lines.push(`  Bloque sur : ${a.blockers}`)
  if (a.recovery.pain) lines.push(`  Douleur ou gêne : ${a.recovery.pain}`)
  return lines.join('\n')
}

export function buildBrief(state: AppState, sessionDate: string): string {
  const daysOut = daysBetween(sessionDate, state.competitionDate)
  const planned = state.sessions.filter((s) => s.date === sessionDate)
  const out: string[] = []

  out.push('CONTEXTE')
  out.push(
    `Équipe de CrossFit${state.teamName ? ` « ${state.teamName} »` : ''} de ${state.athletes.length} athlètes : ${state.athletes.map((a) => a.name).join(', ')}. Compétition par équipe le ${dayName(state.competitionDate).toLowerCase()} ${shortDate(state.competitionDate)}.`,
  )
  out.push(
    `Nous ne ferons qu’une seule séance ensemble avant la compétition, le ${dayName(sessionDate).toLowerCase()} ${shortDate(sessionDate)} (${daysOut > 0 ? `J-${daysOut}` : 'jour J'}). Objectif : arriver frais, caler la synchro, les transitions et la répartition des rôles. Pas de recherche de volume ni de maximum.`,
  )

  out.push('')
  out.push('WODS DE L’AN DERNIER (référence ; les épreuves de cette année ne sont pas confirmées)')
  for (const h of HISTORICAL) {
    out.push(`${h.code} — ${h.title} — ${formatLabel(h.wod)}`)
    out.push(wodLines(h.wod))
    const open = h.open.filter((o) => state.rules[o.id] !== 'rejected' && state.rules[o.id] !== 'confirmed')
    if (open.length) out.push(`  Points non confirmés : ${open.map((o) => o.text).join(' | ')}`)
  }

  out.push('')
  out.push('PROFILS (déclarés par les athlètes ; ne rien supposer au-delà)')
  for (const a of state.athletes) out.push(athleteBlock(a))

  if (planned.length) {
    out.push('')
    out.push('SÉANCE ACTUELLEMENT PRÉVUE DANS NOTRE APPLICATION')
    for (const s of planned) {
      out.push(`${s.wod.name} — ${formatLabel(s.wod)} — RPE ${s.wod.rpe}`)
      out.push(wodLines(s.wod))
    }
  }

  out.push('')
  out.push('DEMANDE')
  out.push(
    'Propose une séance d’équipe en 3 parties (une inspirée de chaque WOD), 45 minutes au total, intensité RPE 5 à 6. Pour chaque partie, donne : le format et la durée, les mouvements avec reps et charges hommes/femmes, qui fait quoi, les binômes synchro à tester, l’ordre des transitions, et ce qu’il faut observer. Adapte les mouvements non acquis avec une variante. Termine par les points de vigilance : tout ce qui te paraît trop fatigant à ce stade, et les questions de règlement à poser à l’organisation.',
  )
  return out.join('\n')
}
