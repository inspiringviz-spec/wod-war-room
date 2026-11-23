import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, History, MessageSquareHeart, Play, Target, Wand2 } from 'lucide-react'
import { dayName, daysBetween, shortDate } from '../domain/calc'
import { DAY_GUIDE, HISTORICAL } from '../domain/data'
import { bottlenecks } from '../domain/strategy'
import { go, useSessionDate, useStore } from '../state/store'
import type { Page } from '../state/store'
import { Button, Card, cx, Eyebrow, H2, LEVEL_BG, LEVEL_TEXT, LevelPill, Meter, Ring } from '../ui/kit'

function countdownLabel(daysOut: number): string {
  if (daysOut > 0) return `J-${daysOut}`
  if (daysOut === 0) return 'Jour J'
  return 'Terminé'
}

export function Dashboard() {
  const { state, daysOut, today, week, ready } = useStore()
  const date = useSessionDate()
  const day = week.days.find((d) => d.date === date)
  const parts = day?.sessions ?? []
  const score = day?.score ?? 0
  const level = day?.level ?? 'green'
  const sessionOut = daysBetween(date, state.competitionDate)
  const guide = DAY_GUIDE[sessionOut]
  const nextPart = parts.find((p) => !p.session.done) ?? parts[0]
  const allDone = parts.length > 0 && parts.every((p) => p.session.done)
  const alerts =
    (day?.warnings.filter((w) => w.severity !== 'info').length ?? 0) +
    parts.reduce((s, p) => s + p.assessment.warnings.filter((w) => w.severity !== 'info').length, 0)

  const blockers = bottlenecks(state.athletes)
  const top = blockers[0]
  const given = state.athletes.filter((a) => Object.keys(a.competency).length >= 5 || a.strengths || a.blockers)
  const missing = state.athletes.filter((a) => !given.includes(a))
  const openRules = HISTORICAL.flatMap((h) => h.open).filter((o) => !state.rules[o.id]).length

  const steps: { icon: typeof Target; title: string; detail: string; page: Page; param?: string; done?: boolean }[] = [
    {
      icon: History,
      title: 'Revoir les WODs de l’an dernier',
      detail: 'Trois épreuves pour comprendre le style de la compétition.',
      page: 'wods',
    },
    {
      icon: MessageSquareHeart,
      title: missing.length ? `Recueillir les avis (${given.length}/${state.athletes.length})` : 'Les trois avis sont reçus',
      detail: missing.length ? `Il manque ${missing.map((a) => a.name).join(' et ')}. Chacun indique où il est à l’aise et où il bloque.` : 'Régénérez la séance pour en tenir compte.',
      page: 'team',
      done: missing.length === 0,
    },
    {
      icon: Wand2,
      title: 'Générer la séance en 3 parties',
      detail: 'Adaptée aux avis, au jour choisi et au matériel, avec binômes tournants pour tester la synchro.',
      page: 'week',
    },
  ]
  if (top && top.severity !== 'info') {
    steps.push({
      icon: Target,
      title: `Décider d’un plan pour ${top.headline.split(' :')[0]}`,
      detail: `${top.wodCode} : ${top.qty || 'volume à confirmer'} reps l’an dernier. Répartition ou variante à trancher ensemble.`,
      page: 'strategy',
      param: top.wodId,
    })
  }
  if (openRules > 0) {
    steps.push({
      icon: CalendarDays,
      title: `${openRules} point${openRules > 1 ? 's' : ''} de règlement à confirmer`,
      detail: 'Synchro, partage des reps, scoring : à vérifier dès que les épreuves sortent.',
      page: 'wods',
    })
  }

  return (
    <div className="space-y-4">
      {/* Compte à rebours + fraîcheur */}
      <Card className="grid-bg relative overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Compétition · {dayName(state.competitionDate)} {shortDate(state.competitionDate)}</Eyebrow>
            <p className="mt-1 font-display text-[5.5rem] leading-[0.82] font-bold tracking-tight text-lime uppercase sm:text-8xl">{countdownLabel(daysOut)}</p>
            <p className="mt-3 text-sm text-mute">
              {daysOut > 1 && 'Une séance ensemble, bien préparée, puis on arrive frais.'}
              {daysOut === 1 && 'Demain. Le travail est fait : on récupère.'}
              {daysOut === 0 && 'C’est aujourd’hui. Échauffement, stratégie, plaisir.'}
              {daysOut < 0 && 'La compétition est passée. Changez la date dans Fatigue Guard pour préparer la suivante.'}
            </p>
          </div>
          <button type="button" onClick={() => go('guard')} aria-label={`Indice de fraîcheur ${ready.score} sur 100, ${ready.label}. Ouvrir Fatigue Guard`} className="rounded-full transition active:scale-95">
            <Ring value={ready.score} level={ready.level} size={116} stroke={9}>
              <div>
                <p className="tabular font-display text-4xl leading-none font-bold">{ready.score}</p>
                <p className={cx('mt-0.5 text-[11px] font-semibold', LEVEL_TEXT[ready.level])}>{ready.label}</p>
              </div>
            </Ring>
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-dim">Indice de fraîcheur : repère heuristique basé sur la charge prévue et la récupération déclarée. Ce n’est pas une mesure médicale.</p>
      </Card>

      {/* La séance */}
      <Card tone={parts.length && level !== 'green' ? level : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>
              Séance d’équipe · {dayName(date)} {shortDate(date)}
              {date === today ? ' · aujourd’hui' : ''}
            </Eyebrow>
            <H2 className="mt-1.5">{parts.length ? `${parts.length} partie${parts.length > 1 ? 's' : ''} · ${parts.reduce((s, p) => s + p.session.wod.capMin, 0)} min de travail` : 'Pas encore de séance'}</H2>
            {guide && (
              <p className="mt-1.5 text-sm leading-snug text-mute">
                <span className="font-medium text-ink">{guide.title}.</span> {guide.detail}
              </p>
            )}
          </div>
          {parts.length > 0 && <LevelPill level={level} />}
        </div>

        {parts.length > 0 && (
          <>
            <ol className="mt-4 space-y-1.5">
              {parts.map((p, i) => (
                <li key={p.session.id} className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5">
                  <span className={cx('tabular grid size-8 shrink-0 place-items-center rounded-lg font-display text-xl leading-none font-bold', p.session.done ? 'bg-lime text-bg' : 'bg-panel3')}>
                    {p.session.done ? <CheckCircle2 size={16} aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.session.wod.name}</span>
                    <span className="tabular block text-xs text-mute">
                      {p.session.wod.capMin} min · RPE {p.session.wod.rpe} · {p.session.wod.items.length} mouvements
                    </span>
                  </span>
                  <span className={cx('size-2.5 shrink-0 rounded-full', LEVEL_BG[p.assessment.level])} title={`${Math.round(p.assessment.score)} pts`} />
                  <span className="tabular w-8 shrink-0 text-right text-xs text-mute">{Math.round(p.assessment.score)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs text-mute">
                <span>Charge totale</span>
                <span className="tabular">
                  {Math.round(score)} pts · attention à {state.config.dayAmber}
                </span>
              </div>
              <Meter className="mt-1" value={score} max={state.config.dayRed} level={score >= state.config.dayRed ? 'red' : score >= state.config.dayAmber ? 'amber' : 'green'} />
            </div>
            {alerts > 0 && (
              <button type="button" onClick={() => go('week')} className="mt-3 flex w-full items-center justify-between rounded-xl bg-panel2 px-3 py-2.5 text-left text-[13px] hover:bg-panel3">
                <span>
                  <span className="font-semibold text-amber">
                    {alerts} alerte{alerts > 1 ? 's' : ''}
                  </span>{' '}
                  à examiner avant de partir
                </span>
                <ArrowRight size={15} aria-hidden className="text-dim" />
              </button>
            )}
          </>
        )}

        <div className="mt-4 flex gap-2">
          {parts.length > 0 ? (
            <>
              <Button variant="primary" className="flex-1" onClick={() => nextPart && go('live', nextPart.session.id)}>
                <Play size={16} aria-hidden />
                {allDone ? 'Refaire' : parts.some((p) => p.session.done) ? 'Continuer' : 'Lancer la séance'}
              </Button>
              <Button onClick={() => go('week')}>Préparer</Button>
            </>
          ) : (
            <Button variant="primary" className="flex-1" onClick={() => go('week')}>
              <Wand2 size={16} aria-hidden />
              Générer la séance en 3 parties
            </Button>
          )}
        </div>
      </Card>

      {/* Étapes */}
      <Card>
        <Eyebrow>Pour tirer le maximum de la séance</Eyebrow>
        <ul className="mt-2 divide-y divide-line/70">
          {steps.map((p) => (
            <li key={p.title}>
              <button type="button" onClick={() => go(p.page, p.param)} className="group flex w-full items-center gap-3 py-3 text-left">
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', p.done ? 'bg-lime text-bg' : 'bg-panel2 text-lime')}>
                  {p.done ? <CheckCircle2 size={18} aria-hidden /> : <p.icon size={18} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-semibold">{p.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-mute">{p.detail}</span>
                </span>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-dim transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* Point bloquant */}
      {top && (
        <Card tone={top.severity === 'info' ? undefined : top.severity}>
          <Eyebrow>Point bloquant n°1 · {top.wodCode}</Eyebrow>
          <H2 className={cx('mt-1.5', top.severity === 'red' ? 'text-red' : top.severity === 'amber' ? 'text-amber' : '')}>{top.headline}</H2>
          <ul className="mt-3 space-y-1.5">
            {top.lines.map((l) => (
              <li key={l} className="flex gap-2 text-[13px] leading-snug text-mute">
                <span className="text-dim">•</span>
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-dim">D’après les WODs de l’an dernier et les avis reçus. Les épreuves de cette année ne sont pas confirmées.</p>
          <Button className="mt-3 w-full" onClick={() => go('strategy', top.wodId)}>
            Travailler la stratégie
            <ChevronRight size={16} aria-hidden />
          </Button>
        </Card>
      )}
    </div>
  )
}
