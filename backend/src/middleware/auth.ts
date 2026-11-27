/**
 * Security middleware — API auth + CSRF protection
 *
 * Auth: once FUSION_API_TOKEN is set, everything under /api/v1 except /health requires
 * `Authorization: Bearer <token>`. When unset it stays unauthenticated (single-machine
 * localhost mode); server/Docker deployments must set it (docker-compose passes it through).
 *
 * CSRF: browser simple requests (text/plain forms etc.) skip preflight, so CORS cannot stop
 * their side effects; mutating methods get a Content-Type allowlist to close that path.
 */
import type { MiddlewareHandler } from 'hono'

// Read env per request: the index.ts startup gate may generate a token and write it back to env
// first (P3 first-start auto-generation); a module-load-time snapshot would freeze an empty
// value and the auto-generated token would never take effect
const apiToken = () => process.env.FUSION_API_TOKEN || ''

/**
 * Shared credential check (audit 1107 F-7): Authorization header, cookie
 * (img/video tags cannot attach headers — the frontend mirrors the token
 * into a `fusion_api_token` cookie on save), or `?token=` query param.
 */
export function hasValidApiToken(c: { req: { header(n: string): string | undefined, query(n: string): string | undefined } | any }): boolean {
  const API_TOKEN = apiToken()
  if (!API_TOKEN) return true
  const auth = c.req.header('Authorization') || ''
  if (auth === `Bearer ${API_TOKEN}`) return true
  const cookie = c.req.header('Cookie') || ''
  // plain substring compare, not RegExp — token may contain regex metacharacters
  if (cookie.split(/;\s*/).some((p: string) => p === `fusion_api_token=${API_TOKEN}`)) return true
  if (c.req.query('token') === API_TOKEN) return true
  return false
}

/** Bearer token auth (passes through when no token is configured) */
export const requireApiToken: MiddlewareHandler = async (c, next) => {
  const API_TOKEN = apiToken()
  if (!API_TOKEN) return next()
  if (c.req.path === '/api/v1/health' || c.req.path === '/health') return next()
  if (hasValidApiToken(c)) return next()
  console.warn(`[auth] unauthorized ${c.req.method} ${c.req.path}`)
  return c.json({ code: 401, message: 'Unauthorized' }, 401)
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ALLOWED_CT = ['application/json', 'multipart/form-data']

/** Content-Type allowlist for mutating methods — rejects text/plain etc. simple requests that bypass preflight */
export const requireSafeContentType: MiddlewareHandler = async (c, next) => {
  if (!MUTATING.has(c.req.method)) return next()
  const ct = (c.req.header('Content-Type') || '').toLowerCase()
  // Body-less requests (missing Content-Type) pass through (DELETE etc.)
  if (!ct) return next()
  if (ALLOWED_CT.some(a => ct.startsWith(a))) return next()
  console.warn(`[auth] rejected content-type "${ct}" on ${c.req.method} ${c.req.path}`)
  return c.json({ code: 415, message: 'Unsupported Content-Type' }, 415)
}
