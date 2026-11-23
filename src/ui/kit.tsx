import { AlertTriangle, Info, Minus, OctagonAlert, Plus, ShieldCheck, X } from 'lucide-react'
import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'
import type { Level, Severity } from '../domain/types'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export const LEVEL_LABEL: Record<Level, string> = {
  green: 'Contrôlé',
  amber: 'Attention',
  red: 'Risque élevé',
}

export const LEVEL_TEXT: Record<Level, string> = {
  green: 'text-lime',
  amber: 'text-amber',
  red: 'text-red',
}

export const LEVEL_BG: Record<Level, string> = {
  green: 'bg-lime',
  amber: 'bg-amber',
  red: 'bg-red',
}

export const LEVEL_HEX: Record<Level, string> = {
  green: '#c8f53c',
  amber: '#ffb224',
  red: '#ff5d55',
}

const LEVEL_SOFT: Record<Level, string> = {
  green: 'bg-lime/10 text-lime border-lime/25',
  amber: 'bg-amber/10 text-amber border-amber/30',
  red: 'bg-red/10 text-red border-red/30',
}

export function LevelIcon({ level, size = 14 }: { level: Level | Severity; size?: number }) {
  if (level === 'green') return <ShieldCheck size={size} aria-hidden />
  if (level === 'amber') return <AlertTriangle size={size} aria-hidden />
  if (level === 'red') return <OctagonAlert size={size} aria-hidden />
  return <Info size={size} aria-hidden />
}

export function LevelPill({ level, label, className }: { level: Level; label?: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        LEVEL_SOFT[level],
        className,
      )}
    >
      <LevelIcon level={level} />
      {label ?? LEVEL_LABEL[level]}
    </span>
  )
}

export function Card({
  children,
  className,
  tone,
  id,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  tone?: Level
  id?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag
      id={id}
      className={cx(
        'rounded-2xl border bg-panel p-4 sm:p-5',
        tone === 'amber' ? 'border-amber/35' : tone === 'red' ? 'border-red/40' : 'border-line',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[11px] font-semibold tracking-[0.14em] text-dim uppercase', className)}>{children}</p>
  )
}

export function H2({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cx('font-display text-2xl leading-none font-bold tracking-wide uppercase', className)}>{children}</h2>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-1 font-display text-[2rem] leading-[0.95] font-bold tracking-wide uppercase sm:text-4xl">
          {title}
        </h1>
      </div>
      {children}
    </header>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-lime text-bg hover:brightness-110 active:brightness-95 font-semibold',
  secondary: 'bg-panel2 text-ink border border-line hover:bg-panel3 font-medium',
  ghost: 'text-mute hover:text-ink hover:bg-panel2 font-medium',
  danger: 'bg-red/10 text-red border border-red/30 hover:bg-red/20 font-medium',
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  className,
  disabled,
  type = 'button',
  ariaLabel,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  ariaLabel?: string
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl transition duration-150 select-none active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
        size === 'sm' ? 'min-h-9 px-3 text-[13px]' : size === 'lg' ? 'min-h-13 px-5 text-base' : 'min-h-11 px-4 text-sm',
        BUTTON[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-xl border border-line bg-bg p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 rounded-lg px-2 text-center font-medium whitespace-nowrap transition disabled:opacity-30',
              size === 'sm' ? 'min-h-8 text-xs' : 'min-h-9 text-[13px]',
              active ? 'bg-panel3 text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-mute hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
  suffix,
  className,
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  label: string
  suffix?: string
  className?: string
}) {
  const safe = Number.isFinite(value) ? value : 0
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <div className={cx('flex h-11 items-stretch overflow-hidden rounded-xl border border-line bg-bg', className)}>
      <button
        type="button"
        aria-label={`Diminuer ${label}`}
        onClick={() => set(safe - step)}
        disabled={safe <= min}
        className="grid w-10 shrink-0 place-items-center text-mute hover:bg-panel2 hover:text-ink disabled:opacity-30"
      >
        <Minus size={16} aria-hidden />
      </button>
      <label className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <span className="sr-only">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          value={safe}
          min={min}
          max={max}
          step={step}
          onChange={(e) => set(e.target.value === '' ? min : Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          className="tabular w-full min-w-0 bg-transparent text-center text-[15px] font-semibold outline-none"
          style={{ maxWidth: suffix ? '3.2rem' : undefined }}
        />
        {suffix && <span className="shrink-0 pr-1 text-xs text-dim">{suffix}</span>}
      </label>
      <button
        type="button"
        aria-label={`Augmenter ${label}`}
        onClick={() => set(safe + step)}
        disabled={safe >= max}
        className="grid w-10 shrink-0 place-items-center text-mute hover:bg-panel2 hover:text-ink disabled:opacity-30"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <span className="mb-1.5 block text-xs font-medium text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-dim">{hint}</span>}
    </div>
  )
}

export const INPUT =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-bg px-3 text-sm outline-none placeholder:text-dim focus:border-lime/60'

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  className,
  maxLength = 120,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  className?: string
  maxLength?: number
}) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cx(INPUT, className)}
    />
  )
}

/** Champ numérique qui accepte le vide (valeur inconnue). */
export function OptionalNumber({
  value,
  onChange,
  label,
  placeholder = '—',
  suffix,
  className,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  label: string
  placeholder?: string
  suffix?: string
  className?: string
}) {
  return (
    <label className={cx('flex h-11 items-center gap-1 rounded-xl border border-line bg-bg px-3 focus-within:border-lime/60', className)}>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value === undefined ? '' : value}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(undefined)
          const n = Number(raw)
          onChange(Number.isFinite(n) && n >= 0 ? n : undefined)
        }}
        className="tabular w-full min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-dim"
      />
      {suffix && <span className="shrink-0 text-xs text-dim">{suffix}</span>}
    </label>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 animate-fade cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="relative flex max-h-[90dvh] w-full animate-sheet flex-col rounded-t-3xl border border-line bg-panel sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id={id} className="font-display text-2xl leading-none font-bold tracking-wide uppercase">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-panel2 text-mute hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="safe-bottom border-t border-line p-4">{footer}</div>}
      </div>
    </div>
  )
}

/** Jauge circulaire (repère visuel, pas une mesure). */
export function Ring({
  value,
  level,
  size = 132,
  stroke = 10,
  children,
}: {
  value: number
  level: Level
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, value)) / 100
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232731" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={LEVEL_HEX[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1), stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function Meter({ value, max, level, className }: { value: number; max: number; level: Level; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-panel3', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', LEVEL_BG[level])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: Severity; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'flex gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-snug',
        tone === 'red'
          ? 'border-red/30 bg-red/8 text-ink'
          : tone === 'amber'
            ? 'border-amber/30 bg-amber/8 text-ink'
            : 'border-line bg-panel2 text-mute',
        className,
      )}
    >
      <span className={cx('mt-0.5 shrink-0', tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber' : 'text-dim')}>
        <LevelIcon level={tone} size={15} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-[13px] font-medium transition disabled:opacity-35',
        checked ? 'border-lime/40 bg-lime/10 text-lime' : 'border-line bg-bg text-mute',
      )}
    >
      <span>{label}</span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-lime' : 'bg-panel3')}>
        <span
          className={cx(
            'absolute top-0.5 size-4 rounded-full transition-all',
            checked ? 'left-[18px] bg-bg' : 'left-0.5 bg-mute',
          )}
        />
      </span>
    </button>
  )
}
