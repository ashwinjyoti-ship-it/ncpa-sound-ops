import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Env } from './types'
import { handleRAGQuery } from './rag-endpoint'
import { generateEventEmbedding } from './rag-utils'
import { backfillEmbeddings } from './backfill-embeddings'
import { 
  setupFilteringEndpoints,
  setupConflictDetection,
  setupBulkAssignment,
  setupDashboardEndpoints,
  setupExportEndpoints
} from './v41-endpoints'
import { setupCrewAssignmentEngine } from './crew-assignment-engine'
import { setupAuthEndpoints } from './auth-endpoints'
import { setupCrewStatsEndpoints } from './crew-stats-endpoints'

type Bindings = {
  DB: D1Database;
  AI: any;
  VECTORIZE: any; // Vectorize enabled for semantic search
  ANTHROPIC_API_KEY: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes (Safari compatibility)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
  credentials: false
}))

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// ============================================
// API ROUTES
// ============================================

// Get all events
app.get('/api/events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM events ORDER BY event_date ASC
    `).all()
    
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Get events by date range (for calendar view)
app.get('/api/events/range', async (c) => {
  try {
    const startDate = c.req.query('start')
    const endDate = c.req.query('end')
    
    if (!startDate || !endDate) {
      return c.json({ success: false, error: 'Start and end dates required' }, 400)
    }
    
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM events 
      WHERE event_date >= ? AND event_date <= ?
      ORDER BY event_date ASC
    `).bind(startDate, endDate).all()
    
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Search events (MUST be before /:id route)
app.get('/api/events/search', async (c) => {
  try {
    const query = c.req.query('q')
    
    if (!query) {
      return c.json({ success: false, error: 'Search query required' }, 400)
    }
    
    const searchTerm = `%${query}%`
    
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM events 
      WHERE program LIKE ? 
         OR venue LIKE ? 
         OR team LIKE ?
         OR crew LIKE ?
         OR sound_requirements LIKE ?
      ORDER BY event_date DESC
      LIMIT 50
    `).bind(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm).all()
    
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// GOOGLE SHEETS AUTO-SYNC: CSV EXPORT ENDPOINT
// ============================================
// Permanent URL for Google Sheets IMPORTDATA() function
// Usage in Google Sheets: =IMPORTDATA("https://ncpa-sound.pages.dev/api/export/latest-csv")
// Auto-refreshes every hour
app.get('/api/export/latest-csv', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT 
        event_date as "Date",
        program as "Program",
        venue as "Venue",
        team as "Team",
        crew as "Crew",
        sound_requirements as "Sound Requirements",
        call_time as "Call Time",
        status as "Status"
      FROM events 
      ORDER BY event_date ASC
    `).all()
    
    if (!results || results.length === 0) {
      return new Response('Date,Program,Venue,Team,Crew,Sound Requirements,Call Time,Status\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'inline; filename="ncpa-events-latest.csv"',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }
    
    // Helper to escape CSV values
    const escapeCSV = (val: any): string => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }
    
    // Build CSV header
    const headers = ['Date', 'Program', 'Venue', 'Team', 'Crew', 'Sound Requirements', 'Call Time', 'Status']
    const csvRows = [headers.join(',')]
    
    // Add data rows
    results.forEach((row: any) => {
      const values = [
        escapeCSV(row.Date),
        escapeCSV(row.Program),
        escapeCSV(row.Venue),
        escapeCSV(row.Team),
        escapeCSV(row.Crew),
        escapeCSV(row['Sound Requirements']),
        escapeCSV(row['Call Time']),
        escapeCSV(row.Status || 'confirmed')
      ]
      csvRows.push(values.join(','))
    })
    
    const csv = csvRows.join('\n')
    
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="ncpa-events-latest.csv"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// MONTHLY CSV EXPORT (Manual month selection)
// ============================================
// For early month preparation (e.g., upload Jan data in Dec, populate sheet in Dec)
// Usage: =IMPORTDATA("https://ncpa-sound.pages.dev/api/export/csv?month=2026-01")
// Column order: Date, Crew, Program, Venue, Team, Sound Requirements, Call Time
app.get('/api/export/csv', async (c) => {
  try {
    const month = c.req.query('month') // Format: YYYY-MM (e.g., "2026-01")
    
    if (!month) {
      return c.json({ 
        success: false, 
        error: 'Month parameter required. Use: ?month=YYYY-MM (e.g., ?month=2026-01)' 
      }, 400)
    }
    
    // Validate format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ 
        success: false, 
        error: 'Invalid month format. Use: YYYY-MM (e.g., 2026-01)' 
      }, 400)
    }
    
    const { results } = await c.env.DB.prepare(`
      SELECT 
        event_date as "Date",
        crew as "Crew",
        program as "Program",
        venue as "Venue",
        team as "Team",
        sound_requirements as "Sound Requirements",
        call_time as "Call Time"
      FROM events 
      WHERE strftime('%Y-%m', event_date) = ?
      ORDER BY event_date ASC
    `).bind(month).all()
    
    // Helper to escape CSV values
    const escapeCSV = (val: any): string => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }
    
    // Build CSV with custom column order
    const headers = ['Date', 'Crew', 'Program', 'Venue', 'Team', 'Sound Requirements', 'Call Time']
    const csvRows = [headers.join(',')]
    
    // Add data rows
    results.forEach((row: any) => {
      // Format date as DD/MM/YYYY (zero-padded)
      // Google Sheets will display this as plain text without converting to serial numbers
      let formattedDate = row.Date
      if (row.Date) {
        const dateMatch = row.Date.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (dateMatch) {
          const [, year, month, day] = dateMatch
          // Simple DD/MM/YYYY format (e.g., 02/12/2025)
          formattedDate = `${day}/${month}/${year}`
        }
      }
      
      const values = [
        escapeCSV(formattedDate), // Escape for CSV safety
        escapeCSV(row.Crew),
        escapeCSV(row.Program),
        escapeCSV(row.Venue),
        escapeCSV(row.Team),
        escapeCSV(row['Sound Requirements']),
        escapeCSV(row['Call Time'])
      ]
      csvRows.push(values.join(','))
    })
    
    const csv = csvRows.join('\n')
    
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `inline; filename="ncpa-events-${month}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// V4.1 ENHANCED API ENDPOINTS (Must be before /:id catch-all route)
// ============================================
setupFilteringEndpoints(app)
setupConflictDetection(app)
setupBulkAssignment(app)
setupDashboardEndpoints(app)
setupExportEndpoints(app)
setupCrewAssignmentEngine(app)
setupAuthEndpoints(app)
setupCrewStatsEndpoints(app)

// Get single event (This must be AFTER specific routes like /filter-options)
app.get('/api/events/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare(`
      SELECT * FROM events WHERE id = ?
    `).bind(id).first()
    
    if (!result) {
      return c.json({ success: false, error: 'Event not found' }, 404)
    }
    
    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Create new event
app.post('/api/events', async (c) => {
  try {
    const body = await c.req.json()
    const { event_date, program, venue, team, sound_requirements, call_time, crew } = body
    
    if (!event_date || !program || !venue) {
      return c.json({ success: false, error: 'Date, program, and venue are required' }, 400)
    }
    
    // Check if sound_requirements is filled
    const requirements_updated = sound_requirements && sound_requirements.trim() !== '' ? 1 : 0
    
    const result = await c.env.DB.prepare(`
      INSERT INTO events (event_date, program, venue, team, sound_requirements, call_time, crew, requirements_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event_date,
      program,
      venue,
      team || null,
      sound_requirements || null,
      call_time || null,
      crew || null,
      requirements_updated
    ).run()
    
    const eventId = result.meta.last_row_id
    
    // Generate embedding for semantic search (Version 4.0)
    try {
      if (c.env.AI && c.env.VECTORIZE) {
        const event = { id: eventId, event_date, program, venue, team, sound_requirements, call_time, crew, created_at: new Date().toISOString() }
        const { text, vector, metadata } = await generateEventEmbedding(event, c.env.AI)
        
        // Store in Vectorize
        await c.env.VECTORIZE.insert([{
          id: `event-${eventId}`,
          values: vector,
          metadata
        }])
        
        // Store embedding metadata in DB
        await c.env.DB.prepare(`
          INSERT INTO event_embeddings (event_id, embedding_text, metadata_json, vector_id)
          VALUES (?, ?, ?, ?)
        `).bind(eventId, text, JSON.stringify(metadata), `event-${eventId}`).run()
        
        // Update event with embedding_id
        await c.env.DB.prepare(`
          UPDATE events SET embedding_id = ? WHERE id = ?
        `).bind(`event-${eventId}`, eventId).run()
        
        console.log(`✅ Generated embedding for event ${eventId}`)
      }
    } catch (embError) {
      console.warn('⚠️ Embedding generation failed (non-critical):', embError)
    }
    
    return c.json({ 
      success: true, 
      data: { 
        id: eventId,
        event_date,
        program,
        venue,
        team,
        sound_requirements,
        call_time,
        crew,
        requirements_updated
      }
    }, 201)
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Update event
app.put('/api/events/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { event_date, program, venue, team, sound_requirements, call_time, crew } = body
    
    // Check if sound_requirements is filled
    const requirements_updated = sound_requirements && sound_requirements.trim() !== '' ? 1 : 0
    
    await c.env.DB.prepare(`
      UPDATE events 
      SET event_date = ?,
          program = ?,
          venue = ?,
          team = ?,
          sound_requirements = ?,
          call_time = ?,
          crew = ?,
          requirements_updated = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      event_date,
      program,
      venue,
      team || null,
      sound_requirements || null,
      call_time || null,
      crew || null,
      requirements_updated,
      id
    ).run()
    
    return c.json({ success: true, message: 'Event updated successfully' })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Delete event
app.delete('/api/events/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    await c.env.DB.prepare(`
      DELETE FROM events WHERE id = ?
    `).bind(id).run()
    
    return c.json({ success: true, message: 'Event deleted successfully' })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Bulk delete events by date range
app.post('/api/events/bulk-delete', async (c) => {
  try {
    const body = await c.req.json()
    const { month, year } = body
    
    if (!month || !year) {
      return c.json({ success: false, error: 'Month and year are required' }, 400)
    }
    
    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate() // Last day of month
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // Count events first
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM events 
      WHERE event_date >= ? AND event_date <= ?
    `).bind(startDate, endDate).first()
    
    const count = countResult?.count || 0
    
    if (count === 0) {
      return c.json({ success: true, deleted: 0, message: 'No events found for this month' })
    }
    
    // Delete events
    await c.env.DB.prepare(`
      DELETE FROM events 
      WHERE event_date >= ? AND event_date <= ?
    `).bind(startDate, endDate).run()
    
    return c.json({ 
      success: true, 
      deleted: count,
      message: `Deleted ${count} events from ${startDate} to ${endDate}` 
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Bulk upload events (for CSV/Word import with duplicate detection)
app.post('/api/events/bulk', async (c) => {
  try {
    const body = await c.req.json()
    const { events } = body
    
    if (!Array.isArray(events) || events.length === 0) {
      return c.json({ success: false, error: 'Events array is required' }, 400)
    }
    
    // Track results and skipped duplicates
    const inserted = []
    const skipped = []
    const invalid = []
    
    for (const event of events) {
      const { event_date, program, venue, team, sound_requirements, call_time, crew } = event
      
      // Validate required fields
      if (!event_date || !program || !venue) {
        invalid.push({ ...event, reason: 'Missing required fields (date, program, or venue)' })
        continue
      }
      
      // Check for duplicate: same date + program + venue
      // This prevents re-importing events that already exist (from manual entry or previous imports)
      const existing = await c.env.DB.prepare(`
        SELECT id FROM events 
        WHERE event_date = ? AND program = ? AND venue = ?
        LIMIT 1
      `).bind(event_date, program, venue).first()
      
      if (existing) {
        // Duplicate found - skip insertion to preserve existing data
        skipped.push({ 
          ...event, 
          reason: 'Duplicate event already exists',
          existing_id: existing.id 
        })
        continue
      }
      
      // Not a duplicate - insert new event
      const requirements_updated = sound_requirements && sound_requirements.trim() !== '' ? 1 : 0
      
      const result = await c.env.DB.prepare(`
        INSERT INTO events (event_date, program, venue, team, sound_requirements, call_time, crew, requirements_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        event_date,
        program,
        venue,
        team || null,
        sound_requirements || null,
        call_time || null,
        crew || null,
        requirements_updated
      ).run()
      
      inserted.push({ id: result.meta.last_row_id, ...event })
    }
    
    // Build detailed response message
    let message = `${inserted.length} events uploaded successfully`
    if (skipped.length > 0) {
      message += `, ${skipped.length} duplicates skipped`
    }
    if (invalid.length > 0) {
      message += `, ${invalid.length} invalid entries ignored`
    }
    
    return c.json({ 
      success: true, 
      message,
      data: inserted,
      skipped: skipped.length > 0 ? skipped : undefined,
      invalid: invalid.length > 0 ? invalid : undefined,
      stats: {
        total_processed: events.length,
        inserted: inserted.length,
        skipped: skipped.length,
        invalid: invalid.length
      }
    }, 201)
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Analytics endpoint for AI queries
app.get('/api/analytics/stats', async (c) => {
  try {
    // Get date range from query (default to last 6 months)
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    const start = c.req.query('start') || startDate
    const end = c.req.query('end') || endDate
    
    // Total events count
    const totalResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM events
      WHERE event_date >= ? AND event_date <= ?
    `).bind(start, end).first()
    
    // Events by venue
    const venueStats = await c.env.DB.prepare(`
      SELECT venue, COUNT(*) as count 
      FROM events
      WHERE event_date >= ? AND event_date <= ?
      GROUP BY venue
      ORDER BY count DESC
    `).bind(start, end).all()
    
    // Events by crew
    const crewStats = await c.env.DB.prepare(`
      SELECT crew, COUNT(*) as count 
      FROM events
      WHERE crew IS NOT NULL AND crew != '' AND event_date >= ? AND event_date <= ?
      GROUP BY crew
      ORDER BY count DESC
    `).bind(start, end).all()
    
    return c.json({ 
      success: true, 
      data: {
        total: totalResult?.total || 0,
        venueStats: venueStats.results || [],
        crewStats: crewStats.results || []
      }
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// INTENT CLASSIFIER - Analyzes query intent
// ============================================
function classifyIntent(query: string, pastContext: any[]) {
  const lowerQuery = query.toLowerCase()
  
  // Extract learned preferences from past context
  const learnedPreferences: any[] = []
  pastContext.forEach(ctx => {
    if (ctx.context_data) {
      try {
        const data = JSON.parse(ctx.context_data)
        if (data.venues) learnedPreferences.push({ type: 'venue_preference', value: data.venues })
        if (data.time) learnedPreferences.push({ type: 'time_preference', value: data.time })
      } catch (e) {
        // Ignore parse errors
      }
    }
  })
  
  // Detect venues mentioned
  const venues = {
    jbt: lowerQuery.includes('jbt') || lowerQuery.includes('jamshed') || lowerQuery.includes('bhabha'),
    tata: lowerQuery.includes('tata') || lowerQuery.includes('tt '),
    tet: lowerQuery.includes('tet') || lowerQuery.includes('experimental'),
    all: lowerQuery.includes('all venues') || lowerQuery.includes('no events')
  }
  
  // Detect intent type
  const intentTypes = {
    availability: lowerQuery.includes('free') || lowerQuery.includes('available') || 
                  lowerQuery.includes('maintenance') || lowerQuery.includes('schedule'),
    workshop: lowerQuery.includes('workshop') || lowerQuery.includes('training'),
    eventQuery: lowerQuery.includes('show') || lowerQuery.includes('event') || 
                lowerQuery.includes('program') || lowerQuery.includes('performance'),
    crewQuery: lowerQuery.includes('crew') && !lowerQuery.includes('workshop'),
    dateQuery: lowerQuery.includes('when') || lowerQuery.includes('which date') || 
               lowerQuery.includes('what day')
  }
  
  // Determine if clarification is needed
  let needsClarification = false
  let clarificationMessage = ''
  let suggestedQueries: string[] = []
  let intentType = 'general'
  
  // Case 1: Workshop/availability query without specific venue
  if ((intentTypes.workshop || intentTypes.availability) && !venues.jbt && !venues.tata && !venues.tet && !venues.all) {
    // Check if we have learned preferences
    const venuePreference = learnedPreferences.find(p => p.type === 'venue_preference')
    
    if (venuePreference) {
      // Apply learned preference
      console.log('Applying learned venue preference:', venuePreference.value)
      venues.jbt = venuePreference.value.includes('JBT')
      venues.tata = venuePreference.value.includes('Tata')
      venues.tet = venuePreference.value.includes('TET')
      intentType = 'availability_with_learned_preference'
    } else {
      needsClarification = true
      intentType = 'ambiguous_availability'
      clarificationMessage = "I'd be happy to help you find dates! Could you clarify:\n\n1. Which venue(s) do you need? (JBT, Tata Theatre, Experimental Theatre, or all venues?)\n2. Do you need the entire venue free, or just no events scheduled?\n3. Any specific time requirements (morning, afternoon, evening)?\n\nI'll remember your preference for next time!"
      suggestedQueries = [
        'When are JBT and Tata both free in November?',
        'Days with no events in any venue in November',
        'When is Experimental Theatre available in November?'
      ]
    }
  }
  // Case 2: Multi-venue availability
  else if ((venues.jbt && venues.tata) || (venues.jbt && venues.tet) || (venues.tata && venues.tet)) {
    intentType = 'multi_venue_availability'
  }
  // Case 3: All venues free (no events at all)
  else if (venues.all || (lowerQuery.includes('no events') && lowerQuery.includes('day'))) {
    intentType = 'all_venues_free'
  }
  // Case 4: Single venue availability
  else if (venues.jbt || venues.tata || venues.tet) {
    intentType = 'single_venue_availability'
  }
  // Case 5: Event query
  else if (intentTypes.eventQuery) {
    intentType = 'event_search'
  }
  // Case 6: Crew query
  else if (intentTypes.crewQuery) {
    intentType = 'crew_search'
  }
  
  return {
    type: intentType,
    needsClarification,
    clarificationMessage,
    suggestedQueries,
    context: {
      venues,
      intentTypes,
      query: query
    },
    learnedPreferences
  }
}

// ============================================
// RAG QUERY ENDPOINT (Version 4.0 - Claude Sonnet 4 + Vectorize)
// ============================================
app.post('/api/ai/rag', handleRAGQuery)

// ============================================
// EMBEDDING BACKFILL ENDPOINT (Admin Only)
// ============================================
app.post('/api/admin/backfill-embeddings', async (c) => {
  try {
    const { batch_size } = await c.req.json().catch(() => ({ batch_size: 50 }))
    
    const result = await backfillEmbeddings(c, batch_size || 50)
    
    return c.json(result)
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Backfill failed',
      details: error.message
    }, 500)
  }
})

// AI Query endpoint - Intelligent data analysis with Claude (Legacy)
app.post('/api/ai/query', async (c) => {
  try {
    const body = await c.req.json()
    const { query, session_id } = body
    
    if (!query) {
      return c.json({ success: false, error: 'Query is required' }, 400)
    }
    
    // Generate session ID if not provided
    const sessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    // Get relevant events from the database
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const sixMonthsAhead = new Date()
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6)
    
    const allEvents = await c.env.DB.prepare(`
      SELECT event_date, program, venue, crew, team 
      FROM events 
      WHERE event_date >= ? AND event_date <= ?
      ORDER BY event_date ASC
    `).bind(
      threeMonthsAgo.toISOString().split('T')[0],
      sixMonthsAhead.toISOString().split('T')[0]
    ).all()
    
    // ============================================
    // INTENT CLASSIFIER - Determines query intent
    // ============================================
    const lowerQuery = query.toLowerCase()
    
    // Check context memory for similar past queries
    const pastContext = await c.env.DB.prepare(`
      SELECT intent, context_data, resolved 
      FROM query_context 
      WHERE session_id = ? AND resolved = 1 
      ORDER BY created_at DESC 
      LIMIT 5
    `).bind(sessionId).all()
    
    // Intent classification
    const intent = classifyIntent(lowerQuery, pastContext.results)
    
    // Store query context
    await c.env.DB.prepare(`
      INSERT INTO query_context (session_id, query_text, intent, context_data, resolved)
      VALUES (?, ?, ?, ?, 0)
    `).bind(
      sessionId,
      query,
      intent.type,
      JSON.stringify(intent.context)
    ).run()
    
    // Handle ambiguous queries using intent classification
    if (intent.needsClarification) {
      // Store clarification request
      await c.env.DB.prepare(`
        UPDATE query_context 
        SET context_data = ? 
        WHERE session_id = ? AND query_text = ?
      `).bind(
        JSON.stringify({ ...intent.context, clarification_requested: true }),
        sessionId,
        query
      ).run()
      
      return c.json({
        success: true,
        query: query,
        session_id: sessionId,
        data: [],
        clarification_needed: true,
        question: intent.clarificationMessage,
        intent: intent.type,
        suggested_queries: intent.suggestedQueries,
        method: 'Clarification Request'
      })
    }
    
    // If we have context from learning, apply it
    if (intent.learnedPreferences && intent.learnedPreferences.length > 0) {
      console.log('Applying learned preferences:', intent.learnedPreferences)
    }
    
    // Smart detection: Handle "both venues free" or "JBT and Tata" queries directly in code
    // Also apply learned venue preferences
    let hasJBT = lowerQuery.includes('jbt') || lowerQuery.includes('jamshed') || lowerQuery.includes('bhabha')
    let hasTata = lowerQuery.includes('tata')
    let hasAvailability = lowerQuery.includes('free') || lowerQuery.includes('available') || lowerQuery.includes('maintenance') || lowerQuery.includes('schedule') || lowerQuery.includes('workshop')
    
    // Apply learned preferences if available
    if (intent.type === 'availability_with_learned_preference' && intent.context.venues) {
      hasJBT = intent.context.venues.jbt
      hasTata = intent.context.venues.tata
      hasAvailability = true  // Force availability check when using learned preferences
      console.log('Applied learned venue preferences: JBT=', hasJBT, 'Tata=', hasTata)
    }
    
    const isBothFreeQuery = hasJBT && hasTata && hasAvailability
    
    if (isBothFreeQuery) {
      // Extract month from query (default to current month if not specified)
      const monthMatch = query.match(/november|december|january|february|march|april|may|june|july|august|september|october/i)
      const targetMonth = monthMatch ? monthMatch[0].toLowerCase() : null
      
      // Generate all dates in target month
      const today = new Date()
      let year = today.getFullYear()
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      const monthIndex = targetMonth ? monthNames.indexOf(targetMonth) : today.getMonth()
      
      // If target month is in the past, use next year
      if (monthIndex < today.getMonth()) {
        year++
      }
      
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      const allDatesInMonth = []
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day)
        allDatesInMonth.push(date.toISOString().split('T')[0])
      }
      
      // Filter events for JBT and Tata in that month
      // Note: Venue formats can be "JBT", "JBT 5pm", "Jamshed Bhabha Theatre", etc.
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
      
      const jbtEvents = allEvents.results.filter((e: any) => {
        const venue = e.venue?.toLowerCase() || ''
        const dateMatches = e.event_date.startsWith(monthPrefix)
        // Match: "JBT", "JBT 5pm", "Jamshed Bhabha", etc.
        // But NOT: "TET & JBT Museum" (that's TET, not JBT)
        const isJBT = (venue.startsWith('jbt') || venue.includes('jamshed') || venue.includes('bhabha')) &&
                      !venue.startsWith('tet')
        return isJBT && dateMatches
      })
      
      const tataEvents = allEvents.results.filter((e: any) => {
        const venue = e.venue?.toLowerCase() || ''
        const dateMatches = e.event_date.startsWith(monthPrefix)
        // Match: "TT", "TT 6pm", "Tata Theatre", etc.
        const isTata = venue.startsWith('tt') || venue.includes('tata theatre')
        return isTata && dateMatches
      })
      
      // Find dates where both are free
      const jbtDates = new Set(jbtEvents.map((e: any) => e.event_date))
      const tataDates = new Set(tataEvents.map((e: any) => e.event_date))
      
      const freeDates = allDatesInMonth
        .filter(date => !jbtDates.has(date) && !tataDates.has(date))
        .map(date => ({
          event_date: date,
          program: 'Both venues free for maintenance',
          venue: 'JBT & Tata Theatre',
          crew: '',
          team: ''
        }))
      
      // Mark query as resolved and store learned context
      await c.env.DB.prepare(`
        UPDATE query_context 
        SET resolved = 1, context_data = ?
        WHERE session_id = ? AND query_text = ?
      `).bind(
        JSON.stringify({
          venues: ['JBT', 'Tata'],
          intent: 'multi_venue_availability',
          successful: true,
          result_count: freeDates.length
        }),
        sessionId,
        query
      ).run()
      
      return c.json({
        success: true,
        query: query,
        session_id: sessionId,
        data: freeDates,
        explanation: `Code analysis found ${freeDates.length} dates where both venues are free`,
        method: 'Smart Code Analysis',
        learned: true
      })
    }
    
    // Handle "completely free" or "no events" queries (all venues)
    const isCompletelyFreeQuery = (lowerQuery.includes('no events') || lowerQuery.includes('completely free') || 
                                   lowerQuery.includes('all venues') || lowerQuery.includes('no shows')) &&
                                   (lowerQuery.includes('day') || lowerQuery.includes('date'))
    
    if (isCompletelyFreeQuery) {
      // Extract month from query
      const monthMatch = query.match(/november|december|january|february|march|april|may|june|july|august|september|october/i)
      const targetMonth = monthMatch ? monthMatch[0].toLowerCase() : null
      
      const today = new Date()
      let year = today.getFullYear()
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      const monthIndex = targetMonth ? monthNames.indexOf(targetMonth) : today.getMonth()
      
      if (monthIndex < today.getMonth()) {
        year++
      }
      
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
      
      // Get all event dates in the month
      const eventDates = new Set(
        allEvents.results
          .filter((e: any) => e.event_date.startsWith(monthPrefix))
          .map((e: any) => e.event_date)
      )
      
      // Find dates with no events at all
      const completelyFreeDates = []
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day).toISOString().split('T')[0]
        if (!eventDates.has(date)) {
          completelyFreeDates.push({
            event_date: date,
            program: 'No events scheduled - Perfect for crew workshop',
            venue: 'All venues available',
            crew: '',
            team: ''
          })
        }
      }
      
      // Mark query as resolved and store learned context
      await c.env.DB.prepare(`
        UPDATE query_context 
        SET resolved = 1, context_data = ?
        WHERE session_id = ? AND query_text = ?
      `).bind(
        JSON.stringify({
          venues: ['All'],
          intent: 'all_venues_free',
          successful: true,
          result_count: completelyFreeDates.length
        }),
        sessionId,
        query
      ).run()
      
      return c.json({
        success: true,
        query: query,
        session_id: sessionId,
        data: completelyFreeDates,
        explanation: `Found ${completelyFreeDates.length} days with no events scheduled in any venue`,
        method: 'Smart Code Analysis',
        learned: true
      })
    }
    
    // Handle single venue availability queries
    const hasTET = lowerQuery.includes('tet') || lowerQuery.includes('experimental')
    const singleVenueQuery = (hasJBT && !hasTata && !hasTET) || 
                             (!hasJBT && hasTata && !hasTET) || 
                             (!hasJBT && !hasTata && hasTET)
    
    if (singleVenueQuery && hasAvailability) {
      // Determine which venue
      let venueName = ''
      let venueFilter: (venue: string) => boolean
      
      if (hasJBT) {
        venueName = 'JBT'
        venueFilter = (v: string) => {
          const lv = v.toLowerCase()
          return (lv.startsWith('jbt') || lv.includes('jamshed') || lv.includes('bhabha')) && !lv.startsWith('tet')
        }
      } else if (hasTata) {
        venueName = 'Tata Theatre'
        venueFilter = (v: string) => {
          const lv = v.toLowerCase()
          return lv.startsWith('tt') || lv.includes('tata theatre')
        }
      } else if (hasTET) {
        venueName = 'Experimental Theatre'
        venueFilter = (v: string) => {
          const lv = v.toLowerCase()
          return lv.startsWith('tet') || lv.includes('experimental')
        }
      } else {
        // Should not reach here
        venueFilter = () => false
      }
      
      // Extract month
      const monthMatch = query.match(/november|december|january|february|march|april|may|june|july|august|september|october/i)
      const targetMonth = monthMatch ? monthMatch[0].toLowerCase() : null
      
      const today = new Date()
      let year = today.getFullYear()
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      const monthIndex = targetMonth ? monthNames.indexOf(targetMonth) : today.getMonth()
      
      if (monthIndex < today.getMonth()) {
        year++
      }
      
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
      
      // Get events for this venue in this month
      const venueEvents = allEvents.results.filter((e: any) => {
        const dateMatches = e.event_date.startsWith(monthPrefix)
        const venueMatches = venueFilter(e.venue || '')
        return dateMatches && venueMatches
      })
      
      const eventDates = new Set(venueEvents.map((e: any) => e.event_date))
      
      // Find free dates
      const freeDates = []
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day).toISOString().split('T')[0]
        if (!eventDates.has(date)) {
          freeDates.push({
            event_date: date,
            program: `No event scheduled at ${venueName}`,
            venue: venueName,
            crew: '',
            team: ''
          })
        }
      }
      
      // Mark as resolved
      await c.env.DB.prepare(`
        UPDATE query_context 
        SET resolved = 1, context_data = ?
        WHERE session_id = ? AND query_text = ?
      `).bind(
        JSON.stringify({
          venues: [venueName],
          intent: 'single_venue_availability',
          successful: true,
          result_count: freeDates.length
        }),
        sessionId,
        query
      ).run()
      
      return c.json({
        success: true,
        query: query,
        session_id: sessionId,
        data: freeDates,
        explanation: `Found ${freeDates.length} free dates for ${venueName} in ${monthNames[monthIndex]}`,
        method: 'Smart Code Analysis',
        learned: true
      })
    }
    
    // For other queries, use AI (with minimal context)
    const today = new Date()
    const currentMonth = today.toLocaleString('default', { month: 'long' })
    const currentYear = today.getFullYear()
    const apiKey = c.env.ANTHROPIC_API_KEY
    
    // Let Claude ANALYZE the data directly, not generate SQL
    const prompt = `You are an intelligent data analyst for NCPA Sound Crew event management.

CURRENT CONTEXT:
- Today's date: ${today.toISOString().split('T')[0]}
- Current month: ${currentMonth} ${currentYear}

COMPLETE EVENT DATABASE (simplified for analysis):
${allEvents.results.map((e: any) => `${e.event_date}|${e.venue}|${e.program}`).join('\n')}

USER QUESTION: "${query}"

INSTRUCTIONS:
Analyze the complete event data above and answer the user's question intelligently.

VENUE NAME MATCHING:
- "Tata" / "Tata Theatre" / "TT" → Match any venue containing "Tata"
- "JBT" / "Jamshed Bhabha" / "Bhabha" → Match "Jamshed Bhabha Theatre"
- "Experimental" / "Exp" / "ET" → Match "Experimental Theatre"
- Be flexible with venue names (case-insensitive, partial matches)

FOR SINGLE VENUE "FREE DATES" QUESTIONS:
Example: "Which dates no events at Tata?"
1. List ALL dates in November 2025 (Nov 1-30)
2. Check which dates have events at Tata Theatre
3. Return dates that DON'T have Tata events
4. Format: [{"event_date": "2025-11-03", "program": "No event scheduled", "venue": "Tata Theatre"}]

FOR MULTIPLE VENUE "BOTH FREE" QUESTIONS:
Example: "Closest date when JBT and Tata both free?"
1. List ALL dates in November 2025
2. For each date, check if EITHER venue has an event
3. Return dates where BOTH venues are free (no JBT event AND no Tata event)
4. Sort by date (closest first)
5. Format: [{"event_date": "2025-11-03", "program": "Both venues free for maintenance", "venue": "JBT & Tata Theatre"}]

FOR REGULAR EVENT QUERIES:
Example: "Show all events at Tata" or "Events tomorrow"
1. Filter events matching the criteria
2. Return matching events from database
3. Format: [{"event_date": "...", "program": "...", "venue": "...", "crew": "..."}]

OUTPUT FORMAT:
- Return ONLY a valid JSON array, nothing else
- No markdown, no explanations, no code blocks
- Just pure JSON: [{"event_date": "...", "program": "...", "venue": "..."}]
- Include relevant fields: event_date, program, venue (and crew/team if relevant)
- Sort results by date (earliest first)

EXAMPLES:

Q: "Which dates no events at Tata?"
A: [{"event_date":"2025-11-01","program":"No event scheduled","venue":"Tata Theatre"},{"event_date":"2025-11-03","program":"No event scheduled","venue":"Tata Theatre"}]

Q: "Closest date JBT and Tata both free?"
A: [{"event_date":"2025-11-05","program":"Both venues free for maintenance","venue":"JBT & Tata Theatre"}]

Q: "Events tomorrow"
A: [{"event_date":"2025-11-02","program":"Classical Concert","venue":"Tata Theatre","crew":"Ashwin"}]

NOW ANALYZE AND RESPOND:
JSON ARRAY:`
    
    // Use Cloudflare Workers AI for fast, local processing (no external API)
    let aiResponse: string
    
    try {
      // Try Cloudflare AI first (built-in, fast, no CPU timeout)
      if (c.env.AI) {
        const aiResult = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
          prompt: prompt,
          max_tokens: 1024
        })
        aiResponse = aiResult.response || aiResult.text || JSON.stringify(aiResult)
      } else {
        // Fallback to Anthropic if AI binding not available
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        })
        
        if (!response.ok) {
          const error = await response.text()
          console.error('Anthropic API error:', error)
          return c.json({ 
            success: false, 
            error: 'Anthropic API error',
            status: response.status,
            details: error.substring(0, 500)
          }, 500)
        }
        
        const aiResult = await response.json()
        aiResponse = aiResult.content[0].text
      }
    } catch (aiError: any) {
      console.error('AI processing error:', aiError)
      return c.json({ 
        success: false, 
        error: 'AI processing failed',
        details: aiError.message
      }, 500)
    }
    
    aiResponse = aiResponse.trim()
    
    // Clean up response - remove markdown if present
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    
    console.log('AI Response:', aiResponse)
    
    // Parse the JSON array from AI
    let results = []
    try {
      // Try to extract JSON if AI added extra text
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0])
      } else {
        results = JSON.parse(aiResponse)
      }
      
      // Validate it's an array
      if (!Array.isArray(results)) {
        console.error('AI response is not an array:', results)
        return c.json({ 
          success: false, 
          error: 'AI returned invalid format',
          debug: aiResponse.substring(0, 200)
        }, 500)
      }
      
    } catch (parseError: any) {
      console.error('Failed to parse AI response:', parseError)
      console.error('Raw AI response:', aiResponse)
      return c.json({ 
        success: false, 
        error: 'AI returned unparseable data: ' + parseError.message,
        debug: aiResponse.substring(0, 200)
      }, 500)
    }
    
    // Ensure results have required fields
    results = results.map(r => ({
      event_date: r.event_date || r.date || '',
      program: r.program || r.title || 'Event',
      venue: r.venue || '',
      crew: r.crew || '',
      team: r.team || ''
    }))
    
    return c.json({ 
      success: true,
      query: query,
      data: results,
      explanation: `AI analyzed ${allEvents.results.length} events and found ${results.length} results`,
      method: c.env.AI ? 'AI Analysis (Cloudflare Llama 3.1)' : 'AI Analysis (Claude Haiku)'
    })
    
  } catch (error: any) {
    console.error('AI query error:', error)
    return c.json({ 
      success: false, 
      error: 'AI query failed',
      details: error.message,
      stack: error.stack?.substring(0, 300)
    }, 500)
  }
})

