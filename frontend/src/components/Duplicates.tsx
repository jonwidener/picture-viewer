import { useCallback, useEffect, useState } from 'react'
import { api, fmtBytes, fmtDate, fmtDuration, type DupGroup, type TagCount } from '../api'
import BulkBar from './BulkBar'

const PAGE = 50
const btn = 'rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700'

export default function Duplicates({ tags, onTagsChanged }: { tags: TagCount[]; onTagsChanged: () => void }) {
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [total, setTotal] = useState(0)
  const [wasted, setWasted] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Reload everything shown so far (keeps scroll/paging after a bulk edit)
  const reload = useCallback(async (count = PAGE) => {
    const r = await api.duplicates(0, count)
    setGroups(r.groups); setTotal(r.total); setWasted(r.wasted_bytes); setLoaded(true)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const more = async () => {
    const r = await api.duplicates(groups.length, PAGE)
    setGroups((g) => [...g, ...r.groups]); setTotal(r.total); setWasted(r.wasted_bytes)
  }

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const selectExtras = () => setSelected(new Set(groups.flatMap((g) => g.entries.slice(1).map((e) => e.item_id))))

  const bulk = async (body: Omit<Parameters<typeof api.bulk>[0], 'ids'>) => {
    await api.bulk({ ids: [...selected], ...body })
    await reload(Math.max(groups.length, PAGE))
    onTagsChanged()
  }

  return (
    <div className="flex h-full flex-col">
      {selected.size > 0 ? (
        <BulkBar count={selected.size} ids={[...selected]} tags={tags}
          onAdd={(t) => bulk({ add_tags: [t] })} onRemove={(t) => bulk({ remove_tags: [t] })}
          onFavorite={(on) => bulk({ favorite: on })} onRotate={(d) => bulk({ rotate: d })} onClear={() => setSelected(new Set())} />
      ) : (
        <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2">
          <span className="text-sm text-neutral-400">
            {total.toLocaleString()} duplicate group{total === 1 ? '' : 's'} · {fmtBytes(wasted)} redundant
          </span>
          <button className={`${btn} ml-auto`} onClick={selectExtras} disabled={!groups.length}>Select all but first in each group</button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {loaded && groups.length === 0 && <p className="p-8 text-center text-neutral-500">No exact duplicates found. Scan to refresh.</p>}
        {groups.map((g) => (
          <section key={g.hash} className="rounded bg-neutral-900 p-3">
            <p className="mb-2 text-xs text-neutral-500">{g.entries.length} identical copies · {fmtBytes(g.size)} each</p>
            <div className="flex flex-wrap gap-3">
              {g.entries.map((e) => (
                <div key={e.file_id} className={`w-56 rounded p-2 ${selected.has(e.item_id) ? 'bg-sky-950 ring-2 ring-sky-500' : 'bg-neutral-950'}`}>
                  <div className="relative">
                    <a href={`/api/files/${e.file_id}/original?v=${e.v}`} target="_blank" rel="noreferrer">
                      <img src={`/api/files/${e.file_id}/thumb?v=${e.v}`} loading="lazy" alt="" className="h-40 w-full rounded object-cover" />
                    </a>
                    <input type="checkbox" className="absolute left-2 top-2 h-5 w-5" checked={selected.has(e.item_id)} onChange={() => toggle(e.item_id)} />
                    {e.kind === 'video' && <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 text-xs">▶ {fmtDuration(e.duration)}</span>}
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-neutral-300">{e.path}</p>
                  <p className="mt-1 text-xs text-neutral-500">{fmtDate(e.taken_at)}{e.width ? ` · ${e.width}×${e.height}` : ''}</p>
                  {e.name && <p className="mt-1 text-sm">{e.name}</p>}
                  {e.tags.length > 0 && <p className="mt-1 text-xs text-sky-300">{e.tags.join(', ')}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
        {groups.length < total && <button className={btn} onClick={more}>Load more</button>}
      </div>
    </div>
  )
}
