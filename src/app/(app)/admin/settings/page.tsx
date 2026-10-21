'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/api'
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/field'
import { LoadingBlock } from '@/components/ui/states'
import { PageHeader } from '@/components/shell'
import { useToast } from '@/lib/toast'

interface CategoryRow {
  categoryId: string
  name: string
  active: boolean
}

const SETTING_FIELDS = [
  { key: 'arrival_tolerance_minutes', label: 'Arrival tolerance (minutes)', hint: 'Within this window an arrival counts as on time' },
  { key: 'session_hours', label: 'Session length (hours)', hint: 'Sign-in sessions expire after this many hours' },
] as const

const TOGGLES = [
  { key: 'receipts_enabled', label: 'Receipt photo uploads', hint: 'Coordinators can attach a photo when saving an expense' },
  { key: 'allow_rating_updates', label: 'Allow rating updates', hint: 'Coordinators may re-submit ratings for a stop' },
  { key: 'require_delay_reason', label: 'Require delay reason', hint: 'Early/late arrivals must include a reason' },
] as const

export default function SettingsPage() {
  const api = useApi()
  const { refresh, categories } = useSession()
  const toast = useToast()

  const [newCategory, setNewCategory] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Seed toggle state from bootstrap settings.
  const { settings } = useSession()
  useEffect(() => {
    if (!settings) return
    setToggles({
      receipts_enabled: settings.receiptsEnabled,
      allow_rating_updates: settings.allowRatingUpdates,
      require_delay_reason: true,
    })
  }, [settings])

  const catList = useAsync<{ categories: CategoryRow[] } & Record<string, unknown>>(
    async () => {
      const res = await api<{ user: unknown }>('meta.bootstrap')
      // categories come from bootstrap; local session already has names.
      return { categories: categories.map((c, i) => ({ categoryId: String(i), name: c.name, active: true })) }
    },
    [categories.length],
  )

  const saveSetting = async (key: string, value: string) => {
    setSavingKey(key)
    try {
      await api('settings.save', { key, value })
      toast.success('Setting saved.')
      await refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingKey(null)
    }
  }

  const addCategory = async () => {
    if (!newCategory.trim() || adding) return
    setAdding(true)
    try {
      await api('categories.save', { name: newCategory.trim() })
      toast.success(`Category "${newCategory.trim()}" added.`)
      setNewCategory('')
      await refresh()
      catList.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Application configuration" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Categories" subtitle="Used when coordinators record expenses" />
          <div className="p-4">
            {catList.loading && !catList.data ? (
              <LoadingBlock />
            ) : (
              <ul className="mb-4 space-y-1.5">
                {categories.map((c) => (
                  <li key={c.name} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2.5 text-sm">
                    <span className="text-zinc-800">{c.name}</span>
                    <Badge tone="success">Active</Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                className="h-11 flex-1"
                maxLength={80}
              />
              <Button loading={adding} onClick={addCategory} disabled={!newCategory.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="General" />
            <div className="space-y-4 p-4">
              {SETTING_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <div className="flex gap-2">
                    <Input
                      value={values[f.key] ?? (f.key === 'arrival_tolerance_minutes' ? String(settings?.arrivalToleranceMinutes ?? 10) : '12')}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      inputMode="numeric"
                      className="h-11 w-28 tnum"
                    />
                    <Button
                      variant="outline"
                      loading={savingKey === f.key}
                      onClick={() => saveSetting(f.key, values[f.key] ?? '')}
                    >
                      Save
                    </Button>
                  </div>
                </Field>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Modules" />
            <ul className="divide-y divide-zinc-50">
              {TOGGLES.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{t.label}</p>
                    <p className="text-xs text-zinc-500">{t.hint}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={!!toggles[t.key]}
                    onClick={() => {
                      const next = !toggles[t.key]
                      setToggles((s) => ({ ...s, [t.key]: next }))
                      void saveSetting(t.key, String(next))
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${toggles[t.key] ? 'bg-brand-700' : 'bg-zinc-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${toggles[t.key] ? 'left-5.5' : 'left-0.5'}`}
                      style={{ left: toggles[t.key] ? '1.375rem' : '0.125rem' }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Account recovery" />
            <div className="p-4 text-sm text-zinc-600">
              <p>
                If someone forgets their password, open the Apps Script editor and run{' '}
                <code className="rounded bg-zinc-100 px-1">resetUserPassword(&apos;email@example.com&apos;, &apos;NewPass123&apos;)</code>.
                Admins can also reset a password from the <strong>People</strong> page. The first admin is created with{' '}
                <code className="rounded bg-zinc-100 px-1">createAdmin(...)</code> in the editor (see README).
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
