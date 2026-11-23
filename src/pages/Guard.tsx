import { ChevronDown, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, Cell, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { dayName, emptyTagPoints, isValidISO } from '../domain/calc'
import { TAG_LABEL } from '../domain/movements'
import { DEFAULT_CONFIG } from '../domain/risk'
import type { RiskConfig, Tag } from '../domain/types'
import { go, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, Field, INPUT, LEVEL_HEX, LEVEL_TEXT, LevelPill, Meter, Notice, PageHeader, Ring, Stepper, TextInput } from '../ui/kit'

const RADAR_TAGS: Tag[] = ['grip', 'shoulder', 'overhead', 'legs', 'impact', 'engine', 'core']

const SCALE = [1, 2, 3, 4, 5]

function Scale({ label, value, onChange, low, high }: { label: string; value: number; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-mute">{label}</span>
        <span className="text-[10px] text-dim">
          1 = {low} · 5 = {high}
        </span>
      </div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1">
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? 0 : n)}
            className={cx(
              'tabular h-10 rounded-lg border text-sm font-semibold transition',
              value === n ? 'border-lime bg-lime text-bg' : 'border-line bg-bg text-mute hover:text-ink',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumberSetting({ label, value, onChange, step = 1, min = 0, max = 9999, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Stepper label={label} value={value} step={step} min={min} max={max} onChange={onChange} />
    </Field>
  )
}

export function Guard() {
  const { state, update, week, ready, toast } = useStore()
  const [settings, setSettings] = useState(false)
  const cfg = state.config
  const setCfg = (fn: (c: RiskConfig) => void) => update((s) => fn(s.config))

  const sessionDay = week.days.find((d) => d.sessions.length > 0)
  const chart = (sessionDay?.sessions ?? []).map((s, i) => ({ name: `Partie ${i + 1}`, score: Math.round(s.assessment.score), level: s.assessment.level, today: true }))
  const zones = emptyTagPoints()
  for (const d of week.days) for (const s of d.sessions) for (const t of RADAR_TAGS) zones[t] += s.assessment.tagPoints[t]
  const radar = RADAR_TAGS.map((t) => ({ zone: TAG_LABEL[t], value: Math.round(zones[t]) }))
  const hasLoad = radar.some((r) => r.value > 0)

  const allAlerts = [
    ...week.warnings.map((w) => ({ where: 'Ensemble', w, sessionId: undefined as string | undefined })),
    ...week.days.flatMap((d) => [
      ...d.warnings.filter((w) => w.severity !== 'info').map((w) => ({ where: dayName(d.date), w, sessionId: undefined as string | undefined })),
      ...d.sessions.flatMap((s) =>
        s.assessment.warnings
          .filter((w) => w.severity !== 'info')
          .map((w) => ({ where: `${dayName(d.date)} · ${s.session.wod.name}`, w, sessionId: s.session.id })),
      ),
    ]),
  ]

  return (
    <div>
      <PageHeader eyebrow="Charge et fraîcheur" title="Fatigue Guard" />

      <Notice className="mb-4">
        Outil heuristique de planification : il additionne des points de volume et applique des règles visibles
        ci-dessous. Il ne prédit pas les blessures et ne remplace ni un coach ni un professionnel de santé. Vous restez
        libres de vos choix : aucune alerte ne bloque l’édition.
      </Notice>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4">
            <Ring value={ready.score} level={ready.level}>
              <div>
                <p className="tabular font-display text-5xl leading-none font-bold">{ready.score}</p>
                <p className={cx('mt-0.5 text-xs font-semibold', LEVEL_TEXT[ready.level])}>{ready.label}</p>
              </div>
            </Ring>
            <div className="min-w-0">
              <Eyebrow>Indice de fraîcheur</Eyebrow>
              <p className="mt-1.5 text-[13px] leading-snug text-mute">
                100 = semaine légère et bonne récupération déclarée. Chaque ligne ci-dessous retire des points.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {ready.parts.map((p) => (
              <li key={p.label}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium">{p.label}</span>
                  <span className="tabular text-xs text-mute">
                    −{Math.round(p.penalty)} / {p.max}
                  </span>
                </div>
                <Meter className="mt-1" value={p.penalty} max={p.max} level={p.max <= 5 ? (p.penalty > 0 ? 'amber' : 'green') : p.penalty / p.max > 0.66 ? 'red' : p.penalty / p.max > 0.4 ? 'amber' : 'green'} />
                <p className="mt-1 text-[11px] text-dim">{p.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow>Charge par partie{sessionDay ? ` · ${dayName(sessionDay.date).toLowerCase()}` : ''}</Eyebrow>
              <p className="mt-1.5 flex items-baseline gap-2">
                <span className="tabular font-display text-4xl leading-none font-bold">{Math.round(week.total)}</span>
                <span className="text-sm text-mute">pts · seuils {cfg.dayAmber} / {cfg.dayRed}</span>
              </p>
            </div>
            <LevelPill level={week.level} />
          </div>
          <div className="mt-3 h-40" role="img" aria-label={`Charge par jour : ${chart.map((c) => `${c.name} ${c.score} points`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a3a9b5', fontSize: 11 }} />
                <YAxis hide domain={[0, (max: number) => Math.max(max, cfg.red * 1.05)]} />
                <ReferenceLine y={cfg.amber} stroke="#ffb224" strokeDasharray="3 4" strokeOpacity={0.7} />
                <ReferenceLine y={cfg.red} stroke="#ff5d55" strokeDasharray="3 4" strokeOpacity={0.7} />
                <Bar dataKey="score" radius={[6, 6, 2, 2]} minPointSize={3} isAnimationActive={false}>
                  {chart.map((c) => (
                    <Cell key={c.name} fill={LEVEL_HEX[c.level]} fillOpacity={c.today ? 1 : 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] leading-snug text-dim">
            Pointillés : seuils « attention » ({cfg.amber}) et « risque élevé » ({cfg.red}) pour une partie. Le total de
            la séance a ses propres seuils. Les points sont déjà majorés à l’approche de la compétition.
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <Eyebrow>Zones sollicitées par la séance</Eyebrow>
        {hasLoad ? (
          <div className="mx-auto mt-2 h-56 max-w-md" role="img" aria-label={`Points par zone : ${radar.map((r) => `${r.zone} ${r.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#2a2e39" />
                <PolarAngleAxis dataKey="zone" tick={{ fill: '#a3a9b5', fontSize: 11 }} />
                <Radar dataKey="value" stroke="#c8f53c" fill="#c8f53c" fillOpacity={0.22} strokeWidth={2} isAnimationActive={false} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-dim">Aucune séance planifiée.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {radar.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).map((r) => (
            <span key={r.zone} className="tabular rounded-md bg-panel2 px-2 py-1 text-[11px] text-mute">
              {r.zone} · {r.value} pts
            </span>
          ))}
        </div>
      </Card>

      <Card className="mt-4" tone={allAlerts.some((a) => a.w.severity === 'red') ? 'red' : allAlerts.length ? 'amber' : undefined}>
        <Eyebrow>Alertes</Eyebrow>
        {allAlerts.length === 0 ? (
          <p className="mt-2 flex items-start gap-2 text-[13px] leading-snug text-mute">
            <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-lime" />
            Aucune alerte : le plan reste dans les limites pour chaque jour.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {allAlerts.map(({ where, w, sessionId }) => (
              <li key={`${where}-${w.id}`}>
                <Notice tone={w.severity}>
                  <p className="text-[11px] font-semibold tracking-wide text-dim uppercase">{where}</p>
                  <p className="mt-0.5 font-semibold">{w.title}</p>
                  <p className="mt-0.5 text-mute">{w.explanation}</p>
                  {w.suggestions[0] && <p className="mt-1">→ {w.suggestions[0]}</p>}
                  {sessionId && (
                    <button
                      type="button"
                      className="mt-1.5 text-xs font-semibold text-lime underline-offset-2 hover:underline"
                      onClick={() => {
                        const session = state.sessions.find((x) => x.id === sessionId)
                        if (!session) return
                        update((s) => {
                          s.draft = structuredClone(session.wod)
                          s.draftDate = session.date
                          s.draftSessionId = session.id
                        })
                        go('builder')
                      }}
                    >
                      Ouvrir et corriger en un clic
                    </button>
                  )}
                </Notice>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <Eyebrow>Récupération déclarée</Eyebrow>
        <p className="mt-1 text-[13px] leading-snug text-mute">
          Facultatif, à remplir le jour de la séance. Sommeil bas, fortes courbatures ou énergie basse rendent l’indicateur plus
          prudent. Touchez à nouveau une valeur pour l’effacer.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {state.athletes.map((a) => {
            const setRec = (fn: (r: typeof a.recovery) => void) =>
              update((s) => {
                const target = s.athletes.find((x) => x.id === a.id)
                if (target) fn(target.recovery)
              })
            return (
              <div key={a.id} className="space-y-3 rounded-2xl border border-line bg-panel2 p-3">
                <p className="font-display text-xl leading-none font-bold tracking-wide uppercase">{a.name}</p>
                <Scale label="Sommeil" value={a.recovery.sleep} low="mauvais" high="excellent" onChange={(v) => setRec((r) => { r.sleep = v })} />
                <Scale label="Courbatures" value={a.recovery.soreness} low="aucune" high="très fortes" onChange={(v) => setRec((r) => { r.soreness = v })} />
                <Scale label="Énergie" value={a.recovery.energy} low="à plat" high="en forme" onChange={(v) => setRec((r) => { r.energy = v })} />
                <Field label="Douleur ou gêne">
                  <TextInput label={`Douleur ou gêne de ${a.name}`} value={a.recovery.pain} placeholder="Ex. épaule droite" maxLength={160} onChange={(v) => setRec((r) => { r.pain = v })} />
                </Field>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="mt-4">
        <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} className="flex w-full items-center justify-between gap-3 text-left">
          <div>
            <Eyebrow>Calcul et réglages</Eyebrow>
            <p className="mt-1 text-[13px] text-mute">Formule, seuils et pondérations : tout est modifiable.</p>
          </div>
          <ChevronDown size={18} aria-hidden className={cx('shrink-0 text-dim transition', settings && 'rotate-180')} />
        </button>

        {settings && (
          <div className="mt-4 animate-fade space-y-5">
            <div className="rounded-xl bg-panel2 p-3 text-[13px] leading-relaxed text-mute">
              <p className="text-ink">Score d’une séance = (volume + durée) × intensité × proximité × contexte</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Volume : reps par athlète impliqué × coût du mouvement (1 burpee = 1 point) × facteur de charge (0,6 + charge / 1RM quand le 1RM est connu).</li>
                <li>Durée : minutes × {cfg.durationWeight}.</li>
                <li>Intensité : (RPE / 6) puissance {cfg.rpeExponent}. RPE 6 = 1, RPE 9 ≈ {Math.pow(9 / 6, cfg.rpeExponent).toFixed(2)}.</li>
                <li>Proximité : multiplicateur selon les jours restants.</li>
                <li>Contexte : arrêt récent de 2 semaines ou plus, récupération déclarée basse.</li>
              </ul>
              <p className="mt-2">Des règles s’ajoutent au score : squats lourds près de la compétition, charge au-delà de {Math.round(cfg.maxRel * 100)} % du 1RM, volume de burpees ou de gym, grip et overhead cumulés, hausse par rapport au modèle, RPE trop élevé pour le jour.</p>
            </div>

            <Field label="Date de la compétition">
              <input
                type="date"
                aria-label="Date de la compétition"
                value={state.competitionDate}
                onChange={(e) => {
                  if (isValidISO(e.target.value)) update((s) => { s.competitionDate = e.target.value })
                }}
                className={INPUT}
              />
            </Field>

            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Seuils</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberSetting label="Séance : attention" value={cfg.amber} step={5} min={10} max={1000} onChange={(v) => setCfg((c) => { c.amber = v; if (c.red <= v) c.red = v + 5 })} />
                <NumberSetting label="Séance : risque élevé" value={cfg.red} step={5} min={15} max={2000} onChange={(v) => setCfg((c) => { c.red = Math.max(v, c.amber + 5) })} />
                <NumberSetting label="Séance complète : attention" value={cfg.dayAmber} step={10} min={20} max={3000} onChange={(v) => setCfg((c) => { c.dayAmber = v; if (c.dayRed <= v) c.dayRed = v + 10 })} />
                <NumberSetting label="Séance complète : risque élevé" value={cfg.dayRed} step={10} min={30} max={6000} onChange={(v) => setCfg((c) => { c.dayRed = Math.max(v, c.dayAmber + 10) })} />
                <NumberSetting label="Semaine : attention" value={cfg.weekAmber} step={10} min={20} max={5000} onChange={(v) => setCfg((c) => { c.weekAmber = v; if (c.weekRed <= v) c.weekRed = v + 10 })} />
                <NumberSetting label="Semaine : risque élevé" value={cfg.weekRed} step={10} min={30} max={10000} onChange={(v) => setCfg((c) => { c.weekRed = Math.max(v, c.weekAmber + 10) })} />
                <NumberSetting label="Burpees / athlète : attention" value={cfg.burpeeAmber} min={5} max={500} onChange={(v) => setCfg((c) => { c.burpeeAmber = v; if (c.burpeeRed <= v) c.burpeeRed = v + 5 })} />
                <NumberSetting label="Burpees / athlète : risque" value={cfg.burpeeRed} min={10} max={1000} onChange={(v) => setCfg((c) => { c.burpeeRed = Math.max(v, c.burpeeAmber + 1) })} />
                <NumberSetting label="Gym barre / athlète : attention" value={cfg.gymAmber} min={5} max={500} onChange={(v) => setCfg((c) => { c.gymAmber = v; if (c.gymRed <= v) c.gymRed = v + 5 })} />
                <NumberSetting label="Gym barre / athlète : risque" value={cfg.gymRed} min={10} max={1000} onChange={(v) => setCfg((c) => { c.gymRed = Math.max(v, c.gymAmber + 1) })} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Multiplicateur de proximité</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {['4', '3', '2', '1', '0'].map((k) => (
                  <NumberSetting key={k} label={k === '0' ? 'Jour J' : `J-${k}`} value={cfg.proximity[k]} step={0.05} min={0.5} max={5} onChange={(v) => setCfg((c) => { c.proximity[k] = v })} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Contexte et charges</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberSetting label="Majoration arrêt récent" value={cfg.inactivityFactor} step={0.05} min={1} max={2} onChange={(v) => setCfg((c) => { c.inactivityFactor = v })} />
                <NumberSetting label="Majoration récupération basse" value={cfg.lowRecoveryFactor} step={0.05} min={1} max={2} onChange={(v) => setCfg((c) => { c.lowRecoveryFactor = v })} />
                <NumberSetting label="Squat « lourd » (part du 1RM)" value={cfg.squatHeavyRel} step={0.05} min={0.3} max={1} onChange={(v) => setCfg((c) => { c.squatHeavyRel = v })} />
                <NumberSetting label="« Proche du max » (part du 1RM)" value={cfg.maxRel} step={0.05} min={0.5} max={1.5} onChange={(v) => setCfg((c) => { c.maxRel = v })} />
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => {
                update((s) => { s.config = { ...DEFAULT_CONFIG, proximity: { ...DEFAULT_CONFIG.proximity } } })
                toast('Réglages par défaut rétablis')
              }}
            >
              <RotateCcw size={14} aria-hidden />
              Rétablir les réglages par défaut
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
