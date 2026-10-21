'use client'

import {
  Compass,
  Gauge,
  IndianRupee,
  KeyRound,
  LayoutGrid,
  LogOut,
  Map,
  PlusCircle,
  Settings,
  Star,
  Users,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { errorMessage, fieldErrors } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  fab?: boolean
}

const coordinatorNav: NavItem[] = [
  { href: '/home', label: 'Home', icon: <Gauge className="size-5" /> },
  { href: '/expenses', label: 'Expenses', icon: <IndianRupee className="size-5" /> },
  { href: '/expenses/new', label: 'Add', icon: <PlusCircle className="size-5" />, fab: true },
  { href: '/itinerary', label: 'Itinerary', icon: <Map className="size-5" /> },
  { href: '/feedback', label: 'Ratings', icon: <Star className="size-5" /> },
]

const adminNav: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: <Gauge className="size-5" /> },
  { href: '/admin/expenses', label: 'Expenses', icon: <IndianRupee className="size-5" /> },
  { href: '/admin/itinerary', label: 'Itinerary', icon: <Map className="size-5" /> },
  { href: '/admin/trips', label: 'Trips', icon: <Compass className="size-5" /> },
  { href: '/admin/reports', label: 'Reports', icon: <LayoutGrid className="size-5" /> },
  { href: '/admin/coordinators', label: 'People', icon: <Users className="size-5" /> },
]

const adminSecondary: NavItem[] = [
  { href: '/admin/settings', label: 'Settings', icon: <Settings className="size-5" /> },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  if (href === '/home') return pathname === '/home'
  return pathname === href || pathname.startsWith(href + '/')
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, trips, logout } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [pwSaving, setPwSaving] = useState(false)
  const isAdmin = user?.role === 'admin'
  const nav = isAdmin ? adminNav : coordinatorNav
  const tripName = trips.length === 1 ? trips[0].name : trips.length ? `${trips.length} trips` : ''

  const changePassword = async () => {
    if (pwSaving) return
    const local: Record<string, string> = {}
    if (!pwForm.current) local.currentPassword = 'Required.'
    if (!pwForm.next) {
      local.newPassword = 'Password is required.'
    }
    if (pwForm.next !== pwForm.confirm) local.confirm = 'Passwords do not match.'
    setPwErrors(local)
    if (Object.keys(local).length) return
    setPwSaving(true)
    try {
      await import('@/lib/api').then((m) =>
        m.callApi('users.changePassword', { currentPassword: pwForm.current, newPassword: pwForm.next }),
      )
      toast.success('Password changed. Please sign in again.')
      setPwOpen(false)
      setPwForm({ current: '', next: '', confirm: '' })
      await logout()
      router.replace('/login')
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setPwErrors(fields)
      toast.error(errorMessage(err))
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="no-print sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="size-8 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-zinc-900">
                {isAdmin ? 'Ziyarah Admin' : tripName || 'Ziyarah'}
              </p>
              <p className="truncate text-[11px] leading-tight text-zinc-500">
                {user?.name} · {isAdmin ? 'Administrator' : 'Coordinator'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setPwErrors({})
                setPwOpen(true)
              }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Change password"
            >
              <KeyRound className="size-5" />
            </button>
            {isAdmin ? (
              <Link
                href="/admin/settings"
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Settings"
              >
                <Settings className="size-5" />
              </Link>
            ) : null}
            <button
              onClick={async () => {
                await logout()
                router.replace('/login')
              }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Sign out"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-0 pb-24 sm:px-6 sm:pb-10">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-20 hidden h-fit w-52 shrink-0 pt-6 md:block">
          <nav className="space-y-1">
            {nav.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-50 text-brand-800' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
            {isAdmin
              ? adminSecondary
                  .filter((s) => !nav.some((n) => n.href === s.href && n.label === s.label))
                  .map((item) => (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        isActive(pathname, item.href)
                          ? 'bg-brand-50 text-brand-800'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))
              : null}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-0 sm:py-6 print-full">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className={`mx-auto grid h-16 max-w-lg ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
          {nav.map((item) => {
            const active = isActive(pathname, item.href)
            if (item.fab) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center"
                  aria-label={item.label}
                >
                  <span className="-mt-6 flex size-13 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-lg shadow-brand-700/30">
                    {item.icon}
                  </span>
                  <span className="mt-1 text-[10px] font-medium text-brand-800">{item.label}</span>
                </Link>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  active ? 'text-brand-700' : 'text-zinc-500'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <Dialog
        open={pwOpen}
        title="Change password"
        subtitle="You will be signed out on all devices after changing"
        onClose={() => setPwOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button loading={pwSaving} onClick={changePassword}>
              Change password
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Current password" error={pwErrors.currentPassword} required>
            <Input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              error={pwErrors.currentPassword}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" error={pwErrors.newPassword} required hint="Any password works (letters, numbers, or both).">
            <Input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              error={pwErrors.newPassword}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password" error={pwErrors.confirm} required>
            <Input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              error={pwErrors.confirm}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function QuickLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" onClick={() => (window.location.href = href)}>
      <Wallet className="size-4" />
      {children}
    </Button>
  )
}
