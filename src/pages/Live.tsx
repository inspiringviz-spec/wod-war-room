import { ArrowLeft, Check, Flag, Minus, Pause, Play, Plus, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dayName, equipmentList, formatLabel, num, shortDate } from '../domain/calc'
import { EQUIPMENT_LABEL, movement } from '../domain/movements'
import { assessSession } from '../domain/risk'
import type { Session } from '../domain/types'
import { go, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, Field, INPUT, LevelPill, Notice, PageHeader, TextInput } from '../ui/kit'
import { ItemRow, WodView } from '../components/WodView'
import { CompetencyMatrix } from './Team'

type Phase = 'brief' | 'countdown' | 'run' | 'debrief'

const COUNTDOWN_MS = 10_000

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function useBeep(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  return useCallback(
    (freq: number, durationMs: number) => {
      if (!enabled) return
      try {
        if (!ctxRef.current) ctxRef.current = new AudioContext()
        const ctx = ctxRef.current
        if (ctx.state === 'suspended') void ctx.resume()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.type = 'square'
        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + durationMs / 1000)
      } catch {
        // Audio indisponible : le chrono continue sans son.
      }
    },
    [enabled],
  )
}

function Picker() {
  const { week, today } = useStore()
  const all = week.days.flatMap((d) => d.sessions.map((s) => ({ ...s, date: d.date })))
  const todays = all.filter((s) => s.date === today)
  const others = all.filter((s) => s.date !== today)
  const row = (s: (typeof all)[number]) => (
    <li key={s.session.id}>
      <button
        type="button"
        onClick={() => go('live', s.session.id)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel p-3.5 text-left hover:border-lime/50"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-bg">
          <Play size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{s.session.wod.name}</span>
          <span className="tabular block text-xs text-mute">
            {dayName(s.date)} {shortDate(s.date)} · {formatLabel(s.session.wod)}
            {s.session.done ? ' · faite' : ''}
          </span>
        </span>
        <LevelPill level={s.assessment.level} />
      </button>
    </li>
  )
  return (
    <div>
      <PageHeader eyebrow="Chrono et débrief" title="Mode séance" />
      {all.length === 0 && (
        <Card>
          <p className="text-sm text-mute">Aucune séance planifiée. Composez un mini-WOD pour le lancer ici.</p>
          <Button variant="primary" className="mt-3" onClick={() => go('builder')}>
            Ouvrir le builder
          </Button>
        </Card>
      )}
      {todays.length > 0 && (
        <>
          <Eyebrow className="mb-2">Aujourd’hui</Eyebrow>
          <ul className="mb-5 space-y-2">{todays.map(row)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <Eyebrow className="mb-2">Autres jours</Eyebrow>
          <ul className="space-y-2">{others.map(row)}</ul>
        </>
      )}
    </div>
  )
}

function Runner({ session }: { session: Session }) {
  const { state, update, ctxFor, toast } = useStore()
  const wod = session.wod
  const assessment = useMemo(() => assessSession(wod, ctxFor(session.date)), [wod, ctxFor, session.date])
  const capMs = num(wod.capMin) * 60_000
  const countsDown = wod.format === 'amrap' || wod.format === 'technique'

  const [phase, setPhase] = useState<Phase>('brief')
  const [startAt, setStartAt] = useState<number | null>(null)
  const [accumulated, setAccumulated] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [roundsDone, setRoundsDone] = useState(0)
  const [checked, setChecked] = useState<string[]>([])
  const [sound, setSound] = useState(true)
  const [finalMs, setFinalMs] = useState(0)
  const [capped, setCapped] = useState(false)
  const lastBeep = useRef(-1)
  const beep = useBeep(sound)

  const [rpe, setRpe] = useState(wod.rpe)
  const [result, setResult] = useState('')
  const [note, setNote] = useState('')

  const running = startAt !== null
  const elapsed = accumulated + (startAt !== null ? now - startAt : 0)

  const finish = useCallback(
    (ms: number, hitCap: boolean) => {
      setStartAt(null)
      setAccumulated(ms)
      setFinalMs(ms)
      setCapped(hitCap)
      setPhase('debrief')
      setResult(
        wod.format === 'amrap'
          ? `${roundsDone} tour${roundsDone > 1 ? 's' : ''} en ${fmt(ms)}`
          : wod.format === 'technique'
            ? `${fmt(ms)} de travail`
            : hitCap
              ? `Time cap (${fmt(ms)})`
              : fmt(ms),
      )
    },
    [wod.format, roundsDone],
  )

  // Horloge basée sur l'heure réelle : reste juste même si l'onglet est ralenti.
  // Les transitions (fin du décompte, time cap) et les bips partent du même tick.
  useEffect(() => {
    if (startAt === null) return
    const tick = () => {
      const t = Date.now()
      const el = accumulated + (t - startAt)
      if (phase === 'countdown') {
        const left = Math.ceil((COUNTDOWN_MS - el) / 1000)
        if (left <= 3 && left >= 1 && lastBeep.current !== left) {
          lastBeep.current = left
          beep(660, 140)
        }
        if (el >= COUNTDOWN_MS) {
          beep(990, 600)
          lastBeep.current = -1
          setAccumulated(0)
          setStartAt(t)
          setPhase('run')
        }
      } else if (phase === 'run' && capMs > 0) {
        const left = Math.ceil((capMs - el) / 1000)
        if (left <= 3 && left >= 1 && lastBeep.current !== left) {
          lastBeep.current = left
          beep(660, 140)
        }
        if (el >= capMs) {
          beep(440, 900)
          finish(capMs, true)
          return
        }
      }
      setNow(t)
    }
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [startAt, accumulated, phase, capMs, beep, finish])

  // Écran allumé pendant le chrono, quand le navigateur le permet.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'run') return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          const l = await navigator.wakeLock.request('screen')
          if (cancelled) void l.release()
          else lock = l
        }
      } catch {
        // Refusé ou non pris en charge : sans conséquence.
      }
    }
    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [phase])

  const start = () => {
    lastBeep.current = -1
    setAccumulated(0)
    setNow(Date.now())
    setStartAt(Date.now())
    setRoundsDone(0)
    setChecked([])
    setPhase('countdown')
    beep(520, 80)
  }
  const pause = () => {
    setAccumulated(elapsed)
    setStartAt(null)
  }
  const resume = () => {
    setNow(Date.now())
    setStartAt(Date.now())
  }
  const reset = () => {
    setStartAt(null)
    setAccumulated(0)
    setPhase('brief')
  }

  const nextRound = () => {
    setRoundsDone((r) => r + 1)
    setChecked([])
  }

  const save = () => {
    update((s) => {
      const target = s.sessions.find((x) => x.id === session.id)
      if (!target) return
      target.done = true
      target.actualRpe = rpe
      target.result = result.trim() || undefined
      target.debrief = note.trim() || undefined
    })
    const next = state.sessions.find((x) => x.date === session.date && x.id !== session.id && !x.done)
    if (next) {
      toast('Partie enregistrée : récupérez avant la suivante')
      go('live', next.id)
    } else {
      toast('Séance enregistrée')
      go('week')
    }
  }

  const movementIds = [...new Set(wod.items.map((i) => i.movementId))].filter((id) => movement(id).group !== 'recovery' && id !== 'sync_drill')
  const equipment = equipmentList(wod)

  if (phase === 'brief') {
    return (
      <div>
        <button type="button" onClick={() => go('week')} className="mb-3 flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          Séance
        </button>
        <Card className="grid-bg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>Briefing · {dayName(session.date)}</Eyebrow>
              <h1 className="mt-1.5 font-display text-4xl leading-[0.95] font-bold tracking-wide uppercase">{wod.name}</h1>
            </div>
            <LevelPill level={assessment.level} />
          </div>
          <div className="mt-3">
            <WodView wod={wod} big numbered />
          </div>
        </Card>

        <Card className="mt-4">
          <Eyebrow>Avant de partir</Eyebrow>
          <ul className="mt-2 space-y-2 text-[13px] leading-snug">
            <li className="flex gap-2">
              <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-lime" />
              <span>
                Intensité visée : <span className="font-semibold">RPE {wod.rpe}</span>. On doit finir en ayant de la marge.
              </span>
            </li>
            {equipment.length > 0 && (
              <li className="flex gap-2">
                <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-lime" />
                <span>Matériel : {equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ')}.</span>
              </li>
            )}
            <li className="flex gap-2">
              <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-lime" />
              <span>Annoncez qui fait quoi et l’ordre des transitions avant le départ.</span>
            </li>
          </ul>
          {assessment.warnings
            .filter((w) => w.severity !== 'info')
            .slice(0, 2)
            .map((w) => (
              <Notice key={w.id} tone={w.severity} className="mt-3">
                <span className="font-semibold">{w.title}.</span> {w.suggestions[0]}
              </Notice>
            ))}
        </Card>

        <div className="sticky bottom-20 z-10 mt-4 flex gap-2 lg:bottom-4">
          <Button variant="primary" size="lg" className="flex-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)]" onClick={start}>
            <Play size={20} aria-hidden />
            Démarrer (décompte 10 s)
          </Button>
          <Button size="lg" ariaLabel={sound ? 'Couper le son' : 'Activer le son'} onClick={() => setSound((s) => !s)} className="shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            {sound ? <Volume2 size={20} aria-hidden /> : <VolumeX size={20} aria-hidden />}
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'countdown' || phase === 'run') {
    const inCountdown = phase === 'countdown'
    const display = inCountdown
      ? String(Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000)))
      : countsDown && capMs > 0
        ? fmt(capMs - elapsed + 999)
        : fmt(elapsed)
    const progress = inCountdown ? elapsed / COUNTDOWN_MS : capMs > 0 ? Math.min(1, elapsed / capMs) : 0
    const lastMinute = !inCountdown && capMs > 0 && capMs - elapsed <= 60_000
    return (
      <div className="flex min-h-[calc(100dvh-9.5rem)] flex-col lg:min-h-[calc(100dvh-4rem)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{inCountdown ? 'Préparez-vous' : formatLabel(wod)}</Eyebrow>
            <p className="truncate font-semibold">{wod.name}</p>
          </div>
          <button type="button" aria-label={sound ? 'Couper le son' : 'Activer le son'} onClick={() => setSound((s) => !s)} className="grid size-10 shrink-0 place-items-center rounded-full bg-panel2 text-mute">
            {sound ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
          </button>
        </div>

        <div className="my-4 text-center">
          <p
            role="timer"
            aria-live="off"
            className={cx(
              'tabular font-display leading-[0.85] font-bold tracking-tight',
              inCountdown ? 'text-[40vw] text-lime sm:text-[14rem]' : 'text-[27vw] sm:text-[11rem]',
              lastMinute && 'text-amber',
              !running && 'animate-pulse-soft',
            )}
          >
            {display}
          </p>
          <div className="mx-auto mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-panel3">
            <div className={cx('h-full rounded-full', lastMinute ? 'bg-amber' : 'bg-lime')} style={{ width: `${progress * 100}%` }} />
          </div>
          {!inCountdown && capMs > 0 && (
            <p className="tabular mt-2 text-xs text-mute">
              {countsDown ? `Écoulé ${fmt(elapsed)}` : `Time cap dans ${fmt(capMs - elapsed + 999)}`}
              {!running && ' · en pause'}
            </p>
          )}
        </div>

        {!inCountdown && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3">
            <div>
              <Eyebrow>Tours terminés</Eyebrow>
              <p className="tabular font-display text-4xl leading-none font-bold">
                {roundsDone}
                {wod.format !== 'amrap' && num(wod.rounds) > 0 && <span className="text-xl text-dim"> / {wod.rounds}</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-label="Retirer un tour" disabled={roundsDone === 0} onClick={() => setRoundsDone((r) => Math.max(0, r - 1))} className="grid size-12 place-items-center rounded-xl border border-line bg-bg text-mute disabled:opacity-30">
                <Minus size={20} aria-hidden />
              </button>
              <button type="button" aria-label="Ajouter un tour terminé" onClick={nextRound} className="grid h-12 w-20 place-items-center rounded-xl bg-panel3 text-ink active:scale-95">
                <Plus size={22} aria-hidden />
              </button>
            </div>
          </div>
        )}

        <ul className="flex-1 space-y-1.5">
          {wod.items.map((item) => {
            const done = checked.includes(item.id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={done}
                  disabled={inCountdown}
                  onClick={() => setChecked((c) => (done ? c.filter((x) => x !== item.id) : [...c, item.id]))}
                  className={cx('flex w-full items-center gap-2 rounded-2xl border px-3 text-left transition', done ? 'border-lime/40 bg-lime/8 opacity-55' : 'border-line bg-panel')}
                >
                  <span className="block min-w-0 flex-1">
                    <ItemRow item={item} as="span" />
                  </span>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border', done ? 'border-lime bg-lime text-bg' : 'border-line text-transparent')}>
                    <Check size={15} aria-hidden />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="sticky bottom-20 z-10 mt-4 grid grid-cols-[auto_1fr_auto] gap-2 lg:bottom-4">
          <Button size="lg" ariaLabel="Recommencer" onClick={reset}>
            <RotateCcw size={18} aria-hidden />
          </Button>
          {running ? (
            <Button size="lg" onClick={pause} disabled={inCountdown}>
              <Pause size={18} aria-hidden />
              Pause
            </Button>
          ) : (
            <Button size="lg" variant="primary" onClick={resume}>
              <Play size={18} aria-hidden />
              Reprendre
            </Button>
          )}
          <Button size="lg" variant="primary" disabled={inCountdown} onClick={() => finish(elapsed, false)}>
            <Flag size={18} aria-hidden />
            Terminé
          </Button>
        </div>
      </div>
    )
  }

  // Débrief
  const harder = rpe >= wod.rpe + 1.5
  const remaining = state.sessions.filter((x) => x.date === session.date && x.id !== session.id && !x.done).length
  return (
    <div>
      <PageHeader eyebrow={`Débrief · ${wod.name}`} title={capped ? 'Time cap' : fmt(finalMs)} />

      <Card>
        <Field label="Résultat">
          <TextInput label="Résultat" value={result} maxLength={80} onChange={setResult} className="font-semibold" />
        </Field>
        <Field label="Intensité ressentie par l’équipe" className="mt-4">
          <div className="rounded-xl border border-line bg-bg px-3 pt-2 pb-1">
            <div className="flex items-baseline justify-between">
              <span className="tabular font-display text-3xl leading-none font-bold">RPE {rpe}</span>
              <span className="text-xs text-mute">prévu : {wod.rpe}</span>
            </div>
            <input type="range" min={1} max={10} step={0.5} value={rpe} aria-label="Intensité ressentie (RPE de 1 à 10)" onChange={(e) => setRpe(Number(e.target.value))} />
          </div>
        </Field>
        {harder && (
          <Notice tone="amber" className="mt-3">
            Séance plus dure que prévu. Le Fatigue Guard recalcule la semaine avec ce RPE réel : regardez si les jours
            suivants restent verts.
          </Notice>
        )}
        <Field label="Ce qu’on retient" className="mt-4">
          <textarea
            aria-label="Notes de débrief"
            value={note}
            maxLength={400}
            rows={3}
            placeholder="Synchro, transitions, rôle de chacun, sensations…"
            onChange={(e) => setNote(e.target.value)}
            className={cx(INPUT, 'h-auto resize-none py-2.5 leading-snug')}
          />
        </Field>
      </Card>

      {movementIds.length > 0 && (
        <Card className="mt-4">
          <Eyebrow>Évaluation à chaud</Eyebrow>
          <p className="mt-1 mb-3 text-[13px] leading-snug text-mute">Comment s’est senti chacun sur les mouvements de la séance ? Touchez une case pour la mettre à jour.</p>
          <CompetencyMatrix movementIds={movementIds} compact />
        </Card>
      )}

      <div className="sticky bottom-20 z-10 mt-4 flex gap-2 lg:bottom-4">
        <Button variant="primary" size="lg" className="flex-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)]" onClick={save}>
          <Check size={18} aria-hidden />
          {remaining > 0 ? 'Enregistrer et passer à la suite' : 'Enregistrer la séance'}
        </Button>
        <Button size="lg" onClick={reset} className="shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
          Refaire
        </Button>
      </div>
    </div>
  )
}

export function Live({ sessionId }: { sessionId: string }) {
  const { state } = useStore()
  const session = state.sessions.find((s) => s.id === sessionId)
  if (!session) return <Picker />
  return <Runner key={session.id} session={session} />
}
