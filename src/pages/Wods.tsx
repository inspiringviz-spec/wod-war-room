import { Check, ChevronRight, CircleHelp, History, Hammer } from 'lucide-react'
import { useState } from 'react'
import { formatLabel, instantiate, tagPoints } from '../domain/calc'
import { HISTORICAL, template } from '../domain/data'
import { TAG_LABEL } from '../domain/movements'
import { bottlenecks } from '../domain/strategy'
import type { RuleStatus, Tag } from '../domain/types'
import { defaultTrainingDay, go, useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, H2, LevelIcon, Notice, PageHeader, Segmented } from '../ui/kit'
import { ItemRow } from '../components/WodView'

const DEMAND_TAGS: Tag[] = ['grip', 'pull', 'shoulder', 'overhead', 'legs', 'burpee', 'engine', 'core']

export function Wods({ initial }: { initial?: string }) {
  const { state, update, today } = useStore()
  const [id, setId] = useState(HISTORICAL.some((h) => h.id === initial) ? initial! : 'h1')
  const h = HISTORICAL.find((x) => x.id === id) ?? HISTORICAL[0]

  const points = tagPoints(h.wod, state.athletes)
  const demands = DEMAND_TAGS.map((t) => ({ tag: t, value: points[t] }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
  const maxDemand = Math.max(1, ...demands.map((d) => d.value))
  const blockers = bottlenecks(state.athletes, h.id).slice(0, 3)
  const tpl = template(h.templateId)

  return (
    <div>
      <PageHeader eyebrow="Édition précédente" title="WODs de l’an dernier" />

      <Notice className="mb-4">
        <span className="flex items-start gap-2">
          <History size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Ce sont les épreuves de l’an dernier, pas celles du 28 novembre. Elles donnent le style de la compétition ;
            rien ne garantit qu’elles reviennent.
          </span>
        </span>
      </Notice>

      <Segmented
        label="Choisir un WOD"
        value={h.id}
        options={HISTORICAL.map((x) => ({ value: x.id, label: x.code }))}
        onChange={setId}
        className="mb-4"
      />

      <div key={h.id} className="animate-rise space-y-4">
        <Card>
          <Eyebrow>{h.code} · {formatLabel(h.wod)}</Eyebrow>
          <H2 className="mt-1.5 text-3xl">{h.title}</H2>
          <p className="mt-1 text-sm text-mute">{h.theme}</p>
          <ul className="mt-3 divide-y divide-line/60">
            {h.wod.items.map((item, i) => (
              <ItemRow key={item.id} item={item} index={i} />
            ))}
          </ul>
          {tpl && (
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                update((s) => {
                  s.draft = instantiate(tpl.wod)
                  s.draftDate = defaultTrainingDay(s.competitionDate, today)
                  s.draftSessionId = undefined
                })
                go('builder')
              }}
            >
              <Hammer size={16} aria-hidden />
              Créer un mini-WOD inspiré ({tpl.tag})
            </Button>
          )}
          <Button className="mt-2 w-full" onClick={() => go('week')}>
            Générer la séance d’équipe en 3 parties
            <ChevronRight size={16} aria-hidden />
          </Button>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => go('strategy', h.id)}>
            Préparer la stratégie d’équipe
            <ChevronRight size={16} aria-hidden />
          </Button>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <Eyebrow>Ce que ce WOD demande</Eyebrow>
            <ul className="mt-3 space-y-2.5">
              {demands.map((d) => (
                <li key={d.tag}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium">{TAG_LABEL[d.tag]}</span>
                    <span className="tabular text-xs text-dim">{Math.round(d.value)} pts</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel3">
                    <div className="h-full rounded-full bg-lime/80" style={{ width: `${(d.value / maxDemand) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-dim">
              Estimation par athlète à partir des volumes notés. Quand la répartition n’est pas précisée, les reps sont
              supposées partagées à parts égales. Le SkiErg en distance maximale n’est pas chiffré.
            </p>
          </Card>

          <Card>
            <Eyebrow>Points bloquants pour l’équipe</Eyebrow>
            <ul className="mt-3 space-y-3">
              {blockers.map((b) => (
                <li key={b.movementId} className="flex gap-2.5">
                  <span className={cx('mt-0.5 shrink-0', b.severity === 'red' ? 'text-red' : b.severity === 'amber' ? 'text-amber' : 'text-dim')}>
                    <LevelIcon level={b.severity} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-semibold">{b.headline}</p>
                    <p className="mt-0.5 text-xs leading-snug text-mute">{b.lines.join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Button size="sm" className="mt-3" onClick={() => go('team')}>
              Donner son avis
              <ChevronRight size={14} aria-hidden />
            </Button>
          </Card>
        </div>

        <Card>
          <Eyebrow>Ce que disent les notes</Eyebrow>
          <ul className="mt-3 space-y-1.5">
            {h.known.map((k) => (
              <li key={k} className="flex gap-2 text-[13px] leading-snug">
                <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-lime" />
                {k}
              </li>
            ))}
          </ul>

          <Eyebrow className="mt-5">À confirmer auprès de l’organisation</Eyebrow>
          <p className="mt-1 text-xs leading-snug text-dim">
            Ces points ne figurent pas dans les notes. L’application ne suppose rien : indiquez la réponse quand vous
            l’avez.
          </p>
          <ul className="mt-3 space-y-3">
            {h.open.map((o) => {
              const status: RuleStatus = state.rules[o.id] ?? 'unknown'
              return (
                <li key={o.id} className="rounded-xl border border-line bg-panel2 p-3">
                  <p className="flex gap-2 text-[13px] leading-snug">
                    <CircleHelp size={15} aria-hidden className={cx('mt-0.5 shrink-0', status === 'unknown' ? 'text-amber' : 'text-dim')} />
                    <span className={cx(status === 'rejected' && 'text-dim line-through')}>{o.text}</span>
                  </p>
                  <Segmented
                    size="sm"
                    label={`Statut : ${o.text}`}
                    value={status}
                    className="mt-2.5"
                    options={[
                      { value: 'unknown', label: 'À confirmer' },
                      { value: 'confirmed', label: 'Clarifié' },
                      { value: 'rejected', label: 'Sans objet' },
                    ]}
                    onChange={(v) =>
                      update((s) => {
                        if (v === 'unknown') delete s.rules[o.id]
                        else s.rules[o.id] = v
                      })
                    }
                  />
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
