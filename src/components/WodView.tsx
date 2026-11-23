import { Link2, Users } from 'lucide-react'
import { formatLabel, formatLoad, formatQty, formatWho, num } from '../domain/calc'
import { movement } from '../domain/movements'
import type { Wod, WodItem } from '../domain/types'
import { cx } from '../ui/kit'

export function ItemRow({ item, big, index, as: Tag = 'li' }: { item: WodItem; big?: boolean; index?: number; as?: 'li' | 'span' }) {
  const mv = movement(item.movementId)
  const load = formatLoad(item)
  return (
    <Tag className={cx('flex items-baseline gap-3', big ? 'py-2.5' : 'py-1.5')}>
      {index !== undefined && <span className="tabular w-4 shrink-0 text-xs text-dim">{index + 1}</span>}
      <span
        className={cx(
          'tabular shrink-0 font-display leading-none font-bold text-lime',
          big ? 'w-24 text-4xl' : 'w-16 text-2xl',
        )}
      >
        {formatQty(item)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block leading-tight font-semibold', big ? 'text-xl' : 'text-[15px]')}>{mv.name}</span>
        <span className={cx('mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-mute', big ? 'text-sm' : 'text-xs')}>
          {load && <span className="tabular">{load}</span>}
          <span className={cx('inline-flex items-center gap-1', item.sync && 'text-ink')}>
            {item.sync ? <Link2 size={12} aria-hidden /> : <Users size={12} aria-hidden />}
            {formatWho(item)}
          </span>
          {item.note && <span className="text-dim">{item.note}</span>}
        </span>
      </span>
    </Tag>
  )
}

export function WodView({ wod, big, numbered }: { wod: Wod; big?: boolean; numbered?: boolean }) {
  return (
    <div>
      <p className={cx('text-mute', big ? 'text-base' : 'text-xs')}>
        <span className="tabular">{formatLabel(wod)}</span>
        {wod.format === 'amrap' && num(wod.rounds) > 0 && <span> · ~{wod.rounds} tours estimés</span>}
        {wod.format === 'for_time' && num(wod.rounds) > 1 && <span> · {wod.rounds} tours</span>}
        <span> · RPE {wod.rpe}</span>
        {num(wod.restSec) > 0 && <span> · repos {wod.restSec} s</span>}
      </p>
      <ul className={cx('divide-y divide-line/60', big ? 'mt-3' : 'mt-2')}>
        {wod.items.map((item, i) => (
          <ItemRow key={item.id} item={item} big={big} index={numbered ? i : undefined} />
        ))}
        {wod.items.length === 0 && <li className="py-3 text-sm text-dim">Aucun mouvement.</li>}
      </ul>
      {wod.note && <p className="mt-2 text-xs text-dim">{wod.note}</p>}
    </div>
  )
}
