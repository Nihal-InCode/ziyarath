'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'

export function StarRating({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md'
  label?: string
}) {
  const [hover, setHover] = useState(0)
  const interactive = !!onChange
  const starClass = size === 'sm' ? 'size-4' : 'size-6'
  const shown = hover || value

  return (
    <div className="flex items-center gap-1" role={interactive ? 'radiogroup' : 'img'} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? 'rounded p-0.5 transition-colors hover:bg-amber-50' : 'cursor-default p-0.5'}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            className={`${starClass} ${shown >= n ? 'fill-amber-400 text-amber-400' : 'fill-zinc-100 text-zinc-300'}`}
          />
        </button>
      ))}
      {value ? <span className="tnum ml-1 text-sm font-medium text-zinc-600">{value}.0</span> : null}
    </div>
  )
}

export function StarsDisplay({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-sm text-zinc-400">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="tnum text-sm font-medium text-zinc-800">{Number(value).toFixed(1)}</span>
    </span>
  )
}
