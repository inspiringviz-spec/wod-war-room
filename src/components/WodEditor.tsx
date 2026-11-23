import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { cloneWod, equipmentList, num, uid } from '../domain/calc'
import { OBJECTIVE_LABEL, OBJECTIVES } from '../domain/data'
import { EQUIPMENT_LABEL, GROUP_LABEL, GROUP_ORDER, movement, MOVEMENTS, unitLabel } from '../domain/movements'
import type { Format, Objective, Wod, WodItem } from '../domain/types'
import { Button, cx, Field, INPUT, OptionalNumber, Segmented, Stepper, TextInput, Toggle } from '../ui/kit'

const FORMAT_LABEL: Record<Format, string> = {
  rounds: 'Tours',
  amrap: 'AMRAP',
  for_time: 'For Time',
  technique: 'Technique',
}

function rpeWord(rpe: number): string {
  if (rpe <= 3) return 'très facile'
  if (rpe <= 5) return 'facile, on peut parler'
  if (rpe <= 7) return 'soutenu mais contrôlé'
  if (rpe <= 8) return 'dur'
  return 'maximal'
}

function stepFor(unit: string, qty: number): number {
  if (unit === 'm') return qty >= 100 ? 50 : 10
  if (unit === 'cal') return 1
  return 1
}

