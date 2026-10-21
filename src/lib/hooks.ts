'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

const CACHE_TTL_MS = 5 * 60 * 1000
const memoryCache = new Map<string, { data: unknown; at: number }>()

function cacheGet<T>(key: string): T | null {
  const hit = memoryCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T
  try {
    const raw = window.sessionStorage.getItem('ziyarah.cache.' + key)
    if (raw) {
      const parsed = JSON.parse(raw) as { data: unknown; at: number }
      if (parsed && typeof parsed.at === 'number' && Date.now() - parsed.at < CACHE_TTL_MS) {
        memoryCache.set(key, parsed)
        return parsed.data as T
      }
    }
  } catch {
    // ignore
  }
  return null
}

function cacheSet(key: string, data: unknown) {
  const entry = { data, at: Date.now() }
  memoryCache.set(key, entry)
  try {
    window.sessionStorage.setItem('ziyarah.cache.' + key, JSON.stringify(entry))
  } catch {
    // storage full / private mode: memory cache still works
  }
}

/** Drop one cache entry (call after a write so the next read is fresh). */
export function invalidateCache(prefix: string) {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }
  try {
    const drop: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)
      if (k && k.startsWith('ziyarah.cache.' + prefix)) drop.push(k)
    }
    drop.forEach((k) => window.sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/**
 * Load-on-mount helper with manual reload support.
 * Pass a stable `cacheKey` to show the last result instantly (stale-while-revalidate)
 * while the fresh response downloads in the background.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const [state, setState] = useState<AsyncState<T>>(() => ({
    data: cacheKey ? cacheGet<T>(cacheKey) : null,
    loading: true,
    error: null,
  }))
  const fnRef = useRef(fn)
  fnRef.current = fn
  const keyRef = useRef(cacheKey)
  keyRef.current = cacheKey
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    const key = keyRef.current
    const cached = key ? cacheGet<T>(key) : null
    setState({ data: cached, loading: true, error: null })
    fnRef
      .current()
      .then((data) => {
        if (key) cacheSet(key, data)
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({ data: cached, loading: false, error: err.message || 'Something went wrong.' })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, cacheKey])

  return { ...state, reload }
}

/** Poll an async loader at a fixed interval; pauses when the tab is hidden. */
export function usePolling(reload: () => void, intervalMs: number) {
  const saved = useRef(reload)
  saved.current = reload

  useEffect(() => {
    if (!intervalMs || intervalMs < 10000) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') saved.current()
    }, intervalMs)
    const onFocus = () => saved.current()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
}

export function pollInterval(): number {
  const raw = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS || 60000)
  return isFinite(raw) && raw >= 15000 ? raw : 60000
}
