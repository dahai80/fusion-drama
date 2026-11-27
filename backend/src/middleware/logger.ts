import type { MiddlewareHandler } from 'hono'

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function statusColor(status: number): string {
  if (status >= 500) return colors.red
  if (status >= 400) return colors.yellow
  if (status >= 300) return colors.cyan
  return colors.green
}

function formatTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * Global logging middleware — prints request method/path/status/duration/body
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const method = c.req.method
  const path = c.req.path
  const start = performance.now()

  // log the request
  const time = formatTime()
  let bodyInfo = ''
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      const ct = (c.req.header('Content-Type') || 'application/json').toLowerCase()
      const isJson = ct.startsWith('application/json')
      const sensitive = path.includes('/ai-configs')
      if (sensitive) {
        // ai-configs bodies carry api_key; plaintext in logs is a leak surface (task-logger
        // has a redaction layer, body preview is skipped here)
        bodyInfo = `\n  ${colors.dim}body: <redacted>${colors.reset}`
      } else if (isJson && path !== '/tasks') {
        // preview only for JSON bodies: fully cloning multipart large files just wastes
        // memory (a 50MB video = double buffering)
        const clone = c.req.raw.clone()
        const text = await clone.text()
        if (text) {
          const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text
          bodyInfo = `\n  ${colors.dim}body: ${truncated}${colors.reset}`
        }
      }
    } catch {}
  }

  console.log(`${colors.dim}${time}${colors.reset} ${colors.cyan}${method}${colors.reset} ${path}${bodyInfo}`)

  await next()

  const ms = (performance.now() - start).toFixed(0)
  const status = c.res.status
  const sc = statusColor(status)
  console.log(`${colors.dim}${time}${colors.reset} ${colors.cyan}${method}${colors.reset} ${path} ${sc}${status}${colors.reset} ${colors.dim}${ms}ms${colors.reset}`)
}

/**
 * Global error handler — catches unhandled exceptions and prints the full stack
 */
export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (err: any) {
    const status = err.status || 500
    console.error(`${colors.red}[ERROR]${colors.reset} ${c.req.method} ${c.req.path}`)
    console.error(err.stack || err.message || err)
    // internal error text is never sent to clients (messages containing upstream response
    // bodies would expose internal paths/services to the client)
    return c.json({ code: status, message: 'Internal Server Error' }, status)
  }
}
