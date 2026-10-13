import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Item } from './api'

const PAGE = 100

/** Paged, index-addressable item cache for a filter query (supports virtualized grids). */
export function useItems(query: string) {
  const [total, setTotal] = useState(0)
  const [, bump] = useState(0)
  const cache = useRef(new Map<number, Item>())
  const pages = useRef(new Set<number>())
  const gen = useRef(0)
  const [reloadKey, setReloadKey] = useState(0)

  const fetchPage = useCallback((page: number) => {
    if (pages.current.has(page)) return
    pages.current.add(page)
    const g = gen.current
    api.items(query, page * PAGE, PAGE).then(({ total, items }) => {
      if (g !== gen.current) return
      items.forEach((it, i) => cache.current.set(page * PAGE + i, it))
      setTotal(total)
      bump((n) => n + 1)
    }).catch(() => { if (g === gen.current) pages.current.delete(page) })
  }, [query])

  useEffect(() => {
    gen.current++
    cache.current = new Map()
    pages.current = new Set()
    fetchPage(0)
  }, [fetchPage, reloadKey])

  const ensure = useCallback((start: number, end: number) => {
    for (let p = Math.floor(start / PAGE); p <= Math.floor(end / PAGE); p++) fetchPage(p)
  }, [fetchPage])

  const update = useCallback((item: Item) => {
    for (const [i, it] of cache.current) if (it.id === item.id) cache.current.set(i, item)
    bump((n) => n + 1)
  }, [])

  return {
    total,
    get: (i: number) => cache.current.get(i),
    ensure,
    update,
    reload: () => setReloadKey((k) => k + 1),
  }
}

export type ItemsHandle = ReturnType<typeof useItems>
