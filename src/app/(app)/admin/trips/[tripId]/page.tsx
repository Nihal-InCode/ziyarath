'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useApi, useSession } from '@/lib/session'
import { useAsync, usePolling, pollInterval } from '@/lib/hooks'
import type { ExpenseListResult, ItineraryStop, ProgressRow, RatingsSummary, TripSnapshot } from '@/lib/types'
import { formatDateTimeIST, formatINR } from '@/lib/format'
import { errorMessage } from '@/lib/api'
import { Badge, Button, Card, CardHeader, Spinner } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/field'
import { StatCard, BudgetBar, MiniBars, levelTone } from '@/components/ui/stat'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { ExpenseRows } from '@/components/expense-list'
import { StarsDisplay } from '@/components/ui/stars'
import { PageHeader } from '@/components/shell'
import { ItineraryEditor } from '@/components/admin/itinerary-editor'
import { useToast } from '@/lib/toast'
import { invalidateCache } from '@/lib/hooks'

type Tab = 'overview' | 'expenses' | 'itinerary' | 'progress' | 'ratings'

interface TripDetail {
  trip: TripSnapshot
  coordinators: { userId: string; name: string; email: string }[]
}

export default function AdminTripDetailPage() {
  const params = useParams<{ tripId: string }>()
  const tripId = params.tripId
  const api = useApi()
  const { trips } = useSession()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [budgetInput, setBudgetInput] = useState('')
  const [tripForm, setTripForm] = useState({ name: '', startDate: '', endDate: '' })
  const [savingTrip, setSavingTrip] = useState(false)

  const { data, loading, error, reload } = useAsync<TripDetail>(
    () => api('trips.get', { tripId }),
    [tripId],
    `admin.trip:${tripId}`,
  )
  usePolling(reload, pollInterval())

  useEffect(() => {
    if (!data?.trip) return
    setTripForm({
      name: data.trip.name,
      startDate: data.trip.startDate || '',
      endDate: data.trip.endDate || '',
    })
  }, [data?.trip])

  const expenses = useAsync<ExpenseListResult>(
    () => api('expenses.list', { tripIds: [tripId], limit: 200, statuses: ['active', 'void'] }),
    [tripId, tab === 'expenses'],
    `admin.trip.expenses:${tripId}`,
  )
  const itinerary = useAsync<{ stops: ItineraryStop[] }>(
    () => api('itinerary.list', { tripId }),
    [tripId, tab === 'itinerary'],
    `itinerary:${tripId}`,
  )
  const progress = useAsync<{ rows: ProgressRow[] }>(
    () => api('progress.list', { tripId }),
    [tripId, tab === 'progress'],
    `progress:${tripId}`,
  )
  const ratings = useAsync<RatingsSummary>(
    () => api('ratings.summary', { tripId }),
    [tripId, tab === 'ratings'],
    `ratings:${tripId}`,
  )

  const saveBudget = async () => {
    try {
      await api('trips.updateBudget', { tripId, amount: budgetInput })
      invalidateCache('admin.')
      invalidateCache('home:')
      toast.success('Budget updated.')
      setBudgetInput('')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const saveTripSettings = async () => {
    if (savingTrip) return
    if (!tripForm.name.trim()) {
      toast.error('Trip name is required.')
      return
    }
    if (tripForm.startDate && tripForm.endDate && tripForm.endDate < tripForm.startDate) {
      toast.error('End date must be on or after the start date.')
      return
    }
    setSavingTrip(true)
    try {
      await api('trips.update', {
        tripId,
        name: tripForm.name.trim(),
        startDate: tripForm.startDate,
        endDate: tripForm.endDate,
      })
      invalidateCache('admin.')
      toast.success('Trip details saved.')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingTrip(false)
    }
  }

  if (loading && !data) return <LoadingBlock label="Loading trip…" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const { trip, coordinators } = data
  const tone = levelTone[trip.level]
  const tripName = trips.find((t) => t.tripId === tripId)?.name || trip.name

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'itinerary', label: 'Map' },
    { id: 'progress', label: 'Progress' },
    { id: 'ratings', label: 'Ratings' },
  ]

  return (
    <>
      <PageHeader
        title={tripName}
        subtitle={`${trip.expenseCount} active entries${trip.voidCount ? ` · ${trip.voidCount} void` : ''}`}
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200 scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total Budget" value={trip.hasBudget ? formatINR(trip.totalBudget) : 'Not set'} />
            <StatCard label="Total Expenses" value={formatINR(trip.spent)} />
            <StatCard
              label="Remaining"
              value={trip.remaining !== null ? formatINR(trip.remaining) : '—'}
              tone={trip.remaining !== null && trip.remaining < 0 ? 'danger' : 'default'}
            />
            <StatCard label="Today" value={formatINR(trip.todaySpent)} />
          </div>

          <Card>
            <CardHeader title="Trip details" subtitle="Name and travel dates (shown to coordinators)" />
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Trip name">
                  <Input
                    value={tripForm.name}
                    onChange={(e) => setTripForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-11"
                    maxLength={120}
                  />
                </Field>
                <Field label="Start date">
                  <Input
                    type="date"
                    value={tripForm.startDate}
                    onChange={(e) => setTripForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="h-11"
                  />
                </Field>
                <Field label="End date">
                  <Input
                    type="date"
                    value={tripForm.endDate}
                    onChange={(e) => setTripForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="h-11"
                  />
                </Field>
              </div>
              <Button loading={savingTrip} onClick={saveTripSettings}>
                Save trip details
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Budget" subtitle="Warnings at 75% (approaching), 90% (high), 100% (exceeded)" />
            <div className="space-y-3 p-4">
              {trip.hasBudget ? (
                <>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-zinc-700">Used</span>
                    <span className={`tnum font-semibold ${tone.text}`}>{trip.usedPercent}%</span>
                  </div>
                  <BudgetBar percent={trip.usedPercent} level={trip.level} />
                </>
              ) : (
                <p className="text-sm text-zinc-500">No budget configured for this trip yet.</p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Set total budget (₹)">
                  <Input
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    inputMode="decimal"
                    placeholder={trip.hasBudget ? String(trip.totalBudget) : 'e.g. 150000'}
                    className="h-11 w-48 tnum"
                  />
                </Field>
                <Button onClick={saveBudget} disabled={!budgetInput.trim()} className="mb-0.5">
                  Update budget
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Coordinators" subtitle="Active accounts assigned to this trip" />
            {coordinators.length ? (
              <ul className="divide-y divide-zinc-50">
                {coordinators.map((c) => (
                  <li key={c.userId} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{c.name}</p>
                      <p className="text-xs text-zinc-500">{c.email}</p>
                    </div>
                    <Badge tone="brand">Coordinator</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No coordinators assigned" description="Add coordinators from the People page." />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'expenses' ? (
        <Card>
          {expenses.loading && !expenses.data ? (
            <LoadingBlock />
          ) : expenses.error ? (
            <ErrorState message={expenses.error} onRetry={expenses.reload} />
          ) : !expenses.data?.rows.length ? (
            <EmptyState title="No expenses for this trip" />
          ) : (
            <>
              <div className="border-b border-zinc-100 px-4 py-2.5 text-right text-xs text-zinc-500">
                Counted total: <span className="tnum font-semibold text-zinc-800">{formatINR(expenses.data.countedTotal)}</span>
              </div>
              <ExpenseRows rows={expenses.data.rows} />
            </>
          )}
        </Card>
      ) : null}

      {tab === 'itinerary' ? (
        <Card>
          <CardHeader title="Trip plan" subtitle="Sequence, planned times and notes for each stop" />
          <div className="p-4">
            {itinerary.loading && !itinerary.data ? (
              <LoadingBlock />
            ) : itinerary.error ? (
              <ErrorState message={itinerary.error} onRetry={itinerary.reload} />
            ) : (
              <ItineraryEditor
                tripId={tripId}
                stops={itinerary.data?.stops || []}
                onSaved={() => {
                  itinerary.reload()
                  reload()
                }}
              />
            )}
          </div>
        </Card>
      ) : null}

      {tab === 'progress' ? (
        <Card>
          <CardHeader title="Arrival progress" subtitle="Coordinator-submitted arrivals (not GPS)" />
          {progress.loading && !progress.data ? (
            <LoadingBlock />
          ) : !progress.data?.rows.length ? (
            <EmptyState title="No arrivals recorded yet" description="Coordinators tap “Reached” on their itinerary page." />
          ) : (
            <ul className="divide-y divide-zinc-50">
              {progress.data.rows
                .slice()
                .reverse()
                .map((p) => (
                  <li key={p.progressId} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900">{p.locationName}</p>
                      <Badge tone={p.status === 'late' ? 'warning' : p.status === 'early' ? 'info' : 'success'}>
                        {p.status === 'late'
                          ? `${formatDateTimeIST(p.actualArrival)} · ${Math.abs(p.delayMinutes)}m late`
                          : p.status === 'early'
                            ? `${Math.abs(p.delayMinutes)}m early`
                            : 'On time'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Arrived {formatDateTimeIST(p.actualArrival)}
                      {p.delayReason ? ` · ${p.delayReason}` : ''}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'ratings' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Category averages" subtitle={ratings.data ? `${ratings.data.averages.count} ratings` : undefined} />
            <div className="space-y-2.5 p-4">
              {ratings.loading && !ratings.data ? (
                <Spinner />
              ) : ratings.data ? (
                (
                  [
                    ['Destination', ratings.data.averages.destination],
                    ['Accommodation', ratings.data.averages.accommodation],
                    ['Food', ratings.data.averages.food],
                    ['Transportation', ratings.data.averages.transport],
                    ['Overall', ratings.data.averages.overall],
                  ] as [string, number | null][]
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600">{label}</span>
                    <StarsDisplay value={value} />
                  </div>
                ))
              ) : null}
            </div>
          </Card>
          <Card>
            <CardHeader title="Feedback" />
            {ratings.data?.feedback?.length ? (
              <ul className="divide-y divide-zinc-50">
                {ratings.data.feedback.map((f, i) => (
                  <li key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-900">{f.locationName || 'Whole trip'}</p>
                      <StarsDisplay value={f.overall} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{f.feedback}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{formatDateTimeIST(f.submittedAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No feedback yet" />
            )}
          </Card>
        </div>
      ) : null}
    </>
  )
}
