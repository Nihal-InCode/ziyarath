'use client'

import { Receipt } from 'lucide-react'
import type { Expense } from '@/lib/types'
import { formatDateTimeIST, formatINRExact } from '@/lib/format'
import { Badge } from '@/components/ui/primitives'

export function ExpenseRows({ rows, onOpen }: { rows: Expense[]; onOpen?: (e: Expense) => void }) {
  return (
    <>
      {/* Mobile: card list */}
      <ul className="divide-y divide-zinc-100 md:hidden">
        {rows.map((e) => (
          <li key={e.expenseId}>
            <button
              type="button"
              onClick={() => onOpen?.(e)}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-900">{e.reason}</p>
                  {e.status === 'void' ? <Badge tone="danger">Void</Badge> : null}
                  {e.receiptReference ? <Receipt className="size-3.5 shrink-0 text-zinc-400" /> : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {e.category}
                  {' · '}
                  {e.coordinatorName}
                  {e.tripName ? ` · ${e.tripName}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {e.expenseDate} · submitted {formatDateTimeIST(e.submittedAt)}
                </p>
              </div>
              <p className={`tnum shrink-0 text-sm font-semibold ${e.status === 'void' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                {formatINRExact(e.amount)}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Coordinator</th>
              <th className="px-4 py-2.5 font-medium">Submitted</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.map((e) => (
              <tr
                key={e.expenseId}
                onClick={() => onOpen?.(e)}
                className={onOpen ? 'cursor-pointer hover:bg-zinc-50' : ''}
              >
                <td className="tnum whitespace-nowrap px-4 py-3 text-zinc-600">{e.expenseDate}</td>
                <td className="max-w-64 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-zinc-900">{e.reason}</span>
                    {e.status === 'void' ? <Badge tone="danger">Void</Badge> : null}
                    {e.receiptReference ? <Receipt className="size-3.5 shrink-0 text-zinc-400" /> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600">{e.category}</td>
                <td className="px-4 py-3 text-zinc-600">
                  {e.coordinatorName}
                  {e.tripName ? <span className="block text-xs text-zinc-400">{e.tripName}</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{formatDateTimeIST(e.submittedAt)}</td>
                <td className={`tnum whitespace-nowrap px-4 py-3 text-right font-semibold ${e.status === 'void' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                  {formatINRExact(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
