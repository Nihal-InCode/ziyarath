'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { Button, Card, Spinner } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/field'

export default function LoginPage() {
  const { status, login } = useSession()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})

  if (status === 'authed') {
    router.replace('/')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const local: Record<string, string> = {}
    if (!email.trim()) local.email = 'Email is required.'
    if (!password) local.password = 'Password is required.'
    if (Object.keys(local).length) {
      setFieldErr(local)
      return
    }
    setFieldErr({})
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      router.replace('/')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="mx-auto mb-4 size-14 rounded-2xl object-cover"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Ziyarah</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Travel expense management for Kerala, Tamil Nadu, Mumbai and Kashmir Ziyarath trips.
          </p>
        </div>

        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" error={fieldErr.email} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="you@example.com"
                error={fieldErr.email}
                autoFocus
              />
            </Field>
            <Field label="Password" error={fieldErr.password} required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                error={fieldErr.password}
              />
            </Field>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-sm text-red-700">{error}</p> : null}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 flex items-start justify-center gap-1.5 text-center text-xs text-zinc-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
          Accounts are created by an administrator. Passwords are stored only as salted
          PBKDF2 hashes — never in plain text.
        </p>
      </div>
      {busy ? <Spinner className="sr-only" /> : null}
    </div>
  )
}
