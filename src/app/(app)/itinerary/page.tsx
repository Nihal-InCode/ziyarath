'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, MapPin, Star } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync, invalidateCache } from '@/lib/hooks'
import type { ItineraryStop } from '@/lib/types'
import { formatDateIST, formatDateTimeIST, formatMinutes } from '@/lib/format'
import { errorMessage, fieldErrors } from '@/lib/api'
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/field'
import { StarRating } from '@/components/ui/stars'
import { useToast } from '@/lib/toast'
import { PageHeader } from '@/components/shell'

interface ItineraryResult {
  stops: ItineraryStop[]
  currentStopId: string | null
}

const DELAY_REASONS = ['Traffic', 'Weather', 'Extended visit', 'Transport issues', 'Road block', 'Other']

const RATING_CRITERIA = [
  { key: 'destination', label: 'Destination' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'food', label: 'Food' },
  { key: 'transport', label: 'Transport' },
  { key: 'overall', label: 'Overall' },
] as const

/** Parse 'YYYY-MM-DD HH:mm' (IST) to epoch ms. */
function parsePlannedMs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value || '').replace(/^'/, ''))
  if (!m) return null
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+05:30`)
}

function istClock(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms))
}

interface TimingPreview {
  tone: 'success' | 'warning' | 'info'
  label: string
  detail: string
}

function timingPreview(plannedMs: number | null, nowMs: number, tolerance: number): TimingPreview | null {
  if (plannedMs == null) return null
  const diffMin = Math.round((nowMs - plannedMs) / 60000)
  const base = `Planned ${istClock(plannedMs)} · now ${istClock(nowMs)}`
  if (Math.abs(diffMin) <= tolerance) {
    return { tone: 'success', label: 'On time', detail: `${base} · within ${tolerance} min tolerance` }
  }
  if (diffMin > 0) {
    return { tone: 'warning', label: `${formatMinutes(diffMin)} late`, detail: base }
  }
  return { tone: 'info', label: `${formatMinutes(-diffMin)} early`, detail: base }
}

export default function ItineraryPage() {
  const { user, trips, settings } = useSession()
  const api = useApi()
  const toast = useToast()
  const tripId = user?.tripIds?.[0] || trips[0]?.tripId || ''

  const [arriving, setArriving] = useState<ItineraryStop | null>(null)
  const [delayReason, setDelayReason] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [scores, setScores] = useState<Record<string, number>>({ destination: 0, accommodation: 0, food: 0, transport: 0, overall: 0 })
  const [ratingFeedback, setRatingFeedback] = useState('')

  const { data, loading, error, reload } = useAsync<ItineraryResult>(
    () => api<ItineraryResult>('itinerary.list', { tripId }),
    [tripId],
    `itinerary:${tripId}`,
  )

  // Live clock while the Reached dialog is open.
  useEffect(() => {
    if (!arriving) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 15000)
    return () => window.clearInterval(id)
  }, [arriving])

  const tolerance = settings?.arrivalToleranceMinutes ?? 10
  const preview = arriving ? timingPreview(parsePlannedMs(arriving.plannedArrival), nowMs, tolerance) : null

  const days = useMemo(() => {
    const list: { key: string; stops: ItineraryStop[] }[] = []
    for (const s of data?.stops || []) {
      const key = String(s.plannedArrival || '').replace(/^'/, '').slice(0, 10) || 'unscheduled'
      let bucket = list.find((b) => b.key === key)
      if (!bucket) {
        bucket = { key, stops: [] }
        list.push(bucket)
      }
      bucket.stops.push(s)
    }
    return list
  }, [data?.stops])

  const resetDialog = () => {
    setArriving(null)
    setDelayReason('')
    setNotes('')
    setErrors({})
    setScores({ destination: 0, accommodation: 0, food: 0, transport: 0, overall: 0 })
    setRatingFeedback('')
  }

  const confirmArrival = async () => {
    if (!arriving || saving) return
    const ratedValues = RATING_CRITERIA.map((c) => scores[c.key])
    const anyRated = ratedValues.some((v) => v > 0)
    const allRated = ratedValues.every((v) => v > 0)
    if (anyRated && !allRated) {
      setErrors({ ratings: 'Rate all five categories, or clear every star.' })
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const res = await api<{ progress: { status: string; delayMinutes: number }; duplicate: boolean }>('progress.arrive', {
        tripId,
        stopId: arriving.stopId,
        delayReason,
        notes,
      })
      let ratingSaved = false
      if (anyRated && allRated) {
        try {
          await api('ratings.submit', { tripId, stopId: arriving.stopId, ...scores, feedback: ratingFeedback })
          ratingSaved = true
        } catch (ratingErr) {
          toast.error(`Arrival saved, but rating failed: ${errorMessage(ratingErr)}`)
        }
      }
      invalidateCache('itinerary:')
      invalidateCache('ratings:')
      invalidateCache('home:')
      const statusText = res.progress.status === 'late'
        ? ` — ${formatMinutes(res.progress.delayMinutes)} late`
        : res.progress.status === 'early'
          ? ` — ${formatMinutes(res.progress.delayMinutes)} early`
          : ' — on time'
      toast.success(
        `${res.duplicate ? 'Arrival was already recorded.' : `Arrival recorded${statusText}.`}${ratingSaved ? ' Rating saved.' : ''}`,
      )
      resetDialog()
      reload()
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setErrors(fields)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!tripId) {
    return (
      <>
        <PageHeader title="Itinerary" />
        <Card className="p-6 text-center text-sm text-zinc-500">No trip is assigned to your account yet.</Card>
      </>
    )
  }

  if (loading && !data) return <LoadingBlock label="Loading itinerary…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const stops = data?.stops || []
  const currentStop = stops.find((s) => s.stopId === data?.currentStopId) || null
  const arrivedCount = stops.filter((s) => s.arrived).length

  const toneClass: Record<TimingPreview['tone'], string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  }

  return (
    <>
      <PageHeader title="Trip Itinerary" subtitle={stops.length ? `${arrivedCount} of ${stops.length} stops reached` : undefined} />

      {currentStop ? (
        <Card className="mb-4 border-brand-200 bg-brand-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Current stop</p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-zinc-900">{currentStop.locationName}</p>
              <p className="text-sm text-zinc-500">Planned arrival {formatDateTimeIST(currentStop.plannedArrival)}</p>
            </div>
            <Button onClick={() => setArriving(currentStop)}>
              <CheckCircle2 className="size-4" /> Reached
            </Button>
          </div>
        </Card>
      ) : null}

      {days.length ? (
        days.map((day, di) => (
          <Card key={day.key} className="mb-4">
            <CardHeader
              title={day.key === 'unscheduled' ? 'Unscheduled' : `Day ${di + 1} · ${formatDateIST(day.key + ' 00:00')}`}
              subtitle={`${day.stops.length} stop${day.stops.length === 1 ? '' : 's'} · times in IST`}
            />
            <ol className="divide-y divide-zinc-50">
              {day.stops.map((stop) => {
                const isCurrent = stop.stopId === data?.currentStopId
                return (
                  <li key={stop.stopId} className="flex gap-3 px-4 py-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          stop.arrived
                            ? stop.arrivalStatus === 'late'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                            : isCurrent
                              ? 'bg-brand-700 text-white'
                              : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {stop.sequence}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900">{stop.locationName}</p>
                        {stop.arrived ? (
                          <Badge tone={stop.arrivalStatus === 'late' ? 'warning' : stop.arrivalStatus === 'early' ? 'info' : 'success'}>
                            {stop.delayText || 'On time'}
                          </Badge>
                        ) : isCurrent ? (
                          <Badge tone="brand">Up next</Badge>
                        ) : (
                          <Badge>Upcoming</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Planned {formatDateTimeIST(stop.plannedArrival)}
                        {stop.plannedDeparture ? ` → ${formatDateTimeIST(stop.plannedDeparture)}` : ''}
                      </p>
                      {stop.arrived ? (
                        <p className="mt-0.5 text-xs text-zinc-600">
                          Arrived {formatDateTimeIST(stop.actualArrival)}
                          {stop.delayReason ? ` · ${stop.delayReason}` : ''}
                        </p>
                      ) : null}
                      {stop.notes ? <p className="mt-1 text-xs italic text-zinc-400">{stop.notes}</p> : null}
                      {!stop.arrived && isCurrent ? (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => setArriving(stop)}>
                          <CheckCircle2 className="size-4" /> Mark as reached
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState
            icon={<MapPin className="size-9" />}
            title="No itinerary published"
            description="The administrator has not added stops for this trip yet."
          />
        </Card>
      )}

      <Dialog
        open={!!arriving}
        title={`Reached ${arriving?.locationName || ''}?`}
        subtitle="Arrival time is recorded automatically."
        onClose={resetDialog}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetDialog}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} onClick={confirmArrival}>
              Confirm arrival
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {preview ? (
            <div className={`rounded-xl border px-3 py-2.5 ${toneClass[preview.tone]}`}>
              <p className="text-sm font-semibold">{preview.label}</p>
              <p className="mt-0.5 text-xs opacity-80">{preview.detail}</p>
            </div>
          ) : null}

          <Field
            label="Reason (if early or late)"
            error={errors.delayReason}
            hint={`Tolerance is ${tolerance} minutes`}
          >
            <Select value={delayReason} onChange={(e) => setDelayReason(e.target.value)} error={errors.delayReason}>
              <option value="">Select a reason…</option>
              {DELAY_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Optional note" />
          </Field>

          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
              <Star className="size-4 fill-amber-400 text-amber-400" /> Rate this place (optional)
            </p>
            <div className="mt-2 space-y-2">
              {RATING_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-600">{c.label}</span>
                  <StarRating size="sm" value={scores[c.key]} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} label={c.label} />
                </div>
              ))}
            </div>
            {errors.ratings ? <p className="mt-2 text-xs text-red-600">{errors.ratings}</p> : null}
            <Textarea
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
              maxLength={1000}
              placeholder="Quick feedback (optional)"
              className="mt-2 min-h-14 text-sm"
            />
          </div>

          <p className="text-xs text-zinc-400">
            Planned arrival: {arriving ? formatDateTimeIST(arriving.plannedArrival) : ''}. This records a
            coordinator-submitted arrival, not GPS tracking.
          </p>
        </div>
      </Dialog>
    </>
  )
}
