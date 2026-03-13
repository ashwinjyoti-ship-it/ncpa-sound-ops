import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setupAuthEndpoints, verifyAuth } from './auth-endpoints'
import { setupCrewEndpoints } from './crew-endpoints'
import { setupEventsEndpoints } from './events-endpoints'
import { setupQuoteEndpoints } from './quote-endpoints'
import { setupParseWordEndpoints } from './parse-word'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({ origin: '*', credentials: true }))

// Public
app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))
setupAuthEndpoints(app)

// Auth guard — all /api/* except /api/auth/*
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next()
  if (!await verifyAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
  return next()
})

// Protected routes
setupEventsEndpoints(app)
setupCrewEndpoints(app)
setupQuoteEndpoints(app)
setupParseWordEndpoints(app)

export default app
