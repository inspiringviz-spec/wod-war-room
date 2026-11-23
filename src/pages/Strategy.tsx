import { Copy, Link2, Users } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, Legend, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatLoad, formatQty, formatWho, num, prescribedTotal } from '../domain/calc'
import { emptyStrategy, HISTORICAL } from '../domain/data'
import { movement } from '../domain/movements'
import { COMPETENCY_SHORT, competencyOf, distribution, effectiveSplitRule, pairInsights } from '../domain/strategy'
import type { Distribution } from '../domain/strategy'
import type { Competency, Scenario, SplitRule, WodItem } from '../domain/types'
import { useStore } from '../state/store'
import { Button, Card, cx, Eyebrow, H2, LevelIcon, Notice, OptionalNumber, PageHeader, Segmented, TextInput } from '../ui/kit'

const CHIP: Record<Competency, string> = {
  comfortable: 'text-lime',
  manageable: 'text-lime/80',
  difficult: 'text-amber',
  not_yet: 'text-red',
  unknown: 'text-dim',
}

function countBy(d: Distribution, severity: 'red' | 'amber'): number {
  return d.issues.filter((i) => i.severity === severity).length
}

export function Strategy({ initial }: { initial?: string }) {
  const { state, update, toast } = useStore()
  const [wodId, setWodId] = useState(HISTORICAL.some((h) => h.id === initial) ? initial! : 'h1')
  const h = HISTORICAL.find((x) => x.id === wodId) ?? HISTORICAL[0]
  const strat = state.strategies[h.id] ?? emptyStrategy()
  const key = strat.active
  const scenario = strat[key]
  const athletes = state.athletes

  const mutate = (fn: (sc: Scenario) => void) =>
    update((s) => {
      if (!s.strategies[h.id]) s.strategies[h.id] = emptyStrategy()
      fn(s.strategies[h.id][s.strategies[h.id].active])
    })

  const toggle = (item: WodItem, athleteId: string) =>
    mutate((sc) => {
      const cur = sc.assign[item.id] ?? []
      sc.assign[item.id] = cur.includes(athleteId) ? cur.filter((x) => x !== athleteId) : [...cur, athleteId]
    })

  const dA = distribution(h.wod, strat.A, athletes, state.splitRules)
  const dB = distribution(h.wod, strat.B, athletes, state.splitRules)
  const active = key === 'A' ? dA : dB
  const chart = athletes.map((a) => ({ name: a.name, A: Math.round(dA.per[a.id]?.points ?? 0), B: Math.round(dB.per[a.id]?.points ?? 0) }))
  const hasB = Object.values(strat.B.assign).some((x) => x.length > 0)
  const hasAny = dA.total > 0 || dB.total > 0

  return (
    <div>
      <PageHeader eyebrow="Qui fait quoi" title="Stratégie d’équipe" />

      <Segmented label="Choisir un WOD" value={h.id} options={HISTORICAL.map((x) => ({ value: x.id, label: x.code }))} onChange={setWodId} className="mb-3" />

      <div className="mb-4 flex items-center gap-2">
        <Segmented
          label="Scénario"
          value={key}
          options={[
            { value: 'A', label: 'Scénario A' },
            { value: 'B', label: 'Scénario B' },
          ]}
          onChange={(v) =>
            update((s) => {
              if (!s.strategies[h.id]) s.strategies[h.id] = emptyStrategy()
              s.strategies[h.id].active = v
            })
          }
          className="flex-1"
        />
        <Button
          size="sm"
          className="h-11"
          ariaLabel={`Copier le scénario ${key} vers ${key === 'A' ? 'B' : 'A'}`}
          onClick={() => {
            update((s) => {
              if (!s.strategies[h.id]) s.strategies[h.id] = emptyStrategy()
              const st = s.strategies[h.id]
              const other = st.active === 'A' ? 'B' : 'A'
              st[other] = structuredClone(st[st.active])
            })
            toast(`Scénario ${key} copié vers ${key === 'A' ? 'B' : 'A'}`)
          }}
        >
          <Copy size={14} aria-hidden />
          {key} → {key === 'A' ? 'B' : 'A'}
        </Button>
      </div>

      <Notice className="mb-4">
        Basé sur le WOD de l’an dernier. L’application ne désigne pas de « meilleure » paire : elle montre les données
        disponibles et ce qui manque. Les règles non confirmées sont signalées.
      </Notice>

      <ol className="space-y-3">
        {h.wod.items.map((item, index) => {
          const mv = movement(item.movementId)
          const assigned = (scenario.assign[item.id] ?? []).filter((id) => athletes.some((a) => a.id === id))
          const required = Math.round(num(item.athletes))
          const rule = effectiveSplitRule(item, state.splitRules)
          const total = prescribedTotal(item, h.wod)
          const showPairs = required === 2 && athletes.length >= 3
          const splitSum = assigned.reduce((s, id) => s + num(scenario.split[item.id]?.[id]), 0)
          const load = formatLoad(item)
          return (
            <li key={item.id}>
              <Card as="div">
                <div className="flex items-start gap-3">
                  <span className="tabular grid size-7 shrink-0 place-items-center rounded-lg bg-panel3 text-xs font-semibold text-mute">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-tight font-semibold">
                      <span className="tabular font-display text-2xl leading-none font-bold text-lime">{formatQty(item)}</span> {mv.name}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-mute">
                      {load && <span className="tabular">{load}</span>}
                      <span className="inline-flex items-center gap-1">
                        {item.sync ? <Link2 size={12} aria-hidden /> : <Users size={12} aria-hidden />}
                        {formatWho(item)}
                      </span>
                      {item.note && <span className="text-dim">{item.note}</span>}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label={`Athlètes sur ${mv.name}`}>
                  {athletes.map((a) => {
                    const on = assigned.includes(a.id)
                    const comp = competencyOf(a, mv.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(item, a.id)}
                        className={cx(
                          'min-h-12 rounded-xl border px-1.5 py-1.5 text-center transition active:scale-[0.97]',
                          on ? 'border-lime bg-lime/12' : 'border-line bg-bg hover:border-dim',
                        )}
                      >
                        <span className={cx('block truncate text-[13px] font-semibold', on ? 'text-ink' : 'text-mute')}>{a.name}</span>
                        <span className={cx('block text-[10px] font-medium', CHIP[comp])}>{comp === 'unknown' ? 'à évaluer' : COMPETENCY_SHORT[comp]}</span>
                      </button>
                    )
                  })}
                </div>
                {required > 0 && assigned.length > 0 && assigned.length !== required && (
                  <p className="mt-1.5 text-xs text-amber">
                    Les notes indiquent {required} athlète{required > 1 ? 's' : ''} sur ce mouvement.
                  </p>
                )}

                {showPairs && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-mute">Comparer les binômes</p>
                    <ul className="space-y-1.5">
                      {pairInsights(athletes, mv.id).map((p) => {
                        const selected = assigned.length === 2 && p.ids.every((id) => assigned.includes(id))
                        return (
                          <li key={p.ids.join('-')}>
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => mutate((sc) => { sc.assign[item.id] = [...p.ids] })}
                              className={cx('w-full rounded-xl border p-2.5 text-left transition', selected ? 'border-lime bg-lime/8' : 'border-line bg-panel2 hover:border-dim')}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[13px] font-semibold">{p.label}</span>
                                <span
                                  className={cx(
                                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    p.status === 'tested' ? 'bg-lime/15 text-lime' : p.status === 'declared' ? 'bg-panel3 text-mute' : 'bg-amber/15 text-amber',
                                  )}
                                >
                                  {p.status === 'tested' ? 'Testé' : p.status === 'declared' ? 'Déclaratif' : 'Données insuffisantes'}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs leading-snug text-mute">
                                {p.members.map((m) => `${m.name} : ${COMPETENCY_SHORT[m.competency] === '?' ? 'inconnu' : COMPETENCY_SHORT[m.competency].toLowerCase()}${m.unbroken !== null ? ` (max ${m.unbroken})` : ''}`).join(' · ')}
                              </span>
                              <span className="mt-1 block text-xs leading-snug">{p.fact}</span>
                              {p.tests.map((t) => (
                                <span key={t.id} className="tabular mt-0.5 block text-[11px] text-lime">
                                  Test : {t.result}{t.note ? ` · ${t.note}` : ''}
                                </span>
                              ))}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {!item.sync && assigned.length > 1 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-mute">Partage des reps : que dit le règlement ?</p>
                    <Segmented
                      size="sm"
                      label={`Règle de partage pour ${mv.name}`}
                      value={rule}
                      options={[
                        { value: 'unknown', label: 'Non confirmé' },
                        { value: 'equal', label: 'Parts égales' },
                        { value: 'free', label: 'Partage libre' },
                      ]}
                      onChange={(v: SplitRule) =>
                        update((s) => {
                          if (v === 'unknown') delete s.splitRules[item.id]
                          else s.splitRules[item.id] = v
                        })
                      }
                    />
                    {rule === 'free' && total > 0 ? (
                      <div className="mt-2">
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${assigned.length}, minmax(0, 1fr))` }}>
                          {assigned.map((id) => {
                            const a = athletes.find((x) => x.id === id)!
                            const raw = scenario.split[item.id]?.[id]
                            return (
                              <div key={id}>
                                <span className="mb-1 block truncate text-[11px] text-mute">{a.name}</span>
                                <OptionalNumber
                                  label={`Reps de ${a.name} sur ${mv.name}`}
                                  value={raw === undefined || raw === 0 ? undefined : raw}
                                  placeholder={String(Math.round(total / assigned.length))}
                                  onChange={(v) =>
                                    mutate((sc) => {
                                      if (!sc.split[item.id]) sc.split[item.id] = {}
                                      sc.split[item.id][id] = v ?? 0
                                    })
                                  }
                                  className="px-2"
                                />
                              </div>
                            )
                          })}
                        </div>
                        <p className={cx('tabular mt-1.5 text-xs', splitSum === 0 ? 'text-dim' : splitSum === total ? 'text-lime' : 'text-amber')}>
                          {splitSum === 0
                            ? `Vide = parts égales. Total à répartir : ${total}.`
                            : splitSum === total
                              ? `Total ${splitSum} / ${total} : répartition complète.`
                              : `Total ${splitSum} / ${total} : la charge est estimée au prorata.`}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs leading-snug text-dim">
                        {rule === 'unknown'
                          ? 'Tant que la règle n’est pas confirmée, la charge est estimée à parts égales.'
                          : 'Parts égales entre les athlètes sélectionnés.'}
                      </p>
                    )}
                  </div>
                )}

                <TextInput
                  label={`Transition et matériel pour ${mv.name}`}
                  value={scenario.notes[item.id] ?? ''}
                  placeholder="Transition, matériel, ordre de passage…"
                  maxLength={200}
                  onChange={(v) => mutate((sc) => { if (v) sc.notes[item.id] = v; else delete sc.notes[item.id] })}
                  className="mt-3 h-10 text-[13px]"
                />
              </Card>
            </li>
          )
        })}
      </ol>

      <Card className="mt-4">
        <Eyebrow>Scénario {key} · répartition estimée</Eyebrow>
        {active.total === 0 ? (
          <p className="mt-2 text-[13px] leading-snug text-dim">Sélectionnez les athlètes sur chaque mouvement pour voir la répartition de la charge.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {athletes.map((a) => {
              const p = active.per[a.id]
              const share = active.total > 0 ? p.points / active.total : 0
              return (
                <li key={a.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{a.name}</span>
                    <span className="tabular text-xs text-mute">
                      {Math.round(share * 100)} % · {Math.round(p.points)} pts
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel3">
                    <div className={cx('h-full rounded-full transition-all duration-500', share > 0.5 ? 'bg-amber' : 'bg-lime')} style={{ width: `${share * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs leading-snug text-mute">{p.lines.length ? p.lines.join(' · ') : 'Aucun mouvement attribué'}</p>
                </li>
              )
            })}
          </ul>
        )}
        {active.unassigned > 0 && (
          <p className="mt-3 text-xs text-dim">
            {active.unassigned} mouvement{active.unassigned > 1 ? 's' : ''} sans athlète attribué.
          </p>
        )}
      </Card>

      {active.issues.length > 0 && (
        <Card className="mt-4" tone={countBy(active, 'red') ? 'red' : countBy(active, 'amber') ? 'amber' : undefined}>
          <Eyebrow>Points de vigilance · scénario {key}</Eyebrow>
          <ul className="mt-3 space-y-2">
            {active.issues.map((i, idx) => (
              <li key={`${i.text}-${idx}`} className="flex gap-2.5 text-[13px] leading-snug">
                <span className={cx('mt-0.5 shrink-0', i.severity === 'red' ? 'text-red' : i.severity === 'amber' ? 'text-amber' : 'text-dim')}>
                  <LevelIcon level={i.severity} size={15} />
                </span>
                <span className={cx(i.severity === 'info' && 'text-mute')}>{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasAny && hasB && (
        <Card className="mt-4">
          <Eyebrow>Comparer A et B</Eyebrow>
          <H2 className="mt-1.5">Charge par athlète</H2>
          <div className="mt-2 h-44" role="img" aria-label={`Charge par athlète : ${chart.map((c) => `${c.name} A ${c.A} B ${c.B}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={4}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a3a9b5', fontSize: 11 }} />
                <YAxis hide />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#a3a9b5' }} />
                <Bar dataKey="A" name="Scénario A" fill="#c8f53c" radius={[5, 5, 2, 2]} isAnimationActive={false} />
                <Bar dataKey="B" name="Scénario B" fill="#f3f2ec" fillOpacity={0.55} radius={[5, 5, 2, 2]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-dim">
                <th scope="col" className="pb-1 font-medium">Critère</th>
                <th scope="col" className="pb-1 text-right font-medium">A</th>
                <th scope="col" className="pb-1 text-right font-medium">B</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line/70">
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-mute">Blocages (rouge)</th>
                <td className="text-right">{countBy(dA, 'red')}</td>
                <td className="text-right">{countBy(dB, 'red')}</td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-mute">Vigilances (orange)</th>
                <td className="text-right">{countBy(dA, 'amber')}</td>
                <td className="text-right">{countBy(dB, 'amber')}</td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-mute">Part la plus lourde</th>
                {[dA, dB].map((d, i) => (
                  <td key={i} className="text-right">
                    {d.total > 0 ? `${Math.round((Math.max(...Object.values(d.per).map((p) => p.points)) / d.total) * 100)} %` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-mute">Mouvements non attribués</th>
                <td className="text-right">{dA.unassigned}</td>
                <td className="text-right">{dB.unassigned}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-dim">Chiffres indicatifs pour discuter en équipe : ils ne désignent pas un scénario gagnant.</p>
        </Card>
      )}
    </div>
  )
}
