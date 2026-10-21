'use client'

import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300',
  secondary: 'bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400',
  outline: 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-400',
  ghost: 'text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-13 px-5 text-base gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
  brand: 'bg-brand-50 text-brand-800',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-brand-600`} aria-hidden />
}
