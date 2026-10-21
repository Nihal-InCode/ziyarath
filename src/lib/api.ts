/**
 * Service layer: every backend call goes through callApi().
 * The browser talks to the same-origin Next.js relay (/api/ziyarah),
 * which forwards to the Google Apps Script web app server-side.
 * The Apps Script URL is never exposed to the client bundle.
 */

export class ApiError extends Error {
  code: string
  details: unknown
  status: number

  constructor(message: string, code = 'error', details: unknown = null, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
  }
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string; details?: unknown }
}

const TIMEOUT_MS = 30000

export async function callApi<T>(action: string, data: unknown = {}, token?: string | null): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api/ziyarah', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: token || undefined, data }),
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(TIMEOUT_MS)
        : undefined,
    })
  } catch (err) {
    const message = err instanceof Error && err.name === 'TimeoutError'
      ? 'The server took too long to respond. Check your connection and try again.'
      : 'Could not reach the server. Check your internet connection and try again.'
    throw new ApiError(message, 'network')
  }

  let payload: ApiResult<T>
  try {
    payload = (await res.json()) as ApiResult<T>
  } catch {
    throw new ApiError('The server returned an unreadable response. Please try again.', 'bad_response', null, res.status)
  }

  if (!res.ok || !payload.ok) {
    const e = payload.error
    throw new ApiError(
      e?.message || `Request failed (${res.status}).`,
      e?.code || 'http_error',
      e?.details ?? null,
      res.status,
    )
  }
  return payload.data as T
}

/** Field-level validation errors thrown by the backend. */
export function fieldErrors(err: unknown): Record<string, string> | null {
  if (err instanceof ApiError && err.details && typeof err.details === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(err.details as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return Object.keys(out).length ? out : null
  }
  return null
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}
