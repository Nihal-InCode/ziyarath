'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export function Dialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-zinc-950/40" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer ? <div className="border-t border-zinc-100 px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  )
}
