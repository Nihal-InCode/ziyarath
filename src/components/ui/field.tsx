'use client'

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string
  error?: string | null
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-zinc-700">
        {label}
        {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : null}
      {!error && hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  )
}

const controlBase =
  'w-full rounded-xl border bg-white px-3.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 disabled:bg-zinc-50 disabled:text-zinc-500'

function controlClass(error?: string | null) {
  return `${controlBase} h-12 ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/30' : 'border-zinc-300'}`
}

export function Input({ error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return <input className={`${controlClass(error)} ${className}`} {...rest} />
}

export function Textarea({ error, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string | null }) {
  return <textarea className={`${controlClass(error)} min-h-24 py-3 resize-y ${className}`} {...rest} />
}

export function Select({ error, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string | null }) {
  return (
    <select className={`${controlClass(error)} appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10 ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}