// Helper function: Parse a chunk of text with Claude
async function parseChunkWithClaude(chunk: string, contextHint: string, apiKey: string, chunkNumber: number, totalChunks: number): Promise<any[]> {
  const prompt = `You are parsing section ${chunkNumber} of ${totalChunks} from an NCPA Sound Crew event schedule document. Extract ALL events from this section and return them as a JSON array.${contextHint}

Document section:
${chunk}

Parse ALL events and extract the following fields for EACH event:
- event_date: Date in YYYY-MM-DD format (extract from "Day & Date" column or date information. USE THE MONTH AND YEAR FROM THE CONTEXT ABOVE if provided in filename)
- program: Full program/event name (from "Programme" or "Event" column)
- venue: Venue name (e.g., "Tata Theatre", "Experimental Theatre", "Jamshed Bhabha Theatre", "Little Theatre", "GDT", "TET", "LT", "JBT", "DPAG", "Stuart Liff Lib", "TT")
- team: Curator/team name if mentioned (often in brackets like [Dr.Swapno/Team], [Nooshin/Team], [Tejal/Team])
- sound_requirements: Extract ONLY sound-related requirements. Look for text blocks containing "Sound" or sound equipment. Extract: mic specifications (e.g., "2 cordless mics"), playback equipment (e.g., "laptop for recorded music"), "NCPA basic sound", sound check times, mic stand counts, monitor speaker needs. EXCLUDE: catering info, parking, ushers, lights, AC, general stage setup, non-sound requirements.
- call_time: Extract the time when sound must be ready from phrases like: "ready by [TIME]", "to be ready by [TIME]", "Sound Check at [TIME]", "sound to be ready by [TIME]", "connections to be ready by [TIME]", "calltime: Ready by [TIME]". Extract times like "9am", "9:00am", "2:00pm", "2pm". If multiple times found, use the sound-specific readiness time.
- crew: Crew member initials assigned (e.g., "AGN", "FD", "SP", "VSD", "LDPG", "NP", "SA", "BBK", "TT")

CRITICAL EXTRACTION RULES FOR SOUND REQUIREMENTS:
1. Look for lines or phrases starting with "Sound" followed by a dash, colon, or bullet point
2. Extract equipment details: mic types (cordless, lapel, foot mics), counts (e.g., "2 cordless mics"), playback devices (laptop, aux wire)
3. Include "NCPA basic sound" if mentioned
4. Capture sound-specific setup times embedded in the requirements
5. DO NOT include: catering, parking, ushers, lights, AC, cleaning schedules, non-sound staff requirements
6. If requirements say "Requirements will follow" or similar, leave sound_requirements empty

CRITICAL EXTRACTION RULES FOR CALL TIME:
1. Search for these patterns (case-insensitive):
   - "ready by [TIME]"
   - "to be ready by [TIME]"
   - "Sound Check at [TIME]"
   - "sound to be ready by [TIME]"
   - "connections to be ready by [TIME]"
   - "calltime: [TIME]"
   - "calltime: Ready by [TIME]"
2. TIME formats to extract: "9am", "9:00am", "9:00 am", "2pm", "2:00pm", "6:30pm", "12noon"
3. The call_time is when sound CREW must be ready, not the event start time
4. Normalize the time format to include AM/PM with proper spacing (e.g., "9:00 AM", "2:00 PM")

CRITICAL DATE INSTRUCTIONS:
1. Look for day names (Mon, Tue, Wed, Thu, Fri, Sat, Sun) followed by dates (Thu 4th, Fri 5th, Wed 1st, Sat 7th, etc.)
2. USE THE MONTH AND YEAR FROM THE CONTEXT provided in the filename above
3. If context says "March 2026", then "Sun 1st" becomes "2026-03-01", "Mon 2nd" becomes "2026-03-02", etc.
4. ALWAYS use the context month/year from the filename

VENUE CODE MAPPING (use full names):
- TT or TET → "Tata Theatre"
- JBT → "Jamshed Bhabha Theatre"
- GDT → "Godrej Dance Theatre"
- LT → "Little Theatre"
- DPAG → "Dilip Piramal Art Gallery"
- Experimental Theatre or Exp → "Experimental Theatre"

Return ONLY a valid JSON array, nothing else. No explanations, no markdown, just the JSON array.

CRITICAL JSON REQUIREMENTS:
- Use double quotes for all strings
- Escape any quotes inside strings with backslash
- No trailing commas
- No newlines inside string values (replace with spaces)
- If a field contains special characters, escape them properly

Example format:
[
  {
    "event_date": "2026-03-01",
    "program": "Grufalo - A Twisted Tale",
    "venue": "Tata Theatre",
    "team": "Nooshin/Team",
    "sound_requirements": "2 cordless mics, aux wire for recorded music",
    "call_time": "9:00 AM",
    "crew": "TET"
  },
  {
    "event_date": "2026-03-05",
    "program": "NCPA Nrityagurukul",
    "venue": "Tata Theatre",
    "team": "Dr.Swapno/Team",
    "sound_requirements": "2 cordless mics, laptop for recorded music",
    "call_time": "",
    "crew": "AGN"
  },
  {
    "event_date": "2026-03-06",
    "program": "Living Traditions",
    "venue": "Tata Theatre",
    "team": "Dr.Swapno/Team",
    "sound_requirements": "sound to be ready by 9:00 am",
    "call_time": "9:00 AM",
    "crew": "AGN"
  },
  {
    "event_date": "2026-03-07",
    "program": "Animal",
    "venue": "Tata Theatre",
    "team": "Nooshin/Team",
    "sound_requirements": "NCPA basic sound",
    "call_time": "2:00 PM",
    "crew": "TT"
  }
]

If no events found, return: []`
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    console.error(`Chunk ${chunkNumber} AI error:`, error)
    throw new Error(`AI parsing failed for chunk ${chunkNumber}`)
  }
  
  const aiResult = await response.json()
  let aiResponse = aiResult.content[0].text.trim()
  
  // Remove markdown code blocks if present
  aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  
  // Parse JSON response with better error handling
  try {
    // Try to find JSON array in response
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[0]
      
      // Clean up common JSON issues
      let cleanedJson = jsonStr
        // Remove trailing commas before ] or }
        .replace(/,(\s*[\]}])/g, '$1')
        // Fix unescaped newlines in strings (replace with space)
        .replace(/("[^"]*)\n([^"]*")/g, '$1 $2')
      
      return JSON.parse(cleanedJson)
    } else {
      // Try parsing directly
      return JSON.parse(aiResponse)
    }
  } catch (parseError: any) {
    console.error(`Failed to parse chunk ${chunkNumber} response:`, parseError.message)
    console.error(`Response preview:`, aiResponse.substring(0, 200))
    return []
  }
}

