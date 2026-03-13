import { Hono } from 'hono'
import type { Bindings } from './types'

export function setupEventsEndpoints(app: Hono<{ Bindings: Bindings }>) {

  // Get events by month (YYYY-MM) or recent
  app.get('/api/events', async (c) => {
    const { DB } = c.env
    const month = c.req.query('month')
    const id = c.req.query('id')

    if (id) {
      const row = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
      return c.json(row)
    }
    if (month) {
      const results = await DB.prepare(
        'SELECT * FROM events WHERE event_date LIKE ? ORDER BY event_date, program'
      ).bind(`${month}%`).all()
      return c.json(results.results)
    }
    // No filter: return distinct months available
    const months = await DB.prepare(
      "SELECT DISTINCT substr(event_date,1,7) as month, COUNT(*) as count FROM events GROUP BY month ORDER BY month DESC"
    ).all()
    return c.json(months.results)
  })

  // Create single event
  app.post('/api/events', async (c) => {
    const { DB } = c.env
    const { event_date, program, venue, team, sound_requirements, call_time } = await c.req.json()
    if (!event_date || !program || !venue) {
      return c.json({ error: 'event_date, program, venue are required' }, 400)
    }
    const result = await DB.prepare(
      `INSERT INTO events (event_date, program, venue, team, sound_requirements, call_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(event_date, program, venue, team || '', sound_requirements || '', call_time || '').run()
    return c.json({ success: true, id: result.meta.last_row_id })
  })

  // Update event fields (sound_requirements, call_time, etc.)
  app.put('/api/events/:id', async (c) => {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()

    const allowed = ['sound_requirements', 'call_time', 'venue', 'team', 'program',
                     'event_date', 'stage_crew_needed', 'needs_manual_review',
                     'manual_flag_reason', 'requirements_updated', 'rider', 'notes']
    const fields: string[] = []
    const values: any[] = []

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(body[key])
      }
    }
    if (fields.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    await DB.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
    return c.json({ success: true })
  })

  // Delete event
  app.delete('/api/events/:id', async (c) => {
    const { DB } = c.env
    const id = c.req.param('id')
    await DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  })

  // CSV Import — for month-by-month migration from old app
  // Accepts JSON body: { csv: "...", source?: "ncpa-sound-manager" }
  // CSV columns: Date, Program, Venue, Team, Sound Requirements, Call Time, Crew (optional)
  app.post('/api/events/import/csv', async (c) => {
    const { DB } = c.env
    const body = await c.req.json()
    const { csv } = body
    if (!csv) return c.json({ error: 'csv field required' }, 400)

    const lines = csv.trim().split('\n')
    if (lines.length < 2) return c.json({ error: 'CSV must have header + data rows' }, 400)

    const headers = parseCSVLine(lines[0]).map((h: string) => h.toLowerCase().trim().replace(/\s+/g, '_'))
    const imported: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      try {
        const values = parseCSVLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h: string, idx: number) => { row[h] = (values[idx] || '').trim() })

        const dateRaw = row['date'] || row['event_date'] || ''
        const program = row['program'] || row['event'] || row['name'] || row['programme'] || ''
        const venue = row['venue'] || ''

        if (!dateRaw || !program || !venue) {
          skipped.push(`Row ${i + 1}: missing date/program/venue`)
          continue
        }

        // Normalize date formats: DD-MM-YYYY, DD/MM/YYYY → YYYY-MM-DD
        let eventDate = dateRaw
        if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(eventDate)) {
          const sep = eventDate.includes('/') ? '/' : '-'
          const parts = eventDate.split(sep)
          eventDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
        } else if (/^\d{1,2} \w+ \d{4}$/.test(eventDate)) {
          // "12 January 2025" format
          const d = new Date(eventDate)
          if (!isNaN(d.getTime())) {
            eventDate = d.toISOString().split('T')[0]
          }
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
          errors.push(`Row ${i + 1}: cannot parse date "${dateRaw}"`)
          continue
        }

        const team = row['team'] || ''
        const soundReq = row['sound_requirements'] || row['sound requirements'] || ''
        const callTime = row['call_time'] || row['call time'] || ''

        // Check for existing event; preserve rider + notes on re-import
        const existing = await DB.prepare(
          'SELECT id FROM events WHERE event_date = ? AND program = ? LIMIT 1'
        ).bind(eventDate, program).first() as any

        if (existing) {
          await DB.prepare(
            `UPDATE events SET venue=?, team=?, sound_requirements=?, call_time=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).bind(venue, team, soundReq, callTime, existing.id).run()
          skipped.push(`Row ${i + 1}: updated existing (${eventDate} ${program})`)
        } else {
          await DB.prepare(
            `INSERT INTO events (event_date, program, venue, team, sound_requirements, call_time)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(eventDate, program, venue, team, soundReq, callTime).run()
          imported.push(`${eventDate} — ${program}`)
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`)
      }
    }

    return c.json({
      success: true,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { imported, skipped, errors }
    })
  })

  // Export events as CSV for a given month
  app.get('/api/events/export/csv', async (c) => {
    const { DB } = c.env
    const month = c.req.query('month')

    let results
    if (month) {
      results = await DB.prepare(
        'SELECT * FROM events WHERE event_date LIKE ? ORDER BY event_date, program'
      ).bind(`${month}%`).all()
    } else {
      results = await DB.prepare(
        'SELECT * FROM events ORDER BY event_date, program'
      ).all()
    }

    const esc = (val: any) => {
      const s = String(val ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    let csv = 'Date,Program,Venue,Team,Sound Requirements,Call Time,Rider,Notes\n'
    for (const e of results.results as any[]) {
      csv += [e.event_date, esc(e.program), esc(e.venue), esc(e.team),
              esc(e.sound_requirements), esc(e.call_time),
              esc(e.rider), esc(e.notes)].join(',') + '\n'
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="events_${month || 'all'}.csv"`
      }
    })
  })

  // Export events as iCalendar (.ics) for a given month
  app.get('/api/events/export/ical', async (c) => {
    const { DB } = c.env
    const month = c.req.query('month')

    let results
    if (month) {
      results = await DB.prepare(
        'SELECT * FROM events WHERE event_date LIKE ? ORDER BY event_date, program'
      ).bind(`${month}%`).all()
    } else {
      results = await DB.prepare(
        'SELECT * FROM events ORDER BY event_date, program'
      ).all()
    }

    const escape = (s: string) => s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n')
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NCPA Sound Ops//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ].join('\r\n')

    for (const e of results.results as any[]) {
      const dtstart = (e.event_date as string).replace(/-/g, '')
      const summary = escape(e.program || '')
      const location = escape(e.venue || '')
      const desc = [
        e.team ? `Team: ${e.team}` : '',
        e.sound_requirements ? `Sound: ${e.sound_requirements}` : '',
        e.call_time ? `Call time: ${e.call_time}` : ''
      ].filter(Boolean).join('\\n')

      ics += '\r\n' + [
        'BEGIN:VEVENT',
        `UID:ncpa-${e.id}@ncpa-sound-ops`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtstart}`,
        `SUMMARY:${summary}`,
        location ? `LOCATION:${location}` : '',
        desc ? `DESCRIPTION:${desc}` : '',
        'END:VEVENT',
      ].filter(Boolean).join('\r\n')
    }

    ics += '\r\nEND:VCALENDAR'

    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="ncpa_events_${month || 'all'}.ics"`
      }
    })
  })
}

// RFC 4180 compliant CSV line parser
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}
