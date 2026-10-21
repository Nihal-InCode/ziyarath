'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, X } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { errorMessage, fieldErrors } from '@/lib/api'
import { nowHM, todayYmd } from '@/lib/format'
import type { Expense, ReceiptUpload } from '@/lib/types'
import { Button, Card } from '@/components/ui/primitives'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/lib/toast'
import { PageHeader } from '@/components/shell'
import { invalidateCache } from '@/lib/hooks'

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  }
  return 'req' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

/** Compress an image on the phone before upload (keeps payloads small). */
async function compressImage(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image on this device.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return dataUrl.split(',')[1] || ''
}

export default function NewExpensePage() {
  const { user, trips, categories, settings } = useSession()
  const api = useApi()
  const router = useRouter()
  const toast = useToast()

  const tripId = user?.tripIds?.[0] || trips[0]?.tripId || ''
  const tripName = trips.find((t) => t.tripId === tripId)?.name || ''

  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => todayYmd())
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState<Expense | null>(null)

  const requestId = useRef(newRequestId())
  const receiptRef = useRef<HTMLInputElement>(null)

  const displayTime = useMemo(() => nowHM(), [])

  const onPickReceipt = (file: File | null) => {
    setReceiptFile(file)
    setReceiptPreview(file ? URL.createObjectURL(file) : null)
  }

  const reset = () => {
    setReason('')
    setAmount('')
    setCategory('')
    setExpenseDate(todayYmd())
    setNotes('')
    onPickReceipt(null)
    setErrors({})
    setSaved(null)
    requestId.current = newRequestId()
  }

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (submitting) return
      setErrors({})

      // Lightweight client-side checks; the backend validates authoritatively.
      const local: Record<string, string> = {}
      if (!reason.trim()) local.reason = 'Reason is required.'
      const amt = Number(String(amount).replace(/[,₹\s]/g, ''))
      if (!amount.trim()) local.amount = 'Amount is required.'
      else if (!isFinite(amt) || amt <= 0) local.amount = 'Enter a valid positive amount.'
      if (!category) local.category = 'Choose a category.'
      if (!expenseDate) local.expenseDate = 'Choose the expense date.'
      else if (expenseDate > todayYmd()) local.expenseDate = 'Expense date cannot be in the future.'
      if (Object.keys(local).length) {
        setErrors(local)
        return
      }

      setSubmitting(true)
      try {
        let receiptReference = ''
        if (receiptFile && settings?.receiptsEnabled !== false) {
          const b64 = await compressImage(receiptFile)
          const uploaded = await api<ReceiptUpload>('receipts.upload', {
            tripId,
            base64: b64,
            mime: 'image/jpeg',
            name: receiptFile.name,
          })
          receiptReference = uploaded.fileId
        }

        const result = await api<{ expense: Expense; duplicate: boolean }>('expenses.create', {
          tripId,
          reason: reason.trim(),
          amount: amt,
          category,
          expenseDate,
          notes: notes.trim(),
          receiptReference,
          clientRequestId: requestId.current,
        })
        setSaved(result.expense)
        invalidateCache('home:')
        invalidateCache('expenses:')
        invalidateCache('admin.summary')
        toast.success(result.duplicate ? 'This expense was already saved.' : 'Expense saved successfully.')
      } catch (err) {
        // Keep all entered data so the coordinator can fix and retry.
        const fields = fieldErrors(err)
        if (fields) setErrors(fields)
        toast.error(errorMessage(err))
      } finally {
        setSubmitting(false)
      }
    },
    [amount, api, category, expenseDate, notes, reason, receiptFile, settings, submitting, toast, tripId],
  )

  if (!tripId) {
    return (
      <>
        <PageHeader title="Add Expense" />
        <Card className="p-6 text-center text-sm text-zinc-500">No trip is assigned to your account yet.</Card>
      </>
    )
  }

  if (saved) {
    return (
      <>
        <PageHeader title="Expense saved" />
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <h2 className="mt-3 text-lg font-semibold text-zinc-900">{saved.reason}</h2>
          <p className="tnum mt-1 text-2xl font-semibold text-zinc-900">₹{saved.amount.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {saved.category} · {saved.expenseDate}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Saved at {saved.submittedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={reset} size="lg">
              Add another expense
            </Button>
            <Button variant="outline" onClick={() => router.push('/home')}>
              Back to dashboard
            </Button>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Add Expense" subtitle={tripName} />
      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Expense reason" error={errors.reason} required>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Lunch at highway hotel"
              maxLength={200}
              error={errors.reason}
              autoFocus
              enterKeyHint="next"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" error={errors.amount} required>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                type="text"
                error={errors.amount}
                className="tnum text-lg font-semibold"
              />
            </Field>
            <Field label="Category" error={errors.category} required>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} error={errors.category}>
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Expense date" error={errors.expenseDate} required hint="Change if this is for an earlier day">
              <Input
                type="date"
                value={expenseDate}
                max={todayYmd()}
                onChange={(e) => setExpenseDate(e.target.value)}
                error={errors.expenseDate}
              />
            </Field>
            <Field label="Expense time" hint="Recorded automatically when you save">
              <Input type="time" value={displayTime} disabled readOnly className="tnum" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Coordinator">
              <Input value={user?.name || ''} disabled readOnly />
            </Field>
            <Field label="Trip">
              <Input value={tripName} disabled readOnly />
            </Field>
          </div>

          <Field label="Notes (optional)" error={errors.notes}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the administrator should know"
              maxLength={1000}
              error={errors.notes}
            />
          </Field>

          {settings?.receiptsEnabled !== false ? (
            <Field label="Receipt photo (optional)">
              {receiptPreview ? (
                <div className="relative inline-block">
                  <img src={receiptPreview} alt="Receipt preview" className="h-40 rounded-xl border border-zinc-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => onPickReceipt(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-zinc-800 p-1 text-white"
                    aria-label="Remove receipt"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => receiptRef.current?.click()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-brand-500 hover:text-brand-700"
                >
                  <Camera className="size-4" /> Attach receipt photo
                </button>
              )}
              <input
                ref={receiptRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPickReceipt(e.target.files?.[0] ?? null)}
              />
            </Field>
          ) : null}

          <div className="pt-1">
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Saving…' : 'Save Expense'}
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-400">
              Submission time is recorded automatically and cannot be edited.
            </p>
          </div>
        </form>
      </Card>
    </>
  )
}
