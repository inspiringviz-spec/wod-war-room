import { ArrowRight, CalendarDays, ChevronRight, Dumbbell, Play, Target, Users } from 'lucide-react'
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { dayName, instantiate, shortDate, uid } from '../domain/calc'
import { DAY_GUIDE, HISTORICAL, template } from '../domain/data'
import { COMPETENCY_MOVEMENTS } from '../domain/movements'
import { bottlenecks, unknownShare } from '../domain/strategy'
import { go, useStore } from '../state/store'
import type { Page } from '../state/store'
import { Button, Card, cx, Eyebrow, H2, LEVEL_HEX, LEVEL_TEXT, LevelPill, Meter, Ring } from '../ui/kit'
import { WodView } from '../components/WodView'

function countdownLabel(daysOut: number): string {
  if (daysOut > 0) return `J-${daysOut}`
  if (daysOut === 0) return 'Jour J'
  return 'Terminé'
}

export function Dashboard() {
  const { state, update, daysOut, today, week, ready } = useStore()
  const guide = DAY_GUIDE[daysOut]
  const todayData = week.days.find((d) => d.date === today)
  const alerts = week.days.flatMap((d) => [
    ...d.warnings.filter((w) => w.severity !== 'info'),
    ...d.sessions.flatMap((s) => s.assessment.warnings.filter((w) => w.severity !== 'info')),
  ]).length + week.warnings.length

  const blockers = bottlenecks(state.athletes)
  const top = blockers[0]
  const unknown = unknownShare(state.athletes, COMPETENCY_MOVEMENTS)
  const openRules = HISTORICAL.flatMap((h) => h.open).filter((o) => !state.rules[o.id]).length

  const priorities: { icon: typeof Target; title: string; detail: string; page: Page; param?: string }[] = []
  if (unknown > 0.25) {
    priorities.push({
      icon: Users,
      title: 'Évaluer les compétences de l’équipe',
      detail: `${Math.round(unknown * 100)} % de la matrice est encore inconnue. Deux minutes par athlète suffisent.`,
      page: 'team',
    })
  }
  if (top && top.severity !== 'info') {
    priorities.push({
      icon: Target,
      title: `Préparer un plan pour ${top.headline.split(' :')[0]}`,
      detail: `${top.wodCode} : ${top.qty || 'volume à confirmer'} reps l’an dernier. Répartition ou variante à décider ensemble.`,
      page: 'strategy',
      param: top.wodId,
    })
  }
  priorities.push({
    icon: Dumbbell,
    title: 'Roder la synchro à deux',
    detail: 'Toes-to-bar, burpee box jumps et snatches synchro reviennent dans deux des trois WODs de référence.',
    page: 'builder',
  })
  if (openRules > 0) {
    priorities.push({
      icon: CalendarDays,
      title: `${openRules} point${openRules > 1 ? 's' : ''} de règlement à confirmer`,
      detail: 'Synchro, partage des reps, scoring : à vérifier auprès de l’organisation dès que les épreuves sortent.',
      page: 'wods',
    })
  }

  const chart = week.days.map((d) => ({
    name: dayName(d.date).slice(0, 3),
    score: Math.round(d.score),
    level: d.level,
    today: d.date === today,
  }))

  const addRecommended = () => {
    const tpl = guide?.templateId ? template(guide.templateId) : undefined
    if (!tpl) return
    update((s) => {
      s.sessions.push({ id: uid(), date: today, wod: instantiate(tpl.wod), done: false })
    })
  }

  return (
    <div className="space-y-4">
      {/* Compte à rebours + fraîcheur */}
      <Card className="grid-bg relative overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Compétition · {dayName(state.competitionDate)} {shortDate(state.competitionDate)}</Eyebrow>
            <p className="mt-1 font-display text-[5.5rem] leading-[0.82] font-bold tracking-tight text-lime uppercase sm:text-8xl">
              {countdownLabel(daysOut)}
            </p>
            <p className="mt-3 text-sm text-mute">
              {daysOut > 1 && `${daysOut} jours pour arriver frais, pas pour rattraper.`}
              {daysOut === 1 && 'Demain. Le travail est fait : on récupère.'}
              {daysOut === 0 && 'C’est aujourd’hui. Échauffement, stratégie, plaisir.'}
              {daysOut < 0 && 'La compétition est passée. Changez la date dans Fatigue Guard pour préparer la suivante.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => go('guard')}
            aria-label={`Indice de fraîcheur ${ready.score} sur 100, ${ready.label}. Ouvrir Fatigue Guard`}
            className="rounded-full transition active:scale-95"
          >
            <Ring value={ready.score} level={ready.level} size={116} stroke={9}>
              <div>
                <p className="tabular font-display text-4xl leading-none font-bold">{ready.score}</p>
                <p className={cx('mt-0.5 text-[11px] font-semibold', LEVEL_TEXT[ready.level])}>{ready.label}</p>
              </div>
            </Ring>
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-dim">
          Indice de fraîcheur : repère heuristique basé sur la charge planifiée et la récupération déclarée. Ce n’est
          pas une mesure médicale.
        </p>
      </Card>

      {/* Aujourd'hui */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Aujourd’hui · {dayName(today)} {shortDate(today)}</Eyebrow>
            <H2 className="mt-1.5">{guide?.title ?? 'Hors semaine de compétition'}</H2>
            {guide && <p className="mt-1.5 text-sm leading-snug text-mute">{guide.detail}</p>}
          </div>
          {todayData && todayData.sessions.length > 0 && <LevelPill level={todayData.level} />}
        </div>

        {todayData?.sessions.map(({ session, assessment }) => (
          <div key={session.id} className="mt-4 rounded-2xl border border-line bg-panel2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-semibold">{session.wod.name}</p>
              {session.done ? (
                <span className="shrink-0 rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-semibold text-lime">Faite</span>
              ) : (
                <span className="tabular shrink-0 text-xs text-mute">{Math.round(assessment.score)} pts</span>
              )}
            </div>
            <div className="mt-1">
              <WodView wod={session.wod} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => go('live', session.id)}>
                <Play size={16} aria-hidden />
                {session.done ? 'Refaire la séance' : 'Lancer la séance'}
              </Button>
              <Button
                onClick={() => {
                  update((s) => {
                    s.draft = structuredClone(session.wod)
                    s.draftDate = session.date
                    s.draftSessionId = session.id
                  })
                  go('builder')
                }}
              >
                Modifier
              </Button>
            </div>
          </div>
        ))}

        {todayData && todayData.sessions.length === 0 && daysOut > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {guide?.templateId && (
              <Button variant="primary" onClick={addRecommended}>
                Ajouter la séance conseillée
              </Button>
            )}
            <Button onClick={() => go('builder')}>Composer un mini-WOD</Button>
          </div>
        )}
        {!todayData && (
          <Button className="mt-4" onClick={() => go('week')}>
            Voir la semaine
            <ChevronRight size={16} aria-hidden />
          </Button>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Charge planifiée */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow>Charge planifiée</Eyebrow>
              <p className="mt-1.5 flex items-baseline gap-2">
                <span className="tabular font-display text-5xl leading-none font-bold">{Math.round(week.total)}</span>
                <span className="text-sm text-mute">pts sur la semaine</span>
              </p>
            </div>
            <LevelPill level={week.level} />
          </div>
          <Meter
            className="mt-3"
            value={week.total}
            max={state.config.weekRed}
            level={week.total >= state.config.weekRed ? 'red' : week.total >= state.config.weekAmber ? 'amber' : 'green'}
          />
          <p className="tabular mt-1 text-[11px] text-dim">
            Attention à partir de {state.config.weekAmber} · risque élevé à partir de {state.config.weekRed}
          </p>
          <div className="mt-3 h-36" role="img" aria-label={`Charge par jour : ${chart.map((c) => `${c.name} ${c.score} points`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a3a9b5', fontSize: 11 }} />
                <YAxis hide domain={[0, (max: number) => Math.max(max, state.config.amber * 1.1)]} />
                <ReferenceLine y={state.config.amber} stroke="#ffb224" strokeDasharray="3 4" strokeOpacity={0.6} />
                <Bar dataKey="score" radius={[6, 6, 2, 2]} minPointSize={3} isAnimationActive={false}>
                  {chart.map((c) => (
                    <Cell key={c.name} fill={LEVEL_HEX[c.level]} fillOpacity={c.today ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <button
            type="button"
            onClick={() => go('guard')}
            className="mt-2 flex w-full items-center justify-between rounded-xl bg-panel2 px-3 py-2.5 text-left text-[13px] hover:bg-panel3"
          >
            <span>
              {alerts > 0 ? (
                <>
                  <span className="font-semibold text-amber">{alerts} alerte{alerts > 1 ? 's' : ''}</span> à examiner
                </>
              ) : (
                'Aucune alerte sur la semaine'
              )}
            </span>
            <ArrowRight size={15} aria-hidden className="text-dim" />
          </button>
        </Card>

        {/* Point bloquant */}
        {top && (
          <Card tone={top.severity === 'info' ? undefined : top.severity}>
            <Eyebrow>Point bloquant n°1 · {top.wodCode}</Eyebrow>
            <H2 className={cx('mt-1.5', top.severity === 'red' ? 'text-red' : top.severity === 'amber' ? 'text-amber' : '')}>
              {top.headline}
            </H2>
            <ul className="mt-3 space-y-1.5">
              {top.lines.map((l) => (
                <li key={l} className="flex gap-2 text-[13px] leading-snug text-mute">
                  <span className="text-dim">•</span>
                  {l}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-dim">
              D’après les WODs de l’an dernier et les profils renseignés. Les épreuves de cette année ne sont pas
              confirmées.
            </p>
            <Button className="mt-3 w-full" onClick={() => go('strategy', top.wodId)}>
              Travailler la stratégie
              <ChevronRight size={16} aria-hidden />
            </Button>
          </Card>
        )}
      </div>

      {/* À travailler */}
      <Card>
        <Eyebrow>À travailler en équipe</Eyebrow>
        <ul className="mt-2 divide-y divide-line/70">
          {priorities.map((p) => (
            <li key={p.title}>
              <button
                type="button"
                onClick={() => go(p.page, p.param)}
                className="group flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel2 text-lime">
                  <p.icon size={18} aria-hidden />
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
    </div>
  )
}
