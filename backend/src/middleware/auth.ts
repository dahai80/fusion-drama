/**
 * 安全中间件 — API 鉴权 + CSRF 防护
 *
 * 鉴权：FUSION_API_TOKEN 设置后，/api/v1 下除 /health 外全部要求
 * `Authorization: Bearer <token>`。未设置时保持无鉴权（单机 localhost 模式），
 * 服务器/Docker 部署必须设置（docker-compose 已透传）。
 *
 * CSRF：浏览器 simple request（text/plain 表单等）不触发 preflight，CORS 拦不住
 * 副作用；对写方法强制 Content-Type 白名单，堵掉这条路径。
 */
import type { MiddlewareHandler } from 'hono'

// 每请求读 env：index.ts 启动闸可先生成 token 再回写 env（P3 首启自动生成），
// 模块加载期快照会固化空值导致自动生成的 token 不生效
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

/** Bearer token 鉴权（token 未配置时直接放行） */
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

/** 写方法 Content-Type 白名单 — 拒绝 text/plain 等可绕过 preflight 的 simple request */
export const requireSafeContentType: MiddlewareHandler = async (c, next) => {
  if (!MUTATING.has(c.req.method)) return next()
  const ct = (c.req.header('Content-Type') || '').toLowerCase()
  // 无 body 的请求（Content-Type 缺失）放行（DELETE 等）
  if (!ct) return next()
  if (ALLOWED_CT.some(a => ct.startsWith(a))) return next()
  console.warn(`[auth] rejected content-type "${ct}" on ${c.req.method} ${c.req.path}`)
  return c.json({ code: 415, message: 'Unsupported Content-Type' }, 415)
}
