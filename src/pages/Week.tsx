import { ArrowDown, ArrowUp, Bot, CheckCircle2, ChevronDown, Feather, Hourglass, Pencil, Play, Plus, Share2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { dayName, daysBetween, instantiate, shortDate, uid, weekDays } from '../domain/calc'
import { buildBrief } from '../domain/brief'
import { DAY_GUIDE, TEMPLATES } from '../domain/data'
import { ALL_EQUIPMENT, EQUIPMENT_LABEL } from '../domain/movements'
import { lightenDay, saferAlternative } from '../domain/risk'
import type { SessionAssessment } from '../domain/risk'
import { proposalLink } from '../domain/share'
import { generateTeamSession } from '../domain/teamSession'
import type { SessionIntensity, SessionLength } from '../domain/teamSession'
import type { Equipment } from '../domain/types'
import { go, useSessionDate, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, Field, H2, INPUT, LevelPill, Meter, Notice, PageHeader, Segmented, Sheet } from '../ui/kit'
import { copyText, shareLink } from '../components/ShareSheet'
import { WodView } from '../components/WodView'

const PREFS_KEY = 'wod-war-room:session-prefs'

interface Prefs {
  minutes: SessionLength
  intensity: SessionIntensity
  equipment: Equipment[]
  reasons: string[]
  restMin: number
}

function loadPrefs(): Prefs {
  const base: Prefs = { minutes: 45, intensity: 'moderate', equipment: [...ALL_EQUIPMENT], reasons: [], restMin: 5 }
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    if (!raw || typeof raw !== 'object') return base
    return {
      minutes: ([30, 45, 60] as const).includes(raw.minutes as SessionLength) ? (raw.minutes as SessionLength) : 45,
      intensity: raw.intensity === 'light' ? 'light' : 'moderate',
      equipment: Array.isArray(raw.equipment) ? ALL_EQUIPMENT.filter((e) => raw.equipment!.includes(e)) : base.equipment,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.filter((r): r is string => typeof r === 'string').slice(0, 20) : [],
      restMin: Number.isFinite(raw.restMin) ? Number(raw.restMin) : 5,
    }
  } catch {
    return base
  }
}