function ItemEditor({
  item,
  index,
  count,
  teamSize,
  onChange,
  onRemove,
  onMove,
}: {
  item: WodItem
  index: number
  count: number
  teamSize: number
  onChange: (patch: Partial<WodItem>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const mv = movement(item.movementId)
  const athleteOptions = [1, 2, 3].filter((n) => n <= Math.max(1, teamSize))
  return (
    <li className="rounded-2xl border border-line bg-panel2 p-3">
      <div className="flex items-center gap-2">
        <span className="tabular grid size-7 shrink-0 place-items-center rounded-lg bg-panel3 text-xs font-semibold text-mute">
          {index + 1}
        </span>
        <select
          aria-label={`Mouvement ${index + 1}`}
          value={item.movementId}
          onChange={(e) => {
            const next = movement(e.target.value)
            const patch: Partial<WodItem> = { movementId: next.id }
            if (!next.loaded) {
              patch.loadM = undefined
              patch.loadF = undefined
            }
            if (next.unit !== mv.unit) patch.qty = next.unit === 'm' ? 100 : next.unit === 'cal' ? 10 : next.unit === 'min' ? 5 : 10
            onChange(patch)
          }}
          className={cx(INPUT, 'flex-1 font-semibold')}
        >
          {GROUP_ORDER.map((g) => (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {MOVEMENTS.filter((m) => m.group === g).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Field label={mv.unit === 'reps' ? 'Répétitions' : mv.unit === 'm' ? 'Distance' : mv.unit === 'cal' ? 'Calories' : 'Durée'}>
          <Stepper
            label={`quantité de ${mv.name}`}
            value={num(item.qty)}
            step={stepFor(mv.unit, num(item.qty))}
            max={100000}
            suffix={mv.unit === 'reps' ? undefined : unitLabel(mv.unit, item.qty)}
            onChange={(qty) => onChange({ qty })}
          />
        </Field>
        <Field label="Athlètes">
          <Segmented
            label={`Nombre d'athlètes sur ${mv.name}`}
            value={Math.min(Math.max(1, item.athletes), athleteOptions.length)}
            options={athleteOptions.map((n) => ({ value: n, label: String(n) }))}
            onChange={(n) => onChange({ athletes: n, sync: n >= 2 ? item.sync : false })}
            className="h-11"
          />
        </Field>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Toggle
          label="Synchro"
          checked={item.sync}
          disabled={item.athletes < 2}
          onChange={(sync) => onChange({ sync })}
        />
        {mv.loaded ? (
          <div className="grid grid-cols-2 gap-1.5">
            <OptionalNumber label={`Charge hommes ${mv.name}`} value={item.loadM} placeholder="H" suffix="kg" onChange={(loadM) => onChange({ loadM })} className="px-2" />
            <OptionalNumber label={`Charge femmes ${mv.name}`} value={item.loadF} placeholder="F" suffix="kg" onChange={(loadF) => onChange({ loadF })} className="px-2" />
          </div>
        ) : (
          <div className="grid h-11 place-items-center rounded-xl border border-dashed border-line text-xs text-dim">
            Sans charge
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <TextInput
          label={`Note sur ${mv.name}`}
          value={item.note ?? ''}
          placeholder="Note (facultatif)"
          onChange={(note) => onChange({ note: note || undefined })}
          className="h-9 flex-1 text-[13px]"
        />
        <button
          type="button"
          aria-label={`Monter ${mv.name}`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-panel3 hover:text-ink disabled:opacity-25"
        >
          <ArrowUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Descendre ${mv.name}`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-panel3 hover:text-ink disabled:opacity-25"
        >
          <ArrowDown size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Supprimer ${mv.name}`}
          onClick={onRemove}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-red/15 hover:text-red"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
    </li>
  )
}

export function WodEditor({ wod, onChange }: { wod: Wod; onChange: (wod: Wod) => void }) {
  const patch = (p: Partial<Wod>) => onChange({ ...cloneWod(wod), ...p })
  const patchItem = (id: string, p: Partial<WodItem>) =>
    onChange({ ...cloneWod(wod), items: wod.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const move = (index: number, dir: -1 | 1) => {
    const items = wod.items.map((i) => ({ ...i }))
    const target = index + dir
    if (target < 0 || target >= items.length) return
    ;[items[index], items[target]] = [items[target], items[index]]
    onChange({ ...cloneWod(wod), items })
  }
  const add = () =>
    onChange({
      ...cloneWod(wod),
      items: [
        ...wod.items.map((i) => ({ ...i })),
        { id: uid(), movementId: 'burpee', qty: 6, athletes: Math.min(3, Math.max(1, wod.teamSize)), sync: false },
      ],
    })
  const equipment = equipmentList(wod)
  const single = wod.format === 'for_time' || wod.format === 'technique'

  return (
    <div className="space-y-4">
      <Field label="Nom de la séance">
        <TextInput label="Nom de la séance" value={wod.name} maxLength={80} onChange={(name) => patch({ name })} className="font-semibold" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Objectif">
          <select
            aria-label="Objectif d'entraînement"
            value={wod.objective}
            onChange={(e) => patch({ objective: e.target.value as Objective })}
            className={INPUT}
          >
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABEL[o]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select
            aria-label="Format"
            value={wod.format}
            onChange={(e) => patch({ format: e.target.value as Format })}
            className={INPUT}
          >
            {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={wod.format === 'amrap' ? 'Tours estimés' : 'Tours'} hint={wod.format === 'amrap' ? 'Sert à estimer le volume.' : single ? 'Le plus souvent 1.' : undefined}>
          <Stepper label="nombre de tours" value={num(wod.rounds)} min={0} max={50} onChange={(rounds) => patch({ rounds })} />
        </Field>
        <Field label={wod.format === 'amrap' ? 'Durée' : 'Time cap'}>
          <Stepper label="durée en minutes" value={num(wod.capMin)} min={0} max={180} suffix="min" onChange={(capMin) => patch({ capMin })} />
        </Field>
        <Field label="Athlètes dans l’équipe">
          <Segmented
            label="Taille de l'équipe"
            value={wod.teamSize}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            onChange={(teamSize) =>
              onChange({
                ...cloneWod(wod),
                teamSize,
                items: wod.items.map((i) => {
                  const athletes = Math.min(i.athletes || teamSize, teamSize)
                  return { ...i, athletes, sync: athletes >= 2 ? i.sync : false }
                }),
              })
            }
            className="h-11"
          />
        </Field>
        <Field label="Repos entre les tours">
          <Stepper label="repos en secondes" value={num(wod.restSec)} step={15} min={0} max={600} suffix="s" onChange={(restSec) => patch({ restSec })} />
        </Field>
      </div>

      <Field label="Intensité visée">
        <div className="rounded-xl border border-line bg-bg px-3 pt-2 pb-1">
          <div className="flex items-baseline justify-between">
            <span className="tabular font-display text-3xl leading-none font-bold">RPE {wod.rpe}</span>
            <span className="text-xs text-mute">{rpeWord(wod.rpe)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={wod.rpe}
            aria-label="Intensité visée (RPE de 1 à 10)"
            onChange={(e) => patch({ rpe: Number(e.target.value) })}
          />
        </div>
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-mute">Mouvements {wod.format !== 'for_time' && wod.format !== 'technique' ? '(par tour)' : ''}</span>
          <span className="text-xs text-dim">{wod.items.length} / 20</span>
        </div>
        <ul className="space-y-2.5">
          {wod.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              count={wod.items.length}
              teamSize={wod.teamSize}
              onChange={(p) => patchItem(item.id, p)}
              onRemove={() => onChange({ ...cloneWod(wod), items: wod.items.filter((x) => x.id !== item.id) })}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </ul>
        <Button className="mt-2.5 w-full border-dashed" onClick={add} disabled={wod.items.length >= 20}>
          <Plus size={16} aria-hidden />
          Ajouter un mouvement
        </Button>
      </div>

      {equipment.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Matériel à préparer</span>
          <div className="flex flex-wrap gap-1.5">
            {equipment.map((e) => (
              <span key={e} className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs">
                {EQUIPMENT_LABEL[e]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
