'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useApi } from '@/lib/session'
import { useAsync, usePolling, pollInterval } from '@/lib/hooks'
import type { AdminSummary } from '@/lib/types'
import { formatDateTimeIST, formatINR } from '@/lib/format'
import { Badge, Card } from '@/components/ui/primitives'
import { BudgetBar, levelTone } from '@/components/ui/stat'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { PageHeader } from '@/components/shell'

export default function AdminTripsPage() {
  const api = useApi()
  const { data, loading, error, reload } = useAsync<AdminSummary>(() => api('trips.summary'), [], 'admin.summary')
  usePolling(reload, pollInterval())

  return (
    <>
      <PageHeader title="Trips" subtitle="Kerala · Tamil Nadu · Mumbai · Kashmir" />
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.trips.map((trip) => {
            const tone = levelTone[trip.level]
            return (
              <Link key={trip.tripId} href={`/admin/trips/${trip.tripId}`}>
                <Card className="group h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{trip.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {trip.expenseCount} entries · {trip.voidCount} void
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-zinc-300 group-hover:text-brand-600" />
                  </div>
                  <div className="mt-3">
                    <BudgetBar percent={trip.usedPercent} level={trip.level} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] text-zinc-400">Budget</p>
                      <p className="tnum font-semibold">{trip.hasBudget ? formatINR(trip.totalBudget) : 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-400">Spent</p>
                      <p className="tnum font-semibold">{formatINR(trip.spent)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-400">Today</p>
                      <p className="tnum font-semibold">{formatINR(trip.todaySpent)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-xs font-medium ${tone.text}`}>
                      {trip.hasBudget ? `${trip.usedPercent}% used` : 'Budget not set'}
                    </span>
                    {trip.latestExpenseAt ? (
                      <span className="text-[11px] text-zinc-400">last {formatDateTimeIST(trip.latestExpenseAt)}</span>
                    ) : (
                      <Badge>new</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