// Helper function: Remove duplicate events
function deduplicateEvents(events: any[]): any[] {
  const seen = new Set()
  const unique = []
  
  for (const event of events) {
    // Create unique key from date + program + venue
    const key = `${event.event_date}|${event.program}|${event.venue}`.toLowerCase()
    
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(event)
    }
  }
  
  return unique
}

// AI-powered Word document parser with chunked processing
app.post('/api/ai/parse-word', async (c) => {
  try {
    const body = await c.req.json()
    const { text, filename } = body
    
    if (!text) {
      return c.json({ success: false, error: 'Document text is required' }, 400)
    }
    
    // Get API key from environment
    const apiKey = c.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'AI service not configured' }, 500)
    }
    
    // Extract month/year context from filename if available
    let contextHint = ''
    if (filename) {
      const monthMatch = filename.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i)
      const yearMatch = filename.match(/20\d{2}/)
      if (monthMatch || yearMatch) {
        contextHint = `\n\nContext from filename: ${monthMatch?.[0] || ''} ${yearMatch?.[0] || ''}`
      }
    }
    
    console.log(`📄 Processing Word document: ${text.length} characters`)
    
    // CHUNKED PROCESSING: Split document into manageable chunks
    // Using larger chunks (18K) and smarter splitting to avoid cutting events
    const CHUNK_SIZE = 18000 // Characters per chunk (increased for better event capture)
    const chunks: string[] = []
    
    if (text.length <= CHUNK_SIZE) {
      // Small document - process in one chunk
      chunks.push(text)
    } else {
      // Large document - split intelligently at event boundaries
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        let chunkEnd = Math.min(i + CHUNK_SIZE, text.length)
        
        // If not at end of document, try to find a good split point
        if (chunkEnd < text.length) {
          // Look for a day pattern (Mon/Tue/Wed etc) in the next 500 chars
          const searchArea = text.substring(chunkEnd, Math.min(chunkEnd + 500, text.length))
          const dayMatch = searchArea.match(/\n(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}(st|nd|rd|th)/i)
          
          if (dayMatch && dayMatch.index !== undefined) {
            // Split at the start of the next event
            chunkEnd += dayMatch.index
          }
        }
        
        chunks.push(text.substring(i, chunkEnd))
      }
    }
    
    console.log(`📊 Split into ${chunks.length} chunks for processing (avg ${Math.round(text.length / chunks.length)} chars each)`)
    
    // Process each chunk with Claude
    const allEvents: any[] = []
    
    for (let i = 0; i < chunks.length; i++) {
      console.log(`🤖 Processing chunk ${i + 1}/${chunks.length}...`)
      
      try {
        const chunkEvents = await parseChunkWithClaude(
          chunks[i],
          contextHint,
          apiKey,
          i + 1,
          chunks.length
        )
        
        console.log(`✅ Chunk ${i + 1}: Found ${chunkEvents.length} events`)
        allEvents.push(...chunkEvents)
        
      } catch (chunkError: any) {
        console.error(`❌ Chunk ${i + 1} failed:`, chunkError.message)
        // Continue processing other chunks even if one fails
      }
    }
    
    // Validate and clean events
    let validEvents = allEvents.filter(event => {
      return event.event_date && event.program && event.venue
    })
    
    // Remove duplicates (events that appear in multiple chunks)
    validEvents = deduplicateEvents(validEvents)
    
    // Sort by date
    validEvents.sort((a, b) => {
      return a.event_date.localeCompare(b.event_date)
    })
    
    console.log(`✅ Successfully parsed ${validEvents.length} unique events from ${chunks.length} chunks`)
    
    return c.json({ 
      success: true,
      events: validEvents,
      message: `Found ${validEvents.length} events in document (processed in ${chunks.length} chunks)`,
      chunks: chunks.length,
      totalEvents: allEvents.length,
      uniqueEvents: validEvents.length
    })
    
  } catch (error: any) {
    console.error('Word parsing error:', error)
    return c.json({ success: false, error: error.message || 'Failed to parse document' }, 500)
  }
})

