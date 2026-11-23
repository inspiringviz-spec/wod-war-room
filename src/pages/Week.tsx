import { CheckCircle2, Moon, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { dayName, instantiate, shortDate, uid, weekDays } from '../domain/calc'
import { DAY_GUIDE, defaultSessions, TEMPLATES } from '../domain/data'
import { saferAlternative } from '../domain/risk'
import type { DayAssessment, SessionAssessment } from '../domain/risk'
import { go, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, LevelPill, Notice, PageHeader, Sheet } from '../ui/kit'
import { WodView } from '../components/WodView'

function SessionCard({ data, day }: { data: SessionAssessment; day: DayAssessment }) {
  const { state, update, ctxFor, toast } = useStore()
  const { session, assessment } = data
  const [open, setOpen] = useState(false)
  const days = weekDays(state.competitionDate)
  const alerts = assessment.warnings.filter((w) => w.severity !== 'info')

  const edit = () => {
    update((s) => {
      s.draft = structuredClone(session.wod)
      s.draftDate = session.date
      s.draftSessionId = session.id
    })
    go('builder')
  }

  const safer = () => {
    const res = saferAlternative(session.wod, ctxFor(session.date))
    if (!res.changes.length) {
      toast('Aucune modification automatique possible')
      return
    }
    update((s) => {
      const target = s.sessions.find((x) => x.id === session.id)
      if (target) target.wod = res.wod
    })
    toast(`Alternative appliquée : ${res.changes.length} ajustement${res.changes.length > 1 ? 's' : ''}`)
  }

  return (
    <li className={cx('rounded-2xl border bg-panel2', assessment.level === 'red' ? 'border-red/40' : assessment.level === 'amber' ? 'border-amber/35' : 'border-line')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {session.done && <CheckCircle2 size={15} aria-hidden className="shrink-0 text-lime" />}
            <span className="truncate text-[15px] font-semibold">{session.wod.name}</span>
          </span>
          <span className="tabular mt-0.5 block text-xs text-mute">
            {session.wod.capMin} min · RPE {session.done && session.actualRpe ? `${session.actualRpe} (réel)` : session.wod.rpe} ·{' '}
            {Math.round(assessment.score)} pts
            {session.result ? ` · ${session.result}` : ''}
          </span>
        </span>
        <LevelPill level={assessment.level} />
      </button>

      {open && (
        <div className="animate-fade border-t border-line/70 px-3 pt-2 pb-3">
          <WodView wod={session.wod} />
          {alerts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {alerts.map((w) => (
                <li key={w.id}>
                  <Notice tone={w.severity}>
                    <span className="font-semibold">{w.title}.</span> {w.suggestions[0]}
                  </Notice>
                </li>
              ))}
            </ul>
          )}
          {session.debrief && <p className="mt-2 text-xs leading-snug text-mute">Débrief : {session.debrief}</p>}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => go('live', session.id)}>
              <Play size={16} aria-hidden />
              Lancer
            </Button>
            <Button onClick={edit}>
              <Pencil size={15} aria-hidden />
              Modifier
            </Button>
          </div>
          {assessment.level !== 'green' && alerts.some((w) => w.fix) && (
            <Button className="mt-2 w-full" onClick={safer}>
              <Sparkles size={15} aria-hidden />
              Appliquer l’alternative plus sûre
            </Button>
          )}
          <div className="mt-2 flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-mute">
              <span className="shrink-0">Déplacer</span>
              <select
                aria-label={`Déplacer ${session.wod.name}`}
                value={session.date}
                onChange={(e) =>
                  update((s) => {
                    const target = s.sessions.find((x) => x.id === session.id)
                    if (target) target.date = e.target.value
                  })
                }
                className="h-9 w-full min-w-0 rounded-lg border border-line bg-bg px-2 text-[13px] text-ink"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayName(d)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label={`Supprimer ${session.wod.name} de ${dayName(day.date).toLowerCase()}`}
              onClick={() => {
                update((s) => {
                  s.sessions = s.sessions.filter((x) => x.id !== session.id)
                  if (s.draftSessionId === session.id) s.draftSessionId = undefined
                })
                toast('Séance supprimée')
              }}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-red/15 hover:text-red"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export function Week() {
  const { update, week, today, toast } = useStore()
  const [addFor, setAddFor] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div>
      <PageHeader eyebrow="Du lundi au jour J" title="Semaine de compétition">
        <LevelPill level={week.level} className="mb-1" />
      </PageHeader>

      {week.warnings.length > 0 && (
        <ul className="mb-4 space-y-2">
          {week.warnings.map((w) => (
            <li key={w.id}>
              <Notice tone={w.severity}>
                <p className="font-semibold">{w.title}</p>
                <p className="mt-0.5 text-mute">{w.explanation}</p>
                {w.suggestions[0] && <p className="mt-1">→ {w.suggestions[0]}</p>}
              </Notice>
            </li>
          ))}
        </ul>
      )}

      <ol className="relative space-y-3">
        {week.days.map((day) => {
          const guide = DAY_GUIDE[day.daysOut]
          const isToday = day.date === today
          const past = day.date < today
          const isComp = day.daysOut === 0
          return (
            <li key={day.date}>
              <Card
                as="div"
                tone={day.level === 'green' ? undefined : day.level}
                className={cx(isToday && day.level === 'green' && 'border-lime/45', past && 'opacity-70')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-2xl leading-none font-bold tracking-wide uppercase">{dayName(day.date)}</p>
                      {isToday && <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold tracking-wider text-bg uppercase">Aujourd’hui</span>}
                    </div>
                    <p className="tabular mt-1 text-xs text-dim">
                      {shortDate(day.date)} · {isComp ? 'jour J' : `J-${day.daysOut}`}
                    </p>
                  </div>
                  {isComp ? (
                    <Trophy size={22} aria-hidden className="text-lime" />
                  ) : (
                    <div className="text-right">
                      <p className="tabular font-display text-2xl leading-none font-bold">{Math.round(day.score)}</p>
                      <p className="text-[10px] text-dim">pts</p>
                    </div>
                  )}
                </div>

                {guide && (
                  <p className="mt-2.5 text-[13px] leading-snug text-mute">
                    <span className="font-medium text-ink">{guide.title}.</span> {guide.detail}
                  </p>
                )}

                {day.warnings.map((w) => (
                  <Notice key={w.id} tone={w.severity} className="mt-2.5">
                    <p className="font-semibold">{w.title}</p>
                    <p className="mt-0.5 text-mute">{w.explanation}</p>
                    {w.suggestions[0] && <p className="mt-1">→ {w.suggestions[0]}</p>}
                  </Notice>
                ))}

                {day.sessions.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {day.sessions.map((s) => (
                      <SessionCard key={s.session.id} data={s} day={day} />
                    ))}
                  </ul>
                ) : (
                  !isComp && (
                    <p className="mt-3 flex items-center gap-2 text-[13px] text-dim">
                      <Moon size={14} aria-hidden />
                      Repos
                    </p>
                  )
                )}

                {!isComp && (
                  <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setAddFor(day.date)}>
                    <Plus size={15} aria-hidden />
                    Ajouter une séance
                  </Button>
                )}
              </Card>
            </li>
          )
        })}
      </ol>

      <div className="mt-4">
        {confirmReset ? (
          <Card as="div" tone="amber">
            <p className="text-[13px] leading-snug">Remplacer toutes les séances par le plan conseillé ? Les profils et la stratégie sont conservés.</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  update((s) => {
                    s.sessions = defaultSessions(s.competitionDate)
                    s.draftSessionId = undefined
                  })
                  setConfirmReset(false)
                  toast('Plan conseillé rétabli')
                }}
              >
                Rétablir
              </Button>
              <Button onClick={() => setConfirmReset(false)}>Annuler</Button>
            </div>
          </Card>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} aria-hidden />
            Rétablir le plan conseillé
          </Button>
        )}
      </div>

      <Sheet open={addFor !== null} onClose={() => setAddFor(null)} title={addFor ? `Ajouter · ${dayName(addFor)}` : 'Ajouter'}>
        <Eyebrow>Depuis un modèle</Eyebrow>
        <ul className="mt-2 space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  if (!addFor) return
                  update((s) => {
                    s.sessions.push({ id: uid(), date: addFor, wod: instantiate(t.wod), done: false })
                  })
                  toast(`${t.wod.name} ajouté`)
                  setAddFor(null)
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel2 p-3 text-left hover:border-lime/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold tracking-wider text-lime uppercase">{t.tag}</span>
                  <span className="block text-sm font-semibold">{t.wod.name}</span>
                  <span className="block text-xs leading-snug text-mute">{t.blurb}</span>
                </span>
                <span className="tabular shrink-0 text-xs text-dim">{t.wod.capMin} min</span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-3 w-full"
          onClick={() => {
            if (!addFor) return
            update((s) => {
              s.draftDate = addFor
              s.draftSessionId = undefined
            })
            setAddFor(null)
            go('builder')
          }}
        >
          Composer dans le builder
        </Button>
      </Sheet>
    </div>
  )
}
