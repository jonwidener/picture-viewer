export interface Tag { id: number; name: string }
export interface TagCount extends Tag { count: number }
export interface FileInfo {
  id: number; kind: 'image' | 'video'; role: 'still' | 'motion' | null
  width: number | null; height: number | null; duration: number | null; v: string; missing: boolean
}
export interface Item {
  id: number; name: string | null; favorite: boolean; taken_at: number; rotation: number
  type: 'image' | 'video' | 'live'; files: FileInfo[]; tags: Tag[]; cover_file_id: number | null
}
export interface Root { id: number; path: string; enabled: boolean; exists: boolean; files: number }
export interface ScanStatus {
  running: boolean; phase: string; processed: number; total: number
  added: number; relinked: number; updated: number; missing: number; paired: number; error: string | null
}
export interface DupEntry {
  file_id: number; item_id: number; kind: 'image' | 'video'; size: number; v: string
  width: number | null; height: number | null; duration: number | null
  path: string; name: string | null; favorite: boolean; taken_at: number; tags: string[]
}
export interface DupGroup { hash: string; size: number; entries: DupEntry[] }
export interface Slideshow { id: number; name: string; count: number }
export interface Filters {
  q: string; sort: 'taken' | 'added' | 'name'; dir: 'asc' | 'desc'
  type: '' | 'image' | 'video' | 'live'; favorite: boolean; untagged: boolean; unnamed: boolean; missing: boolean
  tags: number[]; tagMode: 'all' | 'any'; from: string; to: string
}

export const defaultFilters: Filters = {
  q: '', sort: 'taken', dir: 'desc', type: '', favorite: false, untagged: false, unnamed: false,
  missing: false, tags: [], tagMode: 'all', from: '', to: '',
}

const dayStart = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000)

export function filterQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  p.set('sort', f.sort)
  p.set('dir', f.dir)
  if (f.type) p.set('type', f.type)
  if (f.favorite) p.set('favorite', '1')
  if (f.untagged) p.set('untagged', '1')
  if (f.unnamed) p.set('unnamed', '1')
  if (f.missing) p.set('missing', '1')
  if (f.tags.length) { p.set('tags', f.tags.join(',')); p.set('tag_mode', f.tagMode) }
  if (f.from) p.set('from', String(dayStart(f.from)))
  if (f.to) p.set('to', String(dayStart(f.to) + 86400))
  return p.toString()
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api' + url, init)
  if (!r.ok) {
    let msg = r.statusText
    try { msg = (await r.json()).error ?? msg } catch { /* not json */ }
    throw new Error(msg)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

export const api = {
  items: (query: string, offset: number, limit: number) =>
    req<{ total: number; items: Item[] }>(`/items?${query}&offset=${offset}&limit=${limit}`),
  itemIds: (query: string) => req<number[]>(`/items/ids?${query}`),
  patchItem: (id: number, body: Partial<{ name: string; favorite: boolean; tags: string[]; rotate: 90 | -90 }>) =>
    req<Item>(`/items/${id}`, json('PATCH', body)),
  bulk: (body: { ids: number[]; add_tags?: string[]; remove_tags?: string[]; favorite?: boolean; rotate?: 90 | -90 }) =>
    req<void>('/items/bulk', json('POST', body)),
  tags: () => req<TagCount[]>('/tags'),
  renameTag: (id: number, name: string) => req<void>(`/tags/${id}`, json('PATCH', { name })),
  deleteTag: (id: number) => req<void>(`/tags/${id}`, { method: 'DELETE' }),
  roots: () => req<Root[]>('/roots'),
  addRoot: (path: string) => req<Root>('/roots', json('POST', { path })),
  setRootEnabled: (id: number, enabled: boolean) => req<Root>(`/roots/${id}`, json('PATCH', { enabled })),
  deleteRoot: (id: number) => req<void>(`/roots/${id}`, { method: 'DELETE' }),
  scan: () => req<ScanStatus>('/scan', { method: 'POST' }),
  scanStatus: () => req<ScanStatus>('/scan/status'),
  duplicates: (offset: number, limit: number) =>
    req<{ total: number; wasted_bytes: number; groups: DupGroup[] }>(`/duplicates?offset=${offset}&limit=${limit}`),
  slideshows: () => req<Slideshow[]>('/slideshows'),
  createSlideshow: (name: string) => req<Slideshow>('/slideshows', json('POST', { name })),
  renameSlideshow: (id: number, name: string) => req<Slideshow>(`/slideshows/${id}`, json('PATCH', { name })),
  deleteSlideshow: (id: number) => req<void>(`/slideshows/${id}`, { method: 'DELETE' }),
  slideshow: (id: number) => req<Slideshow & { items: Item[] }>(`/slideshows/${id}`),
  addToSlideshow: (id: number, ids: number[]) => req<Slideshow>(`/slideshows/${id}/items`, json('POST', { ids })),
  removeFromSlideshow: (id: number, itemId: number) =>
    req<void>(`/slideshows/${id}/items/${itemId}`, { method: 'DELETE' }),
  reorderSlideshow: (id: number, ids: number[]) => req<void>(`/slideshows/${id}/order`, json('PUT', { ids })),
  playback: (fileId: number) =>
    req<{ status: 'ready' | 'processing' | 'error'; url: string | null; error?: string }>(`/files/${fileId}/playback`),
}

export const thumbUrl = (f: FileInfo) => `/api/files/${f.id}/thumb?v=${f.v}`
export const originalUrl = (f: FileInfo) => `/api/files/${f.id}/original?v=${f.v}`

export const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })

export const fmtDuration = (s: number | null) => {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

export const fmtBytes = (n: number) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}
