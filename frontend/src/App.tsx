import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, defaultFilters, filterQuery, type Filters, type Item, type TagCount } from './api'
import BulkBar from './components/BulkBar'
import FilterBar from './components/FilterBar'
import Duplicates from './components/Duplicates'
import Grid from './components/Grid'
import Settings from './components/Settings'
import SlideshowPlayer from './components/Slideshow'
import Slideshows from './components/Slideshows'
import Viewer from './components/Viewer'
import { useItems } from './useItems'

export default function App() {
  const [page, setPage] = useState<'library' | 'duplicates' | 'slideshows' | 'settings'>('library')
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [tags, setTags] = useState<TagCount[]>([])
  const [sel, setSel] = useState<{ query: string; ids: Set<number> }>({ query: '', ids: new Set() })
  const [viewing, setViewing] = useState<number | null>(null)
  const [playFrom, setPlayFrom] = useState<number | null>(null)
  const lastClicked = useRef<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const query = useMemo(() => filterQuery({ ...filters, q: debouncedQ }), [filters, debouncedQ])
  const items = useItems(query)
  const { reload } = items
  const empty = useMemo(() => new Set<number>(), [])
  const selected = sel.query === query ? sel.ids : empty
  const setSelected = (ids: Set<number>) => setSel({ query, ids })

  const loadTags = useCallback(() => { api.tags().then(setTags) }, [])
  useEffect(loadTags, [loadTags])

  const toggle = (item: Item, index: number, shift: boolean) => {
    const next = new Set(selected)
    const from = lastClicked.current
    if (shift && from !== null) {
      const [a, b] = from < index ? [from, index] : [index, from]
      const adding = !selected.has(item.id)
      for (let i = a; i <= b; i++) {
        const it = items.get(i)
        if (!it) continue
        if (adding) next.add(it.id)
        else next.delete(it.id)
      }
    } else if (next.has(item.id)) next.delete(item.id)
    else next.add(item.id)
    setSelected(next)
    lastClicked.current = index
  }

  const bulk = async (body: Omit<Parameters<typeof api.bulk>[0], 'ids'>) => {
    await api.bulk({ ids: [...selected], ...body })
    reload()
    loadTags()
  }

  const onScanned = useCallback(() => { reload(); loadTags() }, [reload, loadTags])

  const navBtn = (p: typeof page, label: string) => (
    <button onClick={() => setPage(p)} className={`rounded px-3 py-1 text-sm ${page === p ? 'bg-neutral-800' : 'text-neutral-400 hover:text-white'}`}>{label}</button>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="mr-2 font-semibold">Pictures</span>
        {navBtn('library', 'Library')}
        {navBtn('duplicates', 'Duplicates')}
        {navBtn('slideshows', 'Slideshows')}
        {navBtn('settings', 'Settings')}
      </header>

      {page === 'settings' && <div className="min-h-0 flex-1 overflow-y-auto"><Settings onScanned={onScanned} /></div>}

      {page === 'duplicates' && <div className="min-h-0 flex-1"><Duplicates tags={tags} onTagsChanged={loadTags} /></div>}
      {page === 'slideshows' && <div className="min-h-0 flex-1"><Slideshows /></div>}

      {page === 'library' && (
        <>
          {selected.size > 0 ? (
            <BulkBar count={selected.size} ids={[...selected]} tags={tags}
              onAdd={(t) => bulk({ add_tags: [t] })} onRemove={(t) => bulk({ remove_tags: [t] })}
              onFavorite={(on) => bulk({ favorite: on })} onRotate={(d) => bulk({ rotate: d })}
              onSelectAll={async () => setSelected(new Set(await api.itemIds(query)))}
              onClear={() => setSelected(new Set())} />
          ) : (
            <FilterBar filters={filters} setFilters={setFilters} tags={tags} total={items.total} onPlay={() => setPlayFrom(0)} />
          )}
          <div className="min-h-0 flex-1">
            <Grid key={query} items={items} selected={selected} onOpen={setViewing} onToggle={toggle} />
          </div>
        </>
      )}

      {viewing !== null && (
        <Viewer key={viewing} items={items} index={viewing} tags={tags} onIndex={setViewing}
          onClose={() => setViewing(null)} onChanged={loadTags}
          onSlideshow={(i) => { setViewing(null); setPlayFrom(i) }} />
      )}
      {playFrom !== null && <SlideshowPlayer source={items} start={playFrom} onClose={() => setPlayFrom(null)} />}
    </div>
  )
}
