'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: Toast['kind'], message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastState | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )

  const value = useMemo<ToastState>(
    () => ({
      toasts,
      push,
      success: (m: string) => push('success', m),
      error: (m: string) => push('error', m),
      dismiss,
    }),
    [toasts, push, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
