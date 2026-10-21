'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session'
import { Spinner } from '@/components/ui/primitives'

export default function IndexPage() {
  const { status, user } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'anon') {
      router.replace('/login')
      return
    }
    router.replace(user?.role === 'admin' ? '/admin' : '/home')
  }, [status, user, router])

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-7" />
    </div>
  )
}
