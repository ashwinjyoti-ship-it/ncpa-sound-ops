// NCPA Sound Crew v4.1 - Enhanced API Endpoints
// New endpoints for advanced filtering, conflict detection, bulk operations, etc.

import { Hono } from 'hono'
import type { Context } from 'hono'

type Bindings = {
  DB: D1Database;
  AI: any;
  VECTORIZE: any;
  ANTHROPIC_API_KEY: string;
}

// VALID CREW MEMBERS - Only learn from these crew members
// 11 In-House Crew (excluding Ashwin who is team head) + 3 Outside Crew (OC)
const VALID_CREW_MEMBERS = new Set([
  // In-House Crew (11)
  'Naren',
  'Sandeep', 
  'Coni',
  'Nikhil',
  'NS',
  'Aditya',
  'Viraj',
  'Shridhar',
  'Nazar',
  'Omkar',
  'Akshay',
  // Outside Crew - Hired on Need Basis (3)
  'OC1',
  'OC2',
  'OC3'
])

// Filter crew member to only include valid crew
function isValidCrewMember(name: string): boolean {
  const trimmedName = name.trim()
  return VALID_CREW_MEMBERS.has(trimmedName)
}

// ============================================
// 1. ADVANCED FILTERING & SORTING
// ============================================

export function setupFilteringEndpoints(app: Hono<{ Bindings: Bindings }>) {
  
  // Advanced filter events with multiple criteria
  app.post('/api/events/filter', async (c) => {
    try {
      const body = await c.req.json()
      const { 
        venues, 
        crews, 
        teams, 
        dateFrom, 
        dateTo, 
        tags,
        hasRequirements,
        sortBy = 'event_date',
        sortOrder = 'ASC',
        limit = 100
      } = body
      
      // Build dynamic query
      let query = 'SELECT * FROM events WHERE 1=1'
      const params: any[] = []
      
      // Venue filter
      if (venues && venues.length > 0) {
        const placeholders = venues.map(() => '?').join(',')
        query += ` AND venue IN (${placeholders})`
        params.push(...venues)
      }
      
      // Crew filter (support partial matches)
      if (crews && crews.length > 0) {
        const crewConditions = crews.map(() => 'crew LIKE ?').join(' OR ')
        query += ` AND (${crewConditions})`
        params.push(...crews.map((c: string) => `%${c}%`))
      }
      
      // Team filter
      if (teams && teams.length > 0) {
        const placeholders = teams.map(() => '?').join(',')
        query += ` AND team IN (${placeholders})`
        params.push(...teams)
      }
      
      // Date range filter
      if (dateFrom) {
        query += ' AND event_date >= ?'
        params.push(dateFrom)
      }
      if (dateTo) {
        query += ' AND event_date <= ?'
        params.push(dateTo)
      }
      
      // Tags filter (comma-separated)
      if (tags && tags.length > 0) {
        const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ')
        query += ` AND (${tagConditions})`
        params.push(...tags.map((t: string) => `%${t}%`))
      }
      
      // Sound requirements filter
      if (hasRequirements === true) {
        query += ' AND sound_requirements IS NOT NULL AND sound_requirements != ""'
      } else if (hasRequirements === false) {
        query += ' AND (sound_requirements IS NULL OR sound_requirements = "")'
      }
      
      // Sorting
      const validSortFields = ['event_date', 'program', 'venue', 'crew', 'created_at', 'status']
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'event_date'
      const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
      query += ` ORDER BY ${sortField} ${order}`
      
      // Limit
      query += ' LIMIT ?'
      params.push(limit)
      
      const { results } = await c.env.DB.prepare(query).bind(...params).all()
      
      return c.json({ 
        success: true, 
        data: results,
        count: results.length,
        query: query // For debugging
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get unique filter values (for dropdown population)
  app.get('/api/events/filter-options', async (c) => {
    try {
      // Define main venues (without time variations or combinations)
      const MAIN_VENUES = [
        'JBT',
        'TET', 
        'GDT',
        'LT',
        'TT',
        'DP Art Gallery',
        'SVR'
      ]
      
      // Get all crews and filter to only valid crew members
      const crews = await c.env.DB.prepare('SELECT DISTINCT crew FROM events WHERE crew IS NOT NULL AND crew != "" ORDER BY crew').all()
      
      // Parse comma-separated crew and filter to valid crew only
      const validCrewSet = new Set<string>()
      crews.results.forEach((row: any) => {
        const crewMembers = row.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          if (isValidCrewMember(member)) {
            validCrewSet.add(member)
          }
        })
      })
      
      const teams = await c.env.DB.prepare('SELECT DISTINCT team FROM events WHERE team IS NOT NULL AND team != "" ORDER BY team').all()
      
      return c.json({
        success: true,
        data: {
          venues: MAIN_VENUES,
          crews: Array.from(validCrewSet).sort(),
          teams: teams.results.map((t: any) => t.team)
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// ============================================
// 2. CONFLICT DETECTION
// ============================================

export function setupConflictDetection(app: Hono<{ Bindings: Bindings }>) {
  
  // Detect conflicts for a specific date range
  app.get('/api/conflicts/detect', async (c) => {
    try {
      const dateFrom = c.req.query('from')
      const dateTo = c.req.query('to')
      
      if (!dateFrom || !dateTo) {
        return c.json({ success: false, error: 'Date range required' }, 400)
      }
      
      // Get all events in date range
      const { results: events } = await c.env.DB.prepare(`
        SELECT id, event_date, program, venue, crew, call_time
        FROM events
        WHERE event_date >= ? AND event_date <= ?
        ORDER BY event_date, call_time
      `).bind(dateFrom, dateTo).all()
      
      // Detect conflicts
      const conflicts: any[] = []
      
      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const event1 = events[i] as any
          const event2 = events[j] as any
          
          // Same date conflicts
          if (event1.event_date === event2.event_date) {
            
            // Venue conflict (same venue, same date)
            if (event1.venue === event2.venue) {
              conflicts.push({
                type: 'venue_overlap',
                severity: 'error',
                event1: { id: event1.id, program: event1.program, venue: event1.venue },
                event2: { id: event2.id, program: event2.program, venue: event2.venue },
                message: `Both events scheduled at ${event1.venue} on ${event1.event_date}`
              })
            }
            
            // Crew conflict (same crew member assigned to both)
            if (event1.crew && event2.crew) {
              const crew1 = event1.crew.split(',').map((c: string) => c.trim())
              const crew2 = event2.crew.split(',').map((c: string) => c.trim())
              const overlap = crew1.filter((c: string) => crew2.includes(c))
              
              if (overlap.length > 0) {
                conflicts.push({
                  type: 'crew_overlap',
                  severity: 'warning',
                  event1: { id: event1.id, program: event1.program, crew: event1.crew },
                  event2: { id: event2.id, program: event2.program, crew: event2.crew },
                  overlappingCrew: overlap,
                  message: `Crew member(s) ${overlap.join(', ')} assigned to multiple events on ${event1.event_date}`
                })
              }
            }
          }
        }
      }
      
      return c.json({
        success: true,
        data: {
          conflicts,
          totalEvents: events.length,
          conflictCount: conflicts.length
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get conflicts for specific event
  app.get('/api/conflicts/event/:id', async (c) => {
    try {
      const id = c.req.param('id')
      
      // Get event details
      const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
      
      if (!event) {
        return c.json({ success: false, error: 'Event not found' }, 404)
      }
      
      // Find potential conflicts on same date
      const { results: sameDate } = await c.env.DB.prepare(`
        SELECT * FROM events 
        WHERE event_date = ? AND id != ?
      `).bind(event.event_date, id).all()
      
      const conflicts = []
      
      for (const other of sameDate as any[]) {
        // Venue conflict
        if (other.venue === event.venue) {
          conflicts.push({
            type: 'venue_overlap',
            severity: 'error',
            conflictingEvent: other,
            message: `Same venue conflict with "${other.program}"`
          })
        }
        
        // Crew conflict
        if (event.crew && other.crew) {
          const crew1 = event.crew.split(',').map((c: string) => c.trim())
          const crew2 = other.crew.split(',').map((c: string) => c.trim())
          const overlap = crew1.filter((c: string) => crew2.includes(c))
          
          if (overlap.length > 0) {
            conflicts.push({
              type: 'crew_overlap',
              severity: 'warning',
              conflictingEvent: other,
              overlappingCrew: overlap,
              message: `Crew conflict: ${overlap.join(', ')} also assigned to "${other.program}"`
            })
          }
        }
      }
      
      return c.json({
        success: true,
        data: {
          event,
          conflicts,
          hasConflicts: conflicts.length > 0
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// ============================================
// 3. BULK ASSIGNMENT WITH SMART SUGGESTIONS
// ============================================

export function setupBulkAssignment(app: Hono<{ Bindings: Bindings }>) {
  
  // Get crew suggestions for a venue/event type
  app.post('/api/crew/suggestions', async (c) => {
    try {
      const body = await c.req.json()
      const { venue, eventType, date } = body
      
      if (!venue) {
        return c.json({ success: false, error: 'Venue required' }, 400)
      }
      
      // Get historical crew assignments for this venue
      const { results: history } = await c.env.DB.prepare(`
        SELECT crew, COUNT(*) as count
        FROM events
        WHERE venue = ? AND crew IS NOT NULL AND crew != ""
        GROUP BY crew
        ORDER BY count DESC
        LIMIT 10
      `).bind(venue).all()
      
      // Parse crew members and calculate confidence scores (ONLY VALID CREW)
      const crewScores: Record<string, number> = {}
      let validTotalAssignments = 0
      
      for (const record of history as any[]) {
        const crewMembers = record.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach(member => {
          // Only include valid crew members (exclude Ashwin and invalid names)
          if (isValidCrewMember(member)) {
            crewScores[member] = (crewScores[member] || 0) + record.count
            validTotalAssignments += record.count
          }
        })
      }
      
      // Convert to suggestions with confidence scores
      const suggestions = Object.entries(crewScores)
        .map(([name, count]) => ({
          name,
          confidence: Math.round((count / validTotalAssignments) * 100),
          assignmentCount: count,
          reason: `Worked ${count} time(s) at ${venue}`
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
      
      return c.json({
        success: true,
        data: {
          venue,
          suggestions,
          totalHistory: validTotalAssignments
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Bulk assign crew to multiple events
  app.post('/api/events/bulk-assign', async (c) => {
    try {
      const body = await c.req.json()
      const { eventIds, crew } = body
      
      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return c.json({ success: false, error: 'Event IDs required' }, 400)
      }
      
      if (!crew) {
        return c.json({ success: false, error: 'Crew assignment required' }, 400)
      }
      
      // Update all events
      const placeholders = eventIds.map(() => '?').join(',')
      await c.env.DB.prepare(`
        UPDATE events 
        SET crew = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `).bind(crew, ...eventIds).run()
      
      return c.json({
        success: true,
        message: `Updated ${eventIds.length} events`,
        updatedCount: eventIds.length
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Update event status (bulk or single)
  app.post('/api/events/update-status', async (c) => {
    try {
      const body = await c.req.json()
      const { eventIds, status } = body
      
      const validStatuses = ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled']
      if (!validStatuses.includes(status)) {
        return c.json({ success: false, error: 'Invalid status' }, 400)
      }
      
      const placeholders = eventIds.map(() => '?').join(',')
      await c.env.DB.prepare(`
        UPDATE events 
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `).bind(status, ...eventIds).run()
      
      return c.json({
        success: true,
        message: `Updated status to '${status}' for ${eventIds.length} events`
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// ============================================
// 4. DASHBOARD ANALYTICS
// ============================================

export function setupDashboardEndpoints(app: Hono<{ Bindings: Bindings }>) {
  
  // Get comprehensive dashboard statistics
  app.get('/api/dashboard/stats', async (c) => {
    try {
      const dateFrom = c.req.query('from') || new Date().toISOString().split('T')[0]
      const dateTo = c.req.query('to') || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      // Total events
      const totalResult = await c.env.DB.prepare(`
        SELECT COUNT(*) as total FROM events
        WHERE event_date >= ? AND event_date <= ?
      `).bind(dateFrom, dateTo).first()
      
      // Events by status
      const statusStats = await c.env.DB.prepare(`
        SELECT 
          COALESCE(status, 'confirmed') as status,
          COUNT(*) as count
        FROM events
        WHERE event_date >= ? AND event_date <= ?
        GROUP BY status
      `).bind(dateFrom, dateTo).all()
      
      // Events by venue (with normalization)
      const venueStatsRaw = await c.env.DB.prepare(`
        SELECT venue, COUNT(*) as count
        FROM events
        WHERE event_date >= ? AND event_date <= ?
        GROUP BY venue
        ORDER BY count DESC
      `).bind(dateFrom, dateTo).all()
      
      // Define main venues and normalization function
      const MAIN_VENUES = ['JBT', 'TET', 'GDT', 'LT', 'TT', 'DP Art Gallery', 'SVR']
      
      function normalizeVenue(venueName: string): string {
        if (!venueName) return 'Unknown'
        
        // Remove time variations
        let cleaned = venueName.replace(/\s+\d{1,2}(:\d{2})?(am|pm|AM|PM)/gi, '')
                               .replace(/\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}(:\d{2})?(am|pm|AM|PM)/gi, '')
                               .trim()
        
        const upper = cleaned.toUpperCase()
        
        // Exact match first
        if (upper === 'JBT') return 'JBT'
        if (upper === 'TET') return 'TET'
        if (upper === 'GDT') return 'GDT'
        if (upper === 'LT') return 'LT'
        if (upper === 'TT') return 'TT'
        if (upper === 'SVR') return 'SVR'
        if (upper === 'DPAG' || upper === 'DP ART GALLERY') return 'DP Art Gallery'
        
        // Partial matches
        if (upper.includes('JAMSHED') || upper.includes('BHABHA')) return 'JBT'
        if (upper.includes('TATA') && upper.includes('THEATRE')) return 'TET'
        if (upper.includes('GODREJ') || (upper.includes('DANCE') && upper.includes('THEATRE'))) return 'GDT'
        if (upper.includes('LITTLE') && upper.includes('THEATRE')) return 'LT'
        if (upper.includes('EXPERIMENTAL')) return 'TT'
        if (upper.includes('DPAG') || upper.includes('DP AG')) return 'DP Art Gallery'
        
        // Check if starts with main venue codes
        for (const mainVenue of MAIN_VENUES) {
          if (upper.startsWith(mainVenue + ' ') || upper.startsWith(mainVenue)) {
            return mainVenue
          }
        }
        
        return venueName
      }
      
      // Aggregate normalized venues
      const venueMap = new Map<string, number>()
      venueStatsRaw.results.forEach((v: any) => {
        const normalized = normalizeVenue(v.venue)
        if (MAIN_VENUES.includes(normalized)) {
          venueMap.set(normalized, (venueMap.get(normalized) || 0) + v.count)
        }
      })
      
      const venueStats = Array.from(venueMap.entries())
        .map(([venue, count]) => ({ venue, count }))
        .sort((a, b) => b.count - a.count)
      
      // Individual crew workload (parse comma-separated crew field)
      const crewEvents = await c.env.DB.prepare(`
        SELECT crew FROM events
        WHERE event_date >= ? AND event_date <= ?
          AND crew IS NOT NULL AND crew != ""
      `).bind(dateFrom, dateTo).all()
      
      // Parse and count individual crew members
      const crewWorkloadMap = new Map<string, number>()
      crewEvents.results.forEach((row: any) => {
        const crewMembers = row.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          if (isValidCrewMember(member)) {
            crewWorkloadMap.set(member, (crewWorkloadMap.get(member) || 0) + 1)
          }
        })
      })
      
      // Convert to array and sort
      const crewWorkloadArray = Array.from(crewWorkloadMap.entries())
        .map(([crew, count]) => ({ crew, count }))
        .sort((a, b) => b.count - a.count)
      
      // Calculate workload statistics
      const assignments = crewWorkloadArray.map(c => c.count)
      const avgAssignments = assignments.length > 0 
        ? assignments.reduce((a, b) => a + b, 0) / assignments.length 
        : 0
      const maxAssignments = assignments.length > 0 ? Math.max(...assignments) : 0
      
      // Categorize crew by workload status
      const crewWorkload = crewWorkloadArray.map(item => {
        const status = item.count > avgAssignments * 1.5 ? 'overloaded' :
                      item.count < avgAssignments * 0.5 ? 'underutilized' : 'balanced'
        return { ...item, status }
      })
      
      // Upcoming events (next 7 days)
      const today = new Date().toISOString().split('T')[0]
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const upcomingEvents = await c.env.DB.prepare(`
        SELECT * FROM events
        WHERE event_date >= ? AND event_date <= ?
        ORDER BY event_date ASC
        LIMIT 20
      `).bind(today, nextWeek).all()
      
      // Events requiring sound setup (missing requirements)
      const needsRequirements = await c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM events
        WHERE event_date >= ? AND event_date <= ?
          AND (sound_requirements IS NULL OR sound_requirements = "")
      `).bind(dateFrom, dateTo).first()
      
      // Missing sound requirements in next 4 days (for urgency alert)
      const fourDaysFromNow = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const missingSoundNext4Days = await c.env.DB.prepare(`
        SELECT id, event_date, venue, program, crew
        FROM events
        WHERE event_date >= ? AND event_date <= ?
          AND (sound_requirements IS NULL OR sound_requirements = "")
        ORDER BY event_date ASC
      `).bind(today, fourDaysFromNow).all()
      
      return c.json({
        success: true,
        data: {
          total: totalResult?.total || 0,
          statusBreakdown: statusStats.results,
          venueDistribution: venueStats,
          crewWorkload: crewWorkload,
          crewWorkloadStats: {
            average: Math.round(avgAssignments * 10) / 10,
            max: maxAssignments,
            overloaded: crewWorkload.filter(c => c.status === 'overloaded').map(c => c.crew),
            underutilized: crewWorkload.filter(c => c.status === 'underutilized').map(c => c.crew)
          },
          upcomingEvents: upcomingEvents.results,
          needsRequirements: needsRequirements?.count || 0,
          missingSoundNext4Days: missingSoundNext4Days.results,
          dateRange: { from: dateFrom, to: dateTo }
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get crew workload details
  app.get('/api/dashboard/crew-workload', async (c) => {
    try {
      const month = c.req.query('month') // Format: YYYY-MM
      
      let query = `
        SELECT 
          event_date,
          crew,
          COUNT(*) as event_count,
          GROUP_CONCAT(venue) as venues
        FROM events
        WHERE crew IS NOT NULL AND crew != ""
      `
      const params: any[] = []
      
      if (month) {
        query += ' AND strftime("%Y-%m", event_date) = ?'
        params.push(month)
      }
      
      query += ' GROUP BY event_date, crew ORDER BY event_date'
      
      const { results } = await c.env.DB.prepare(query).bind(...params).all()
      
      return c.json({
        success: true,
        data: results
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get venue statistics with month/year filtering
  app.get('/api/dashboard/venue-stats', async (c) => {
    try {
      const month = c.req.query('month') // Format: YYYY-MM (e.g., "2025-01")
      
      // Default to current month if not specified
      const targetMonth = month || new Date().toISOString().slice(0, 7)
      
      // Main venues to normalize to
      const MAIN_VENUES = ['JBT', 'TET', 'GDT', 'LT', 'TT', 'DP Art Gallery', 'SVR']
      
      // Function to normalize venue names (remove times, variations)
      function normalizeVenue(venueName: string): string {
        if (!venueName) return 'Unknown'
        
        // Remove time variations (e.g., "TET 7pm", "GDT 6.30pm", "JBT 7:29pm")
        // Match patterns like: "7pm", "6.30pm", "7:29pm", "Sat 4:32pm", etc.
        let cleaned = venueName.replace(/\s+\d{1,2}(:\d{2})?(am|pm|AM|PM)/gi, '')
                               .replace(/\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}(:\d{2})?(am|pm|AM|PM)/gi, '')
                               .trim()
        
        const upper = cleaned.toUpperCase()
        
        // Exact match first (after cleaning)
        if (upper === 'JBT') return 'JBT'
        if (upper === 'TET') return 'TET'
        if (upper === 'GDT') return 'GDT'
        if (upper === 'LT') return 'LT'
        if (upper === 'TT') return 'TT'
        if (upper === 'SVR') return 'SVR'
        if (upper === 'DPAG' || upper === 'DP ART GALLERY') return 'DP Art Gallery'
        
        // Partial matches for full names
        if (upper.includes('JAMSHED') || upper.includes('BHABHA')) return 'JBT'
        if (upper.includes('TATA') && upper.includes('THEATRE')) return 'TET'
        if (upper.includes('GODREJ') || (upper.includes('DANCE') && upper.includes('THEATRE'))) return 'GDT'
        if (upper.includes('LITTLE') && upper.includes('THEATRE')) return 'LT'
        if (upper.includes('EXPERIMENTAL')) return 'TT'
        if (upper.includes('DPAG') || upper.includes('DP AG')) return 'DP Art Gallery'
        
        // If still no match, check if it starts with main venue codes
        for (const mainVenue of ['JBT', 'TET', 'GDT', 'LT', 'TT', 'SVR']) {
          if (upper.startsWith(mainVenue + ' ') || upper.startsWith(mainVenue)) {
            return mainVenue
          }
        }
        
        // If no match, return original (will be filtered out)
        return venueName
      }
      
      const venueStats = await c.env.DB.prepare(`
        SELECT venue, COUNT(*) as count
        FROM events
        WHERE strftime("%Y-%m", event_date) = ?
        GROUP BY venue
        ORDER BY count DESC
      `).bind(targetMonth).all()
      
      // Normalize and aggregate venues
      const venueMap = new Map<string, number>()
      
      venueStats.results.forEach((v: any) => {
        const normalized = normalizeVenue(v.venue)
        // Only include main venues
        if (MAIN_VENUES.includes(normalized)) {
          venueMap.set(normalized, (venueMap.get(normalized) || 0) + v.count)
        }
      })
      
      // Convert to array and sort by count
      const aggregatedVenues = Array.from(venueMap.entries())
        .map(([venue, count]) => ({ venue, count }))
        .sort((a, b) => b.count - a.count)
      
      // Calculate total for percentage
      const total = aggregatedVenues.reduce((sum, v) => sum + v.count, 0)
      
      // Add percentage to each venue
      const venueStatsWithPercent = aggregatedVenues.map((v) => ({
        venue: v.venue,
        count: v.count,
        percentage: total > 0 ? Math.round((v.count / total) * 100) : 0
      }))
      
      return c.json({
        success: true,
        data: {
          month: targetMonth,
          total: total,
          venues: venueStatsWithPercent
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get AI confidence levels by venue
  app.get('/api/crew/ai-confidence', async (c) => {
    try {
      const VALID_CREW_MEMBERS = new Set([
        'Naren', 'Sandeep', 'Coni', 'Nikhil', 'NS', 'Aditya', 
        'Viraj', 'Shridhar', 'Nazar', 'Omkar', 'Akshay', 'OC1', 'OC2', 'OC3'
      ])
      
      // Get all events with crew assignments
      const allEvents = await c.env.DB.prepare(`
        SELECT venue, crew, event_date FROM events
        WHERE crew IS NOT NULL AND crew != ""
        ORDER BY event_date ASC
      `).all()
      
      // Calculate venue-by-venue confidence
      const venueAssignments = new Map<string, number>()
      let totalValidAssignments = 0
      let firstDate = ''
      let lastDate = ''
      
      allEvents.results.forEach((event: any) => {
        const crewMembers = event.crew.split(',').map((c: string) => c.trim())
        const hasValidCrew = crewMembers.some((name: string) => VALID_CREW_MEMBERS.has(name))
        
        if (hasValidCrew) {
          totalValidAssignments++
          const venue = event.venue
          venueAssignments.set(venue, (venueAssignments.get(venue) || 0) + 1)
          
          if (!firstDate) firstDate = event.event_date
          lastDate = event.event_date
        }
      })
      
      // Calculate days of learning
      const daysOfLearning = firstDate && lastDate 
        ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      
      // Calculate overall confidence (based on assignments and time)
      const assignmentScore = Math.min(totalValidAssignments / 350, 1) * 100 // 350 assignments = 100%
      const timeScore = Math.min(daysOfLearning / 365, 1) * 100 // 1 year = 100%
      const overallConfidence = Math.round((assignmentScore * 0.7 + timeScore * 0.3))
      
      // Calculate venue-specific confidence
      const venueConfidence = Array.from(venueAssignments.entries()).map(([venue, count]) => {
        const confidence = Math.min(Math.round((count / 50) * 100), 100) // 50 assignments = 100%
        const status = confidence >= 85 ? 'ready' : confidence >= 70 ? 'good' : confidence >= 50 ? 'learning' : 'needs_data'
        return { venue, assignments: count, confidence, status }
      }).sort((a, b) => b.confidence - a.confidence)
      
      return c.json({
        success: true,
        data: {
          overall: {
            confidence: overallConfidence,
            totalAssignments: totalValidAssignments,
            daysOfLearning: daysOfLearning,
            status: overallConfidence >= 85 ? 'ready' : overallConfidence >= 70 ? 'good' : 'learning',
            dateRange: { first: firstDate, last: lastDate }
          },
          byVenue: venueConfidence,
          nextGoal: {
            target: 350,
            current: totalValidAssignments,
            remaining: Math.max(0, 350 - totalValidAssignments),
            targetConfidence: 95
          }
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// ============================================
// 5. EXPORT ENHANCEMENTS
// ============================================

export function setupExportEndpoints(app: Hono<{ Bindings: Bindings }>) {
  
  // Export events with change tracking (for Google Sheets sync)
  app.post('/api/export/tracked', async (c) => {
    try {
      const body = await c.req.json()
      const { eventIds, format = 'csv', includeMetadata = true } = body
      
      // Get events
      let query = 'SELECT * FROM events'
      let params: any[] = []
      
      if (eventIds && eventIds.length > 0) {
        const placeholders = eventIds.map(() => '?').join(',')
        query += ` WHERE id IN (${placeholders})`
        params = eventIds
      }
      
      query += ' ORDER BY event_date ASC'
      
      const { results: events } = await c.env.DB.prepare(query).bind(...params).all()
      
      // Generate checksum for change detection
      const dataString = JSON.stringify(events)
      const checksum = await generateChecksum(dataString)
      
      // Log export
      await c.env.DB.prepare(`
        INSERT INTO export_log (export_type, event_ids, file_checksum)
        VALUES (?, ?, ?)
      `).bind(format, eventIds ? eventIds.join(',') : 'all', checksum).run()
      
      // Add metadata if requested
      const exportData = includeMetadata ? {
        exportedAt: new Date().toISOString(),
        checksum,
        eventCount: events.length,
        events
      } : events
      
      return c.json({
        success: true,
        data: exportData,
        checksum // For client-side change detection
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Check if events have changed since last export
  app.post('/api/export/check-changes', async (c) => {
    try {
      const body = await c.req.json()
      const { lastChecksum, eventIds } = body
      
      // Get current events
      let query = 'SELECT * FROM events'
      let params: any[] = []
      
      if (eventIds && eventIds.length > 0) {
        const placeholders = eventIds.map(() => '?').join(',')
        query += ` WHERE id IN (${placeholders})`
        params = eventIds
      }
      
      query += ' ORDER BY event_date ASC'
      
      const { results: events } = await c.env.DB.prepare(query).bind(...params).all()
      
      // Generate current checksum
      const currentChecksum = await generateChecksum(JSON.stringify(events))
      
      return c.json({
        success: true,
        data: {
          hasChanges: currentChecksum !== lastChecksum,
          currentChecksum,
          lastChecksum,
          eventCount: events.length
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// Helper function to generate checksum
async function generateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
