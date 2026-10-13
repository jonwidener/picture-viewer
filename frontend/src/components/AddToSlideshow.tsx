import { useEffect, useState } from 'react'
import { api, type Slideshow } from '../api'

const NEW = '__new__'

/** Dropdown that appends the given items to an existing or newly created slideshow. */
export default function AddToSlideshow({ ids }: { ids: number[] }) {
  const [shows, setShows] = useState<Slideshow[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => { api.slideshows().then(setShows) }, [])

  const pick = async (value: string) => {
    if (!value) return
    let show: Slideshow | undefined
    if (value === NEW) {
      const name = prompt('New slideshow name')?.trim()
      if (!name) return
      show = await api.createSlideshow(name)
      setShows((s) => [...s, show!])
    } else show = shows.find((s) => s.id === Number(value))
    if (!show) return
    const before = show.count
    const after = await api.addToSlideshow(show.id, ids)
    setShows((s) => s.map((x) => (x.id === after.id ? after : x)))
    setMsg(`Added ${after.count - before} to “${after.name}”`)
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div>
      <select value="" onChange={(e) => pick(e.target.value)}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-sky-500">
        <option value="">Add to slideshow…</option>
        {shows.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
        <option value={NEW}>＋ New slideshow…</option>
      </select>
      {msg && <p className="mt-1 text-xs text-emerald-400">{msg}</p>}
    </div>
  )
}
