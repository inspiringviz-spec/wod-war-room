import { CalendarPlus, Dices, LayoutTemplate, Play, Save, Share2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { dayName, daysBetween, instantiate, movementTotals, uid } from '../domain/calc'
import { OBJECTIVE_LABEL, OBJECTIVES, TEMPLATES } from '../domain/data'
import { generateWod } from '../domain/generator'
import type { Intensity } from '../domain/generator'
import { ALL_EQUIPMENT, EQUIPMENT_LABEL } from '../domain/movements'
import { assessSession } from '../domain/risk'
import { wodLink } from '../domain/share'
import type { Equipment, Objective, Wod } from '../domain/types'
import { go, useSessionDate, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, Field, INPUT, LEVEL_BG, LEVEL_LABEL, LEVEL_TEXT, PageHeader, Segmented, Stepper } from '../ui/kit'
import { RiskPanel } from '../components/RiskPanel'
import { shareLink } from '../components/ShareSheet'
import { WodEditor } from '../components/WodEditor'

const GEN_KEY = 'wod-war-room:generator'

interface GenPrefs {
  objective: Objective
  minutes: number
  teamSize: number
  intensity: Intensity
  equipment: Equipment[]
}

function loadPrefs(): GenPrefs {
  const base: GenPrefs = { objective: 'sync', minutes: 8, teamSize: 3, intensity: 'moderate', equipment: [...ALL_EQUIPMENT] }
  try {
    const raw = JSON.parse(window.localStorage.getItem(GEN_KEY) ?? 'null') as Partial<GenPrefs> | null
    if (!raw || typeof raw !== 'object') return base
    return {
      objective: OBJECTIVES.includes(raw.objective as Objective) ? (raw.objective as Objective) : base.objective,
      minutes: Number.isFinite(raw.minutes) ? Math.min(40, Math.max(3, Number(raw.minutes))) : base.minutes,
      teamSize: [1, 2, 3].includes(Number(raw.teamSize)) ? Number(raw.teamSize) : base.teamSize,
      intensity: (['light', 'moderate', 'high'] as const).includes(raw.intensity as Intensity) ? (raw.intensity as Intensity) : base.intensity,
      equipment: Array.isArray(raw.equipment) ? ALL_EQUIPMENT.filter((e) => raw.equipment!.includes(e)) : base.equipment,
    }
  } catch {
    return base
  }
}

function Generator({ onGenerate }: { onGenerate: (wod: Wod) => void }) {
  const [prefs, setPrefs] = useState<GenPrefs>(loadPrefs)
  const [variant, setVariant] = useState(0)
  const set = (p: Partial<GenPrefs>) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    try {
      window.localStorage.setItem(GEN_KEY, JSON.stringify(next))
    } catch {
      // préférences non enregistrées : sans conséquence
    }
  }
  const run = (v: number) => {
    setVariant(v)
    onGenerate(generateWod({ ...prefs, variant: v }))
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Objectif" className="col-span-2">
          <select
            aria-label="Objectif du mini-WOD"
            value={prefs.objective}
            onChange={(e) => set({ objective: e.target.value as Objective })}
            className={INPUT}
          >
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABEL[o]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Temps disponible">
          <Stepper label="temps disponible" value={prefs.minutes} min={3} max={40} suffix="min" onChange={(minutes) => set({ minutes })} />
        </Field>
        <Field label="Athlètes">
          <Segmented
            label="Nombre d'athlètes"
            value={prefs.teamSize}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            onChange={(teamSize) => set({ teamSize })}
            className="h-11"
          />
        </Field>
        <Field label="Intensité" className="col-span-2">
          <Segmented
            label="Intensité"
            value={prefs.intensity}
            options={[
              { value: 'light', label: 'Légère' },
              { value: 'moderate', label: 'Modérée' },
              { value: 'high', label: 'Soutenue' },
            ]}
            onChange={(intensity) => set({ intensity })}
          />
        </Field>
      </div>
      <Field label="Matériel disponible">
        <div className="flex flex-wrap gap-1.5">
          {ALL_EQUIPMENT.map((e) => {
            const on = prefs.equipment.includes(e)
            return (
              <button
                key={e}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => set({ equipment: on ? prefs.equipment.filter((x) => x !== e) : [...prefs.equipment, e] })}
                className={cx(
                  'min-h-9 rounded-lg border px-2.5 text-xs font-medium transition',
                  on ? 'border-lime/40 bg-lime/10 text-lime' : 'border-line bg-bg text-dim line-through',
                )}
              >
                {EQUIPMENT_LABEL[e]}
              </button>
            )
          })}
        </div>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => run(0)}>
          <Wand2 size={16} aria-hidden />
          Générer
        </Button>
        <Button onClick={() => run(variant + 1)}>
          <Dices size={16} aria-hidden />
          Autre idée
        </Button>
      </div>
    </div>
  )
}

