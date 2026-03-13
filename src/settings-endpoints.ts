import { Hono } from 'hono'
import type { Bindings } from './types'

export function setupSettingsEndpoints(app: Hono<{ Bindings: Bindings }>) {

  // Check if Anthropic API key is configured (returns boolean only — never the key)
  app.get('/api/admin/settings/ai-key-status', async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'anthropic_api_key'"
    ).first() as any
    return c.json({ configured: !!(row?.value) })
  })

  // Save Anthropic API key to D1
  app.post('/api/admin/settings/ai-key', async (c) => {
    const { key } = await c.req.json()
    if (!key || typeof key !== 'string' || !key.startsWith('sk-ant-')) {
      return c.json({ error: 'Invalid Anthropic API key format (must start with sk-ant-)' }, 400)
    }
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('anthropic_api_key', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key.trim()).run()
    return c.json({ success: true })
  })

  // Clear Anthropic API key
  app.delete('/api/admin/settings/ai-key', async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM app_settings WHERE key = 'anthropic_api_key'"
    ).run()
    return c.json({ success: true })
  })
}
