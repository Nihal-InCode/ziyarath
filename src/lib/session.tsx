'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { callApi, errorMessage } from '@/lib/api'
import type { Bootstrap, TripRef, User } from '@/lib/types'

const STORAGE_KEY = 'ziyarah.session.v1'

interface StoredSession {
  token: string
  expiresAt: number
}

interface SessionState {
  status: 'loading' | 'anon' | 'authed'
  user: User | null
  trips: TripRef[]
  categories: { name: string }[]
  settings: Bootstrap['settings'] | null
  token: string | null
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

function readStored(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed.expiresAt) return null
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeStored(session: StoredSession | null) {
  if (typeof window === 'undefined') return
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: session simply lasts for this tab only.
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [trips, setTrips] = useState<TripRef[]>([])
  const [categories, setCategories] = useState<{ name: string }[]>([])
  const [settings, setSettings] = useState<Bootstrap['settings'] | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const applyBootstrap = useCallback((data: Bootstrap, tok: string, expiresAt: number) => {
    writeStored({ token: tok, expiresAt })
    setToken(tok)
    setUser(data.user)
    setTrips(data.trips)
    setCategories(data.categories)
    setSettings(data.settings)
    setStatus('authed')
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    const stored = readStored()
    if (!stored) {
      setStatus('anon')
      return
    }
    try {
      const data = await callApi<Bootstrap>('meta.bootstrap', {}, stored.token)
      const expiresAt = Date.now() + 12 * 3600 * 1000
      if (mounted.current) applyBootstrap(data, stored.token, expiresAt)
    } catch {
      writeStored(null)
      if (mounted.current) {
        setToken(null)
        setUser(null)
        setStatus('anon')
      }
    }
  }, [applyBootstrap])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await callApi<{ token: string; user: User; trips: TripRef[]; expiresInHours: number }>(
        'auth.login',
        { email, password },
      )
      // Pull full bootstrap (categories, settings) with the fresh token.
      const boot = await callApi<Bootstrap>('meta.bootstrap', {}, data.token)
      applyBootstrap(boot, data.token, Date.now() + (data.expiresInHours || 12) * 3600 * 1000)
    },
    [applyBootstrap],
  )

  const logout = useCallback(async () => {
    const current = token
    try {
      if (current) await callApi('auth.logout', {}, current)
    } catch {
      // Local logout still proceeds even if the server call fails.
    }
    writeStored(null)
    setToken(null)
    setUser(null)
    setTrips([])
    setStatus('anon')
  }, [token])

  const value = useMemo<SessionState>(
    () => ({ status, user, trips, categories, settings, token, error, login, logout, refresh }),
    [status, user, trips, categories, settings, token, error, login, logout, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

export function useApi() {
  const { token } = useSession()
  return useCallback(
    <T,>(action: string, data: unknown = {}) => callApi<T>(action, data, token),
    [token],
  )
}

export { errorMessage }
