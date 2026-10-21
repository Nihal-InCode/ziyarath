'use client'

import { useState } from 'react'
import { Plus, UserRound } from 'lucide-react'
import { useApi, useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import type { User } from '@/lib/types'
import { errorMessage, fieldErrors } from '@/lib/api'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { PageHeader } from '@/components/shell'
import { useToast } from '@/lib/toast'

export default function CoordinatorsPage() {
  const api = useApi()
  const { trips } = useSession()
  const toast = useToast()

  const { data, loading, error, reload } = useAsync<{ users: User[] }>(() => api('users.list'), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'coordinator', tripIds: [] as string[], password: '', newPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', email: '', role: 'coordinator', tripIds: trips.length === 1 ? [trips[0].tripId] : [], password: '', newPassword: '' })
    setErrors({})
    setOpen(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({ name: u.name, email: u.email, role: u.role, tripIds: u.tripIds, password: '', newPassword: '' })
    setErrors({})
    setOpen(true)
  }

  const toggleTrip = (tripId: string) => {
    setForm((f) => ({
      ...f,
      tripIds: f.tripIds.includes(tripId) ? f.tripIds.filter((t) => t !== tripId) : [...f.tripIds, tripId],
    }))
  }

  const save = async () => {
    if (saving) return
    setErrors({})
    setSaving(true)
    try {
      if (editing) {
        await api('users.update', {
          userId: editing.userId,
          name: form.name,
          role: form.role,
          tripIds: form.tripIds,
          ...(form.newPassword ? { newPassword: form.newPassword } : {}),
        })
        toast.success(form.newPassword ? 'Account updated and password reset.' : 'Account updated.')
      } else {
        await api('users.create', { name: form.name, email: form.email, role: form.role, tripIds: form.tripIds, password: form.password })
        toast.success('Account created. They can now sign in with this email and password.')
      }
      setOpen(false)
      reload()
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setErrors(fields)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: User) => {
    try {
      await api('users.update', { userId: u.userId, active: !u.active })
      toast.success(u.active ? `${u.name} deactivated.` : `${u.name} reactivated.`)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Admins and trip coordinators sign in with Google"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Add person
          </Button>
        }
      />

      <Card>
        {loading && !data ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.users.length ? (
          <EmptyState icon={<UserRound className="size-9" />} title="No accounts yet" description="Add the first coordinator or admin." />
        ) : (
          <ul className="divide-y divide-zinc-50">
            {data.users.map((u) => (
              <li key={u.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900">{u.name}</p>
                    <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role === 'admin' ? 'Admin' : 'Coordinator'}</Badge>
                    {!u.active ? <Badge tone="danger">Inactive</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{u.email}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {u.role === 'admin' ? 'All trips' : u.tripNames?.length ? u.tripNames.join(', ') : 'No trips assigned'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                    Edit
                  </Button>
                  <Button variant={u.active ? 'ghost' : 'outline'} size="sm" onClick={() => toggleActive(u)}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add person'}
        subtitle="They sign in with the Google account matching this email"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Full name" error={errors.name} required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
          </Field>
          <Field label="Sign-in email" error={errors.email} required hint={editing ? 'Email cannot be changed' : 'Their sign-in email'}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={!!editing}
              error={errors.email}
            />
          </Field>
          {editing ? (
            <Field label="Reset password (optional)" error={errors.newPassword} hint="Any password works. Resets their sign-in.">
              <Input
                type="text"
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Leave blank to keep current password"
                error={errors.newPassword}
              />
            </Field>
          ) : (
            <Field label="Password" error={errors.password} required hint="Any password works. Share it securely with them.">
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Initial password"
                error={errors.password}
              />
            </Field>
          )}
          <Field label="Role" error={errors.role} required>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="coordinator">Coordinator</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {form.role === 'coordinator' ? (
            <Field label="Assigned trips" error={errors.tripIds} required>
              <div className="space-y-1.5">
                {trips.map((t) => (
                  <label key={t.tripId} className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.tripIds.includes(t.tripId)}
                      onChange={() => toggleTrip(t.tripId)}
                      className="size-4 rounded border-zinc-300 accent-brand-700"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
