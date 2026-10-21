'use client'

import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToast } from '@/lib/toast'

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-white px-4 py-3 shadow-lg ${
            t.kind === 'error' ? 'border-red-200' : t.kind === 'success' ? 'border-emerald-200' : 'border-zinc-200'
          }`}
          role="status"
        >
          {t.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600" />
          ) : t.kind === 'error' ? (
            <XCircle className="mt-0.5 size-4.5 shrink-0 text-red-600" />
          ) : (
            <Info className="mt-0.5 size-4.5 shrink-0 text-sky-600" />
          )}
          <p className="flex-1 text-sm text-zinc-800">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="shrink-0 text-zinc-400 hover:text-zinc-600" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
