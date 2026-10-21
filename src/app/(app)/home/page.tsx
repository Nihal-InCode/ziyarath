'use client'

import Link from 'next/link'
import { AlertTriangle, IndianRupee, MapPin, PlusCircle, Wallet } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync, usePolling, pollInterval } from '@/lib/hooks'
import type { CoordinatorDashboard } from '@/lib/types'
import { formatINR, formatINRExact, formatDateTimeIST } from '@/lib/format'
import { Card, CardHeader, Badge } from '@/components/ui/primitives'
import { StatCard, BudgetBar, MiniBars, levelTone } from '@/components/ui/stat'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { ExpenseRows } from '@/components/expense-list'
import { PageHeader } from '@/components/shell'

export default function CoordinatorHomePage() {
  const { user, trips } = useSession()
  const api = useApi()
  const tripId = user?.tripIds?.[0] || trips[0]?.tripId || ''

  const { data, loading, error, reload } = useAsync<CoordinatorDashboard>(
    () => api<CoordinatorDashboard>('trips.dashboard', { tripId }),
    [tripId],
    `home:${tripId}`,
  )
  usePolling(reload, pollInterval())

  if (!tripId) {
    return (
      <>
        <PageHeader title="Home" />
        <Card>
          <EmptyState
            icon={<MapPin className="size-9" />}
            title="No trip assigned yet"
            description="An administrator will assign you to a trip. You will see its expenses and itinerary here."
          />
        </Card>
      </>
    )
  }

  if (loading && !data) return <LoadingBlock label="Loading your trip…" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const { budget, totals, recent, byCategory, byDay, itinerary, trip } = data
  const tone = levelTone[budget.level]

  return (
    <>
      <PageHeader
        title={trip.name}
        subtitle={`Welcome, ${user?.name}`}
        action={
          <Link
            href="/expenses/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            <PlusCircle className="size-4" /> Add Expense
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Budget"
          value={budget.hasBudget ? formatINR(budget.totalBudget) : 'Budget not set'}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Remaining Amount"
          value={budget.hasBudget && budget.remaining !== null ? formatINR(budget.remaining) : 'Budget not set'}
          sub={budget.hasBudget ? `of ${formatINR(budget.totalBudget)}` : undefined}
          icon={<IndianRupee className="size-4" />}
          tone={budget.level === 'exceeded' ? 'danger' : 'default'}
        />
        <StatCard
          label="Trip Spent (all)"
          value={formatINR(budget.tripSpentTotal)}
          icon={<IndianRupee className="size-4" />}
        />
        <StatCard label="Entries" value={String(totals.expenseCount)} />
        <StatCard label="Today" value={formatINR(totals.todaySpent)} sub={totals.todayYmd} />
      </div>

      {budget.hasBudget ? (
        <Card className="mt-4 p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-zinc-700">Budget used</span>
            <span className={`tnum font-semibold ${tone.text}`}>{budget.usedPercent}%</span>
          </div>
          <div className="mt-2">
            <BudgetBar percent={budget.usedPercent} level={budget.level} />
          </div>
          {budget.level !== 'ok' ? (
            <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
              <AlertTriangle className="size-3.5" />
              {budget.level === 'warning'
                ? 'Approaching the budget limit.'
                : budget.level === 'high'
                  ? 'High spending — budget nearly used up.'
                  : 'Budget reached or exceeded.'}
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="mt-4 flex items-center gap-2.5 p-4 text-sm text-zinc-500">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          Budget not set for this trip yet. Totals of your expenses are shown above.
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Category breakdown" subtitle="Your expenses by category" />
          <div className="p-4">
            {byCategory.length ? (
              <MiniBars rows={byCategory.map((r) => ({ key: r.key, total: r.total }))} format={formatINR} />
            ) : (
              <p className="py-6 text-center text-sm text-zinc-400">No expenses yet</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Daily spending" subtitle="Last 14 days with entries" />
          <div className="p-4">
            {byDay.length ? (
              <MiniBars
                rows={byDay.slice(-10).map((r) => ({ key: r.date, total: r.total, label: r.date }))}
                format={formatINR}
              />
            ) : (
              <p className="py-6 text-center text-sm text-zinc-400">No spending recorded yet</p>
            )}
          </div>
        </Card>
      </div>

      {itinerary.length ? (
        <Card className="mt-4">
          <CardHeader
            title="Trip itinerary"
            subtitle="Planned stops and arrival status"
            action={
              <Link href="/itinerary" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-zinc-50">
            {itinerary.slice(0, 4).map((stop) => (
              <li key={stop.stopId} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    stop.arrived ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {stop.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{stop.locationName}</p>
                  <p className="text-xs text-zinc-500">Planned {formatDateTimeIST(stop.plannedArrival)}</p>
                </div>
                {stop.arrived ? (
                  <Badge tone={stop.arrivalStatus === 'late' ? 'warning' : stop.arrivalStatus === 'early' ? 'info' : 'success'}>
                    {stop.arrivalStatus === 'late' ? stop.delayText : stop.arrivalStatus === 'early' ? stop.delayText : 'On time'}
                  </Badge>
                ) : (
                  <Badge>Upcoming</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Recent expenses"
          action={
            <Link href="/expenses" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              View all
            </Link>
          }
        />
        {recent.length ? (
          <ExpenseRows rows={recent} />
        ) : (
          <EmptyState
            title="No expenses yet"
            description="Tap Add Expense to record your first expense for this trip."
            action={
              <Link
                href="/expenses/new"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
              >
                <PlusCircle className="size-4" /> Add Expense
              </Link>
            }
          />
        )}
        {recent.length ? (
          <div className="border-t border-zinc-100 px-4 py-2.5 text-right text-xs text-zinc-500">
            Latest: {formatINRExact(recent[0]?.amount ?? 0)} · {formatDateTimeIST(recent[0]?.submittedAt)}
          </div>
        ) : null}
      </Card>
    </>
  )
}
