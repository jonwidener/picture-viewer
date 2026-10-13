import { useState } from 'react'
import type { TagCount } from '../api'
import AddToSlideshow from './AddToSlideshow'

const btn = 'rounded bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700'

interface Props {
  count: number; ids: number[]; tags: TagCount[]
  onAdd: (tag: string) => void; onRemove: (tag: string) => void
  onFavorite: (on: boolean) => void; onRotate: (deg: 90 | -90) => void; onSelectAll?: () => void; onClear: () => void
}

export default function BulkBar({ count, ids, tags, onAdd, onRemove, onFavorite, onRotate, onSelectAll, onClear }: Props) {
  const [tag, setTag] = useState('')
  const act = (fn: (t: string) => void) => { if (tag.trim()) { fn(tag.trim()); setTag('') } }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sky-900 bg-sky-950 px-3 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <input list="bulk-tags" className="w-48 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
        placeholder="Tag name…" value={tag} onChange={(e) => setTag(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && act(onAdd)} />
      <datalist id="bulk-tags">{tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
      <button className={btn} onClick={() => act(onAdd)}>+ Add tag</button>
      <button className={btn} onClick={() => act(onRemove)}>− Remove tag</button>
      <button className={btn} onClick={() => onFavorite(true)}>♥ Favorite</button>
      <button className={btn} onClick={() => onFavorite(false)}>♡ Unfavorite</button>
      <button className={btn} title="Rotate left" onClick={() => onRotate(-90)}>⟲</button>
      <button className={btn} title="Rotate right" onClick={() => onRotate(90)}>⟳</button>
      <div className="w-48"><AddToSlideshow ids={ids} /></div>
      {onSelectAll && <button className={`${btn} ml-auto`} onClick={onSelectAll}>Select all matching</button>}
      <button className={`${btn} ${onSelectAll ? '' : 'ml-auto'}`} onClick={onClear}>Clear</button>
    </div>
  )
}
