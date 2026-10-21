/** INR and Asia/Kolkata formatting helpers. */

export const TZ = 'Asia/Kolkata'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const inrDecimals = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

/** ₹1,250 - no decimals for ordinary amounts. */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !isFinite(Number(amount))) return '₹0'
  return inr.format(Math.round(Number(amount)))
}

/** ₹1,250.50 - only when paise are present (receipt-accurate amounts). */
export function formatINRExact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !isFinite(Number(amount))) return '₹0'
  const n = Number(amount)
  return Math.round(n * 100) % 100 === 0 ? inr.format(n) : inrDecimals.format(n)
}

/** Current date in Asia/Kolkata as YYYY-MM-DD. */
export function todayYmd(timeZone: string = TZ, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12))
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

function parseSheetish(value: string): Date | null {
  if (!value) return null
  const s = String(value).replace(/^'/, '').trim()
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)
    ? s.replace(' ', 'T') + '+05:30'
    : /^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
      ? s + '+05:30'
      : s
  const ms = Date.parse(normalized)
  return isFinite(ms) ? new Date(ms) : null
}

/** Format a stored timestamp ('YYYY-MM-DD HH:mm' or ISO) for display in IST. */
export function formatDateTimeIST(value: string | null | undefined, opts?: { withSeconds?: boolean }): string {
  const d = parseSheetish(value || '')
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(opts?.withSeconds ? { second: '2-digit' as const } : {}),
    hour12: true,
  }).format(d)
}

export function formatDateIST(value: string | null | undefined): string {
  const d = parseSheetish(value || '')
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatTimeIST(value: string | null | undefined): string {
  const d = parseSheetish(value || '')
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/** Current time in Asia/Kolkata as HH:mm (24h) for time inputs. */
export function nowHM(timeZone: string = TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

export function formatMinutes(minutes: number | null | undefined): string {
  let m = Math.round(Number(minutes) || 0)
  const sign = m < 0 ? '-' : ''
  m = Math.abs(m)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${sign}${h}h ${r}m`
  if (h) return `${sign}${h}h`
  return `${sign}${r}m`
}

export function percentOf(part: number, whole: number): number {
  if (!whole || !isFinite(whole) || whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}
