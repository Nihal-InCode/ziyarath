'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { Shell } from '@/components/shell'
import { Spinner } from '@/components/ui/primitives'

const ADMIN_PREFIX = '/admin'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, user } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (status !== 'loading') return
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [status])

  useEffect(() => {
    if (status === 'anon') router.replace('/login')
    if (status === 'authed' && user) {
      // UX-only routing guard; every operation is also enforced on the backend.
      if (user.role !== 'admin' && pathname.startsWith(ADMIN_PREFIX)) router.replace('/home')
      if (user.role === 'admin' && (pathname === '/home' || pathname.startsWith('/expenses') || pathname === '/itinerary' || pathname === '/feedback')) {
        router.replace('/admin')
      }
    }
  }, [status, user, pathname, router])

  if (status === 'loading' || !user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <Spinner className="size-7" />
        {slow && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Connecting to server&hellip; first load can take a moment.
          </p>
        )}
      </div>
    )
  }

  return <Shell>{children}</Shell>
}