// ============================================
// FRONTEND ROUTES
// ============================================

// Minimal Safari test page with NO external dependencies
app.get('/safari-test', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Safari Test</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 40px; 
            background: #f0f0f0;
          }
          .box {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .success { color: green; font-weight: bold; }
          .error { color: red; font-weight: bold; }
        </style>
        <script>
          console.log('✅ TEST 1: JavaScript is executing');
          
          function runTests() {
            console.log('✅ TEST 2: Functions work');
            
            var result = document.getElementById('result');
            result.innerHTML = '<p class="success">✅ JavaScript is working!</p>';
            result.innerHTML += '<p>✅ DOM manipulation works</p>';
            result.innerHTML += '<p>✅ Browser: ' + navigator.userAgent + '</p>';
            
            console.log('✅ TEST 3: DOM manipulation successful');
          }
          
          window.onload = function() {
            console.log('✅ TEST 4: Window.onload fired');
            runTests();
          };
        </script>
    </head>
    <body>
        <div class="box">
            <h1>🦁 Safari Test Page</h1>
            <p>This page has NO external scripts, NO CDN, NO dependencies.</p>
            <p>If you see green checkmarks below, JavaScript is working:</p>
            <div id="result">
                <p class="error">❌ JavaScript not running (if you see this red message)</p>
            </div>
            <hr>
            <p><strong>Check Safari Console:</strong></p>
            <p>Right-click → Inspect Element → Console tab</p>
            <p>You should see messages starting with "✅ TEST"</p>
        </div>
    </body>
    </html>
  `)
})

app.get('/', (c) => {
  // Set Content Security Policy for Safari compatibility and iframe embedding
  c.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdn.sheetjs.com https://api.anthropic.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; " +
    "font-src 'self' https://cdn.jsdelivr.net data:; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.anthropic.com; " +
    "worker-src 'self' blob:; " +
    "frame-ancestors 'self' https://ncpa-sound-admin.pages.dev https://*.ncpa-sound-admin.pages.dev;"
  )
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NCPA Sound Crew - Event Schedule & Technical Dashboard</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: https:; connect-src 'self' https://api.anthropic.com;">
        <script>
          // Safari compatibility test
          console.log('🦁 Safari: Page loaded at ' + new Date().toISOString());
          console.log('🦁 Safari: User Agent:', navigator.userAgent);
          console.log('🦁 Safari: Testing JavaScript execution...');
        </script>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: #FFF8DC;
          }
          
          .tab-active {
            border-bottom: 3px solid #FF6B35;
            color: #FF6B35;
          }
          
          .event-card-green {
            background: #FFFFFF;
            border-left: 4px solid #28a745;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .event-card-peach {
            background: #FFFFFF;
            border-left: 4px solid #FF6B35;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .calendar-day {
            min-height: 120px;
            border: 1px solid #E8E8E8;
            background-color: #FFFFFF;
          }
          
          /* Mobile-optimized event cards */
          @media (max-width: 768px) {
            .calendar-day {
              min-height: 100px;
            }
            
            .event-card-green, .event-card-peach {
              font-size: 0.75rem;
              padding: 0.5rem;
              margin-bottom: 0.25rem;
            }
            
            /* Larger touch targets */
            button, .event-card-green, .event-card-peach {
              min-height: 44px;
            }
            
            /* Hide Dashboard tab on mobile */
            #dashboardTab {
              display: none !important;
            }
            
            /* More readable event text on mobile */
            .event-card-green p, .event-card-peach p {
              line-height: 1.4;
              margin-bottom: 0.25rem;
            }
            
            /* Better icon spacing on mobile */
            .event-card-green i, .event-card-peach i {
              width: 14px;
              text-align: center;
            }
          }
          
          .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.5);
          }
          
          .modal.active {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .modal-content {
            background-color: #fefefe;
            padding: 30px;
            border-radius: 12px;
            max-width: 700px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          }
          
          table th {
            position: sticky;
            top: 0;
            background-color: #FF6B35;
            color: white;
            z-index: 10;
          }
          
          .editable-cell {
            cursor: text;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          
          .editable-cell:hover {
            background-color: #f0f0f0;
          }
          
          /* Make table cells wrap text instead of expanding */
          table.table-fixed td {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }
          
          .editable-cell input,
          .editable-cell textarea {
            width: 100%;
            border: 1px solid #ddd;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
          }
          
          .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(139, 69, 19, 0.3);
            border-radius: 50%;
            border-top-color: #FF6B35;
            animation: spin 1s ease-in-out infinite;
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          /* Mobile Responsiveness */
          @media (max-width: 768px) {
            .container {
              padding: 1rem !important;
            }
            
            .flex.space-x-3, .flex.space-x-6 {
              flex-wrap: wrap;
              gap: 0.5rem;
            }
            
            #searchInput {
              width: 100% !important;
              max-width: 200px;
            }
            
            .calendar-day {
              min-height: 80px !important;
              font-size: 0.75rem;
            }
            
            .event-card-green, .event-card-peach {
              padding: 4px !important;
              margin-bottom: 4px !important;
            }
            
            table {
              font-size: 0.75rem !important;
            }
            
            .modal-content {
              width: 95% !important;
              margin: 1rem;
              max-height: 90vh !important;
            }
            
            button {
              font-size: 0.75rem !important;
              padding: 0.375rem 0.75rem !important;
            }
            
            h1 {
              font-size: 1.5rem !important;
            }
            
            h2 {
              font-size: 1.25rem !important;
            }
          }
          
          @media (max-width: 480px) {
            .grid {
              grid-template-columns: 1fr !important;
            }
            
            .hidden-mobile {
              display: none !important;
            }
          }
        </style>
    </head>
    <body style="background-color: #FFF8DC;">
        <div class="min-h-screen">
            <!-- Header -->
            <header class="shadow-md" style="background-color: #FFF8DC; border-bottom: 2px solid #FFE4B5;">
                <div class="container mx-auto px-6 py-4">
                    <div class="flex justify-between items-center">
                        <div class="flex-1"></div>
                        <div class="flex-1 text-center">
                            <h1 class="text-3xl font-bold" style="color: #FF6B35;">
                                <i class="fas fa-music mr-2"></i>
                                NCPA Sound Crew
                            </h1>
                            <p class="text-gray-600 mt-1">Event Schedule & Technical Dashboard</p>
                        </div>
                        <div class="flex-1 flex justify-end items-center gap-3">
                            <!-- User Menu (shown when logged in) -->
                            <div id="userMenu" style="display: none;">
                                <div class="relative">
                                    <button onclick="toggleUserDropdown()" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-yellow-100 transition-all">
                                        <i class="fas fa-user-circle text-2xl" style="color: #FF6B35;"></i>
                                        <span id="userEmailDisplay" class="text-sm font-medium text-gray-700"></span>
                                        <!-- Admin badge -->
                                        <span id="adminBadge" style="display: none;" class="relative">
                                            <i class="fas fa-user-shield text-lg text-orange-600"></i>
                                            <span id="pendingCount" class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center" style="display: none;"></span>
                                        </span>
                                    </button>
                                    <!-- Dropdown -->
                                    <div id="userDropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                        <button onclick="openChangePasswordModal()" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
                                            <i class="fas fa-key mr-2"></i>Change Password
                                        </button>
                                        <button id="adminPanelBtn" onclick="openAdminPanel()" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm" style="display: none;">
                                            <i class="fas fa-users-cog mr-2"></i>Admin Panel
                                        </button>
                                        <hr class="my-1">
                                        <button onclick="logout()" class="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600">
                                            <i class="fas fa-sign-out-alt mr-2"></i>Logout
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <!-- Login Button (shown when not logged in) -->
                            <button id="loginBtn" onclick="openLoginModal()" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                                <i class="fas fa-sign-in-alt mr-2"></i>Login
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Tab Navigation -->
            <div class="container mx-auto px-4 md:px-6 py-2 md:py-4">
                <!-- MOBILE: Simple header with Add Show button only -->
                <div class="md:hidden flex justify-between items-center mb-3">
                    <div></div>
                    <!-- Add Show Button (Mobile) -->
                    <button onclick="openAddShowModal()" class="px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-plus mr-1"></i>Add Show
                    </button>
                </div>
                
                <!-- MOBILE: Simple search bar only -->
                <div class="md:hidden mb-3">
                    <div class="relative">
                        <input type="text" id="searchInput" placeholder="Search by name, venue, crew..." 
                               class="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <i class="fas fa-search absolute right-3 top-3 text-gray-400"></i>
                    </div>
                </div>
                
                <!-- DESKTOP: Full toolbar with all features -->
                <div class="hidden md:block">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex space-x-6 border-b border-gray-300">
                            <button id="calendarTab" class="px-4 py-2 font-semibold tab-active transition-all" onclick="showTab('calendar')">
                                <i class="fas fa-calendar-alt mr-2"></i>Calendar
                            </button>
                            <button id="tableTab" class="px-4 py-2 font-semibold text-gray-600 hover:text-gray-800 transition-all" onclick="showTab('table')">
                                <i class="fas fa-table mr-2"></i>Table
                            </button>
                            <button id="crewTab" class="px-4 py-2 font-semibold text-gray-600 hover:text-gray-800 transition-all" onclick="showTab('crew')">
                                <i class="fas fa-users mr-2"></i>Crew
                            </button>
                        </div>
                        
                        <!-- Desktop toolbar -->
                        <div class="flex items-center gap-3">
                            <!-- Search -->
                            <div class="relative">
                                <input type="text" id="searchInput" placeholder="Search events..." 
                                       class="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                                <i class="fas fa-search absolute right-3 top-3 text-gray-400"></i>
                            </div>
                            
                            <!-- Divider -->
                            <div class="h-8 w-px bg-gray-300"></div>
                            
                            <!-- Analysis Tools Group -->
                            <div class="flex gap-2">
                                <button onclick="toggleFilterPanel()" 
                                        class="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all">
                                    <i class="fas fa-filter mr-1.5"></i>Filters
                                </button>
                                
                                <button onclick="checkConflicts()" 
                                        class="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all">
                                    <i class="fas fa-exclamation-triangle mr-1.5"></i>Conflicts
                                </button>
                                
                                <button onclick="checkShortNotice()" 
                                        class="px-3 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all">
                                    <i class="fas fa-clock mr-1.5"></i>Short Notice
                                </button>
                            </div>
                            
                            <!-- Divider -->
                            <div class="h-8 w-px bg-gray-300"></div>
                            
                            <!-- Import/Export Dropdown -->
                            <div class="relative">
                                <button onclick="toggleActionsDropdown()" 
                                        class="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2">
                                    <i class="fas fa-ellipsis-v"></i>
                                    <span>More Actions</span>
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </button>
                                
                                <!-- Dropdown Menu -->
                                <div id="actionsDropdown" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                    <div class="py-2">
                                        <!-- Export Section -->
                                        <div class="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Export</div>
                                        <button onclick="openCSVExportModal(); toggleActionsDropdown();" 
                                                class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3">
                                            <i class="fas fa-file-csv text-orange-500 w-5"></i>
                                            <span class="text-sm text-gray-700">Export CSV</span>
                                        </button>
                                        <button onclick="openWhatsAppExportModal(); toggleActionsDropdown();" 
                                                class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3">
                                            <i class="fab fa-whatsapp text-green-600 w-5"></i>
                                            <span class="text-sm text-gray-700">WhatsApp Export</span>
                                        </button>
                                        
                                        <!-- Divider -->
                                        <div class="my-2 border-t border-gray-200"></div>
                                        
                                        <!-- Import Section -->
                                        <div class="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Import</div>
                                        <button onclick="document.getElementById('wordInput').click(); toggleActionsDropdown();" 
                                                class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3">
                                            <i class="fas fa-file-word text-blue-600 w-5"></i>
                                            <span class="text-sm text-gray-700">Upload Word</span>
                                        </button>
                                        <button onclick="document.getElementById('csvInput').click(); toggleActionsDropdown();" 
                                                class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3">
                                            <i class="fas fa-file-upload text-teal-600 w-5"></i>
                                            <span class="text-sm text-gray-700">Upload CSV</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Hidden file inputs -->
                            <input type="file" id="wordInput" accept=".doc,.docx" style="display: none;" onchange="handleWordUpload(event)">
                            <input type="file" id="csvInput" accept=".csv" style="display: none;" onchange="handleCSVUpload(event)">
                            
                            <!-- Add Show Button -->
                            <button onclick="openAddShowModal()" 
                                class="px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 transition-all" 
                                style="background-color: #FF6B35;">
                                <i class="fas fa-plus mr-1.5"></i>Add Show
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Calendar View -->
                <div id="calendarView" class="rounded-lg p-3 md:p-6" style="background-color: #FFFFFF;">
                    <!-- Calendar controls with event count -->
                    <div class="flex justify-between items-center mb-4 md:mb-6">
                        <button onclick="changeMonth(-1)" class="px-3 py-2 text-sm md:text-base rounded-lg touch-manipulation" style="background-color: #FFE4B5; color: #8B4513;">
                            <i class="fas fa-chevron-left"></i><span class="hidden md:inline"> Previous</span>
                        </button>
                        <div class="text-center">
                            <h2 id="currentMonthYear" class="text-lg md:text-2xl font-bold" style="color: #FF6B35;"></h2>
                            <p id="monthEventCount" class="text-sm text-gray-600 mt-1"></p>
                        </div>
                        <button onclick="changeMonth(1)" class="px-3 py-2 text-sm md:text-base rounded-lg touch-manipulation" style="background-color: #FFE4B5; color: #8B4513;">
                            <span class="hidden md:inline">Next </span><i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                    
                    <!-- Calendar grid - Mobile optimized -->
                    <div class="grid grid-cols-7 gap-1 md:gap-2">
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">SUN</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">MON</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">TUE</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">WED</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">THU</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">FRI</div>
                        <div class="font-bold text-center py-1.5 md:py-2 text-xs md:text-sm" style="background-color: #FFF8DC; color: #8B4513;">SAT</div>
                    </div>
                    <div id="calendarGrid" class="grid grid-cols-7 gap-1 md:gap-2 mt-2"></div>
                </div>

                <!-- Table View -->
                <div id="tableView" class="bg-white rounded-lg shadow-lg p-3 md:p-6" style="display: none;">
                    <!-- Bulk Actions Bar -->
                    <div class="mb-4 flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <select id="bulkDeleteMonth" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                                <option value="">Select Month</option>
                                <option value="1">January</option>
                                <option value="2">February</option>
                                <option value="3">March</option>
                                <option value="4">April</option>
                                <option value="5">May</option>
                                <option value="6">June</option>
                                <option value="7">July</option>
                                <option value="8">August</option>
                                <option value="9">September</option>
                                <option value="10">October</option>
                                <option value="11">November</option>
                                <option value="12">December</option>
                            </select>
                            <select id="bulkDeleteYear" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                                <option value="">Select Year</option>
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                            </select>
                            <button onclick="bulkDeleteEvents()" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center">
                                <i class="fas fa-trash mr-1.5"></i>Delete Month
                            </button>
                        </div>
                        <div id="bulkDeleteStatus" class="text-sm text-gray-600"></div>
                    </div>
                    
                    <div class="overflow-auto" style="max-height: 70vh;">
                        <table class="w-full border-collapse table-fixed">
                            <colgroup>
                                <col style="width: 5%;">   <!-- Select -->
                                <col style="width: 10%;">  <!-- Date -->
                                <col style="width: 23%;">  <!-- Program -->
                                <col style="width: 10%;">  <!-- Venue -->
                                <col style="width: 10%;">  <!-- Team -->
                                <col style="width: 18%;">  <!-- Sound Requirements -->
                                <col style="width: 8%;">   <!-- Call Time -->
                                <col style="width: 10%;">  <!-- Crew -->
                                <col style="width: 6%;">   <!-- Actions -->
                            </colgroup>
                            <thead>
                                <tr style="background-color: #FF6B35;">
                                    <th class="px-2 py-3 text-center text-white font-semibold text-sm">
                                        <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this.checked)" 
                                               class="cursor-pointer">
                                    </th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Date</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Program/Event</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Venue</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Team</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Sound Req</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Call</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Crew</th>
                                    <th class="px-2 py-3 text-left text-white font-semibold text-sm">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="tableBody">
                                <!-- Table rows will be dynamically generated -->
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Dashboard View -->
                <!-- Dashboard removed - using simple event count in calendar header instead -->
                
                <!-- Crew Tab -->
                <div id="crewView" class="bg-white rounded-lg shadow-lg p-6" style="display: none;">
                    <div id="crewContent">
                        <div class="text-center py-12">
                            <i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>
                            <p class="mt-4 text-gray-600">Loading crew statistics...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Event Detail Modal -->
        <div id="eventModal" class="modal">
            <div class="modal-content">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Event Details</h2>
                    <button onclick="closeEventModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div id="eventModalContent"></div>
            </div>
        </div>

        <!-- Add Show Modal -->
        <div id="addShowModal" class="modal">
            <div class="modal-content">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Add New Show</h2>
                    <button onclick="closeAddShowModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <form id="addShowForm" onsubmit="handleAddShow(event)">
                    <div class="space-y-4">
                        <!-- Date Type Selection -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Event Duration *</label>
                            <div class="flex space-x-4">
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="dateType" value="single" checked onchange="toggleDateFields()" 
                                           class="mr-2">
                                    <span class="text-sm">Single Date</span>
                                </label>
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="dateType" value="multiple" onchange="toggleDateFields()" 
                                           class="mr-2">
                                    <span class="text-sm">Multiple Dates (Same show across dates)</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Single Date Field -->
                        <div id="singleDateField">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                            <input type="date" name="event_date" id="singleDate"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        
                        <!-- Multiple Date Fields -->
                        <div id="multipleDateFields" style="display: none;">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                                    <input type="date" name="start_date" id="startDate"
                                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                                    <input type="date" name="end_date" id="endDate"
                                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle mr-1"></i>
                                Same show will be created for all dates in this range with identical venue, crew, and requirements.
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Program/Event *</label>
                            <input type="text" name="program" required 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Venue *</label>
                            <input type="text" name="venue" required list="venueList"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600"
                                   placeholder="Select or type venue">
                            <datalist id="venueList">
                                <option value="JBT">Jamshed Bhabha Theatre</option>
                                <option value="TET">Tata Theatre</option>
                                <option value="GDT">Godrej Dance Theatre</option>
                                <option value="LT">Little Theatre</option>
                                <option value="SVR">Sea View Room</option>
                                <option value="TT">Tata Theatre</option>
                                <option value="Experimental Theatre">Experimental Theatre</option>
                            </datalist>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Team (curator)</label>
                            <select name="team" id="editTeam"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                <option value="">Select Team...</option>
                                <option value="Bruce/Team">Bruce/Team</option>
                                <option value="Dr.Rao/Team">Dr.Rao/Team</option>
                                <option value="Dr.Swapno/Team">Dr.Swapno/Team</option>
                                <option value="Farrahnaz/Team">Farrahnaz/Team</option>
                                <option value="Bianca/Team">Bianca/Team</option>
                                <option value="Dr.Sujata/Team">Dr.Sujata/Team</option>
                                <option value="Nooshin/Team">Nooshin/Team</option>
                                <option value="DPAG">DPAG</option>
                                <option value="DP">DP</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Sound Requirements</label>
                            <textarea name="sound_requirements" rows="3" 
                                      class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Call Time</label>
                            <input type="text" name="call_time" 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Crew (sound team) - Select Multiple</label>
                            <div class="grid grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Ashwin" class="add-crew-checkbox">
                                    <span class="text-sm">Ashwin</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Naren" class="add-crew-checkbox">
                                    <span class="text-sm">Naren</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Sandeep" class="add-crew-checkbox">
                                    <span class="text-sm">Sandeep</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Coni" class="add-crew-checkbox">
                                    <span class="text-sm">Coni</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Nikhil" class="add-crew-checkbox">
                                    <span class="text-sm">Nikhil</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="NS" class="add-crew-checkbox">
                                    <span class="text-sm">NS</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Aditya" class="add-crew-checkbox">
                                    <span class="text-sm">Aditya</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Viraj" class="add-crew-checkbox">
                                    <span class="text-sm">Viraj</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Shridhar" class="add-crew-checkbox">
                                    <span class="text-sm">Shridhar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Nazar" class="add-crew-checkbox">
                                    <span class="text-sm">Nazar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Omkar" class="add-crew-checkbox">
                                    <span class="text-sm">Omkar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Akshay" class="add-crew-checkbox">
                                    <span class="text-sm">Akshay</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC1" class="add-crew-checkbox">
                                    <span class="text-sm">OC1</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC2" class="add-crew-checkbox">
                                    <span class="text-sm">OC2</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC3" class="add-crew-checkbox">
                                    <span class="text-sm">OC3</span>
                                </label>
                            </div>
                            <input type="text" id="addCrewCustom" placeholder="Or type custom crew name (comma-separated for multiple)" 
                                   class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600 text-sm">
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle mr-1"></i>
                                Select multiple crew members or add custom names below
                            </p>
                        </div>
                    </div>
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" onclick="closeAddShowModal()" 
                                class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                            Cancel
                        </button>
                        <button type="submit" 
                                class="px-6 py-2 text-white rounded-lg hover:opacity-90" 
                                style="background-color: #FF6B35;">
                            Add Show
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Edit Event Modal -->
        <div id="editEventModal" class="modal">
            <div class="modal-content">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Edit Event</h2>
                    <button onclick="closeEditEventModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <form id="editEventForm" onsubmit="handleEditEvent(event)">
                    <input type="hidden" name="event_id" id="editEventId">
                    <div class="space-y-4">
                        <!-- Date Type Selection -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Event Duration *</label>
                            <div class="flex space-x-4">
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="editDateType" value="single" checked onchange="toggleEditDateFields()" 
                                           class="mr-2">
                                    <span class="text-sm">Single Date</span>
                                </label>
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="editDateType" value="multiple" onchange="toggleEditDateFields()" 
                                           class="mr-2">
                                    <span class="text-sm">Extend to Multiple Dates</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Single Date Field -->
                        <div id="editSingleDateField">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                            <input type="date" name="event_date" id="editSingleDate"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        
                        <!-- Multiple Date Fields -->
                        <div id="editMultipleDateFields" style="display: none;">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                                    <input type="date" name="start_date" id="editStartDate"
                                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                                    <input type="date" name="end_date" id="editEndDate"
                                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle mr-1"></i>
                                Creates copies of this event for additional dates. Original event will be updated to start date.
                            </p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Program/Event *</label>
                            <input type="text" name="program" id="editProgram" required 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Venue *</label>
                            <input type="text" name="venue" id="editVenue" required list="venueList"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600"
                                   placeholder="Select or type venue">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Team (curator)</label>
                            <select name="team" id="editTeam"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                                <option value="">Select Team...</option>
                                <option value="Bruce/Team">Bruce/Team</option>
                                <option value="Dr.Rao/Team">Dr.Rao/Team</option>
                                <option value="Dr.Swapno/Team">Dr.Swapno/Team</option>
                                <option value="Farrahnaz/Team">Farrahnaz/Team</option>
                                <option value="Bianca/Team">Bianca/Team</option>
                                <option value="Dr.Sujata/Team">Dr.Sujata/Team</option>
                                <option value="Nooshin/Team">Nooshin/Team</option>
                                <option value="DPAG">DPAG</option>
                                <option value="DP">DP</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Sound Requirements</label>
                            <textarea name="sound_requirements" id="editSoundReq" rows="3" 
                                      class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Call Time</label>
                            <input type="text" name="call_time" id="editCallTime"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Crew (sound team) - Select Multiple</label>
                            <div class="grid grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Ashwin" class="crew-checkbox">
                                    <span class="text-sm">Ashwin</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Naren" class="crew-checkbox">
                                    <span class="text-sm">Naren</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Sandeep" class="crew-checkbox">
                                    <span class="text-sm">Sandeep</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Coni" class="crew-checkbox">
                                    <span class="text-sm">Coni</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Nikhil" class="crew-checkbox">
                                    <span class="text-sm">Nikhil</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="NS" class="crew-checkbox">
                                    <span class="text-sm">NS</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Aditya" class="crew-checkbox">
                                    <span class="text-sm">Aditya</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Viraj" class="crew-checkbox">
                                    <span class="text-sm">Viraj</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Shridhar" class="crew-checkbox">
                                    <span class="text-sm">Shridhar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Nazar" class="crew-checkbox">
                                    <span class="text-sm">Nazar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Omkar" class="crew-checkbox">
                                    <span class="text-sm">Omkar</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="Akshay" class="crew-checkbox">
                                    <span class="text-sm">Akshay</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC1" class="crew-checkbox">
                                    <span class="text-sm">OC1</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC2" class="crew-checkbox">
                                    <span class="text-sm">OC2</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input type="checkbox" name="crew[]" value="OC3" class="crew-checkbox">
                                    <span class="text-sm">OC3</span>
                                </label>
                            </div>
                            <input type="text" id="editCrewCustom" placeholder="Or type custom crew name" 
                                   class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600 text-sm">
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle mr-1"></i>
                                Select multiple crew or enter custom names. Selected crew will be joined with commas.
                            </p>
                        </div>
                    </div>
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" onclick="closeEditEventModal()" 
                                class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                            Cancel
                        </button>
                        <button type="submit" 
                                class="px-6 py-2 text-white rounded-lg hover:opacity-90" 
                                style="background-color: #FF6B35;">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div id="deleteConfirmModal" class="modal">
            <div class="modal-content" style="max-width: 400px;">
                <h2 class="text-xl font-bold mb-4" style="color: #FF6B35;">Delete Event</h2>
                <p class="text-gray-700 mb-6" id="deleteConfirmMessage">Are you sure you want to delete this event?</p>
                <div class="flex justify-end space-x-3">
                    <button onclick="closeDeleteConfirm()" 
                            class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                        Cancel
                    </button>
                    <button id="deleteConfirmBtn" 
                            class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                        Delete
                    </button>
                </div>
            </div>
        </div>

        <!-- WhatsApp Export Modal -->
        <div id="whatsappExportModal" class="modal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">
                        <i class="fab fa-whatsapp mr-2"></i>Export for WhatsApp
                    </h2>
                    <button onclick="closeWhatsAppExportModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="space-y-4 mb-6">
                    <p class="text-gray-600">Select a time range to export events:</p>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="exportTomorrow()" class="px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                            <i class="fas fa-calendar-day mr-2"></i>Tomorrow
                        </button>
                        <button onclick="exportThisWeek()" class="px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                            <i class="fas fa-calendar-week mr-2"></i>This Week
                        </button>
                        <button onclick="exportNextWeek()" class="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all">
                            <i class="fas fa-calendar-plus mr-2"></i>Next Week
                        </button>
                        <button onclick="exportCustomDate()" class="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all">
                            <i class="fas fa-calendar-alt mr-2"></i>Custom Date
                        </button>
                    </div>
                </div>
                
                <div id="customDatePicker" style="display: none;" class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Select Date:</label>
                    <input type="date" id="customDateInput" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    <button onclick="exportSelectedDate()" class="mt-3 w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        Generate Export
                    </button>
                </div>
                
                <div id="exportPreview" style="display: none;">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-semibold text-gray-700">Preview:</h3>
                        <button onclick="copyToClipboard()" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
                            <i class="fas fa-copy mr-2"></i>Copy to Clipboard
                        </button>
                    </div>
                    <textarea id="exportText" readonly class="w-full h-64 p-4 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"></textarea>
                </div>
            </div>
        </div>

        <!-- CSV Export Modal -->
        <div id="csvExportModal" class="modal">
            <div class="modal-content" style="max-width: 500px;">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">
                        <i class="fas fa-file-download mr-2"></i>Export Events
                    </h2>
                    <button onclick="closeCSVExportModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="space-y-4">
                    <p class="text-gray-600">Select month to export:</p>
                    
                    <div class="grid grid-cols-1 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Month:</label>
                            <select id="csvExportMonth" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                                <option value="1">January</option>
                                <option value="2">February</option>
                                <option value="3">March</option>
                                <option value="4">April</option>
                                <option value="5">May</option>
                                <option value="6">June</option>
                                <option value="7">July</option>
                                <option value="8">August</option>
                                <option value="9">September</option>
                                <option value="10">October</option>
                                <option value="11">November</option>
                                <option value="12">December</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Year:</label>
                            <select id="csvExportYear" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                                <option value="2024">2024</option>
                                <option value="2025" selected>2025</option>
                                <option value="2026">2026</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <p class="text-sm font-medium text-gray-700 mb-2">Export Format:</p>
                        <div class="grid grid-cols-3 gap-2">
                            <button onclick="generateCSVExport()" 
                                    class="px-3 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all text-sm">
                                <i class="fas fa-file-csv mr-1"></i>CSV
                            </button>
                            <button onclick="generateExcelExport()" 
                                    class="px-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm">
                                <i class="fas fa-file-excel mr-1"></i>Excel
                            </button>
                            <button onclick="generateICalendarExport()" 
                                    class="px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm">
                                <i class="fas fa-calendar mr-1"></i>Calendar
                            </button>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">
                            <i class="fas fa-info-circle mr-1"></i>
                            Use <strong>Calendar</strong> (.ics) for Google Calendar, Apple Calendar, Outlook
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- AI Assistant Floating Button -->
        <button id="aiAssistantBtn" onclick="toggleAIAssistant()" 
                class="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40">
            <i class="fas fa-robot text-xl"></i>
        </button>

        <!-- AI Assistant Modal -->
        <div id="aiAssistantModal" class="modal">
            <div class="modal-content" style="max-width: 700px;">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">
                        <i class="fas fa-robot mr-2"></i>AI Assistant
                    </h2>
                    <button onclick="closeAIAssistant()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="mb-6">
                    <p class="text-gray-600 mb-4">Ask me anything about your events! Try these examples:</p>
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        <button onclick="askAI('Show all events tomorrow')" class="px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 text-left">
                            📅 Events tomorrow
                        </button>
                        <button onclick="askAI('Events at Tata Theatre this month')" class="px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 text-left">
                            🏛️ Events at Tata Theatre
                        </button>
                        <button onclick="askAI('Events with missing sound requirements')" class="px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 text-left">
                            ⚠️ Missing requirements
                        </button>
                        <button onclick="askAI('Events assigned to Ashwin')" class="px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-left">
                            👤 Ashwin's events
                        </button>
                    </div>
                    
                    <div class="flex space-x-2">
                        <input type="text" id="aiQueryInput" placeholder="Ask about events..." 
                               class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                               onkeypress="if(event.key==='Enter') askAI()">
                        <button onclick="askAI()" class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
                
                <div id="aiResponse" style="display: none;">
                    <div class="bg-gray-50 rounded-lg p-4 mb-4">
                        <div class="flex items-center mb-2">
                            <div class="loading mr-2" id="aiLoading" style="display: none;"></div>
                            <h3 class="font-semibold text-gray-700">Response:</h3>
                        </div>
                        <p id="aiExplanation" class="text-gray-600 mb-3"></p>
                        <div id="aiResultsContainer" class="overflow-x-auto"></div>
                    </div>
                </div>
            </div>
        </div>

        <script>
          // Early Safari test - runs before any libraries load
          console.log('🔍 Early test: JavaScript is running!');
          console.log('🔍 Browser:', navigator.userAgent.includes('Safari') ? 'Safari' : 'Other');
          
          // Test if we can access basic DOM
          document.addEventListener('DOMContentLoaded', function() {
            console.log('✅ DOMContentLoaded fired successfully');
            console.log('✅ Body element:', document.body ? 'Found' : 'Not found');
          });
        </script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js" crossorigin="anonymous"></script>
        <!-- Login Modal -->
        <div id="loginModal" class="modal">
            <div class="modal-content max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Login</h2>
                    <button onclick="closeLoginModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <form id="loginForm" onsubmit="handleLogin(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" id="loginEmail" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="loginPassword" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div id="loginError" class="mb-4 text-red-600 text-sm" style="display: none;"></div>
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                            Login
                        </button>
                        <button type="button" onclick="openSignupModal()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all">
                            Sign Up
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Signup Modal -->
        <div id="signupModal" class="modal">
            <div class="modal-content max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Sign Up</h2>
                    <button onclick="closeSignupModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Your account will require admin approval before you can login.</p>
                <form id="signupForm" onsubmit="handleSignup(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" id="signupEmail" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="signupPassword" required minlength="6"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                        <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                        <input type="password" id="signupPasswordConfirm" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div id="signupError" class="mb-4 text-red-600 text-sm" style="display: none;"></div>
                    <div id="signupSuccess" class="mb-4 text-green-600 text-sm" style="display: none;"></div>
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                            Sign Up
                        </button>
                        <button type="button" onclick="openLoginModal()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all">
                            Back to Login
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Change Password Modal -->
        <div id="changePasswordModal" class="modal">
            <div class="modal-content max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">Change Password</h2>
                    <button onclick="closeChangePasswordModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <form id="changePasswordForm" onsubmit="handleChangePassword(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                        <input type="password" id="currentPassword" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                        <input type="password" id="newPassword" required minlength="6"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                        <input type="password" id="newPasswordConfirm" required 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div id="changePasswordError" class="mb-4 text-red-600 text-sm" style="display: none;"></div>
                    <div id="changePasswordSuccess" class="mb-4 text-green-600 text-sm" style="display: none;"></div>
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all">
                            Change Password
                        </button>
                        <button type="button" onclick="closeChangePasswordModal()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Admin Panel Modal -->
        <div id="adminPanelModal" class="modal">
            <div class="modal-content max-w-2xl">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold" style="color: #FF6B35;">
                        <i class="fas fa-users-cog mr-2"></i>Admin Panel
                    </h2>
                    <button onclick="closeAdminPanel()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div id="adminPanelContent">
                    <div class="text-center py-8">
                        <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                        <p class="mt-3 text-gray-600">Loading pending approvals...</p>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js" crossorigin="anonymous"></script>
        <script src="https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js" crossorigin="anonymous"></script>
        <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js" crossorigin="anonymous"></script>
        <script src="/static/app.js?v=4.2.0"></script>
        <script src="/static/v41-features.js?v=4.2.0"></script>
        <script src="/static/auth.js?v=1.0.0"></script>
    </body>
    </html>
  `)
})


