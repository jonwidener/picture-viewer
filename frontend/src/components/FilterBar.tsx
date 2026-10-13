import { useState } from 'react'
import type { Filters, TagCount } from '../api'

const input = 'rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500'
const chip = (on: boolean) =>
  `rounded px-2 py-1 text-sm ${on ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`

interface Props { filters: Filters; setFilters: (f: Filters) => void; tags: TagCount[]; total: number; onPlay: () => void }

export default function FilterBar({ filters, setFilters, tags, total, onPlay }: Props) {
  const [open, setOpen] = useState(false)
  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p })
  const toggleTag = (id: number) =>
    set({ tags: filters.tags.includes(id) ? filters.tags.filter((t) => t !== id) : [...filters.tags, id] })

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
      <input className={`${input} w-56`} placeholder="Search names & tags…" value={filters.q}
        onChange={(e) => set({ q: e.target.value })} />
      <select className={input} value={filters.type} onChange={(e) => set({ type: e.target.value as Filters['type'] })}>
        <option value="">All types</option><option value="image">Photos</option>
        <option value="video">Videos</option><option value="live">Live Photos</option>
      </select>
      <button className={chip(filters.favorite)} onClick={() => set({ favorite: !filters.favorite })}>♥ Favorites</button>

      <div className="relative">
        <button className={chip(filters.tags.length > 0)} onClick={() => setOpen(!open)}>
          Tags{filters.tags.length ? ` (${filters.tags.length})` : ''} ▾
        </button>
        {open && (
          <div className="absolute left-0 top-9 z-20 max-h-80 w-64 overflow-y-auto rounded bg-neutral-800 p-2 shadow-xl">
            <div className="mb-2 flex gap-1">
              <button className={chip(filters.tagMode === 'all')} onClick={() => set({ tagMode: 'all' })}>Match all</button>
              <button className={chip(filters.tagMode === 'any')} onClick={() => set({ tagMode: 'any' })}>Match any</button>
              {filters.tags.length > 0 && <button className="ml-auto text-xs text-neutral-400" onClick={() => set({ tags: [] })}>clear</button>}
            </div>
            {tags.length === 0 && <p className="p-2 text-sm text-neutral-500">No tags yet.</p>}
            {tags.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-700">
                <input type="checkbox" checked={filters.tags.includes(t.id)} onChange={() => toggleTag(t.id)} />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-neutral-500">{t.count}</span>
              </label>
            ))}
            <button className="mt-1 w-full text-center text-xs text-neutral-400" onClick={() => setOpen(false)}>close</button>
          </div>
        )}
      </div>

      <button className={chip(filters.untagged)} onClick={() => set({ untagged: !filters.untagged })}>Untagged</button>
      <button className={chip(filters.unnamed)} onClick={() => set({ unnamed: !filters.unnamed })}>Unnamed</button>
      <button className={chip(filters.missing)} onClick={() => set({ missing: !filters.missing })}>Missing</button>

      <label className="flex items-center gap-1 text-sm text-neutral-400">From
        <input type="date" className={input} value={filters.from} onChange={(e) => set({ from: e.target.value })} /></label>
      <label className="flex items-center gap-1 text-sm text-neutral-400">To
        <input type="date" className={input} value={filters.to} onChange={(e) => set({ to: e.target.value })} /></label>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-sm text-neutral-500">{total.toLocaleString()} items</span>
        <button className={chip(false)} disabled={total === 0} onClick={onPlay}>▶ Slideshow</button>
        <select className={input} value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
          <option value="taken">Date taken</option><option value="added">Date added</option><option value="name">Name</option>
        </select>
        <button className={chip(false)} onClick={() => set({ dir: filters.dir === 'desc' ? 'asc' : 'desc' })}>
          {filters.dir === 'desc' ? '↓' : '↑'}
        </button>
      </div>
    </div>
  )
}
