'use client'

import type { ReactNode } from 'react'
import type { BudgetLevel } from '@/lib/types'
import { Card } from './primitives'

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: string
  icon?: ReactNode
  tone?: 'default' | 'brand' | 'danger'
}) {
  const toneClass =
    tone === 'brand' ? 'bg-brand-50 text-brand-700' : tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {icon ? <span className={`rounded-lg p-1.5 ${toneClass}`}>{icon}</span> : null}
      </div>
      <p className="tnum mt-2 text-xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </Card>
  )
}

export const levelTone: Record<BudgetLevel, { bar: string; text: string; badge: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-700', badge: 'success' },
  warning: { bar: 'bg-amber-500', text: 'text-amber-700', badge: 'warning' },
  high: { bar: 'bg-orange-500', text: 'text-orange-700', badge: 'warning' },
  exceeded: { bar: 'bg-red-500', text: 'text-red-700', badge: 'danger' },
  unknown: { bar: 'bg-zinc-300', text: 'text-zinc-500', badge: 'neutral' },
}

export function BudgetBar({ percent, level }: { percent: number | null; level: BudgetLevel }) {
  const pct = percent === null ? 0 : Math.min(Math.max(percent, 0), 100)
  const tone = levelTone[level]
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Compact horizontal bars for category / daily breakdowns. */
export function MiniBars({
  rows,
  format,
}: {
  rows: { key: string; total: number; label?: string }[]
  format: (n: number) => string
}) {
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-700">{row.label || row.key}</span>
            <span className="tnum shrink-0 font-medium text-zinc-900">{format(row.total)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max((row.total / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
