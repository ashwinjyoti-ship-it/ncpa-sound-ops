import { Hono } from 'hono'
import type { Bindings } from './types'
import { mapVenue, mapTeamToVertical, VENUE_DEFAULTS, isManualOnlyVenue, isSuspiciousVenue } from './crew-endpoints'

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
                     'manual_flag_reason', 'requirements_updated', 'rider', 'notes', 'crew']
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
    const { csv, overwrite } = body
    if (!csv) return c.json({ error: 'csv field required' }, 400)

    // Parse full CSV with multi-line quoted cell support (RFC 4180)
    const rows = parseCSVFull(csv.trim())
    if (rows.length < 2) return c.json({ error: 'CSV must have header + data rows' }, 400)

    const headers = rows[0].map((h: string) => h.toLowerCase().trim().replace(/\s+/g, '_'))

    // If overwrite=true, detect months present in the CSV and delete all existing events for those months
    if (overwrite) {
      const monthsInCSV = new Set<string>()
      const dateIdx = headers.indexOf('date') !== -1 ? headers.indexOf('date') : headers.indexOf('event_date')
      if (dateIdx !== -1) {
        for (let i = 1; i < rows.length; i++) {
          const raw = (rows[i][dateIdx] || '').trim()
          const m = raw.match(/^(\d{4}-\d{2})/) || raw.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{4})$/)
          if (m) {
            if (raw.match(/^\d{4}-\d{2}/)) {
              monthsInCSV.add(raw.substring(0, 7))
            } else {
              const sep = raw.includes('/') ? '/' : '-'
              const parts = raw.split(sep)
              if (parts.length === 3) monthsInCSV.add(`${parts[2]}-${parts[1].padStart(2,'0')}`)
            }
          }
        }
      }
      for (const month of monthsInCSV) {
        await DB.prepare('DELETE FROM events WHERE event_date LIKE ?').bind(`${month}%`).run()
      }
    }
    const imported: string[] = []
    const skipped: string[] = []
    const errors: string[] = []
    // Generate a batch_id for this import so events appear in Crew Automation
    const batchId = `import_${Date.now()}`

    for (let i = 1; i < rows.length; i++) {
      const rowArr = rows[i]
      if (rowArr.every((v: string) => !v.trim())) continue
      try {
        const values = rowArr
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
        const crew = row['crew'] || ''

        // Deduplicate check: TRIM + LOWER so whitespace/case variations don't create false misses
        const existing = await DB.prepare(
          'SELECT id FROM events WHERE event_date = ? AND LOWER(TRIM(program)) = LOWER(TRIM(?)) LIMIT 1'
        ).bind(eventDate, program).first() as any

        if (existing) {
          await DB.prepare(
            `UPDATE events SET venue=?, team=?, sound_requirements=?, call_time=?, crew=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).bind(venue, team, soundReq, callTime, crew, existing.id).run()
          skipped.push(`Row ${i + 1}: updated existing (${eventDate} ${program})`)
        } else {
          const { mapped: venueNorm, isMultiVenue } = mapVenue(venue)
          const vertical = mapTeamToVertical(team)
          const manualCheck = isManualOnlyVenue(venue)
          const suspicious = isSuspiciousVenue(venue)
          const needsManual = manualCheck.manual || isMultiVenue || suspicious ? 1 : 0
          const manualReason = suspicious ? (manualCheck.reason ? manualCheck.reason + '; Suspicious venue' : 'Suspicious venue')
            : (isMultiVenue ? 'Multi-venue event' : manualCheck.reason)
          const stageCrew = suspicious ? 1 : (needsManual ? 0 : (VENUE_DEFAULTS[venueNorm] || 1))
          await DB.prepare(
            `INSERT INTO events (batch_id, event_date, program, venue, venue_normalized, team, vertical, sound_requirements, call_time, crew, stage_crew_needed, needs_manual_review, manual_flag_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(batchId, eventDate, program, venue, venueNorm, team, vertical, soundReq, callTime, crew, stageCrew, needsManual, manualReason || null).run()
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

  // Deduplicate events — keep the row with the most data for each date+program+venue
  app.post('/api/events/deduplicate', async (c) => {
    const { DB } = c.env
    // Find duplicate groups (same date + TRIM+LOWER program + TRIM+LOWER venue)
    const dupes = await DB.prepare(`
      SELECT event_date, LOWER(TRIM(program)) as prog, LOWER(TRIM(venue)) as ven,
             COUNT(*) as cnt, MAX(id) as keep_id
      FROM events
      GROUP BY event_date, LOWER(TRIM(program)), LOWER(TRIM(venue))
      HAVING cnt > 1
    `).all()

    let deleted = 0
    for (const d of (dupes.results as any[])) {
      // Copy rider/notes/crew/sound_requirements from any sibling that has them to the kept row
      await DB.prepare(`
        UPDATE events SET
          sound_requirements = COALESCE(NULLIF((SELECT sound_requirements FROM events WHERE id=? AND sound_requirements != ''), ''),
            (SELECT sound_requirements FROM events WHERE event_date=? AND LOWER(TRIM(program))=? AND LOWER(TRIM(venue))=? AND sound_requirements != '' LIMIT 1)),
          call_time = COALESCE(NULLIF((SELECT call_time FROM events WHERE id=? AND call_time != ''), ''),
            (SELECT call_time FROM events WHERE event_date=? AND LOWER(TRIM(program))=? AND LOWER(TRIM(venue))=? AND call_time != '' LIMIT 1)),
          crew = COALESCE(NULLIF((SELECT crew FROM events WHERE id=? AND crew != ''), ''),
            (SELECT crew FROM events WHERE event_date=? AND LOWER(TRIM(program))=? AND LOWER(TRIM(venue))=? AND crew != '' LIMIT 1))
        WHERE id=?
      `).bind(
        d.keep_id, d.event_date, d.prog, d.ven,
        d.keep_id, d.event_date, d.prog, d.ven,
        d.keep_id, d.event_date, d.prog, d.ven,
        d.keep_id
      ).run()

      // Delete the duplicates (keep only max id)
      const result = await DB.prepare(`
        DELETE FROM events
        WHERE event_date=? AND LOWER(TRIM(program))=? AND LOWER(TRIM(venue))=? AND id != ?
      `).bind(d.event_date, d.prog, d.ven, d.keep_id).run()
      deleted += result.meta.changes || 0
    }

    return c.json({ success: true, deleted, groups: dupes.results.length })
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

// Full RFC 4180 CSV parser — handles multi-line quoted cells
function parseCSVFull(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < csv.length) {
    const ch = csv[i]
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { field += '"'; i += 2; continue } // escaped quote
        inQuotes = false; i++; continue
      }
      field += ch; i++
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ',') { row.push(field.trim()); field = ''; i++; continue }
      if (ch === '\r' && csv[i + 1] === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i += 2; continue }
      if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i++; continue }
      field += ch; i++
    }
  }
  row.push(field.trim())
  if (row.some(v => v)) rows.push(row)
  return rows
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
