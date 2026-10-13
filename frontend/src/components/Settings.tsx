import { useEffect, useState } from 'react'
import { api, type Root, type ScanStatus } from '../api'

const btn = 'rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50'

export default function Settings({ onScanned }: { onScanned: () => void }) {
  const [roots, setRoots] = useState<Root[]>([])
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [allowRemove, setAllowRemove] = useState(false)

  const load = () => api.roots().then(setRoots)
  useEffect(() => { load(); api.scanStatus().then(setScan) }, [])

  useEffect(() => {
    if (!scan?.running) return
    const t = setInterval(async () => {
      const s = await api.scanStatus()
      setScan(s)
      if (!s.running) { clearInterval(t); load(); onScanned() }
    }, 700)
    return () => clearInterval(t)
  }, [scan?.running, onScanned])

  const attempt = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Media folders</h2>
        <p className="mb-3 text-sm text-neutral-400">Paths on the server. Files are only read, never modified.</p>
        <ul className="mb-3 space-y-2">
          {roots.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded bg-neutral-900 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm">{r.path}</div>
                <div className="text-xs text-neutral-500">
                  {r.files.toLocaleString()} files{!r.exists && <span className="ml-2 text-red-400">not found on disk</span>}
                </div>
              </div>
              <label className="flex items-center gap-1 text-sm text-neutral-400">
                <input type="checkbox" checked={r.enabled} onChange={(e) => attempt(() => api.setRootEnabled(r.id, e.target.checked))} /> enabled
              </label>
              <button className="text-sm text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-red-400"
                disabled={!allowRemove || !!scan?.running}
                title={scan?.running ? 'Not available while scanning' : !allowRemove ? 'Tick “Allow removing folders” first' : undefined}
                onClick={() => confirm(`Remove ${r.path}? Its files, names and tags are forgotten.`) && attempt(() => api.deleteRoot(r.id))}>Remove</button>
            </li>
          ))}
          {roots.length === 0 && <li className="text-sm text-neutral-500">No folders yet.</li>}
        </ul>
        <label className="mb-3 flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={allowRemove} onChange={(e) => setAllowRemove(e.target.checked)} />
          Allow removing folders
        </label>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); attempt(async () => { await api.addRoot(path); setPath('') }) }}>
          <input className="flex-1 rounded bg-neutral-800 px-2 py-1.5 font-mono text-sm outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="/path/to/photos" value={path} onChange={(e) => setPath(e.target.value)} />
          <button className={btn} disabled={!path.trim()}>Add folder</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Scan</h2>
        <button className={btn} disabled={scan?.running || roots.length === 0}
          onClick={() => attempt(async () => setScan(await api.scan()))}>
          {scan?.running ? 'Scanning…' : 'Scan now'}
        </button>
        {scan && scan.phase !== 'idle' && (
          <div className="mt-3 text-sm text-neutral-400">
            {scan.running && scan.total > 0 && (
              <div className="mb-2 h-2 overflow-hidden rounded bg-neutral-800">
                <div className="h-full bg-sky-500" style={{ width: `${(scan.processed / scan.total) * 100}%` }} />
              </div>
            )}
            <p>
              {scan.phase} · {scan.processed}/{scan.total} files · {scan.added} new · {scan.relinked} relinked ·
              {' '}{scan.updated} changed · {scan.missing} missing · {scan.paired} Live Photos paired
            </p>
            {scan.error && <p className="text-red-400">{scan.error}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
