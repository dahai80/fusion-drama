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

const API_TOKEN = process.env.FUSION_API_TOKEN || ''

/** Bearer token 鉴权（token 未配置时直接放行） */
export const requireApiToken: MiddlewareHandler = async (c, next) => {
  if (!API_TOKEN) return next()
  if (c.req.path === '/api/v1/health' || c.req.path === '/health') return next()
  const auth = c.req.header('Authorization') || ''
  if (auth === `Bearer ${API_TOKEN}`) return next()
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
