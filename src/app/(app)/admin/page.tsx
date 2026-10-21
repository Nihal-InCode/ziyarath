'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, IndianRupee, RefreshCw, Users, Wallet } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync, usePolling, pollInterval } from '@/lib/hooks'
import type { AdminSummary } from '@/lib/types'
import { formatDateTimeIST, formatINR } from '@/lib/format'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { StatCard, BudgetBar, levelTone } from '@/components/ui/stat'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { PageHeader } from '@/components/shell'

export default function AdminDashboardPage() {
  const api = useApi()
  const { user } = useSession()
  const { data, loading, error, reload } = useAsync<AdminSummary>(() => api('trips.summary'), [], 'admin.summary')
  usePolling(reload, pollInterval())

  if (loading && !data) return <LoadingBlock label="Loading dashboard…" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const c = data.combined

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`All trips · refreshed ${formatDateTimeIST(data.generatedAt)}`}
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Total Budget"
          value={c.hasBudget ? formatINR(c.totalBudget) : 'Not set'}
          icon={<Wallet className="size-4" />}
        />
        <StatCard label="Total Expenses" value={formatINR(c.spent)} icon={<IndianRupee className="size-4" />} />
        <StatCard
          label="Remaining"
          value={c.remaining !== null ? formatINR(c.remaining) : '—'}
          sub={c.usedPercent !== null ? `${c.usedPercent}% used` : 'Budget not set for all trips'}
          tone={c.level === 'exceeded' ? 'danger' : 'default'}
        />
        <StatCard label="Expense Entries" value={String(c.expenseCount)} />
        <StatCard
          label="Active"
          value={`${c.activeTrips} trips`}
          sub={`${c.activeCoordinators} coordinators`}
          icon={<Users className="size-4" />}
        />
      </div>

      {c.level !== 'ok' && c.level !== 'unknown' ? (
        <Card className={`mt-4 flex items-center gap-2 p-3.5 text-sm font-medium ${levelTone[c.level].text} ${levelTone[c.level].badge === 'danger' ? 'bg-red-50' : 'bg-amber-50'}`}>
          <AlertTriangle className="size-4" />
          Combined spending is at {c.usedPercent}% of the configured budget across trips.
        </Card>
      ) : null}

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Trips</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.trips.map((trip) => {
          const tone = levelTone[trip.level]
          return (
            <Link key={trip.tripId} href={`/admin/trips/${trip.tripId}`}>
              <Card className="group h-full p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-zinc-900">{trip.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {trip.expenseCount} entries
                      {trip.latestExpenseAt ? ` · last ${formatDateTimeIST(trip.latestExpenseAt)}` : ' · no expenses yet'}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-brand-600" />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-zinc-400">Budget</p>
                    <p className="tnum font-semibold text-zinc-800">{trip.hasBudget ? formatINR(trip.totalBudget) : 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Spent</p>
                    <p className="tnum font-semibold text-zinc-800">{formatINR(trip.spent)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Remaining</p>
                    <p className={`tnum font-semibold ${trip.remaining !== null && trip.remaining < 0 ? 'text-red-600' : 'text-zinc-800'}`}>
                      {trip.remaining !== null ? formatINR(trip.remaining) : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <BudgetBar percent={trip.usedPercent} level={trip.level} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`text-xs font-medium ${tone.text}`}>
                    {trip.hasBudget ? `${trip.usedPercent}% used` : 'Budget not set'}
                  </span>
                  {trip.level === 'exceeded' ? (
                    <Badge tone="danger">Over budget</Badge>
                  ) : trip.level === 'high' ? (
                    <Badge tone="warning">High spending</Badge>
                  ) : trip.level === 'warning' ? (
                    <Badge tone="warning">Approaching limit</Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </>
  )
}
