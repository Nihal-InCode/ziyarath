'use client'

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 scrollbar-thin ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