// ============================================
// QUOTE BUILDER MODULE - Equipment API Endpoints
// ============================================

// Get all equipment
app.get('/api/equipment', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM equipment ORDER BY name ASC
    `).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Search equipment
app.get('/api/equipment/search', async (c) => {
  try {
    const q = c.req.query('q') || ''
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM equipment WHERE name LIKE ? ORDER BY name ASC LIMIT 20
    `).bind(`%${q}%`).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Add equipment
app.post('/api/equipment', async (c) => {
  try {
    const body = await c.req.json()
    const { name, rate } = body
    if (!name || !rate) {
      return c.json({ success: false, error: 'Name and rate required' }, 400)
    }
    await c.env.DB.prepare(`
      INSERT INTO equipment (name, rate) VALUES (?, ?)
    `).bind(name.toUpperCase(), parseInt(rate)).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Update equipment
app.put('/api/equipment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { name, rate } = body
    await c.env.DB.prepare(`
      UPDATE equipment SET name = ?, rate = ? WHERE id = ?
    `).bind(name.toUpperCase(), parseInt(rate), id).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Delete equipment
app.delete('/api/equipment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`DELETE FROM equipment WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// QUOTE BUILDER PAGE - Light Green Theme (Exact Match to Screenshots)
// ============================================
const QUOTE_BUILDER_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #f5f7f5;
    color: #2d3436;
    min-height: 100vh;
    padding: 20px;
  }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.75rem; font-weight: 600; margin-bottom: 0.25rem; color: #2d3436; }
  .nav-links { font-size: 0.9rem; color: #636e72; margin-bottom: 1.5rem; }
  .nav-links a { color: #81a896; text-decoration: none; }
  .nav-links a:hover { text-decoration: underline; }
  .card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e8efe8;
  }
  .card-header { font-weight: 600; font-size: 1rem; margin-bottom: 1rem; color: #2d3436; }
  input, select, textarea {
    font-family: inherit;
    background: white;
    border: 1px solid #d1ddd1;
    color: #2d3436;
    padding: 0.75rem;
    font-size: 0.9rem;
    width: 100%;
    border-radius: 8px;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #81a896;
    box-shadow: 0 0 0 3px rgba(129, 168, 150, 0.2);
  }
  button {
    font-family: inherit;
    padding: 0.75rem 1.25rem;
    background: #81a896;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    border-radius: 8px;
    font-weight: 500;
  }
  button:hover { background: #6b9480; }
  button.danger { background: #e74c3c; }
  button.danger:hover { background: #c0392b; }
  button.secondary { background: #f5f7f5; color: #2d3436; border: 1px solid #d1ddd1; }
  button.secondary:hover { background: #e8efe8; }
  .equipment-row {
    display: grid;
    grid-template-columns: 1fr 80px 40px;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    align-items: center;
  }
  .add-row-btn {
    background: white;
    color: #81a896;
    border: 1px dashed #81a896;
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
  .add-row-btn:hover { background: #f0f5f0; }
  .autocomplete { position: relative; }
  .autocomplete-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #d1ddd1;
    border-top: none;
    border-radius: 0 0 8px 8px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  .autocomplete-item {
    padding: 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
    border-bottom: 1px solid #f0f0f0;
  }
  .autocomplete-item:hover { background: #f5f7f5; }
  .create-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .quote-display { margin-top: 1.5rem; }
  .quote-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .quote-header h3 { font-size: 1.1rem; font-weight: 600; }
  .quote-actions { display: flex; gap: 0.5rem; }
  .quote-table { width: 100%; border-collapse: collapse; }
  .quote-table th {
    background: #81a896;
    color: white;
    padding: 0.75rem;
    text-align: left;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .quote-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #e8efe8;
    font-size: 0.9rem;
  }
  .quote-table tr:nth-child(even) { background: #fafcfa; }
  .quote-total td {
    background: #e8f5e9;
    font-weight: 500;
  }
  .notes-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e8efe8; }
  .notes-section strong { font-size: 0.9rem; }
  @media (max-width: 600px) {
    .equipment-row { grid-template-columns: 1fr 60px 36px; }
    .quote-actions { flex-wrap: wrap; }
  }
`;

function QuoteBuilderPage(activeTab = 'quotes') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Sound Hire Quote Builder</title>
  <style>${QUOTE_BUILDER_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Live Sound Hire Quote Builder</h1>
    <div class="nav-links">
      <a href="/quotes" style="${activeTab === 'quotes' ? 'font-weight:600;color:#2d3436;' : ''}">Quote Builder</a> | 
      <a href="/equipment" style="${activeTab === 'equipment' ? 'font-weight:600;color:#2d3436;' : ''}">Manage Equipment</a>
      <span style="float:right;"><a href="/">← Back to Schedule</a></span>
    </div>
    <div id="app">Loading...</div>
  </div>
  <script>
    const activeTab = '${activeTab}';
    let state = {
      equipment: [],
      quoteItems: [{ equipment_id: null, name: '', rate: 0, qty: 1 }],
      quoteNotes: '',
      generatedQuote: null,
      editingId: null
    };
    
    async function api(path, opts = {}) {
      const res = await fetch(path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...opts.headers }
      });
      return res.json();
    }
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      if (activeTab === 'quotes') loadQuotes();
      else if (activeTab === 'equipment') loadEquipment();
    });
    
    // ============================================
    // QUOTE BUILDER
    // ============================================
    async function loadQuotes() {
      const res = await api('/api/equipment');
      state.equipment = res.data || [];
      state.quoteItems = [{ equipment_id: null, name: '', rate: 0, qty: 1 }];
      state.generatedQuote = null;
      renderQuotes();
    }
    
    function renderQuotes() {
      if (state.generatedQuote) {
        renderGeneratedQuote();
        return;
      }
      
      document.getElementById('app').innerHTML = \`
        <div class="card">
          <div class="card-header">Equipment Selection</div>
          <div id="quoteItems">
            \${state.quoteItems.map((item, i) => \`
              <div class="equipment-row">
                <div class="autocomplete">
                  <input type="text" placeholder="Search equipment..."
                         value="\${item.name || ''}"
                         oninput="searchEquipment(\${i}, this.value)"
                         onfocus="searchEquipment(\${i}, this.value)" />
                  <div id="autocomplete-\${i}" class="autocomplete-list" style="display:none;"></div>
                </div>
                <input type="number" min="1" value="\${item.qty}"
                       onchange="updateQty(\${i}, this.value)" style="text-align:center;width:80px;" />
                <button class="danger" onclick="removeQuoteItem(\${i})" style="width:40px;padding:0.5rem;">×</button>
              </div>
            \`).join('')}
          </div>
          <button class="add-row-btn" onclick="addQuoteItem()">+ ADD EQUIPMENT ROW</button>
        </div>
        
        <div class="card">
          <div class="card-header">Additional Notes:</div>
          <textarea id="quoteNotes" rows="4" placeholder="Enter any additional notes or requirements..."
                    onchange="state.quoteNotes = this.value">\${state.quoteNotes}</textarea>
        </div>
        
        <button class="create-btn" onclick="createQuote()">CREATE QUOTE</button>
      \`;
    }
    
    let searchTimeout;
    async function searchEquipment(index, query) {
      clearTimeout(searchTimeout);
      const dropdown = document.getElementById('autocomplete-' + index);
      
      if (!query || query.length < 1) {
        // Show all equipment when empty
        searchTimeout = setTimeout(async () => {
          const res = await api('/api/equipment');
          const items = res.data || [];
          if (items.length === 0) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = items.map(eq => \`
            <div class="autocomplete-item" onclick="selectEquipment(\${index}, \${eq.id}, '\${eq.name.replace(/'/g, "\\\\'")}', \${eq.rate})">
              \${eq.name} - Rs. \${eq.rate}
            </div>
          \`).join('');
          dropdown.style.display = 'block';
        }, 100);
        return;
      }
      
      searchTimeout = setTimeout(async () => {
        const res = await api('/api/equipment/search?q=' + encodeURIComponent(query));
        const items = res.data || [];
        if (items.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = items.map(eq => \`
          <div class="autocomplete-item" onclick="selectEquipment(\${index}, \${eq.id}, '\${eq.name.replace(/'/g, "\\\\'")}', \${eq.rate})">
            \${eq.name} - Rs. \${eq.rate}
          </div>
        \`).join('');
        dropdown.style.display = 'block';
      }, 150);
    }
    
    function selectEquipment(index, id, name, rate) {
      state.quoteItems[index] = { equipment_id: id, name, rate, qty: state.quoteItems[index].qty };
      document.getElementById('autocomplete-' + index).style.display = 'none';
      renderQuotes();
    }
    
    function updateQty(index, qty) {
      state.quoteItems[index].qty = parseInt(qty) || 1;
    }
    
    function addQuoteItem() {
      state.quoteItems.push({ equipment_id: null, name: '', rate: 0, qty: 1 });
      renderQuotes();
    }
    
    function removeQuoteItem(index) {
      if (state.quoteItems.length > 1) {
        state.quoteItems.splice(index, 1);
        renderQuotes();
      }
    }
    
    function createQuote() {
      const validItems = state.quoteItems.filter(i => i.equipment_id && i.rate > 0);
      if (validItems.length === 0) {
        alert('Please add at least one equipment item');
        return;
      }
      
      const subtotal = validItems.reduce((sum, i) => sum + (i.rate * i.qty), 0);
      const gst = Math.round(subtotal * 0.18);
      const total = subtotal + gst;
      
      state.generatedQuote = { items: validItems, subtotal, gst, total, notes: state.quoteNotes };
      renderGeneratedQuote();
    }
    
    function renderGeneratedQuote() {
      const q = state.generatedQuote;
      document.getElementById('app').innerHTML = \`
        <div class="card quote-display">
          <div class="quote-header">
            <h3>Quote</h3>
            <div class="quote-actions">
              <button class="secondary" onclick="copyQuote()">📋 Copy Quote</button>
              <button class="secondary" onclick="createNewQuote()">+ Create New Quote</button>
            </div>
          </div>
          
          <table class="quote-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:right;">Unit Cost (Rs.)</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Total (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              \${q.items.map(i => \`
                <tr>
                  <td>\${i.name}</td>
                  <td style="text-align:right;">\${i.rate.toFixed(2)}</td>
                  <td style="text-align:center;">\${i.qty}</td>
                  <td style="text-align:right;">\${(i.rate * i.qty).toFixed(2)}</td>
                </tr>
              \`).join('')}
              <tr class="quote-total">
                <td colspan="3" style="text-align:right;">Subtotal:</td>
                <td style="text-align:right;">\${q.subtotal.toFixed(2)}</td>
              </tr>
              <tr class="quote-total">
                <td colspan="3" style="text-align:right;">GST (18%):</td>
                <td style="text-align:right;">\${q.gst.toFixed(2)}</td>
              </tr>
              <tr class="quote-total" style="font-weight:700;">
                <td colspan="3" style="text-align:right;">TOTAL:</td>
                <td style="text-align:right;">\${q.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          \${q.notes ? \`
            <div class="notes-section">
              <strong>Additional Notes:</strong>
              <p style="margin-top:0.5rem;">\${q.notes}</p>
            </div>
          \` : ''}
        </div>
      \`;
    }
    
    function copyQuote() {
      const q = state.generatedQuote;
      let html = '<table border="1" cellpadding="8" style="border-collapse:collapse;font-family:Arial,sans-serif;">';
      html += '<tr style="background:#81a896;color:white;"><th>Item</th><th>Unit Cost (Rs.)</th><th>Qty</th><th>Total (Rs.)</th></tr>';
      q.items.forEach(i => {
        html += '<tr><td>' + i.name + '</td><td align="right">' + i.rate.toFixed(2) + '</td><td align="center">' + i.qty + '</td><td align="right">' + (i.rate * i.qty).toFixed(2) + '</td></tr>';
      });
      html += '<tr style="background:#e8f5e9;"><td colspan="3" align="right"><strong>Subtotal:</strong></td><td align="right">' + q.subtotal.toFixed(2) + '</td></tr>';
      html += '<tr style="background:#e8f5e9;"><td colspan="3" align="right"><strong>GST (18%):</strong></td><td align="right">' + q.gst.toFixed(2) + '</td></tr>';
      html += '<tr style="background:#c8e6c9;"><td colspan="3" align="right"><strong>TOTAL:</strong></td><td align="right"><strong>' + q.total.toFixed(2) + '</strong></td></tr>';
      html += '</table>';
      if (q.notes) html += '<br><strong>Additional Notes:</strong><br>' + q.notes;
      
      try {
        const blob = new Blob([html], { type: 'text/html' });
        const item = new ClipboardItem({ 'text/html': blob });
        navigator.clipboard.write([item]);
        alert('Quote copied to clipboard!');
      } catch (e) {
        let text = 'EQUIPMENT QUOTE\\n' + '='.repeat(50) + '\\n';
        q.items.forEach(i => { text += i.name + ' | Rs.' + i.rate + ' x ' + i.qty + ' = Rs.' + (i.rate * i.qty) + '\\n'; });
        text += '-'.repeat(50) + '\\nSubtotal: Rs.' + q.subtotal + '\\nGST (18%): Rs.' + q.gst + '\\nTOTAL: Rs.' + q.total;
        if (q.notes) text += '\\n\\nNotes: ' + q.notes;
        navigator.clipboard.writeText(text);
        alert('Quote copied (plain text)!');
      }
    }
    
    function createNewQuote() {
      state.quoteItems = [{ equipment_id: null, name: '', rate: 0, qty: 1 }];
      state.quoteNotes = '';
      state.generatedQuote = null;
      renderQuotes();
    }
    
    // ============================================
    // EQUIPMENT MANAGEMENT
    // ============================================
    async function loadEquipment() {
      const res = await api('/api/equipment');
      state.equipment = res.data || [];
      renderEquipment();
    }
    
    function renderEquipment() {
      document.getElementById('app').innerHTML = \`
        <div class="card">
          <div class="card-header">Add New Equipment</div>
          <div style="display:grid;grid-template-columns:1fr 150px auto;gap:0.75rem;align-items:end;">
            <div>
              <label style="font-size:0.85rem;color:#636e72;display:block;margin-bottom:0.25rem;">Equipment Name</label>
              <input type="text" id="newName" placeholder="e.g., SHURE SM58" />
            </div>
            <div>
              <label style="font-size:0.85rem;color:#636e72;display:block;margin-bottom:0.25rem;">Rate (Rs.)</label>
              <input type="number" id="newRate" placeholder="e.g., 300" />
            </div>
            <button onclick="addEquipment()">+ Add Equipment</button>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">Equipment List</div>
          \${state.equipment.map(eq => \`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;margin-bottom:0.5rem;background:#fafcfa;border-radius:8px;border:1px solid #e8efe8;">
              <div>
                <strong>\${eq.name}</strong>
                <span style="color:#81a896;margin-left:0.5rem;">Rs. \${eq.rate}</span>
              </div>
              <div style="display:flex;gap:0.5rem;">
                <button class="secondary" onclick="editEquipment(\${eq.id}, '\${eq.name.replace(/'/g, "\\\\'")}', \${eq.rate})" style="padding:0.5rem 0.75rem;font-size:0.8rem;">✏️ Edit</button>
                <button class="danger" onclick="deleteEquipment(\${eq.id})" style="padding:0.5rem 0.75rem;font-size:0.8rem;">🗑 Delete</button>
              </div>
            </div>
          \`).join('')}
        </div>
        
        <!-- Edit Modal -->
        <div id="editModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;">
          <div style="background:white;max-width:400px;margin:100px auto;padding:1.5rem;border-radius:12px;">
            <h3 style="margin-bottom:1rem;">Edit Equipment</h3>
            <div style="margin-bottom:1rem;">
              <label style="font-size:0.85rem;color:#636e72;display:block;margin-bottom:0.25rem;">Equipment Name</label>
              <input type="text" id="editName" />
            </div>
            <div style="margin-bottom:1rem;">
              <label style="font-size:0.85rem;color:#636e72;display:block;margin-bottom:0.25rem;">Rate (Rs.)</label>
              <input type="number" id="editRate" />
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button onclick="saveEdit()">Save</button>
              <button class="secondary" onclick="closeEditModal()">Cancel</button>
            </div>
          </div>
        </div>
      \`;
    }
    
    async function addEquipment() {
      const name = document.getElementById('newName').value.trim();
      const rate = parseInt(document.getElementById('newRate').value);
      if (!name || !rate) { alert('Please enter name and rate'); return; }
      
      const res = await api('/api/equipment', {
        method: 'POST',
        body: JSON.stringify({ name, rate })
      });
      if (res.success) {
        document.getElementById('newName').value = '';
        document.getElementById('newRate').value = '';
        loadEquipment();
      } else {
        alert(res.error || 'Failed to add equipment');
      }
    }
    
    function editEquipment(id, name, rate) {
      state.editingId = id;
      document.getElementById('editName').value = name;
      document.getElementById('editRate').value = rate;
      document.getElementById('editModal').style.display = 'block';
    }
    
    function closeEditModal() {
      document.getElementById('editModal').style.display = 'none';
      state.editingId = null;
    }
    
    async function saveEdit() {
      const name = document.getElementById('editName').value.trim();
      const rate = parseInt(document.getElementById('editRate').value);
      if (!name || !rate) { alert('Please enter name and rate'); return; }
      
      const res = await api('/api/equipment/' + state.editingId, {
        method: 'PUT',
        body: JSON.stringify({ name, rate })
      });
      if (res.success) {
        closeEditModal();
        loadEquipment();
      } else {
        alert(res.error || 'Failed to update');
      }
    }
    
    async function deleteEquipment(id) {
      if (!confirm('Delete this equipment?')) return;
      const res = await api('/api/equipment/' + id, { method: 'DELETE' });
      if (res.success) loadEquipment();
      else alert(res.error || 'Failed to delete');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete')) {
        document.querySelectorAll('.autocomplete-list').forEach(d => d.style.display = 'none');
      }
    });
  </script>
</body>
</html>`;
}

// Quote Builder routes
app.get('/quotes', (c) => c.html(QuoteBuilderPage('quotes')))
app.get('/equipment', (c) => c.html(QuoteBuilderPage('equipment')))


// ============================================
// SETTINGS PAGE (API Key Configuration)
// ============================================

// Get settings (public info only)
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT username, 
             CASE WHEN anthropic_api_key IS NOT NULL AND anthropic_api_key != '' THEN 1 ELSE 0 END as has_api_key
      FROM app_settings WHERE id = 1
    `).all()
    
    const settings = results?.[0] || { username: 'ncpalivesound', has_api_key: false }
    return c.json({ success: true, data: settings })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Update API key
app.post('/api/settings/api-key', async (c) => {
  try {
    const body = await c.req.json()
    const { api_key } = body
    
    if (!api_key) {
      return c.json({ success: false, error: 'API key required' }, 400)
    }
    
    await c.env.DB.prepare(`
      UPDATE app_settings SET anthropic_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
    `).bind(api_key).run()
    
    return c.json({ success: true, message: 'API key updated' })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Settings Page
function SettingsPage() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - NCPA Sound Ops</title>
  <style>${QUOTE_BUILDER_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Settings</h1>
    <div class="nav-links">
      <a href="/">← Back to Schedule</a> | <a href="/quotes">Quote Builder</a>
    </div>
    <div id="app">Loading...</div>
  </div>
  <script>
    async function api(path, opts = {}) {
      const res = await fetch(path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...opts.headers }
      });
      return res.json();
    }
    
    document.addEventListener('DOMContentLoaded', loadSettings);
    
    async function loadSettings() {
      const res = await api('/api/settings');
      const settings = res.data || {};
      
      document.getElementById('app').innerHTML = \`
        <div class="card">
          <div class="card-header">🔑 Anthropic API Key</div>
          <p style="font-size:0.9rem;color:#636e72;margin-bottom:1rem;">
            Configure your Anthropic API key to enable AI-powered features like Word document parsing.
            \${settings.has_api_key ? '<span style="color:#22c55e;margin-left:0.5rem;">✓ API key configured</span>' : '<span style="color:#dc2626;margin-left:0.5rem;">✗ No API key set</span>'}
          </p>
          <div style="display:flex;gap:1rem;align-items:end;">
            <div style="flex:1;">
              <label style="font-size:0.85rem;color:#636e72;display:block;margin-bottom:0.25rem;">API Key</label>
              <input type="password" id="apiKey" placeholder="sk-ant-api03-..." style="font-family:monospace;" />
            </div>
            <button onclick="saveApiKey()">💾 Save API Key</button>
          </div>
          <p style="font-size:0.75rem;color:#9ca3af;margin-top:0.75rem;">
            Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#81a896;">Anthropic Console</a>
          </p>
        </div>
        
        <div class="card">
          <div class="card-header">ℹ️ About</div>
          <p style="font-size:0.9rem;color:#636e72;">
            <strong>NCPA Sound Ops</strong> is a unified application for managing:
          </p>
          <ul style="font-size:0.9rem;color:#636e72;margin:1rem 0;padding-left:1.5rem;">
            <li><strong>Event Schedule</strong> - Calendar view, event management, crew assignments</li>
            <li><strong>Quote Builder</strong> - Generate equipment hire quotes with GST calculation</li>
            <li><strong>Equipment Management</strong> - Manage your equipment inventory and rates</li>
          </ul>
        </div>
      \`;
    }
    
    async function saveApiKey() {
      const apiKey = document.getElementById('apiKey').value.trim();
      if (!apiKey) {
        alert('Please enter an API key');
        return;
      }
      
      const res = await api('/api/settings/api-key', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey })
      });
      
      if (res.success) {
        alert('API key saved successfully!');
        document.getElementById('apiKey').value = '';
        loadSettings();
      } else {
        alert('Error: ' + (res.error || 'Failed to save'));
      }
    }
  </script>
</body>
</html>`;
}

app.get('/settings', (c) => c.html(SettingsPage()))

export default app