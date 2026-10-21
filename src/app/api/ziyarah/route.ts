/**
 * Same-origin relay to the Google Apps Script web app.
 * Why: Apps Script web apps do not send CORS headers usable from arbitrary
 * origins, and this also keeps the script URL out of the public bundle.
 * Configure ZIYARAH_API_URL (server-side only) in Vercel / .env.local.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4_000_000
const UPSTREAM_TIMEOUT_MS = 35_000

export async function POST(req: Request): Promise<Response> {
  const target = process.env.ZIYARAH_API_URL
  if (!target) {
    return Response.json(
      {
        ok: false,
        error: {
          code: 'config_error',
          message: 'Backend URL is not configured. Set ZIYARAH_API_URL in server environment variables (see README).',
        },
      },
      { status: 503 },
    )
  }

  const body = await req.text()
  if (body.length > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: { code: 'payload_too_large', message: 'Request is too large.' } },
      { status: 413 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return Response.json(
      {
        ok: false,
        error: {
          code: 'upstream_unreachable',
          message: 'Could not reach the travel backend. Please try again in a moment.',
        },
      },
      { status: 502 },
    )
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: false, error: { code: 'method_not_allowed', message: 'Use POST.' } }, { status: 405 })
}
