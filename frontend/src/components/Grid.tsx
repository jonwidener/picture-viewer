import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fmtDuration, thumbUrl, type Item } from '../api'
import type { ItemsHandle } from '../useItems'

const MIN_TILE = 170
const GAP = 3

interface Props {
  items: ItemsHandle
  selected: Set<number>
  onOpen: (index: number) => void
  onToggle: (item: Item, index: number, shift: boolean) => void
}

function Tile({ item, index, selected, anySelected, onOpen, onToggle }: {
  item: Item; index: number; selected: boolean; anySelected: boolean
  onOpen: Props['onOpen']; onToggle: Props['onToggle']
}) {
  const cover = item.files[0]
  const video = item.files.find((f) => f.kind === 'video')
  return (
    <div
      className={`group relative h-full w-full cursor-pointer overflow-hidden bg-neutral-900 ${selected ? 'ring-4 ring-sky-500 ring-inset' : ''}`}
      onClick={(e) => (anySelected || e.shiftKey ? onToggle(item, index, e.shiftKey) : onOpen(index))}
    >
      {cover && <img src={thumbUrl(cover)} loading="lazy" draggable={false} alt="" className="h-full w-full object-cover" />}
      <button
        aria-label="Select"
        onClick={(e) => { e.stopPropagation(); onToggle(item, index, e.shiftKey) }}
        className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold
          ${selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100'}
          ${anySelected ? 'opacity-100' : ''}`}
      >✓</button>
      <div className="absolute right-1.5 top-1.5 flex gap-1 text-xs">
        {item.type === 'live' && <span className="rounded bg-black/60 px-1.5 py-0.5">LIVE</span>}
        {item.type === 'video' && <span className="rounded bg-black/60 px-1.5 py-0.5">▶ {fmtDuration(video?.duration ?? null)}</span>}
      </div>
      {item.favorite && <span className="absolute bottom-1.5 right-1.5 text-red-500 drop-shadow">♥</span>}
      {item.name && (
        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-xs opacity-0 group-hover:opacity-100">
          {item.name}
        </div>
      )}
    </div>
  )
}

export default function Grid({ items, selected, onOpen, onToggle }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const cols = Math.max(1, Math.floor((size.w + GAP) / (MIN_TILE + GAP)))
  const tile = (size.w - GAP * (cols - 1)) / cols
  const rowH = tile + GAP
  const rows = Math.ceil(items.total / cols)
  const first = Math.max(0, Math.floor(scrollTop / rowH) - 3)
  const last = Math.min(rows - 1, Math.ceil((scrollTop + size.h) / rowH) + 3)
  const startIdx = first * cols
  const endIdx = Math.min(items.total - 1, (last + 1) * cols - 1)

  const { ensure, total } = items
  useEffect(() => { if (total > 0 && size.w > 0) ensure(startIdx, endIdx) }, [ensure, total, startIdx, endIdx, size.w])

  const cells = []
  for (let i = startIdx; i <= endIdx; i++) {
    const item = items.get(i)
    const style = { position: 'absolute' as const, width: tile, height: tile,
      top: Math.floor(i / cols) * rowH, left: (i % cols) * (tile + GAP) }
    cells.push(
      <div key={i} style={style}>
        {item && <Tile item={item} index={i} selected={selected.has(item.id)} anySelected={selected.size > 0}
          onOpen={onOpen} onToggle={onToggle} />}
        {!item && <div className="h-full w-full animate-pulse bg-neutral-900" />}
      </div>,
    )
  }

  return (
    <div ref={ref} className="h-full overflow-y-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      {total === 0 && <p className="p-8 text-center text-neutral-500">Nothing here. Add a folder in Settings and scan, or loosen the filters.</p>}
      <div className="relative" style={{ height: rows * rowH }}>{cells}</div>
    </div>
  )
}
