import { ChevronDown, Cloud, Plus, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { shortDate, uid } from '../domain/calc'
import { COMPETENCY_MOVEMENTS, movement, RM_KEYS, RM_LABEL, UNBROKEN_MOVEMENTS } from '../domain/movements'
import { athleteLink } from '../domain/share'
import { COMPETENCIES, COMPETENCY_LABEL, COMPETENCY_SHORT, competencyOf, unknownShare } from '../domain/strategy'
import type { Athlete, Competency } from '../domain/types'
import { useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, Field, H2, INPUT, Meter, OptionalNumber, PageHeader, Segmented, Stepper, TextInput } from '../ui/kit'
import { shareLink } from '../components/ShareSheet'

const ME_KEY = 'wod-war-room:me'

const CELL: Record<Competency, string> = {
  comfortable: 'bg-lime text-bg border-lime',
  manageable: 'bg-lime/20 text-lime border-lime/40',
  difficult: 'bg-amber/20 text-amber border-amber/45',
  not_yet: 'bg-red/20 text-red border-red/45',
  unknown: 'bg-panel2 text-dim border-line border-dashed',
}

const CYCLE: Competency[] = ['unknown', 'comfortable', 'manageable', 'difficult', 'not_yet']
const RATED: Competency[] = ['comfortable', 'manageable', 'difficult', 'not_yet']

function nextCompetency(c: Competency): Competency {
  return CYCLE[(CYCLE.indexOf(c) + 1) % CYCLE.length]
}

export function CompetencyMatrix({ movementIds, compact }: { movementIds: string[]; compact?: boolean }) {
  const { state, update } = useStore()
  const set = (athleteId: string, movementId: string, value: Competency) =>
    update((s) => {
      const a = s.athletes.find((x) => x.id === athleteId)
      if (!a) return
      if (value === 'unknown') delete a.competency[movementId]
      else a.competency[movementId] = value
    })

  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-1">
        <thead>
          <tr>
            <th scope="col" className="w-[36%] text-left text-[11px] font-medium text-dim">
              Mouvement
            </th>
            {state.athletes.map((a) => (
              <th key={a.id} scope="col" className="truncate px-0.5 text-center text-[11px] font-semibold text-mute">
                {a.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movementIds.map((id) => {
            const mv = movement(id)
            return (
              <tr key={id}>
                <th scope="row" className="pr-1 text-left text-[13px] leading-tight font-medium">
                  {mv.name}
                </th>
                {state.athletes.map((a) => {
                  const c = competencyOf(a, id)
                  return (
                    <td key={a.id} className="p-0">
                      <button
                        type="button"
                        onClick={() => set(a.id, id, nextCompetency(c))}
                        aria-label={`${mv.name}, ${a.name} : ${COMPETENCY_LABEL[c]}. Toucher pour changer`}
                        className={cx('w-full rounded-lg border px-0.5 text-[11px] leading-none font-semibold transition active:scale-95', compact ? 'h-9' : 'h-10', CELL[c])}
                      >
                        {COMPETENCY_SHORT[c]}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {COMPETENCIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-mute">
            <span className={cx('size-3 rounded border', CELL[c])} />
            {COMPETENCY_LABEL[c]}
          </span>
        ))}
      </div>
    </div>
  )
}

function usePatch(athleteId: string) {
  const { update } = useStore()
  return (fn: (a: Athlete) => void) =>
    update((s) => {
      const a = s.athletes.find((x) => x.id === athleteId)
      if (a) fn(a)
    })
}

/** L'avis d'un athlète : son niveau par mouvement, en un geste par ligne. */
function SelfAssessment({ athlete }: { athlete: Athlete }) {
  const { toast, teamCode } = useStore()
  const patch = usePatch(athlete.id)
  const rated = COMPETENCY_MOVEMENTS.filter((id) => competencyOf(athlete, id) !== 'unknown').length

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>L’avis de {athlete.name}</Eyebrow>
          <p className="mt-1 text-[13px] leading-snug text-mute">Pour chaque mouvement des WODs de l’an dernier, où en es-tu aujourd’hui ? Touche à nouveau pour effacer.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular font-display text-3xl leading-none font-bold">
            {rated}
            <span className="text-lg text-dim">/{COMPETENCY_MOVEMENTS.length}</span>
          </p>
        </div>
      </div>
      <Meter className="mt-3" value={rated} max={COMPETENCY_MOVEMENTS.length} level="green" />

      <ul className="mt-3 divide-y divide-line/60">
        {COMPETENCY_MOVEMENTS.map((id) => {
          const mv = movement(id)
          const current = competencyOf(athlete, id)
          return (
            <li key={id} className="py-2.5">
              <p className="mb-1.5 text-sm font-semibold">{mv.name}</p>
              <div role="radiogroup" aria-label={`Niveau de ${athlete.name} sur ${mv.name}`} className="grid grid-cols-4 gap-1">
                {RATED.map((c) => {
                  const on = current === c
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => patch((a) => { if (on) delete a.competency[id]; else a.competency[id] = c })}
                      className={cx('h-10 rounded-lg border px-0.5 text-[11px] leading-none font-semibold transition active:scale-95', on ? CELL[c] : 'border-line bg-bg text-mute')}
                    >
                      {COMPETENCY_SHORT[c]}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 space-y-3 border-t border-line pt-4">
        <Field label="Je me sens à l’aise sur…">
          <textarea aria-label="Je me sens à l'aise sur" value={athlete.strengths} maxLength={300} rows={2} placeholder="Ex. burpees, vélo, tenir un rythme régulier" onChange={(e) => patch((a) => { a.strengths = e.target.value })} className={cx(INPUT, 'h-auto resize-none py-2.5 leading-snug')} />
        </Field>
        <Field label="Je bloque sur…">
          <textarea aria-label="Je bloque sur" value={athlete.blockers} maxLength={300} rows={2} placeholder="Ex. muscle-ups, charges lourdes au-dessus de la tête, grip" onChange={(e) => patch((a) => { a.blockers = e.target.value })} className={cx(INPUT, 'h-auto resize-none py-2.5 leading-snug')} />
        </Field>
        <Field label="Douleur ou gêne en ce moment" hint="Laisse vide s’il n’y a rien.">
          <TextInput label="Douleur ou gêne" value={athlete.recovery.pain} maxLength={160} placeholder="Ex. épaule droite" onChange={(v) => patch((a) => { a.recovery.pain = v })} />
        </Field>
      </div>

      {teamCode ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-lime/30 bg-lime/6 p-3 text-[13px] leading-snug">
          <Cloud size={16} aria-hidden className="mt-0.5 shrink-0 text-lime" />
          <span>Ton avis est partagé avec l’équipe automatiquement, au fur et à mesure. Rien à envoyer.</span>
        </p>
      ) : (
        <>
          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            onClick={async () => {
              const r = await shareLink(`WOD War Room · avis de ${athlete.name}`, athleteLink(athlete))
              toast(r === 'copied' ? 'Lien de ton avis copié : envoie-le à l’équipe' : r === 'shared' ? 'Avis partagé' : 'Copie impossible')
            }}
          >
            <Send size={18} aria-hidden />
            Envoyer mon avis
          </Button>
          <p className="mt-2 text-[11px] leading-snug text-dim">
            Le lien ne contient que la fiche de {athlete.name}. La personne qui prépare la séance l’ouvre, l’avis s’ajoute à son plan, puis elle génère la séance.
          </p>
        </>
      )}
    </Card>
  )
}

function Details({ athlete }: { athlete: Athlete }) {
  const { state, today } = useStore()
  const patch = usePatch(athlete.id)
  const [test, setTest] = useState({ movementId: 't2b', result: '', note: '', partnerId: '' })
  const others = state.athletes.filter((a) => a.id !== athlete.id)

  return (
    <div className="space-y-4">
      <Card>
        <Eyebrow>Identité</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Prénom ou surnom" className="col-span-2">
            <TextInput label="Prénom ou surnom" value={athlete.name} maxLength={40} onChange={(v) => patch((a) => { a.name = v })} className="font-semibold" />
          </Field>
          <Field label="Catégorie">
            <Segmented
              label="Catégorie"
              value={athlete.sex}
              options={[
                { value: 'M', label: 'Homme' },
                { value: 'F', label: 'Femme' },
              ]}
              onChange={(v) => patch((a) => { a.sex = v })}
              className="h-11"
            />
          </Field>
          <Field label="Niveau">
            <TextInput label="Niveau" value={athlete.level} placeholder="Inter, RX…" maxLength={60} onChange={(v) => patch((a) => { a.level = v })} />
          </Field>
          <Field label="Expérience" className="col-span-2">
            <TextInput label="Expérience" value={athlete.experience} placeholder="Années de pratique, compétitions…" onChange={(v) => patch((a) => { a.experience = v })} />
          </Field>
          <Field label="Conditionnement" className="col-span-2">
            <TextInput label="Conditionnement" value={athlete.conditioning} placeholder="Repères cardio (5 km, 2 km rameur…)" maxLength={160} onChange={(v) => patch((a) => { a.conditioning = v })} />
          </Field>
          <Field label="Semaines sans entraînement complet" hint="À partir de 2, l’application propose des volumes un peu plus prudents." className="col-span-2">
            <Stepper label="semaines sans entraînement complet" value={athlete.breakWeeks} min={0} max={52} suffix="sem." onChange={(v) => patch((a) => { a.breakWeeks = v })} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <textarea aria-label="Notes" value={athlete.notes} maxLength={400} rows={2} placeholder="Contexte, préférences…" onChange={(e) => patch((a) => { a.notes = e.target.value })} className={cx(INPUT, 'h-auto resize-none py-2.5 leading-snug')} />
          </Field>
        </div>
      </Card>

      <Card>
        <Eyebrow>Force · 1RM en kg</Eyebrow>
        <p className="mt-1 text-xs leading-snug text-dim">Laisse vide si inconnu. Pas de test de maximum cette semaine.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RM_KEYS.map((k) => (
            <Field key={k} label={RM_LABEL[k]}>
              <OptionalNumber label={`1RM ${RM_LABEL[k]}`} value={athlete.rm[k]} suffix="kg" onChange={(v) => patch((a) => { if (v && v > 0) a.rm[k] = v; else delete a.rm[k] })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Gymnastique · max enchaîné</Eyebrow>
        <p className="mt-1 text-xs leading-snug text-dim">Nombre de reps sans lâcher la barre ou les anneaux. 0 = pas encore acquis.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {UNBROKEN_MOVEMENTS.map((id) => (
            <Field key={id} label={movement(id).name}>
              <OptionalNumber
                label={`Max enchaîné ${movement(id).name}`}
                value={id in athlete.unbroken ? athlete.unbroken[id] : undefined}
                suffix="reps"
                onChange={(v) => patch((a) => { if (v === undefined) delete a.unbroken[id]; else a.unbroken[id] = Math.round(v) })}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Tests enregistrés</Eyebrow>
        {athlete.tests.length === 0 ? (
          <p className="mt-2 text-[13px] text-dim">Aucun test pour l’instant. Note ici un essai synchro ou un chrono de la séance.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70">
            {athlete.tests.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {movement(t.movementId).name} · <span className="text-lime">{t.result || '—'}</span>
                  </p>
                  <p className="text-xs text-mute">
                    {t.date ? shortDate(t.date) : ''}
                    {t.partnerId ? ` · avec ${state.athletes.find((a) => a.id === t.partnerId)?.name ?? '?'}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <button type="button" aria-label={`Supprimer le test ${movement(t.movementId).name}`} onClick={() => patch((a) => { a.tests = a.tests.filter((x) => x.id !== t.id) })} className="grid size-8 shrink-0 place-items-center rounded-lg text-mute hover:bg-red/15 hover:text-red">
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!test.result.trim()) return
            patch((a) => {
              a.tests.unshift({ id: uid(), date: today, movementId: test.movementId, result: test.result.trim(), note: test.note.trim(), partnerId: test.partnerId || undefined })
            })
            setTest({ ...test, result: '', note: '' })
          }}
        >
          <select aria-label="Mouvement testé" value={test.movementId} onChange={(e) => setTest({ ...test, movementId: e.target.value })} className={INPUT}>
            {COMPETENCY_MOVEMENTS.map((id) => (
              <option key={id} value={id}>
                {movement(id).name}
              </option>
            ))}
          </select>
          <select aria-label="Partenaire de synchro" value={test.partnerId} onChange={(e) => setTest({ ...test, partnerId: e.target.value })} className={INPUT}>
            <option value="">Test seul</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                Avec {a.name}
              </option>
            ))}
          </select>
          <TextInput label="Résultat du test" value={test.result} placeholder="Résultat (ex. 12 reps, 1:45)" maxLength={80} onChange={(result) => setTest({ ...test, result })} />
          <TextInput label="Note sur le test" value={test.note} placeholder="Note (facultatif)" maxLength={200} onChange={(note) => setTest({ ...test, note })} />
          <Button type="submit" className="col-span-2" disabled={!test.result.trim()}>
            <Plus size={16} aria-hidden />
            Enregistrer le test
          </Button>
        </form>
      </Card>
    </div>
  )
}

export function Team() {
  const { state } = useStore()
  const [me, setMeState] = useState(() => {
    try {
      return window.localStorage.getItem(ME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [details, setDetails] = useState(false)
  const athlete = state.athletes.find((a) => a.id === me) ?? state.athletes[0]
  const known = 1 - unknownShare(state.athletes, COMPETENCY_MOVEMENTS)
  const setMe = (id: string) => {
    setMeState(id)
    try {
      window.localStorage.setItem(ME_KEY, id)
    } catch {
      // choix non mémorisé : sans conséquence
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Deux minutes chacun" title="Mon avis" />

      <Card className="mb-4">
        <H2>Qui es-tu ?</H2>
        <p className="mt-1 mb-3 text-[13px] leading-snug text-mute">Chacun remplit sa fiche sur son téléphone, puis l’envoie. Plus les avis sont complets, plus la séance générée est juste.</p>
        <Segmented label="Qui es-tu ?" value={athlete?.id ?? ''} options={state.athletes.map((a) => ({ value: a.id, label: a.name }))} onChange={setMe} />
      </Card>

      {athlete && <SelfAssessment key={athlete.id} athlete={athlete} />}

      <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details} className="mt-4 flex w-full items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3.5 text-left">
        <span>
          <span className="block text-sm font-semibold">Fiche détaillée de {athlete?.name}</span>
          <span className="block text-xs text-mute">Identité, 1RM, max enchaînés, tests (facultatif)</span>
        </span>
        <ChevronDown size={18} aria-hidden className={cx('shrink-0 text-dim transition', details && 'rotate-180')} />
      </button>
      {details && athlete && (
        <div className="mt-4 animate-fade">
          <Details key={athlete.id} athlete={athlete} />
        </div>
      )}

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Vue d’équipe</Eyebrow>
            <p className="mt-1 text-[13px] leading-snug text-mute">Les trois avis côte à côte. Une case non évaluée reste « ? » : rien n’est supposé.</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular font-display text-3xl leading-none font-bold">{Math.round(known * 100)} %</p>
            <p className="text-[10px] text-dim">évalué</p>
          </div>
        </div>
        <Meter className="mt-3 mb-4" value={known} max={1} level="green" />
        <CompetencyMatrix movementIds={COMPETENCY_MOVEMENTS} />
      </Card>
    </div>
  )
}
