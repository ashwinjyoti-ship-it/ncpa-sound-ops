import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import type { Bindings } from './types'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Exported for use as middleware in index.tsx
export async function verifyAuth(c: any): Promise<boolean> {
  const cookie = getCookie(c, 'ncpa_auth')
  if (!cookie) return false
  const expected = await hashPassword(c.env.SHARED_PASSWORD)
  return cookie === expected
}

export function setupAuthEndpoints(app: Hono<{ Bindings: Bindings }>) {

  app.post('/api/auth/login', async (c) => {
    const { password } = await c.req.json()
    if (!password) return c.json({ success: false, error: 'Password required' }, 400)

    if (password !== c.env.SHARED_PASSWORD) {
      return c.json({ success: false, error: 'Invalid password' }, 401)
    }

    const token = await hashPassword(password)
    setCookie(c, 'ncpa_auth', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/'
    })
    return c.json({ success: true })
  })

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, 'ncpa_auth', { path: '/' })
    return c.json({ success: true })
  })

  app.get('/api/auth/check', async (c) => {
    const authed = await verifyAuth(c)
    return c.json({ authenticated: authed }, authed ? 200 : 401)
  })
}
