'use client'

import { useMemo, useState } from 'react'
import { useApi, useSession } from '@/lib/session'
import { useAsync, usePolling, pollInterval, invalidateCache } from '@/lib/hooks'
import type { Expense, ExpenseListResult } from '@/lib/types'
import { addDaysYmd, formatDateIST, formatDateTimeIST, formatINR, formatINRExact, todayYmd } from '@/lib/format'
import { errorMessage, fieldErrors } from '@/lib/api'
import { downloadCsv } from '@/lib/export'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { ExpenseRows } from '@/components/expense-list'
import { PageHeader } from '@/components/shell'
import { useToast } from '@/lib/toast'

type Preset = 'today' | '7d' | 'month' | 'all' | 'custom'

function presetRange(preset: Preset, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const today = todayYmd()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
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

export default function AdminExpensesPage() {
  const api = useApi()
  const { trips, categories, user } = useSession()
  const toast = useToast()

  const [preset, setPreset] = useState<Preset>('all')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [tripFilter, setTripFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(100)

  const [selected, setSelected] = useState<Expense | null>(null)
  const [detail, setDetail] = useState<{ expense: Expense; history: { userName: string; action: string; timestamp: string; changeSummary: string }[] } | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ reason: '', amount: '', category: '', expenseDate: '', notes: '', correctionReason: '', voidReason: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const range = useMemo(() => presetRange(preset, custom), [preset, custom])

  const query = useMemo(
    () => ({
      tripIds: tripFilter ? [tripFilter] : trips.map((t) => t.tripId),
      from: range.from,
      to: range.to,
      categories: categoryFilter ? [categoryFilter] : undefined,
      statuses: statusFilter === 'all' ? ['active', 'void'] : [statusFilter],
      search,
      limit,
    }),
    [tripFilter, trips, range, categoryFilter, statusFilter, search, limit],
  )

  const { data, loading, error, reload } = useAsync<ExpenseListResult>(
    () => api('expenses.list', query),
    [JSON.stringify(query)],
    `admin.exp:${JSON.stringify(query)}`,
  )
  usePolling(reload, pollInterval())

  const openDetail = async (expense: Expense) => {
    setSelected(expense)
    setEditing(false)
    setErrors({})
    setForm({
      reason: expense.reason,
      amount: String(expense.amount),
      category: expense.category,
      expenseDate: expense.expenseDate,
      notes: expense.notes,
      correctionReason: '',
      voidReason: '',
    })
    try {
      const res = await api<{ expense: Expense; history: { userName: string; action: string; timestamp: string; changeSummary: string }[] }>(
        'expenses.get',
        { tripId: expense.tripId, expenseId: expense.expenseId },
      )
      setDetail(res)
    } catch {
      setDetail({ expense, history: [] })
    }
  }

  const saveEdit = async (mode: 'update' | 'correct') => {
    if (!selected || saving) return
    setErrors({})
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        tripId: selected.tripId,
        expenseId: selected.expenseId,
        reason: form.reason,
        amount: form.amount,
        category: form.category,
        expenseDate: form.expenseDate,
        notes: form.notes,
      }
      if (mode === 'correct') payload.correctionReason = form.correctionReason
      await api(`expenses.${mode}`, payload)
      invalidateCache('admin.')
      invalidateCache('home:')
      invalidateCache('expenses:')
      toast.success(mode === 'correct' ? 'Correction saved and audit-logged.' : 'Expense updated.')
      setSelected(null)
      setDetail(null)
      reload()
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setErrors(fields)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const voidExpense = async (mode: 'void' | 'restore') => {
    if (!selected || saving) return
    setSaving(true)
    try {
      await api(`expenses.${mode}`, {
        tripId: selected.tripId,
        expenseId: selected.expenseId,
        voidReason: form.voidReason,
      })
      invalidateCache('admin.')
      invalidateCache('home:')
      invalidateCache('expenses:')
      toast.success(mode === 'void' ? 'Expense voided (history preserved).' : 'Expense restored.')
      setSelected(null)
      setDetail(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    if (!data?.rows?.length) return
    downloadCsv(
      `ziyarah-expenses-${range.from || 'all'}-to-${range.to || 'all'}`,
      ['Expense ID', 'Trip', 'Date', 'Submitted At', 'Coordinator', 'Reason', 'Category', 'Amount', 'Status', 'Notes'],
      data.rows.map((e) => [
        e.expenseId,
        e.tripName || e.tripId,
        e.expenseDate,
        e.submittedAt,
        e.coordinatorName,
        e.reason,
        e.category,
        e.amount,
        e.status,
        e.notes,
      ]),
    )
    toast.success('CSV downloaded.')
  }

  return (
    <>
      <PageHeader
        title="All Expenses"
        subtitle={data ? `${data.total} records · ${formatINR(data.countedTotal)} counted (active only)` : undefined}
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows?.length}>
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7d', label: '7 days' },
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
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={tripFilter} onChange={(e) => setTripFilter(e.target.value)} className="h-10 text-sm">
            <option value="">All trips</option>
            {trips.map((t) => (
              <option key={t.tripId} value={t.tripId}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 text-sm">
            <option value="active">Active</option>
            <option value="void">Void</option>
            <option value="all">All statuses</option>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reason, notes…"
            className="h-10 text-sm"
          />
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.rows?.length ? (
          <EmptyState title="No expenses match these filters" description="Try a different date range or clear filters." />
        ) : (
          <>
            <ExpenseRows rows={data.rows} onOpen={openDetail} />
            {data.hasMore ? (
              <div className="border-t border-zinc-100 p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 100)}>
                  Load more ({data.rows.length} of {data.total})
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Dialog
        open={!!selected}
        title={selected?.reason || ''}
        subtitle={`${selected?.tripName || selected?.tripId || ''} · ${formatINRExact(selected?.amount ?? 0)}`}
        onClose={() => {
          setSelected(null)
          setDetail(null)
        }}
        footer={
          !editing && user?.role === 'admin' && selected ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {selected.status === 'active' ? (
                <Button variant="danger" size="sm" onClick={() => voidExpense('void')}>
                  Void
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => voidExpense('restore')}>
                  Restore
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {selected && !editing ? (
          <div className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <Row label="Status">
                {selected.status === 'void' ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Active</Badge>}
              </Row>
              <Row label="Category">{selected.category}</Row>
              <Row label="Expense date">{formatDateIST(selected.expenseDate)}</Row>
              <Row label="Submitted at">{formatDateTimeIST(selected.submittedAt)}</Row>
              <Row label="Coordinator">{selected.coordinatorName}</Row>
              {detail?.expense?.updatedAt && detail.expense.updatedAt !== selected.submittedAt ? (
                <Row label="Last updated">{formatDateTimeIST(detail.expense.updatedAt)}</Row>
              ) : null}
              {selected.notes ? <Row label="Notes">{selected.notes}</Row> : null}
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Audit history</h3>
              {detail?.history?.length ? (
                <ul className="space-y-2">
                  {detail.history.map((h, i) => (
                    <li key={i} className="rounded-xl bg-zinc-50 px-3 py-2 text-xs">
                      <p className="font-medium text-zinc-800">
                        {h.action} · {h.userName}
                      </p>
                      <p className="text-zinc-500">{h.changeSummary}</p>
                      <p className="text-zinc-400">{formatDateTimeIST(h.timestamp)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-400">No audit entries.</p>
              )}
            </div>
          </div>
        ) : selected ? (
          <div className="space-y-3">
            <Field label="Reason" error={errors.reason} required>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} error={errors.reason} />
            </Field>
            <Field label="Amount (₹)" error={errors.amount} required>
              <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} inputMode="decimal" error={errors.amount} className="tnum" />
            </Field>
            <Field label="Category" error={errors.category} required>
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} error={errors.category}>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expense date" error={errors.expenseDate} required>
              <Input type="date" value={form.expenseDate} max={todayYmd()} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} error={errors.expenseDate} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} maxLength={1000} />
            </Field>
            <Field label="Correction reason" error={errors.correctionReason} required hint="Recorded in the audit log">
              <Input
                value={form.correctionReason}
                onChange={(e) => setForm((f) => ({ ...f, correctionReason: e.target.value }))}
                placeholder="Why is this being changed?"
                error={errors.correctionReason}
              />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="secondary" className="flex-1" loading={saving} onClick={() => saveEdit('update')}>
                Save edit
              </Button>
              <Button className="flex-1" loading={saving} onClick={() => saveEdit('correct')}>
                Save as correction
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-900">{children}</dd>
    </div>
  )
}
