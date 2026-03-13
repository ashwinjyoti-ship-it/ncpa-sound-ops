import { Hono } from 'hono'
import type { Bindings } from './types'

export function setupQuoteEndpoints(app: Hono<{ Bindings: Bindings }>) {

  // Get all equipment (for quote builder catalog)
  app.get('/api/equipment', async (c) => {
    const { DB } = c.env
    const results = await DB.prepare(
      'SELECT * FROM equipment ORDER BY category, name'
    ).all()
    return c.json(results.results)
  })

  // Add equipment item
  app.post('/api/equipment', async (c) => {
    const { DB } = c.env
    const { name, category, rate_per_item } = await c.req.json()
    if (!name || rate_per_item === undefined) {
      return c.json({ error: 'name and rate_per_item are required' }, 400)
    }
    const result = await DB.prepare(
      'INSERT INTO equipment (name, category, rate_per_item) VALUES (?, ?, ?)'
    ).bind(name.trim(), (category || 'General').trim(), Number(rate_per_item)).run()
    return c.json({ success: true, id: result.meta.last_row_id })
  })

  // Update equipment (name, category, rate)
  app.put('/api/equipment/:id', async (c) => {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields: string[] = []
    const values: any[] = []

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name.trim()) }
    if (body.category !== undefined) { fields.push('category = ?'); values.push(body.category.trim()) }
    if (body.rate_per_item !== undefined) { fields.push('rate_per_item = ?'); values.push(Number(body.rate_per_item)) }

    if (fields.length === 0) return c.json({ error: 'No valid fields to update' }, 400)
    values.push(id)
    await DB.prepare(`UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
    return c.json({ success: true })
  })

  // Delete equipment item
  app.delete('/api/equipment/:id', async (c) => {
    const { DB } = c.env
    const id = c.req.param('id')
    await DB.prepare('DELETE FROM equipment WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  })
}
