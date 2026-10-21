'use client'

import { useState } from 'react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import type { Expense, ExpenseListResult } from '@/lib/types'
import { formatDateIST, formatDateTimeIST, formatINRExact, formatINR } from '@/lib/format'
import { Badge, Card, Button } from '@/components/ui/primitives'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { ExpenseRows } from '@/components/expense-list'
import { PageHeader } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'

export default function CoordinatorExpensesPage() {
  const { user, trips } = useSession()
  const api = useApi()
  const tripId = user?.tripIds?.[0] || trips[0]?.tripId || ''
  const [limit, setLimit] = useState(50)
  const [selected, setSelected] = useState<Expense | null>(null)

  const { data, loading, error, reload } = useAsync<ExpenseListResult>(
    () => api<ExpenseListResult>('expenses.list', { tripId, limit, statuses: ['active', 'void'] }),
    [tripId, limit],
    `expenses:${tripId}:${limit}`,
  )

  return (
    <>
      <PageHeader
        title="My Expenses"
        subtitle={data ? `${data.total} records · ${formatINR(data.countedTotal)} total` : undefined}
      />
      <Card>
        {loading && !data ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || !data.rows.length ? (
          <EmptyState title="No expenses recorded yet" description="Expenses you save will appear here." />
        ) : (
          <>
            <ExpenseRows rows={data.rows} onOpen={setSelected} />
            {data.hasMore ? (
              <div className="border-t border-zinc-100 p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 50)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Dialog open={!!selected} title={selected?.reason || ''} subtitle={selected?.category} onClose={() => setSelected(null)}>
        {selected ? (
          <dl className="space-y-3 text-sm">
            <Row label="Amount">
              <span className="tnum font-semibold">{formatINRExact(selected.amount)}</span>
            </Row>
            <Row label="Expense date">{formatDateIST(selected.expenseDate)}</Row>
            <Row label="Submitted at">{formatDateTimeIST(selected.submittedAt)}</Row>
            <Row label="Status">
              {selected.status === 'void' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Active</Badge>}
            </Row>
            {selected.notes ? <Row label="Notes">{selected.notes}</Row> : null}
            <p className="pt-2 text-xs text-zinc-400">
              Need a change? Contact an administrator — corrections are recorded in the audit log.
            </p>
          </dl>
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
