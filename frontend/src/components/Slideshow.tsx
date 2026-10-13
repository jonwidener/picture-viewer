import { useEffect, useMemo, useRef, useState } from 'react'
import { originalUrl, type Item } from '../api'
import VideoPlayer from './VideoPlayer'

export interface Source { total: number; get: (i: number) => Item | undefined; ensure: (start: number, end: number) => void }

const load = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

function makeOrder(n: number, shuffle: boolean, first: number) {
  const a = Array.from({ length: n }, (_, i) => i)
  if (!shuffle) return a
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  const at = a.indexOf(first)
  if (at > 0) [a[0], a[at]] = [a[at], a[0]]
  return a
}

const ctl = 'rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20'

export default function Slideshow({ source, start = 0, onClose }: { source: Source; start?: number; onClose: () => void }) {
  const [shuffle, setShuffle] = useState(() => load('ss.shuffle', '0') === '1')
  const [seconds, setSeconds] = useState(() => Number(load('ss.seconds', '4')))
  const [paused, setPaused] = useState(false)
  const [show, setShow] = useState(true)
  const [seq, setSeq] = useState(() => ({ order: makeOrder(source.total, load('ss.shuffle', '0') === '1', start), pos: load('ss.shuffle', '0') === '1' ? 0 : start }))
  const box = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number>(0)

  const { order, pos } = seq
  const n = order.length
  const idx = order[pos]
  const item = source.get(idx)
  const { ensure } = source
  const nextIdx = order[(pos + 1) % n]

  useEffect(() => { ensure(idx, idx); ensure(nextIdx, nextIdx) }, [ensure, idx, nextIdx])
  const nextItem = source.get(nextIdx)
  useEffect(() => {
    const f = nextItem?.files.find((x) => x.kind === 'image')
    if (f) new Image().src = originalUrl(f)
  }, [nextItem])

  const go = (d: number) => setSeq((s) => ({ ...s, pos: (s.pos + d + s.order.length) % s.order.length }))
  const goRef = useRef(go)
  useEffect(() => { goRef.current = go })

  const isVideo = item?.type === 'video'
  useEffect(() => {
    if (paused || !item || isVideo) return
    const t = setTimeout(() => goRef.current(1), seconds * 1000)
    return () => clearTimeout(t)
  }, [pos, paused, seconds, item, isVideo])

  const toggleShuffle = () => {
    const on = !shuffle
    setShuffle(on)
    save('ss.shuffle', on ? '1' : '0')
    setSeq({ order: makeOrder(n, on, idx), pos: on ? 0 : idx })
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else box.current?.requestFullscreen().catch(() => {})
  }
  const close = () => { if (document.fullscreenElement) document.exitFullscreen(); onClose() }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('select, input')) return
      if (e.key === 'Escape') close()
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const wake = () => {
    setShow(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShow(false), 3000)
  }
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(hideTimer.current)
  }, [])

  const still = useMemo(() => item?.files.find((f) => f.kind === 'image'), [item])
  const video = item?.files.find((f) => f.kind === 'video')

  return (
    <div ref={box} onMouseMove={wake} className={`fixed inset-0 z-40 bg-black ${show ? '' : 'cursor-none'}`}>
      <div className="flex h-full w-full items-center justify-center" onClick={() => setPaused((p) => !p)}>
        {n === 0 && <p className="text-neutral-500">Nothing to play.</p>}
        {isVideo && video && <VideoPlayer key={video.id} file={video} paused={paused} onEnded={() => go(1)}
          onError={() => setTimeout(() => goRef.current(1), 2000)} />}
        {!isVideo && still && <img key={still.id} src={originalUrl(still)} alt="" className="max-h-full max-w-full object-contain" />}
      </div>
      {item?.name && show && <p className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-lg text-white drop-shadow">{item.name}</p>}
      <div className={`absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity ${show ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <button className={ctl} onClick={() => go(-1)}>‹ Prev</button>
        <button className={ctl} onClick={() => setPaused(!paused)}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
        <button className={ctl} onClick={() => go(1)}>Next ›</button>
        <select className={ctl} value={seconds} onChange={(e) => { setSeconds(Number(e.target.value)); save('ss.seconds', e.target.value) }}>
          {[2, 4, 8, 15, 30].map((s) => <option key={s} value={s} className="text-black">{s}s</option>)}
        </select>
        <button className={`${ctl} ${shuffle ? 'bg-sky-600' : ''}`} onClick={toggleShuffle}>Shuffle</button>
        <button className={ctl} onClick={toggleFullscreen}>Fullscreen</button>
        <button className={ctl} onClick={close}>✕ Close</button>
        <span className="text-sm text-neutral-400">{n ? pos + 1 : 0} / {n}</span>
      </div>
    </div>
  )
}
