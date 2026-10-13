import { useEffect, useState } from 'react'
import { api, fmtDate, originalUrl, type TagCount } from '../api'
import AddToSlideshow from './AddToSlideshow'
import VideoPlayer from './VideoPlayer'
import type { ItemsHandle } from '../useItems'

interface Props {
  items: ItemsHandle; index: number; tags: TagCount[]
  onIndex: (i: number) => void; onClose: () => void; onChanged: () => void; onSlideshow: (index: number) => void
}

export default function Viewer({ items, index, tags, onIndex, onClose, onChanged, onSlideshow }: Props) {
  const item = items.get(index)
  const [motion, setMotion] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')

  useEffect(() => { items.ensure(index, index) }, [items, index])
  const name = draft ?? item?.name ?? ''

  const save = async (body: Parameters<typeof api.patchItem>[1]) => {
    if (!item) return
    items.update(await api.patchItem(item.id, body))
    onChanged()
  }
  const go = (d: number) => { const n = index + d; if (n >= 0 && n < items.total) onIndex(n) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'f' && item) save({ favorite: !item.favorite })
      else if (e.key === ' ' && item?.type === 'live') { e.preventDefault(); setMotion((m) => !m) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const still = item?.files.find((f) => f.kind === 'image')
  const video = item?.files.find((f) => f.kind === 'video')

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !newTag.trim()) return
    await save({ tags: [...item.tags.map((t) => t.name), newTag.trim()] })
    setNewTag('')
  }

  return (
    <div className="fixed inset-0 z-30 flex bg-black/95">
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-4">
        {!item && <p className="text-neutral-500">Loading…</p>}
        {item && (item.type === 'video' || (item.type === 'live' && motion)) && video && <VideoPlayer file={video} />}
        {item && still && !(item.type === 'live' && motion) && (
          <img key={still.id} src={originalUrl(still)} alt="" className="max-h-full max-w-full object-contain" />
        )}
        {index > 0 && <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl hover:bg-black/80" onClick={() => go(-1)}>‹</button>}
        {index < items.total - 1 && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl hover:bg-black/80" onClick={() => go(1)}>›</button>}
        {item?.type === 'live' && (
          <button className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm hover:bg-black"
            onClick={() => setMotion(!motion)}>{motion ? 'Show photo' : '▶ Play Live Photo'} (space)</button>
        )}
      </div>

      <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">{index + 1} / {items.total}</span>
          <button className="text-xl text-neutral-400 hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {item && (
          <>
            <input className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Add a name…" value={name} maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (draft !== null && draft !== (item.name ?? '')) save({ name: draft }); setDraft(null) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <button className={`text-2xl ${item.favorite ? 'text-red-500' : 'text-neutral-500 hover:text-neutral-300'}`}
              onClick={() => save({ favorite: !item.favorite })}>{item.favorite ? '♥' : '♡'}</button>
            <p className="text-sm text-neutral-400">{fmtDate(item.taken_at)}</p>
            <p className="text-sm text-neutral-500">
              {item.type === 'live' ? 'Live Photo' : item.type === 'video' ? 'Video' : 'Photo'}
              {(still ?? video)?.width ? ` · ${(still ?? video)!.width}×${(still ?? video)!.height}` : ''}
            </p>
            <div className="space-y-2">
              <button className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm hover:bg-neutral-700" onClick={() => onSlideshow(index)}>
                ▶ Slideshow from here
              </button>
              <AddToSlideshow ids={[item.id]} />
            </div>
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Tags</h3>
              <div className="mb-2 flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span key={t.id} className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-sm">
                    {t.name}
                    <button className="text-neutral-500 hover:text-white"
                      onClick={() => save({ tags: item.tags.filter((x) => x.id !== t.id).map((x) => x.name) })}>×</button>
                  </span>
                ))}
              </div>
              <form onSubmit={addTag}>
                <input list="viewer-tags" className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Add tag…" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                <datalist id="viewer-tags">{tags.filter((t) => !item.tags.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.name} />)}</datalist>
              </form>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
