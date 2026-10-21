'use client'

import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import type { ReportResult } from '@/lib/types'
import { addDaysYmd, formatDateIST, formatDateTimeIST, formatINR, todayYmd } from '@/lib/format'
import { downloadCsv } from '@/lib/export'
import { Button, Card, CardHeader } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { StatCard, MiniBars, BudgetBar, levelTone } from '@/components/ui/stat'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { PageHeader } from '@/components/shell'
import { useToast } from '@/lib/toast'

type Preset = '7d' | 'month' | 'all' | 'custom'

function rangeOf(preset: Preset, custom: { from: string; to: string }) {
  const today = todayYmd()
  switch (preset) {
    case '7d':
      return { from: addDaysYmd(today, -6), to: today }
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today }
    case 'custom':
      return { from: custom.from || null, to: custom.to || null }
    default:
      return { from: null, to: null }
  }
}

export default function ReportsPage() {
  const api = useApi()
  const { trips, categories } = useSession()
  const toast = useToast()

  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [tripId, setTripId] = useState('')
  const [category, setCategory] = useState('')

  const range = useMemo(() => rangeOf(preset, custom), [preset, custom])
  const query = useMemo(
    () => ({
      tripIds: tripId ? [tripId] : undefined,
      from: range.from,
      to: range.to,
      categories: category ? [category] : undefined,
    }),
    [tripId, range, category],
  )

  const { data, loading, error, reload } = useAsync<ReportResult>(() => api('reports.summary', query), [JSON.stringify(query)])

  const exportCsv = () => {
    if (!data?.rows?.length) return
    downloadCsv(
      `ziyarah-report-${range.from || 'all'}-to-${range.to || 'all'}`,
      ['Expense ID', 'Trip', 'Date', 'Coordinator', 'Reason', 'Category', 'Amount', 'Status'],
      data.rows.map((e) => [e.expenseId, e.tripName || e.tripId, e.expenseDate, e.coordinatorName, e.reason, e.category, e.amount, e.status]),
    )
    toast.success('CSV downloaded.')
  }

  const label = tripId ? trips.find((t) => t.tripId === tripId)?.name || tripId : 'All trips'
  const dateLabel = range.from ? `${formatDateIST(range.from)} – ${formatDateIST(range.to || todayYmd())}` : 'All time'

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Reports"
          subtitle="Totals computed on the server from saved records"
          action={
            <>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows?.length}>
                <Download className="size-4" /> CSV
              </Button>
            </>
          }
        />

        <Card className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={preset}
              onChange={setPreset}
              options={[
                { value: '7d', label: 'Last 7 days' },
                { value: 'month', label: 'This month' },
                { value: 'all', label: 'All time' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {preset === 'custom' ? (
              <div className="flex items-center gap-2">
                <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 w-40 text-sm" />
                <span className="text-sm text-zinc-400">to</span>
                <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 w-40 text-sm" />
              </div>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select value={tripId} onChange={(e) => setTripId(e.target.value)} className="h-10 text-sm">
              <option value="">All trips</option>
              {trips.map((t) => (
                <option key={t.tripId} value={t.tripId}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      </div>

      {loading && !data ? (
        <LoadingBlock label="Building report…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-900">{label}</h2>
            <p className="text-sm text-zinc-500">
              {dateLabel} · generated {formatDateTimeIST(data.generatedAt)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total expenses" value={formatINR(data.totals.total)} sub={`${data.totals.count} entries`} />
            <StatCard label="Total budget" value={data.budgets.some((b) => b.hasBudget) ? formatINR(data.budgets.reduce((s, b) => s + (b.totalBudget || 0), 0)) : 'Not set'} />
            <StatCard
              label="Remaining (full trips)"
              value={
                data.budgets.length && data.budgets.every((b) => b.hasBudget)
                  ? formatINR(data.budgets.reduce((s, b) => s + (b.remaining || 0), 0))
                  : '—'
              }
            />
            <StatCard label="Voided" value={String(data.totals.voidCount)} sub="Excluded from totals" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="By category" />
              <div className="p-4">
                {data.byCategory.length ? (
                  <MiniBars rows={data.byCategory.map((r) => ({ key: r.key, total: r.total }))} format={formatINR} />
                ) : (
                  <p className="py-6 text-center text-sm text-zinc-400">No data</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="By coordinator" />
              <div className="p-4">
                {data.byCoordinator.length ? (
                  <MiniBars rows={data.byCoordinator.map((r) => ({ key: r.key, total: r.total }))} format={formatINR} />
                ) : (
                  <p className="py-6 text-center text-sm text-zinc-400">No data</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Daily summary" />
              <div className="p-4">
                {data.byDay.length ? (
                  <MiniBars rows={data.byDay.slice(-10).map((r) => ({ key: r.date, total: r.total, label: r.date }))} format={formatINR} />
                ) : (
                  <p className="py-6 text-center text-sm text-zinc-400">No data</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Budget utilization" subtitle="Based on all saved expenses for each trip" />
            <ul className="divide-y divide-zinc-50">
              {data.budgets.length ? (
                data.budgets.map((b) => (
                  <li key={b.tripId} className="px-4 py-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-zinc-800">{b.name}</span>
                      <span className={`tnum font-semibold ${levelTone[b.level].text}`}>
                        {b.hasBudget ? `${formatINR(b.spent)} / ${formatINR(b.totalBudget)} (${b.usedPercent}%)` : `${formatINR(b.spent)} spent · budget not set`}
                      </span>
                    </div>
                    <div className="mt-2">
                      <BudgetBar percent={b.usedPercent} level={b.level} />
                    </div>
                  </li>
                ))
              ) : (
                <EmptyState title="No trips with expenses in this range" />
              )}
            </ul>
          </Card>

          {data.byTrip.length > 1 ? (
            <Card className="mt-4">
              <CardHeader title="Trip comparison" />
              <ul className="divide-y divide-zinc-50">
                {data.byTrip.map((t) => (
                  <li key={t.tripId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-medium text-zinc-800">{t.name}</span>
                    <span className="tnum text-zinc-700">
                      {formatINR(t.total)} · {t.count} entries
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {data.rows.length ? (
            <Card className="mt-4">
              <CardHeader title="Expense list" subtitle={`${data.rows.length} records in range`} />
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-100 text-left text-xs uppercase text-zinc-400">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Reason</th>
                      <th className="px-4 py-2 font-medium">Trip</th>
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.rows.slice(0, 200).map((e) => (
                      <tr key={e.expenseId}>
                        <td className="tnum whitespace-nowrap px-4 py-2 text-zinc-600">{e.expenseDate}</td>
                        <td className="max-w-52 truncate px-4 py-2 text-zinc-900">{e.reason}</td>
                        <td className="px-4 py-2 text-zinc-600">{e.tripName || e.tripId}</td>
                        <td className="px-4 py-2 text-zinc-600">{e.category}</td>
                        <td className="tnum whitespace-nowrap px-4 py-2 text-right font-medium">{formatINR(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  )
}
