'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import type { ItineraryStop } from '@/lib/types'
import { Button } from '@/components/ui/primitives'
import { Field, Input, Textarea } from '@/components/ui/field'
import { useToast } from '@/lib/toast'
import { invalidateCache } from '@/lib/hooks'

interface DraftStop {
  stopId: string | null
  sequence: number
  locationName: string
  plannedArrival: string
  plannedDeparture: string
  expectedDuration: string
  notes: string
}

/** 'YYYY-MM-DD HH:mm' -> 'YYYY-MM-DDTHH:mm' for datetime-local inputs */
function toLocalInput(value: string): string {
  return String(value || '').replace(/^'/, '').trim().replace(' ', 'T').slice(0, 16)
}
function fromLocalInput(value: string): string {
  return value ? value.replace('T', ' ') : ''
}

export function ItineraryEditor({ tripId, stops, onSaved }: { tripId: string; stops: ItineraryStop[]; onSaved: () => void }) {
  const api = useApi()
  const toast = useToast()
  const [draft, setDraft] = useState<DraftStop[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(
      stops.map((s, i) => ({
        stopId: s.stopId,
        sequence: s.sequence || i + 1,
        locationName: s.locationName,
        plannedArrival: toLocalInput(s.plannedArrival),
        plannedDeparture: toLocalInput(s.plannedDeparture),
        expectedDuration: s.expectedDuration,
        notes: s.notes,
      })),
    )
  }, [stops])

  const update = (idx: number, patch: Partial<DraftStop>) => {
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = d.slice()
      const j = idx + dir
      if (j < 0 || j >= next.length) return d
      const tmp = next[idx]
      next[idx] = next[j]
      next[j] = tmp
      return next.map((s, i) => ({ ...s, sequence: i + 1 }))
    })
  }

  const addStop = () => {
    setDraft((d) => [
      ...d,
      { stopId: null, sequence: d.length + 1, locationName: '', plannedArrival: '', plannedDeparture: '', expectedDuration: '', notes: '' },
    ])
  }

  const duplicate = (idx: number) => {
    setDraft((d) => {
      const copy = { ...d[idx], stopId: null }
      const next = [...d.slice(0, idx + 1), copy, ...d.slice(idx + 1)]
      return next.map((s, i) => ({ ...s, sequence: i + 1 }))
    })
  }

  const remove = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence: i + 1 })))
  }

  const save = async () => {
    if (saving) return
    setError(null)
    const payload = draft
      .filter((s) => s.locationName.trim())
      .map((s) => ({
        stopId: s.stopId || undefined,
        sequence: s.sequence,
        locationName: s.locationName,
        plannedArrival: fromLocalInput(s.plannedArrival),
        plannedDeparture: fromLocalInput(s.plannedDeparture),
        expectedDuration: s.expectedDuration,
        notes: s.notes,
      }))
    if (!payload.length) {
      setError('Add at least one stop with a location name.')
      return
    }
    const missingTime = payload.find((s) => !s.plannedArrival)
    if (missingTime) {
      setError(`Stop "${missingTime.locationName}" needs a planned arrival time.`)
      return
    }
    setSaving(true)
    try {
      await api('trips.saveItinerary', { tripId, stops: payload })
      invalidateCache('itinerary:')
      invalidateCache('home:')
      toast.success('Itinerary saved.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!draft.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">No stops yet. Add the first stop of the trip plan.</p>
        <Button variant="outline" onClick={addStop}>
          <Plus className="size-4" /> Add first stop
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {draft.map((stop, idx) => (
        <div key={idx} className="rounded-2xl border border-zinc-200 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
              {idx + 1}
            </span>
            <Input
              value={stop.locationName}
              onChange={(e) => update(idx, { locationName: e.target.value })}
              placeholder="Location name"
              className="h-10 flex-1 text-sm"
            />
            <div className="flex shrink-0 gap-0.5">
              <button type="button" onClick={() => move(idx, -1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Move up">
                <ChevronUp className="size-4" />
              </button>
              <button type="button" onClick={() => move(idx, 1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Move down">
                <ChevronDown className="size-4" />
              </button>
              <button type="button" onClick={() => duplicate(idx)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Duplicate stop">
                <Copy className="size-4" />
              </button>
              <button type="button" onClick={() => remove(idx)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50" aria-label="Remove stop">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Planned arrival">
              <Input type="datetime-local" value={stop.plannedArrival} onChange={(e) => update(idx, { plannedArrival: e.target.value })} className="h-10 text-sm" />
            </Field>
            <Field label="Planned departure">
              <Input type="datetime-local" value={stop.plannedDeparture} onChange={(e) => update(idx, { plannedDeparture: e.target.value })} className="h-10 text-sm" />
            </Field>
            <Field label="Expected duration">
              <Input value={stop.expectedDuration} onChange={(e) => update(idx, { expectedDuration: e.target.value })} placeholder="e.g. 3h 30m" className="h-10 text-sm" />
            </Field>
          </div>
          <Field label="Notes / instructions">
            <Textarea value={stop.notes} onChange={(e) => update(idx, { notes: e.target.value })} maxLength={1000} className="min-h-16 text-sm" />
          </Field>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={addStop}>
          <Plus className="size-4" /> Add stop
        </Button>
        <Button loading={saving} onClick={save}>
          Save itinerary
        </Button>
      </div>
      <p className="text-xs text-zinc-400">
        Reorder with the arrows · duplicate copies a stop · every stop needs a planned arrival time.
        Historical arrival records are preserved when the itinerary changes; removed stops keep their progress history.
      </p>
    </div>
  )
}
