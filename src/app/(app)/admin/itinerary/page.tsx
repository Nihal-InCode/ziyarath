'use client'

import { useState } from 'react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import type { ItineraryStop } from '@/lib/types'
import { formatDateTimeIST } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { ErrorState, LoadingBlock, EmptyState } from '@/components/ui/states'
import { ItineraryEditor } from '@/components/admin/itinerary-editor'
import { PageHeader } from '@/components/shell'

interface ItineraryResult {
  stops: ItineraryStop[]
  currentStopId: string | null
}

export default function AdminItineraryPage() {
  const { trips } = useSession()
  const api = useApi()
  const [tripId, setTripId] = useState(trips[0]?.tripId || '')

  const selected = tripId || trips[0]?.tripId || ''
  const { data, loading, error, reload } = useAsync<ItineraryResult>(
    () => api<ItineraryResult>('itinerary.list', { tripId: selected }),
    [selected],
    `itinerary:${selected}`,
  )

  if (!trips.length) {
    return (
      <>
        <PageHeader title="Map" />
        <Card>
          <EmptyState title="No trips available" />
        </Card>
      </>
    )
  }

  const stops = data?.stops || []
  const arrivedCount = stops.filter((s) => s.arrived).length

  return (
    <>
      <PageHeader
        title="Map"
        subtitle={data ? `${stops.length} stops · ${arrivedCount} reached` : undefined}
      />

      {trips.length > 1 ? (
        <div className="mb-4 overflow-x-auto">
          <Segmented
            value={selected}
            onChange={setTripId}
            options={trips.map((t) => ({ value: t.tripId, label: t.name }))}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Trip plan" subtitle="Add, reorder, edit or remove stops — coordinators see this live" />
        <div className="p-4">
          {loading && !data ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <ItineraryEditor tripId={selected} stops={stops} onSaved={reload} />
          )}
        </div>
      </Card>

      {stops.length ? (
        <Card className="mt-4">
          <CardHeader title="Current schedule" subtitle="Read-only preview of what coordinators see" />
          <ul className="divide-y divide-zinc-50">
            {stops.map((s) => (
              <li key={s.stopId} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    s.arrived ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {s.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{s.locationName}</p>
                  <p className="text-xs text-zinc-500">
                    {s.plannedArrival ? formatDateTimeIST(s.plannedArrival) : 'No planned time'}
                    {s.expectedDuration ? ` · ${s.expectedDuration}` : ''}
                  </p>
                </div>
                {s.arrived ? (
                  <Badge tone={s.arrivalStatus === 'late' ? 'warning' : s.arrivalStatus === 'early' ? 'info' : 'success'}>
                    {s.delayText || 'On time'}
                  </Badge>
                ) : (
                  <Badge>Upcoming</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  )
}
