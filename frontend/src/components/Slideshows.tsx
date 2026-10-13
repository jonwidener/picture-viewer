import { useCallback, useEffect, useState } from 'react'
import { api, fmtDuration, thumbUrl, type Item, type Slideshow } from '../api'
import SlideshowPlayer from './Slideshow'

const btn = 'rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50'

export default function Slideshows() {
  const [shows, setShows] = useState<Slideshow[]>([])
  const [current, setCurrent] = useState<number | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [playing, setPlaying] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)

  const loadShows = useCallback(() => api.slideshows().then(setShows), [])
  useEffect(() => { loadShows() }, [loadShows])
  useEffect(() => {
    if (current === null) return
    let alive = true
    api.slideshow(current).then((s) => { if (alive) setItems(s.items) })
    return () => { alive = false }
  }, [current])

  const show = shows.find((s) => s.id === current)

  const create = async () => {
    const name = prompt('New slideshow name')?.trim()
    if (!name) return
    const s = await api.createSlideshow(name)
    await loadShows()
    setCurrent(s.id)
  }
  const rename = async () => {
    const name = show && prompt('Rename slideshow', show.name)?.trim()
    if (!name || !show) return
    await api.renameSlideshow(show.id, name)
    loadShows()
  }
  const remove = async () => {
    if (!show || !confirm(`Delete slideshow “${show.name}”? Photos are not affected.`)) return
    await api.deleteSlideshow(show.id)
    setCurrent(null)
    loadShows()
  }
  const removeItem = async (id: number) => {
    if (current === null) return
    await api.removeFromSlideshow(current, id)
    setItems((l) => l.filter((i) => i.id !== id))
    loadShows()
  }
  const drop = (targetId: number) => {
    if (dragId === null || dragId === targetId || current === null) return
    const moving = items.find((i) => i.id === dragId)!
    const next = items.filter((i) => i.id !== dragId)
    next.splice(next.findIndex((i) => i.id === targetId), 0, moving)
    setItems(next)
    api.reorderSlideshow(current, next.map((i) => i.id))
  }

  const source = { total: items.length, get: (i: number) => items[i], ensure: () => {} }

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 space-y-1 overflow-y-auto border-r border-neutral-800 p-3">
        <button className={`${btn} mb-2 w-full`} onClick={create}>＋ New slideshow</button>
        {shows.map((s) => (
          <button key={s.id} onClick={() => setCurrent(s.id)}
            className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${s.id === current ? 'bg-neutral-800' : 'hover:bg-neutral-900'}`}>
            <span className="truncate">{s.name}</span><span className="ml-2 text-neutral-500">{s.count}</span>
          </button>
        ))}
        {shows.length === 0 && <p className="p-2 text-sm text-neutral-500">No slideshows yet. Select photos in the Library and use “Add to slideshow”.</p>}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {!show && <p className="p-8 text-center text-neutral-500">Pick a slideshow.</p>}
        {show && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="mr-2 text-lg font-semibold">{show.name}</h2>
              <button className={btn} disabled={items.length === 0} onClick={() => setPlaying(true)}>▶ Play</button>
              <button className={btn} onClick={rename}>Rename</button>
              <button className={`${btn} text-red-400`} onClick={remove}>Delete</button>
              <span className="ml-auto text-sm text-neutral-500">Drag to reorder</span>
            </div>
            {items.length === 0 && <p className="text-sm text-neutral-500">Empty. Add photos from the Library.</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
              {items.map((it) => (
                <div key={it.id} draggable onDragStart={() => setDragId(it.id)} onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()} onDrop={() => drop(it.id)}
                  className={`group relative aspect-square cursor-grab overflow-hidden bg-neutral-900 ${dragId === it.id ? 'opacity-40' : ''}`}>
                  <img src={thumbUrl(it.files[0])} alt="" draggable={false} className="h-full w-full object-cover" />
                  {it.type === 'video' && <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-xs">▶ {fmtDuration(it.files[0].duration)}</span>}
                  {it.name && <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-0.5 text-xs">{it.name}</div>}
                  <button onClick={() => removeItem(it.id)} aria-label="Remove"
                    className="absolute left-1 top-1 hidden h-6 w-6 rounded-full bg-black/70 text-sm hover:bg-red-600 group-hover:block">✕</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {playing && <SlideshowPlayer source={source} onClose={() => setPlaying(false)} />}
    </div>
  )
}
