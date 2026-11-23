import { ArrowRight, ChevronDown, RotateCcw, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dayName } from '../domain/calc'
import { assessSession, saferAlternative } from '../domain/risk'
import type { SaferResult } from '../domain/risk'
import type { Assessment, Warning, Wod } from '../domain/types'
import { useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, LEVEL_BG, LEVEL_LABEL, LEVEL_TEXT, LevelIcon, LevelPill } from '../ui/kit'

function ScoreBar({ a, amber, red }: { a: Assessment; amber: number; red: number }) {
  const max = red * 1.3
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-panel3">
        <div
          className={cx('h-full rounded-full transition-all duration-500', LEVEL_BG[a.scoreLevel])}
          style={{ width: pos(a.score) }}
        />
        <span className="absolute inset-y-0 w-px bg-bg" style={{ left: pos(amber) }} />
        <span className="absolute inset-y-0 w-px bg-bg" style={{ left: pos(red) }} />
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-dim">
        <span className="absolute -translate-x-1/2" style={{ left: pos(amber) }}>
          {amber}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(red) }}>
          {red}
        </span>
      </div>
    </div>
  )
}

function WarningCard({ w, onFix }: { w: Warning; onFix?: () => void }) {
  const [open, setOpen] = useState(w.severity !== 'info')
  const tone = w.severity === 'red' ? 'text-red' : w.severity === 'amber' ? 'text-amber' : 'text-dim'
  return (
    <li
      className={cx(
        'rounded-xl border bg-panel2',
        w.severity === 'red' ? 'border-red/35' : w.severity === 'amber' ? 'border-amber/30' : 'border-line',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 p-3 text-left"
      >
        <span className={cx('mt-0.5 shrink-0', tone)}>
          <LevelIcon level={w.severity} size={16} />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug font-semibold">{w.title}</span>
        <ChevronDown size={16} aria-hidden className={cx('mt-0.5 shrink-0 text-dim transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-fade space-y-2.5 px-3 pb-3 pl-[2.375rem]">
          <p className="text-[13px] leading-relaxed text-mute">{w.explanation}</p>
          {w.contributors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {w.contributors.map((c) => (
                <span key={c} className="rounded-md bg-panel3 px-2 py-1 text-[11px] text-mute">
                  {c}
                </span>
              ))}
            </div>
          )}
          {w.suggestions.length > 0 && (
            <ul className="space-y-1">
              {w.suggestions.map((s) => (
                <li key={s} className="flex gap-2 text-[13px] leading-snug">
                  <ArrowRight size={14} aria-hidden className="mt-0.5 shrink-0 text-lime" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
          {w.fix && w.fixLabel && onFix && (
            <Button size="sm" onClick={onFix}>
              <Wrench size={14} aria-hidden />
              {w.fixLabel}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export function RiskPanel({
  wod,
  date,
  onChange,
  id,
}: {
  wod: Wod
  date: string
  onChange?: (wod: Wod) => void
  id?: string
}) {
  const { ctxFor, state, toast } = useStore()
  const ctx = useMemo(() => ctxFor(date), [ctxFor, date])
  const a = useMemo(() => assessSession(wod, ctx), [wod, ctx])
  const [preview, setPreview] = useState<SaferResult | null>(null)
  const [undo, setUndo] = useState<Wod | null>(null)
  const [showMath, setShowMath] = useState(false)

  const apply = (next: Wod, message: string) => {
    if (!onChange) return
    setUndo(wod)
    setPreview(null)
    onChange(next)
    toast(message)
  }

  const alerts = a.warnings.filter((w) => w.severity !== 'info')
  const infos = a.warnings.filter((w) => w.severity === 'info')

  return (
    <Card id={id} tone={a.level === 'green' ? undefined : a.level} className="scroll-mt-28" as="section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Fatigue Guard · {dayName(date)}</Eyebrow>
          <p className={cx('mt-1 font-display text-4xl leading-none font-bold tracking-wide uppercase', LEVEL_TEXT[a.level])}>
            {LEVEL_LABEL[a.level]}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-display text-4xl leading-none font-bold">{Math.round(a.score)}</p>
          <p className="mt-1 text-[11px] text-dim">points de charge</p>
        </div>
      </div>

      <div className="mt-4">
        <ScoreBar a={a} amber={state.config.amber} red={state.config.red} />
      </div>

      <button
        type="button"
        onClick={() => setShowMath((s) => !s)}
        aria-expanded={showMath}
        className="mt-1 flex items-center gap-1 text-xs text-mute underline-offset-2 hover:text-ink hover:underline"
      >
        Comment ce score est calculé
        <ChevronDown size={13} aria-hidden className={cx('transition', showMath && 'rotate-180')} />
      </button>
      {showMath && (
        <div className="mt-2 animate-fade rounded-xl bg-panel2 p-3 text-[12px] leading-relaxed text-mute">
          <p className="tabular text-ink">
            ({Math.round(a.volume)} volume + {Math.round(a.duration)} durée) × {a.rpeFactor.toFixed(2)} intensité ×{' '}
            {a.proximity.toFixed(2)} proximité × {a.context.toFixed(2)} contexte = {Math.round(a.score)}
          </p>
          <ul className="mt-2 space-y-0.5">
            {a.breakdown
              .filter((b) => b.points > 0)
              .map((b) => (
                <li key={b.itemId} className="tabular flex justify-between gap-3">
                  <span className="truncate">{b.label}</span>
                  <span>{b.points.toFixed(1)} pts</span>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-dim">
            Volume = reps par athlète × coût du mouvement × facteur de charge. Repère de planification, pas une mesure
            médicale : il ne prédit ni blessure ni niveau de fatigue réel.
          </p>
        </div>
      )}

      {a.level === 'green' && alerts.length === 0 && (
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-snug text-mute">
          <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-lime" />
          Volume et intensité cohérents avec le nombre de jours restants.
        </p>
      )}

      {alerts.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Alertes">
          {alerts.map((w) => (
            <WarningCard
              key={w.id}
              w={w}
              onFix={onChange && w.fix ? () => apply(w.fix!(wod), 'Correctif appliqué') : undefined}
            />
          ))}
        </ul>
      )}

      {infos.length > 0 && (
        <ul className="mt-2 space-y-2" aria-label="À savoir">
          {infos.map((w) => (
            <WarningCard
              key={w.id}
              w={w}
              onFix={onChange && w.fix ? () => apply(w.fix!(wod), 'Correctif appliqué') : undefined}
            />
          ))}
        </ul>
      )}

      {onChange && a.level !== 'green' && !preview && (
        <Button variant="primary" className="mt-4 w-full" onClick={() => setPreview(saferAlternative(wod, ctx))}>
          <Sparkles size={16} aria-hidden />
          Voir l’alternative plus sûre
        </Button>
      )}

      {preview && onChange && (
        <div className="mt-4 animate-rise rounded-xl border border-lime/30 bg-lime/6 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelPill level={preview.before.level} />
            <ArrowRight size={14} aria-hidden className="text-dim" />
            <LevelPill level={preview.after.level} />
            <span className="tabular text-xs text-mute">
              {Math.round(preview.before.score)} → {Math.round(preview.after.score)} pts
            </span>
          </div>
          <p className="mt-2.5 text-[13px] text-mute">Mêmes mouvements, même structure. Ce qui change :</p>
          {preview.changes.length ? (
            <ul className="mt-1.5 space-y-1">
              {preview.changes.map((c) => (
                <li key={c} className="tabular flex gap-2 text-[13px]">
                  <span className="text-lime">•</span>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[13px]">Aucune modification automatique possible.</p>
          )}
          {preview.after.level !== 'green' && (
            <p className="mt-2 text-xs leading-snug text-amber">
              Le niveau restant vient d’un facteur que l’application ne peut pas corriger seule (douleur signalée,
              récupération).
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={!preview.changes.length}
              onClick={() => apply(preview.wod, 'Alternative plus sûre appliquée')}
            >
              Appliquer
            </Button>
            <Button onClick={() => setPreview(null)}>Garder ma version</Button>
          </div>
        </div>
      )}

      {undo && onChange && (
        <button
          type="button"
          onClick={() => {
            onChange(undo)
            setUndo(null)
            toast('Modification annulée')
          }}
          className="mt-3 flex items-center gap-1.5 text-xs text-mute hover:text-ink"
        >
          <RotateCcw size={13} aria-hidden />
          Annuler la dernière correction
        </button>
      )}
    </Card>
  )
}