function PartCard({ data, index, count }: { data: SessionAssessment; index: number; count: number }) {
  const { update, ctxFor, toast } = useStore()
  const { session, assessment } = data
  const [open, setOpen] = useState(false)
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

  const move = (dir: -1 | 1) =>
    update((s) => {
      const same = s.sessions.filter((x) => x.date === session.date)
      const from = same.findIndex((x) => x.id === session.id)
      const to = from + dir
      if (to < 0 || to >= same.length) return
      const a = s.sessions.indexOf(same[from])
      const b = s.sessions.indexOf(same[to])
      ;[s.sessions[a], s.sessions[b]] = [s.sessions[b], s.sessions[a]]
    })

  return (
    <li className={cx('rounded-2xl border bg-panel', assessment.level === 'red' ? 'border-red/40' : assessment.level === 'amber' ? 'border-amber/35' : 'border-line')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className={cx('tabular grid size-10 shrink-0 place-items-center rounded-xl font-display text-2xl leading-none font-bold', session.done ? 'bg-lime text-bg' : 'bg-panel3 text-ink')}>
          {session.done ? <CheckCircle2 size={20} aria-hidden /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{session.wod.name}</span>
          <span className="tabular mt-0.5 block text-xs text-mute">
            {session.wod.capMin} min · RPE {session.done && session.actualRpe ? `${session.actualRpe} (réel)` : session.wod.rpe} · {Math.round(assessment.score)} pts
            {session.result ? ` · ${session.result}` : ''}
          </span>
        </span>
        <LevelPill level={assessment.level} />
        <ChevronDown size={16} aria-hidden className={cx('shrink-0 text-dim transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade border-t border-line/70 px-3.5 pt-2 pb-3.5">
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
          <div className="mt-2 flex items-center justify-end gap-1">
            <button type="button" aria-label={`Monter ${session.wod.name}`} disabled={index === 0} onClick={() => move(-1)} className="grid size-9 place-items-center rounded-lg text-mute hover:bg-panel3 hover:text-ink disabled:opacity-25">
              <ArrowUp size={16} aria-hidden />
            </button>
            <button type="button" aria-label={`Descendre ${session.wod.name}`} disabled={index === count - 1} onClick={() => move(1)} className="grid size-9 place-items-center rounded-lg text-mute hover:bg-panel3 hover:text-ink disabled:opacity-25">
              <ArrowDown size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Supprimer ${session.wod.name}`}
              onClick={() => {
                update((s) => {
                  s.sessions = s.sessions.filter((x) => x.id !== session.id)
                  if (s.draftSessionId === session.id) s.draftSessionId = undefined
                })
                toast('Partie supprimée')
              }}
              className="grid size-9 place-items-center rounded-lg text-mute hover:bg-red/15 hover:text-red"
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
  const { state, update, week, today, toast, ctxFor } = useStore()
  const date = useSessionDate()
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [showEquipment, setShowEquipment] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefsState(next)
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {
      // préférences non enregistrées : sans conséquence
    }
  }

  const days = weekDays(state.competitionDate).filter((d) => d !== state.competitionDate)
  const daysOut = daysBetween(date, state.competitionDate)
  const day = week.days.find((d) => d.date === date)
  const parts = day?.sessions ?? []
  const elsewhere = state.sessions.filter((s) => s.date !== date).length
  const guide = DAY_GUIDE[daysOut]
  const score = day?.score ?? 0
  const level = day?.level ?? 'green'
  const dayWarnings = day?.warnings ?? []
  const nextPart = parts.find((p) => !p.session.done) ?? parts[0]
  const minutesOfWork = parts.reduce((s, p) => s + p.session.wod.capMin, 0)
  const evaluated = state.athletes.filter((a) => Object.keys(a.competency).length > 0 || a.strengths || a.blockers).length

  const generate = () => {
    const res = generateTeamSession({
      athletes: state.athletes,
      daysOut,
      config: state.config,
      minutes: prefs.minutes,
      intensity: prefs.intensity,
      equipment: prefs.equipment,
    })
    update((s) => {
      s.sessions = [...s.sessions.filter((x) => x.date !== date), ...res.parts.map((wod) => ({ id: uid(), date, wod, done: false }))]
      s.draftSessionId = undefined
    })
    setPrefs({ reasons: res.reasons, restMin: res.restMin })
    setConfirm(false)
    toast('Séance en 3 parties générée')
  }

  return (
    <div>
      <PageHeader eyebrow="Une seule séance avant samedi" title="Séance d’équipe">
        {parts.length > 0 && <LevelPill level={level} className="mb-1" />}
      </PageHeader>

      <Card>
        <Field label="Jour de la séance">
          <select
            aria-label="Jour de la séance"
            value={date}
            onChange={(e) =>
              update((s) => {
                for (const x of s.sessions) if (x.date === date) x.date = e.target.value
                s.draftDate = e.target.value
              })
            }
            className={cx(INPUT, 'font-semibold')}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {dayName(d)} {shortDate(d)} · J-{daysBetween(d, state.competitionDate)}
                {d === today ? ' (aujourd’hui)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {guide && (
          <p className="mt-2.5 text-[13px] leading-snug text-mute">
            <span className={cx('font-semibold', daysOut <= 2 ? 'text-amber' : 'text-lime')}>{guide.title}.</span> {guide.detail}
          </p>
        )}
      </Card>

      {/* Générateur */}
      <Card className="mt-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime text-bg">
            <Wand2 size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <H2>Séance en 3 parties</H2>
            <p className="mt-1 text-[13px] leading-snug text-mute">
              Une partie par WOD de l’an dernier, adaptée à ce que chacun a déclaré dans « Mon avis » ({evaluated}/{state.athletes.length} avis reçus) et au
              jour choisi.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Durée totale (min)">
            <Segmented label="Durée totale" value={prefs.minutes} options={[30, 45, 60].map((n) => ({ value: n as SessionLength, label: String(n) }))} onChange={(minutes) => setPrefs({ minutes })} className="h-11" size="sm" />
          </Field>
          <Field label="Intensité">
            <Segmented
              label="Intensité"
              value={prefs.intensity}
              options={[
                { value: 'light', label: 'Légère' },
                { value: 'moderate', label: 'Modérée' },
              ]}
              onChange={(intensity) => setPrefs({ intensity })}
              className="h-11"
              size="sm"
            />
          </Field>
        </div>
        <button type="button" onClick={() => setShowEquipment((s) => !s)} aria-expanded={showEquipment} className="mt-3 flex items-center gap-1 text-xs text-mute hover:text-ink">
          Matériel disponible ({prefs.equipment.length}/{ALL_EQUIPMENT.length})
          <ChevronDown size={13} aria-hidden className={cx('transition', showEquipment && 'rotate-180')} />
        </button>
        {showEquipment && (
          <div className="mt-2 flex animate-fade flex-wrap gap-1.5">
            {ALL_EQUIPMENT.map((e) => {
              const on = prefs.equipment.includes(e)
              return (
                <button
                  key={e}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setPrefs({ equipment: on ? prefs.equipment.filter((x) => x !== e) : [...prefs.equipment, e] })}
                  className={cx('min-h-9 rounded-lg border px-2.5 text-xs font-medium transition', on ? 'border-lime/40 bg-lime/10 text-lime' : 'border-line bg-bg text-dim line-through')}
                >
                  {EQUIPMENT_LABEL[e]}
                </button>
              )
            })}
          </div>
        )}
        {confirm ? (
          <div className="mt-3 rounded-xl border border-amber/30 bg-amber/8 p-3">
            <p className="text-[13px] leading-snug">Remplacer les {parts.length} parties actuelles par une nouvelle séance ?</p>
            <div className="mt-2.5 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={generate}>
                Oui, régénérer
              </Button>
              <Button onClick={() => setConfirm(false)}>Annuler</Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" className="mt-3 w-full" onClick={() => (parts.length ? setConfirm(true) : generate())}>
            <Wand2 size={16} aria-hidden />
            {parts.length ? 'Régénérer la séance' : 'Générer la séance'}
          </Button>
        )}
        {prefs.reasons.length > 0 && parts.length > 0 && (
          <details className="mt-3 rounded-xl bg-panel2 p-3">
            <summary className="cursor-pointer text-[13px] font-semibold">Pourquoi cette séance</summary>
            <ul className="mt-2 space-y-1.5">
              {prefs.reasons.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] leading-snug text-mute">
                  <span className="text-lime">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* Total */}
      {parts.length > 0 && (
        <Card className="mt-4" tone={level === 'green' ? undefined : level}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow>Charge de la séance complète</Eyebrow>
              <p className="mt-1.5 flex items-baseline gap-2">
                <span className="tabular font-display text-5xl leading-none font-bold">{Math.round(score)}</span>
                <span className="text-sm text-mute">pts · {minutesOfWork} min de travail</span>
              </p>
            </div>
            <LevelPill level={level} />
          </div>
          <Meter className="mt-3" value={score} max={state.config.dayRed} level={score >= state.config.dayRed ? 'red' : score >= state.config.dayAmber ? 'amber' : 'green'} />
          <p className="tabular mt-1 text-[11px] text-dim">
            Attention à partir de {state.config.dayAmber} · risque élevé à partir de {state.config.dayRed}. Repère heuristique, pas une mesure médicale.
          </p>
          {dayWarnings.map((w) => (
            <Notice key={w.id} tone={w.severity} className="mt-2.5">
              <p className="font-semibold">{w.title}</p>
              <p className="mt-0.5 text-mute">{w.explanation}</p>
              {w.suggestions[0] && <p className="mt-1">→ {w.suggestions[0]}</p>}
            </Notice>
          ))}
          {level !== 'green' && (
            <Button
              className="mt-3 w-full"
              onClick={() => {
                const lighter = lightenDay(parts.map((p) => p.session.wod), ctxFor(date))
                update((s) => {
                  parts.forEach((p, i) => {
                    const target = s.sessions.find((x) => x.id === p.session.id)
                    if (target) target.wod = lighter[i]
                  })
                })
                toast('Séance allégée')
              }}
            >
              <Feather size={15} aria-hidden />
              Alléger toute la séance
            </Button>
          )}
        </Card>
      )}

      {/* Parties */}
      {parts.length > 0 && (
        <ol className="mt-4 space-y-2">
          {parts.map((p, i) => (
            <Fragment key={p.session.id}>
              <PartCard data={p} index={i} count={parts.length} />
              {i < parts.length - 1 && (
                <li className="flex items-center justify-center gap-1.5 py-0.5 text-[11px] text-dim" aria-label={`Récupération de ${prefs.restMin} minutes`}>
                  <Hourglass size={12} aria-hidden />
                  {prefs.restMin} min de récupération
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      )}

      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
        <Plus size={15} aria-hidden />
        Ajouter une partie
      </Button>

      {elsewhere > 0 && (
        <Notice className="mt-3">
          {elsewhere} bloc{elsewhere > 1 ? 's' : ''} planifié{elsewhere > 1 ? 's' : ''} un autre jour.{' '}
          <button
            type="button"
            className="font-semibold text-ink underline underline-offset-2"
            onClick={() => update((s) => { s.sessions = s.sessions.filter((x) => x.date === date) })}
          >
            Les supprimer
          </button>
        </Notice>
      )}

      {/* Actions */}
      {parts.length > 0 && (
        <Card className="mt-4 space-y-2">
          <Button variant="primary" size="lg" className="w-full" onClick={() => nextPart && go('live', nextPart.session.id)}>
            <Play size={18} aria-hidden />
            {parts.some((p) => p.session.done) && nextPart && !nextPart.session.done ? `Continuer : ${nextPart.session.wod.name}` : 'Lancer la séance'}
          </Button>
          <Button
            className="w-full"
            onClick={async () => {
              const link = proposalLink({ date, parts: parts.map((p) => p.session.wod) })
              const r = await shareLink('WOD War Room · proposition de séance', link)
              toast(r === 'copied' ? 'Lien de la proposition copié' : r === 'shared' ? 'Proposition partagée' : 'Copie impossible')
            }}
          >
            <Share2 size={16} aria-hidden />
            Partager cette proposition
          </Button>
          <Button
            className="w-full"
            onClick={async () => toast((await copyText(buildBrief(state, date))) ? 'Brief copié : collez-le dans Claude' : 'Copie impossible')}
          >
            <Bot size={16} aria-hidden />
            Copier le brief pour Claude
          </Button>
          <p className="text-[11px] leading-snug text-dim">
            Le brief résume l’équipe, les WODs de l’an dernier et cette séance. Collez-le dans Claude pour obtenir une autre proposition, puis saisissez-la
            ici avec « Ajouter une partie ».
          </p>
        </Card>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Ajouter une partie">
        <Eyebrow>Depuis un modèle</Eyebrow>
        <ul className="mt-2 space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  update((s) => {
                    s.sessions.push({ id: uid(), date, wod: instantiate(t.wod), done: false })
                  })
                  toast(`${t.wod.name} ajouté`)
                  setAdding(false)
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
            update((s) => {
              s.draftDate = date
              s.draftSessionId = undefined
            })
            setAdding(false)
            go('builder')
          }}
        >
          Composer dans le builder
        </Button>
      </Sheet>
    </div>
  )
}