export function Builder() {
  const { state, update, ctxFor, toast, today } = useStore()
  const [tab, setTab] = useState<'templates' | 'generator'>('templates')
  const wod = state.draft
  const date = useSessionDate()
  const out = daysBetween(date, state.competitionDate)
  const assessment = assessSession(wod, ctxFor(date))
  const editing = state.sessions.find((s) => s.id === state.draftSessionId)

  const setDraft = (next: Wod) =>
    update((s) => {
      s.draft = next
    })

  const loadFresh = (next: Wod) =>
    update((s) => {
      s.draft = next
      s.draftSessionId = undefined
      s.draftDate = date
    })

  const saveNew = (): string => {
    const id = uid()
    update((s) => {
      const copy = structuredClone(s.draft)
      copy.id = uid()
      if (!copy.baseline) copy.baseline = movementTotals(copy)
      s.sessions.push({ id, date, wod: copy, done: false })
      s.draftSessionId = id
      s.draftDate = date
    })
    return id
  }

  const saveExisting = () => {
    if (!editing) return
    update((s) => {
      const target = s.sessions.find((x) => x.id === editing.id)
      if (!target) return
      target.wod = structuredClone(s.draft)
      target.date = date
    })
  }

  return (
    <div>
      <PageHeader eyebrow="Composer" title="Mini-WOD Builder" />

      {/* Indicateur collant : toujours visible pendant l'édition */}
      <a
        href="#/builder"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('risk')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
        aria-label={`Fatigue Guard : ${LEVEL_LABEL[assessment.level]}, ${Math.round(assessment.score)} points. Voir le détail`}
        className="sticky top-[3.75rem] z-20 -mx-1 mb-4 flex items-center gap-3 rounded-2xl border border-line bg-panel/95 px-3.5 py-2.5 backdrop-blur lg:top-3"
      >
        <span className={cx('size-2.5 shrink-0 rounded-full', LEVEL_BG[assessment.level], assessment.level !== 'green' && 'animate-pulse-soft')} />
        <span className="min-w-0 flex-1 text-[13px]">
          <span className="text-mute">Fatigue Guard · </span>
          <span className={cx('font-semibold', LEVEL_TEXT[assessment.level])}>{LEVEL_LABEL[assessment.level]}</span>
          {assessment.warnings.filter((w) => w.severity !== 'info').length > 0 && (
            <span className="text-mute">
              {' '}· {assessment.warnings.filter((w) => w.severity !== 'info').length} alerte
              {assessment.warnings.filter((w) => w.severity !== 'info').length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span className="tabular shrink-0 font-display text-2xl leading-none font-bold">{Math.round(assessment.score)}</span>
      </a>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card>
            <Segmented
              label="Point de départ"
              value={tab}
              options={[
                { value: 'templates', label: <span className="inline-flex items-center gap-1.5"><LayoutTemplate size={14} aria-hidden />Modèles</span> },
                { value: 'generator', label: <span className="inline-flex items-center gap-1.5"><Wand2 size={14} aria-hidden />Générateur</span> },
              ]}
              onChange={setTab}
            />
            <div className="mt-3">
              {tab === 'templates' ? (
                <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        loadFresh(instantiate(t.wod))
                        toast(`${t.wod.name} chargé`)
                      }}
                      className={cx(
                        'w-[11.5rem] shrink-0 snap-start rounded-2xl border p-3 text-left transition hover:border-lime/50 active:scale-[0.98]',
                        wod.templateId === t.id && !editing ? 'border-lime/60 bg-lime/8' : 'border-line bg-panel2',
                      )}
                    >
                      <span className="text-[11px] font-semibold tracking-wider text-lime uppercase">{t.tag}</span>
                      <span className="mt-1 block font-display text-xl leading-none font-bold tracking-wide uppercase">{t.wod.name}</span>
                      <span className="mt-1.5 block text-xs leading-snug text-mute">{t.blurb}</span>
                      <span className="tabular mt-2 block text-[11px] text-dim">
                        {t.wod.capMin} min · {t.rpeText}
                        {t.inspiredBy ? ` · ${t.inspiredBy}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Generator
                  onGenerate={(w) => {
                    loadFresh(w)
                    toast('Mini-WOD généré : ajustez-le librement')
                  }}
                />
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Eyebrow>{editing ? 'Modification d’une partie de la séance' : 'Votre mini-WOD'}</Eyebrow>
              {editing && (
                <button
                  type="button"
                  className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline"
                  onClick={() => update((s) => { s.draftSessionId = undefined })}
                >
                  Détacher de la séance
                </button>
              )}
            </div>
            <WodEditor wod={wod} onChange={setDraft} />
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-20">
          <Card>
            <Eyebrow>Évalué pour la séance</Eyebrow>
            <p className="mt-1.5 text-sm font-semibold">
              {dayName(date)} · {out === 0 ? 'jour J' : `J-${out}`}
              {date === today ? ' (aujourd’hui)' : ''}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-dim">Le même WOD pèse plus lourd à l’approche de la compétition. Le jour se change dans « Séance ».</p>
          </Card>

          <RiskPanel id="risk" wod={wod} date={date} onChange={setDraft} />

          <Card className="space-y-2">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    saveExisting()
                    toast('Partie mise à jour')
                    go('week')
                  }}
                >
                  <Save size={16} aria-hidden />
                  Mettre à jour cette partie
                </Button>
                <Button
                  className="w-full"
                  onClick={() => {
                    saveExisting()
                    go('live', editing.id)
                  }}
                >
                  <Play size={16} aria-hidden />
                  Enregistrer et lancer
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={wod.items.length === 0}
                  onClick={() => {
                    saveNew()
                    toast('Ajouté à la séance')
                    go('week')
                  }}
                >
                  <CalendarPlus size={16} aria-hidden />
                  Ajouter à la séance
                </Button>
                <Button
                  className="w-full"
                  disabled={wod.items.length === 0}
                  onClick={() => go('live', saveNew())}
                >
                  <Play size={16} aria-hidden />
                  Ajouter et lancer
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                const r = await shareLink(`Mini-WOD · ${wod.name}`, wodLink(wod))
                toast(r === 'copied' ? 'Lien du mini-WOD copié' : r === 'shared' ? 'Mini-WOD partagé' : 'Copie impossible')
              }}
            >
              <Share2 size={16} aria-hidden />
              Partager ce mini-WOD par lien
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
