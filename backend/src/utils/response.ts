import type { Context } from 'hono'

export function success(c: Context, data: any = null) {
  return c.json({ code: 200, data, message: 'success' })
}

export function created(c: Context, data: any = null) {
  return c.json({ code: 201, data, message: 'created' }, 201)
}

export function badRequest(c: Context, message = 'Invalid request parameters') {
  return c.json({ code: 400, message }, 400)
}

export function notFound(c: Context, message = 'Resource not found') {
  return c.json({ code: 404, message }, 404)
}

export function serverError(c: Context, message = 'Internal server error') {
  return c.json({ code: 500, message }, 500)
}

export function now() {
  return new Date().toISOString()
}
