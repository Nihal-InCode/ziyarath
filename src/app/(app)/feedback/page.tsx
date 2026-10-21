'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import type { ItineraryStop, Rating, RatingAverages } from '@/lib/types'
import { errorMessage, fieldErrors } from '@/lib/api'
import { formatDateTimeIST } from '@/lib/format'
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { StarRating, StarsDisplay } from '@/components/ui/stars'
import { Field, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/lib/toast'
import { PageHeader } from '@/components/shell'

interface RatingsPageData {
  rows: Rating[]
  averages: RatingAverages
  byStop: Record<string, RatingAverages & { stopId: string; locationName: string }>
}

const CRITERIA = [
  { key: 'destination', label: 'Destination' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'food', label: 'Food' },
  { key: 'transport', label: 'Transportation' },
  { key: 'overall', label: 'Overall' },
] as const

export default function FeedbackPage() {
  const { user, trips, settings } = useSession()
  const api = useApi()
  const toast = useToast()
  const tripId = user?.tripIds?.[0] || trips[0]?.tripId || ''

  const [scores, setScores] = useState<Record<string, number>>({ destination: 0, accommodation: 0, food: 0, transport: 0, overall: 0 })
  const [stopId, setStopId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const stopsResult = useAsync<{ stops: ItineraryStop[] }>(() => api('itinerary.list', { tripId }), [tripId])
  const { data, loading, error, reload } = useAsync<RatingsPageData>(() => api('ratings.list', { tripId }), [tripId])

  const submit = async () => {
    if (saving) return
    const local: Record<string, string> = {}
    for (const c of CRITERIA) if (!scores[c.key]) local[c.key] = 'Required.'
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      await api('ratings.submit', { tripId, stopId, ...scores, feedback })
      toast.success('Thank you! Your ratings were saved.')
      setScores({ destination: 0, accommodation: 0, food: 0, transport: 0, overall: 0 })
      setStopId('')
      setFeedback('')
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
        <PageHeader title="Ratings & Feedback" />
        <Card className="p-6 text-center text-sm text-zinc-500">No trip is assigned to your account yet.</Card>
      </>
    )
  }

  const reachedStops = (stopsResult.data?.stops || []).filter((s) => s.arrived)

  return (
    <>
      <PageHeader title="Ratings & Feedback" subtitle="Rate places you have visited on this trip" />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Submit ratings" subtitle="One rating per stop — updates need admin permission" />
          <div className="space-y-4 p-4">
            <Field label="Location (optional)" hint="Pick a stop you visited, or rate the trip overall">
              <Select value={stopId} onChange={(e) => setStopId(e.target.value)}>
                <option value="">Whole trip</option>
                {reachedStops.map((s) => (
                  <option key={s.stopId} value={s.stopId}>
                    {s.locationName}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-3">
              {CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-3 py-2.5">
                  <span className="text-sm font-medium text-zinc-700">{c.label}</span>
                  <div>
                    <StarRating value={scores[c.key]} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} label={c.label} />
                    {errors[c.key] ? <p className="mt-1 text-right text-xs text-red-600">{errors[c.key]}</p> : null}
                  </div>
                </div>
              ))}
            </div>

            <Field label="Written feedback (optional)">
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} placeholder="What went well? What could improve?" />
            </Field>

            <Button size="lg" className="w-full" loading={saving} onClick={submit}>
              <Star className="size-4" /> Submit Ratings
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Trip averages" subtitle={data ? `${data.averages.count} rating(s) submitted` : undefined} />
            <div className="space-y-2.5 p-4">
              {loading && !data ? (
                <LoadingBlock />
              ) : error ? (
                <ErrorState message={error} onRetry={reload} />
              ) : (
                CRITERIA.map((c) => (
                  <div key={c.key} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600">{c.label}</span>
                    <StarsDisplay value={data?.averages?.[c.key] ?? null} />
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="My submissions" />
            {data?.rows?.length ? (
              <ul className="divide-y divide-zinc-50">
                {data.rows.map((r) => (
                  <li key={r.ratingId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900">{r.locationName || 'Whole trip'}</p>
                      <StarsDisplay value={r.overall} />
                    </div>
                    {r.feedback ? <p className="mt-1 text-xs text-zinc-500">{r.feedback}</p> : null}
                    <p className="mt-1 text-[11px] text-zinc-400">{formatDateTimeIST(r.submittedAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No ratings yet" description="Your submitted ratings will appear here." />
            )}
          </Card>

          {settings?.allowRatingUpdates ? <Badge tone="info">Rating updates allowed</Badge> : null}
        </div>
      </div>
    </>
  )
}
