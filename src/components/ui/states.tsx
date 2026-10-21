'use client'

import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Spinner } from './primitives'

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-zinc-500">
      <Spinner className="size-6" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 text-zinc-300">{icon ?? <Inbox className="size-9" />}</div>
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      {description ? <p className="max-w-sm text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="max-w-sm text-sm text-zinc-700">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      ) : null}
    </div>
  )
}
