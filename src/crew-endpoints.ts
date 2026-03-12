import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

type CrewMember = {
  id: number
  name: string
  level: 'Senior' | 'Mid' | 'Junior' | 'Hired'
  can_stage: boolean
  stage_only_if_urgent: boolean
  venue_capabilities: Record<string, string>
  vertical_capabilities: Record<string, string>
  special_notes: string
}

// ============================================
// MAPPINGS (from crew-assignment-automation)
// ============================================

export const VENUE_MAP: Record<string, string> = {
  'JBT': 'JBT', 'Jamshed Bhabha Theatre': 'JBT',
  'TT': 'Tata', 'Tata Theatre': 'Tata', 'TATA': 'Tata', 'Tata': 'Tata',
  'TET': 'Experimental', 'Tata Experimental Theatre': 'Experimental',
  'Experimental Theatre': 'Experimental', 'Experimental': 'Experimental', 'Expl': 'Experimental', 'Expl ZCB': 'Experimental',
  'GDT': 'Godrej Dance', 'Godrej Dance Theatre': 'Godrej Dance',
  'LT': 'Little Theatre', 'Little Theatre': 'Little Theatre', 'Little': 'Little Theatre',
  'Lib': 'Others', 'Library': 'Others', 'DPAG': 'Others',
  'Dilip Piramal Art Gallery': 'Others', 'Stuart Liff': 'Others',
  'Stuart-Liff': 'Others', 'Stuart Liff Lib': 'Others',
  'SVR': 'Others', 'Sea View Room': 'Others', 'Sunken': 'Others',
  'Sunken Garden': 'Others', 'OAP': 'Others', 'West Room': 'Others',
  'West room 1': 'Others', 'NCPA Reference Library': 'Others',
}

export const TEAM_TO_VERTICAL: Record<string, string> = {
  'Dr.Swapno/Team': 'Dance', 'Dr.Swapno': 'Dance', 'Dr. Swapno/Team': 'Dance',
  'Dr.Rao/Team': 'Indian Music', 'Dr. Rao/Team': 'Indian Music', 'Dr. Rao / Team': 'Indian Music',
  'Farrahnaz & Team': 'Intl Music', 'Farrahnaz': 'Intl Music',
  'Nooshin/Team': 'Theatre', 'Nooshin/ Team': 'Theatre', 'Nooshir/Team': 'Theatre',
  'Bruce/Rajeshri': 'Theatre', 'Bruce/Team': 'Theatre', 'Bruce/Binaifar': 'Theatre',
  'Bruce/Deepa': 'Theatre', 'Bruce/Ava/Binney': 'Theatre',
  'Dr.Sujata/Team': 'Library', 'Dr. Sujata/Team': 'Library',
  'Dr.Sujata / Team': 'Library', 'Sujata Jadhav Library NCPA': 'Library',
  'Dr.Cavas': 'Library', 'Dr. Cavas': 'Library',
  'Bianca/Team': 'Western Music', 'Marketing': 'Corporate',
  'DP': 'Others', 'Lit Live': 'Others', 'PAG': 'Others',
  'International Music': 'Intl Music', 'Others': 'Others', '': 'Others',
}

export const VENUE_DEFAULTS: Record<string, number> = {
  'JBT': 3, 'Tata': 3, 'Experimental': 2, 'Godrej Dance': 1, 'Little Theatre': 1, 'Others': 1,
}

export function mapVenue(raw: string): { mapped: string, isMultiVenue: boolean } {
  const trimmed = raw.trim()
  if (trimmed.includes(' & ') || trimmed.includes(',') ||
      (trimmed.includes('TT') && trimmed.includes('TET')) ||
      trimmed.toLowerCase().includes('all lawns') ||
      trimmed.toLowerCase().includes('gardens')) {
    return { mapped: 'Others', isMultiVenue: true }
  }
  if (VENUE_MAP[trimmed]) return { mapped: VENUE_MAP[trimmed], isMultiVenue: false }
  for (const [key, value] of Object.entries(VENUE_MAP)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase())) {
      return { mapped: value, isMultiVenue: false }
    }
  }
  return { mapped: 'Others', isMultiVenue: false }
}

export function mapTeamToVertical(team: string): string {
  const trimmed = team.trim()
  if (TEAM_TO_VERTICAL[trimmed]) return TEAM_TO_VERTICAL[trimmed]
  for (const [key, value] of Object.entries(TEAM_TO_VERTICAL)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase())) return value
  }
  return 'Others'
}

function isManualOnlyVenue(venueRaw: string): { manual: boolean, reason: string } {
  const lower = venueRaw.toLowerCase()
  if (lower.includes('dpag') || lower.includes('piramal') || lower.includes('gallery')) {
    return { manual: true, reason: 'DPAG venue' }
  }
  if (lower.includes('stuart') || lower.includes('liff')) {
    return { manual: true, reason: 'Stuart Liff venue' }
  }
  return { manual: false, reason: '' }
}

function isSuspiciousVenue(venue: string): boolean {
  const trimmed = venue.trim()
  const upper = trimmed.toUpperCase()
  const lower = trimmed.toLowerCase()
  const validVenues = ['JBT', 'TT', 'TET', 'GDT', 'LT', 'DPAG', 'SVR', 'OAP', 'TATA', 'LIB', 'EXPL',
                       'LITTLE', 'LIBRARY', 'ONLINE', 'SUNKEN', 'WEST']
  if (validVenues.includes(upper)) return false
  const venueKeywords = ['theatre', 'theater', 'room', 'garden', 'hall', 'gallery', 'studio', 'foyer', 'lawn', 'online']
  if (venueKeywords.some(kw => lower.includes(kw))) return false
  if (/^[A-Z]{2,4}$/.test(trimmed)) return true
  if (/^[A-Z][a-z]+$/.test(trimmed) && trimmed.length <= 8) {
    const excludeWords = ['little', 'expl', 'tata', 'west', 'main', 'back', 'front', 'upper', 'lower']
    if (excludeWords.includes(lower)) return false
    return true
  }
  return false
}

const LEVEL_ORDER: Record<string, number> = { 'Senior': 0, 'Mid': 1, 'Junior': 2, 'Hired': 3 }

function canDoFOH(crew: CrewMember, venue: string, vertical: string): { can: boolean, isSpecialist: boolean } {
  const venueCapability = crew.venue_capabilities[venue]
  const verticalCapability = crew.vertical_capabilities[vertical]
  if (!venueCapability || venueCapability === 'N') return { can: false, isSpecialist: false }
  if (!verticalCapability || verticalCapability === 'N') return { can: false, isSpecialist: false }
  if (verticalCapability === 'Exp only') {
    return venue === 'Experimental' ? { can: true, isSpecialist: false } : { can: false, isSpecialist: false }
  }
  return { can: true, isSpecialist: venueCapability === 'Y*' || verticalCapability === 'Y*' }
}

export function setupCrewEndpoints(app: Hono<{ Bindings: Bindings }>) {

  // Get all crew
  app.get('/api/crew', async (c) => {
    const { DB } = c.env
    const crew = await DB.prepare(
      "SELECT * FROM crew ORDER BY CASE level WHEN 'Senior' THEN 1 WHEN 'Mid' THEN 2 WHEN 'Junior' THEN 3 WHEN 'Hired' THEN 4 END, name"
    ).all()
    return c.json(crew.results.map((cr: any) => ({
      ...cr,
      venue_capabilities: JSON.parse(cr.venue_capabilities),
      vertical_capabilities: JSON.parse(cr.vertical_capabilities)
    })))
  })

  // Get unavailability
  app.get('/api/unavailability', async (c) => {
    const { DB } = c.env
    const month = c.req.query('month')
    let results
    if (month) {
      results = await DB.prepare(
        'SELECT cu.*, c.name as crew_name FROM crew_unavailability cu JOIN crew c ON cu.crew_id = c.id WHERE cu.unavailable_date LIKE ?'
      ).bind(`${month}%`).all()
    } else {
      results = await DB.prepare(
        'SELECT cu.*, c.name as crew_name FROM crew_unavailability cu JOIN crew c ON cu.crew_id = c.id'
      ).all()
    }
    return c.json(results.results)
  })

  // Add unavailability
  app.post('/api/unavailability', async (c) => {
    const { DB } = c.env
    const { crew_id, unavailable_date, reason } = await c.req.json()
    await DB.prepare(
      'INSERT OR IGNORE INTO crew_unavailability (crew_id, unavailable_date, reason) VALUES (?, ?, ?)'
    ).bind(crew_id, unavailable_date, reason || null).run()
    return c.json({ success: true })
  })

  // Remove unavailability
  app.delete('/api/unavailability', async (c) => {
    const { DB } = c.env
    const { crew_id, unavailable_date } = await c.req.json()
    await DB.prepare(
      'DELETE FROM crew_unavailability WHERE crew_id = ? AND unavailable_date = ?'
    ).bind(crew_id, unavailable_date).run()
    return c.json({ success: true })
  })

  // Bulk unavailability
  app.post('/api/unavailability/bulk', async (c) => {
    const { DB } = c.env
    const { entries } = await c.req.json()
    for (const entry of entries) {
      if (entry.action === 'add') {
        await DB.prepare(
          'INSERT OR IGNORE INTO crew_unavailability (crew_id, unavailable_date) VALUES (?, ?)'
        ).bind(entry.crew_id, entry.unavailable_date).run()
      } else {
        await DB.prepare(
          'DELETE FROM crew_unavailability WHERE crew_id = ? AND unavailable_date = ?'
        ).bind(entry.crew_id, entry.unavailable_date).run()
      }
    }
    return c.json({ success: true })
  })

  // Upload events batch for assignment
  app.post('/api/crew/events/upload', async (c) => {
    const { DB } = c.env
    const { events } = await c.req.json()
    const batchId = `batch_${Date.now()}`

    const eventGroups: Record<string, any[]> = {}
    for (const event of events) {
      const name = event.program || event.name || 'Unnamed Event'
      if (!eventGroups[name]) eventGroups[name] = []
      eventGroups[name].push({ ...event, name })
    }

    const insertedEvents = []

    for (const [name, groupEvents] of Object.entries(eventGroups)) {
      const eventGroup = groupEvents.length > 1 ? `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : null

      for (const event of groupEvents) {
        let eventDate = event.event_date || event.date || ''
        if (eventDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [dd, mm, yyyy] = eventDate.split('-')
          eventDate = `${yyyy}-${mm}-${dd}`
        }

        const { mapped: venue, isMultiVenue } = mapVenue(event.venue || '')
        const vertical = mapTeamToVertical(event.team || '')
        const manualCheck = isManualOnlyVenue(event.venue || '')
        let manualOnly = manualCheck.manual || isMultiVenue
        let manualReason = manualCheck.reason || (isMultiVenue ? 'Multi-venue event' : '')
        let isSuspicious = false

        if (isSuspiciousVenue(event.venue || '')) {
          isSuspicious = true
          manualOnly = true
          manualReason = manualReason ? manualReason + '; Suspicious venue: ' + event.venue : 'Suspicious venue: ' + event.venue
        }

        const defaultCrew = isSuspicious ? 1 : (manualOnly ? 0 : (VENUE_DEFAULTS[venue] || 1))

        const result = await DB.prepare(
          `INSERT INTO events (batch_id, program, event_date, venue, venue_normalized, team, vertical, sound_requirements, call_time, stage_crew_needed, event_group, needs_manual_review, manual_flag_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          batchId, name, eventDate, event.venue || '', venue,
          event.team || '', vertical,
          event.sound_requirements || '', event.call_time || '',
          defaultCrew, eventGroup, manualOnly ? 1 : 0, manualReason
        ).run()

        insertedEvents.push({
          id: result.meta.last_row_id, batch_id: batchId, name, event_date: eventDate,
          venue: event.venue || '', venue_normalized: venue, team: event.team || '', vertical,
          sound_requirements: event.sound_requirements || '', call_time: event.call_time || '',
          stage_crew_needed: defaultCrew, event_group: eventGroup,
          needs_manual_review: manualOnly, manual_flag_reason: manualReason
        })
      }
    }

    return c.json({ batch_id: batchId, events: insertedEvents })
  })

  // Get crew events by batch
  app.get('/api/crew/events', async (c) => {
    const { DB } = c.env
    const batchId = c.req.query('batch_id')
    let results
    if (batchId) {
      results = await DB.prepare(
        'SELECT * FROM events WHERE batch_id = ? ORDER BY event_date, program'
      ).bind(batchId).all()
    } else {
      results = await DB.prepare(
        'SELECT DISTINCT batch_id, MIN(event_date) as first_date, COUNT(*) as event_count FROM events WHERE batch_id IS NOT NULL GROUP BY batch_id ORDER BY first_date DESC'
      ).all()
    }
    return c.json(results.results)
  })

  // Update event (stage crew needed, manual review flag)
  app.put('/api/crew/events/:id', async (c) => {
    const { DB } = c.env
    const id = c.req.param('id')
    const updates = await c.req.json()
    if (updates.stage_crew_needed !== undefined) {
      await DB.prepare('UPDATE events SET stage_crew_needed = ? WHERE id = ?').bind(updates.stage_crew_needed, id).run()
    }
    if (updates.needs_manual_review !== undefined) {
      await DB.prepare('UPDATE events SET needs_manual_review = ? WHERE id = ?').bind(updates.needs_manual_review ? 1 : 0, id).run()
    }
    return c.json({ success: true })
  })

  // Run assignment engine
  app.post('/api/assignments/run', async (c) => {
    const { DB } = c.env
    const { batch_id, foh_preferences } = await c.req.json()
    const preferences = foh_preferences || []

    const eventsResult = await DB.prepare(
      'SELECT * FROM events WHERE batch_id = ? ORDER BY event_date, program'
    ).bind(batch_id).all()
    const events = eventsResult.results as any[]

    const crewResult = await DB.prepare('SELECT * FROM crew').all()
    const crew = crewResult.results.map((cr: any) => ({
      ...cr,
      venue_capabilities: JSON.parse(cr.venue_capabilities),
      vertical_capabilities: JSON.parse(cr.vertical_capabilities)
    })) as CrewMember[]

    const currentMonth = events[0]?.event_date?.substring(0, 7) || new Date().toISOString().substring(0, 7)
    const [year, monthNum] = currentMonth.split('-').map(Number)
    const threeMonthsAgo = new Date(year, monthNum - 4, 1)
    const threeMonthStart = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`

    const workload3MonthResult = await DB.prepare(
      `SELECT crew_id, SUM(assignment_count) as total FROM workload_history WHERE month >= ? AND month <= ? GROUP BY crew_id`
    ).bind(threeMonthStart, currentMonth).all()

    const workload3Month: Record<number, number> = {}
    for (const w of workload3MonthResult.results as any[]) {
      workload3Month[w.crew_id] = w.total
    }

    const verticalSpecialistRotation: Record<string, number[]> = {}
    const verticalRotationIndex: Record<string, number> = {}

    for (const cr of crew) {
      if (cr.level === 'Hired') continue
      for (const [vertical, cap] of Object.entries(cr.vertical_capabilities)) {
        if (cap === 'Y*') {
          if (!verticalSpecialistRotation[vertical]) {
            verticalSpecialistRotation[vertical] = []
            verticalRotationIndex[vertical] = 0
          }
          verticalSpecialistRotation[vertical].push(cr.id)
        }
      }
    }

    for (const vertical of Object.keys(verticalSpecialistRotation)) {
      verticalSpecialistRotation[vertical].sort((a, b) => {
        const crA = crew.find(cr => cr.id === a)!
        const crB = crew.find(cr => cr.id === b)!
        return LEVEL_ORDER[crA.level] - LEVEL_ORDER[crB.level]
      })
    }

    const currentMonthWorkload: Record<number, number> = {}
    const NAREN_MONTHLY_LIMIT = 7
    const narenCrew = crew.find(cr => cr.name === 'Naren')
    const narenId = narenCrew?.id || -1

    const unavailResult = await DB.prepare('SELECT crew_id, unavailable_date FROM crew_unavailability').all()
    const unavailMap: Record<string, Set<number>> = {}
    for (const u of unavailResult.results as any[]) {
      if (!unavailMap[u.unavailable_date]) unavailMap[u.unavailable_date] = new Set()
      unavailMap[u.unavailable_date].add(u.crew_id)
    }

    const dailyAssignments: Record<string, Set<number>> = {}
    const multiDayAssignments: Record<string, { foh: number | null, stage: number[] }> = {}

    const eventIds = events.map(e => e.id)
    if (eventIds.length > 0) {
      await DB.prepare(`DELETE FROM assignments WHERE event_id IN (${eventIds.join(',')})`).run()
    }

    const assignments: any[] = []
    const conflicts: any[] = []

    const hasMatchingPreference = (event: any): boolean => {
      return preferences.some((p: any) => {
        const eventNameLower = (event.program || event.name || '').toLowerCase()
        const prefEventLower = p.eventContains.toLowerCase()
        const eventMatches = eventNameLower.includes(prefEventLower)
        const venueMatches = p.venue === event.venue_normalized || p.venue === event.venue ||
                            (event.venue_normalized || '').toLowerCase().includes(p.venue.toLowerCase())
        return eventMatches && venueMatches
      })
    }

    const sortedEvents = [...events].sort((a, b) => {
      const aHasPref = hasMatchingPreference(a)
      const bHasPref = hasMatchingPreference(b)
      if (aHasPref && !bHasPref) return -1
      if (!aHasPref && bHasPref) return 1
      if (a.event_group && !b.event_group) return -1
      if (!a.event_group && b.event_group) return 1
      return a.event_date.localeCompare(b.event_date)
    })

    for (const event of sortedEvents) {
      const eventName = event.program || event.name || ''
      const eventAssignment: any = {
        event_id: event.id, event_name: eventName, event_date: event.event_date,
        venue: event.venue, venue_normalized: event.venue_normalized,
        team: event.team, vertical: event.vertical,
        sound_requirements: event.sound_requirements, call_time: event.call_time,
        foh: null, foh_name: null, stage: [], stage_names: [],
        foh_conflict: false, stage_conflict: false,
        needs_manual_review: event.needs_manual_review, manual_flag_reason: event.manual_flag_reason
      }

      if (event.needs_manual_review) {
        eventAssignment.foh_conflict = true
        conflicts.push({ event_id: event.id, event_name: eventName, type: 'Manual', reason: event.manual_flag_reason || 'Manual assignment required' })
        assignments.push(eventAssignment)
        continue
      }

      let eventDates: string[] = [event.event_date]
      if (event.event_group) {
        const groupEvents = events.filter(e => e.event_group === event.event_group)
        eventDates = groupEvents.map(e => e.event_date)
        if (multiDayAssignments[event.event_group]) {
          const existing = multiDayAssignments[event.event_group]
          eventAssignment.foh = existing.foh
          eventAssignment.foh_name = crew.find(cr => cr.id === existing.foh)?.name
          eventAssignment.stage = [...existing.stage]
          eventAssignment.stage_names = existing.stage.map(id => crew.find(cr => cr.id === id)?.name).filter(Boolean)
          if (existing.foh) {
            await DB.prepare('INSERT INTO assignments (event_id, crew_id, role) VALUES (?, ?, ?)').bind(event.id, existing.foh, 'FOH').run()
          }
          for (const stageId of existing.stage) {
            await DB.prepare('INSERT INTO assignments (event_id, crew_id, role) VALUES (?, ?, ?)').bind(event.id, stageId, 'Stage').run()
          }
          assignments.push(eventAssignment)
          continue
        }
      }

      for (const date of eventDates) {
        if (!dailyAssignments[date]) dailyAssignments[date] = new Set()
      }

      const isAvailable = (crewId: number): boolean => {
        for (const date of eventDates) {
          if (unavailMap[date]?.has(crewId)) return false
          if (dailyAssignments[date]?.has(crewId)) return false
        }
        if (crewId === narenId) {
          if ((currentMonthWorkload[narenId] || 0) >= NAREN_MONTHLY_LIMIT) return false
        }
        return true
      }

      let selectedFOH: CrewMember | null = null
      let isSpecialistAssignment = false
      let preferenceApplied = false
      let preferenceConflict = false

      const matchingPref = preferences.find((p: any) => {
        const eventNameLower = eventName.toLowerCase()
        const prefEventLower = p.eventContains.toLowerCase()
        const eventMatches = eventNameLower.includes(prefEventLower)
        const venueMatches = p.venue === event.venue_normalized || p.venue === event.venue ||
                            (event.venue_normalized || '').toLowerCase().includes(p.venue.toLowerCase())
        return eventMatches && venueMatches
      })

      if (matchingPref) {
        const preferredCrew = crew.find(cr => cr.id === matchingPref.crewId)
        if (preferredCrew) {
          if (isAvailable(preferredCrew.id)) {
            selectedFOH = preferredCrew
            preferenceApplied = true
          } else {
            preferenceConflict = true
            eventAssignment.foh_conflict = true
            conflicts.push({
              event_id: event.id, event_name: eventName, type: 'FOH Preference',
              reason: `Preferred FOH "${preferredCrew.name}" is unavailable. Manual assignment required.`
            })
          }
        }
      }

      if (!selectedFOH && !preferenceConflict) {
        const specialistIds = verticalSpecialistRotation[event.vertical] || []
        const availableSpecialists = specialistIds.filter(id => {
          const cr = crew.find(c => c.id === id)!
          if (!isAvailable(id)) return false
          const venueCapability = cr.venue_capabilities[event.venue_normalized]
          return venueCapability && venueCapability !== 'N'
        })

        if (availableSpecialists.length > 0) {
          const rotationIdx = verticalRotationIndex[event.vertical] || 0
          for (let i = 0; i < availableSpecialists.length; i++) {
            const idx = (rotationIdx + i) % availableSpecialists.length
            selectedFOH = crew.find(cr => cr.id === availableSpecialists[idx])!
            isSpecialistAssignment = true
            verticalRotationIndex[event.vertical] = (idx + 1) % availableSpecialists.length
            break
          }
        }

        if (!selectedFOH) {
          const capableCandidates: { crew: CrewMember, score: number }[] = []
          for (const cr of crew) {
            if (cr.level === 'Hired') continue
            if (!isAvailable(cr.id)) continue
            const capability = canDoFOH(cr, event.venue_normalized, event.vertical)
            if (!capability.can) continue
            const workload = workload3Month[cr.id] || 0
            let score = (3 - LEVEL_ORDER[cr.level]) * 100
            score -= workload * 5
            capableCandidates.push({ crew: cr, score })
          }
          capableCandidates.sort((a, b) => b.score - a.score)
          if (capableCandidates.length > 0) selectedFOH = capableCandidates[0].crew
        }

        if (selectedFOH) {
          eventAssignment.foh = selectedFOH.id
          eventAssignment.foh_name = selectedFOH.name
          eventAssignment.foh_level = selectedFOH.level
          eventAssignment.foh_specialist = isSpecialistAssignment
          for (const date of eventDates) dailyAssignments[date].add(selectedFOH.id)
          currentMonthWorkload[selectedFOH.id] = (currentMonthWorkload[selectedFOH.id] || 0) + eventDates.length
          workload3Month[selectedFOH.id] = (workload3Month[selectedFOH.id] || 0) + eventDates.length
          await DB.prepare('INSERT INTO assignments (event_id, crew_id, role) VALUES (?, ?, ?)').bind(event.id, selectedFOH.id, 'FOH').run()
        } else {
          eventAssignment.foh_conflict = true
          conflicts.push({ event_id: event.id, event_name: eventName, type: 'FOH', reason: 'No qualified FOH available' })
        }
      } else if (selectedFOH) {
        eventAssignment.foh = selectedFOH.id
        eventAssignment.foh_name = selectedFOH.name
        eventAssignment.foh_level = selectedFOH.level
        eventAssignment.foh_specialist = false
        eventAssignment.foh_preference = true
        for (const date of eventDates) dailyAssignments[date].add(selectedFOH.id)
        currentMonthWorkload[selectedFOH.id] = (currentMonthWorkload[selectedFOH.id] || 0) + eventDates.length
        workload3Month[selectedFOH.id] = (workload3Month[selectedFOH.id] || 0) + eventDates.length
        await DB.prepare('INSERT INTO assignments (event_id, crew_id, role) VALUES (?, ?, ?)').bind(event.id, selectedFOH.id, 'FOH').run()
      }

      // Stage assignment
      const stageNeeded = event.stage_crew_needed - 1
      if (stageNeeded > 0) {
        const stageCandidates: { crew: CrewMember, score: number }[] = []
        for (const cr of crew) {
          if (!cr.can_stage) continue
          if (cr.id === eventAssignment.foh) continue
          if (!isAvailable(cr.id)) continue
          const workload = workload3Month[cr.id] || 0
          let score = 500 - (workload * 20)
          if (!cr.stage_only_if_urgent) score += 10
          if (cr.level === 'Hired') score -= 300
          stageCandidates.push({ crew: cr, score })
        }
        stageCandidates.sort((a, b) => b.score - a.score)

        const internalCandidates = stageCandidates.filter(c => c.crew.level !== 'Hired')
        const outsideCandidates = stageCandidates.filter(c => c.crew.level === 'Hired')
        const selectedStage: number[] = []
        const stageNames: string[] = []

        for (const candidate of internalCandidates) {
          if (selectedStage.length >= stageNeeded) break
          selectedStage.push(candidate.crew.id)
          stageNames.push(candidate.crew.name)
        }
        for (const candidate of outsideCandidates) {
          if (selectedStage.length >= stageNeeded) break
          selectedStage.push(candidate.crew.id)
          stageNames.push(candidate.crew.name)
        }

        for (const stageId of selectedStage) {
          const stageCrew = stageCandidates.find(c => c.crew.id === stageId)?.crew
          if (!stageCrew) continue
          for (const date of eventDates) dailyAssignments[date].add(stageCrew.id)
          currentMonthWorkload[stageCrew.id] = (currentMonthWorkload[stageCrew.id] || 0) + eventDates.length
          workload3Month[stageCrew.id] = (workload3Month[stageCrew.id] || 0) + eventDates.length
          await DB.prepare('INSERT INTO assignments (event_id, crew_id, role) VALUES (?, ?, ?)').bind(event.id, stageCrew.id, 'Stage').run()
        }

        eventAssignment.stage = selectedStage
        eventAssignment.stage_names = stageNames

        if (selectedStage.length < stageNeeded) {
          eventAssignment.stage_conflict = true
          conflicts.push({
            event_id: event.id, event_name: eventName, type: 'Stage',
            reason: `Only ${selectedStage.length + 1}/${event.stage_crew_needed} crew available`
          })
        }
      }

      if (event.event_group) {
        multiDayAssignments[event.event_group] = { foh: eventAssignment.foh, stage: eventAssignment.stage }
      }
      assignments.push(eventAssignment)
    }

    for (const [crewId, count] of Object.entries(currentMonthWorkload)) {
      await DB.prepare(
        `INSERT INTO workload_history (crew_id, month, assignment_count) VALUES (?, ?, ?)
         ON CONFLICT(crew_id, month) DO UPDATE SET assignment_count = assignment_count + ?`
      ).bind(parseInt(crewId), currentMonth, count, count).run()
    }

    return c.json({ assignments, conflicts })
  })

  // Get assignments for a batch
  app.get('/api/assignments', async (c) => {
    const { DB } = c.env
    const batchId = c.req.query('batch_id')
    const results = await DB.prepare(`
      SELECT a.*, e.program as event_name, e.event_date, e.venue, e.venue_normalized, e.vertical, e.team,
             e.sound_requirements, e.call_time, e.stage_crew_needed, e.event_group, e.needs_manual_review, e.manual_flag_reason,
             c.name as crew_name, c.level as crew_level
      FROM assignments a
      JOIN events e ON a.event_id = e.id
      JOIN crew c ON a.crew_id = c.id
      WHERE e.batch_id = ?
      ORDER BY e.event_date, e.program, a.role DESC
    `).bind(batchId).all()
    return c.json(results.results)
  })

  // Manual override assignment
  app.put('/api/assignments/:eventId', async (c) => {
    const { DB } = c.env
    const eventId = c.req.param('eventId')
    const { foh_id, stage_ids } = await c.req.json()
    await DB.prepare('DELETE FROM assignments WHERE event_id = ?').bind(eventId).run()
    if (foh_id) {
      await DB.prepare('INSERT INTO assignments (event_id, crew_id, role, was_manually_overridden) VALUES (?, ?, ?, 1)').bind(eventId, foh_id, 'FOH').run()
    }
    for (const stageId of stage_ids || []) {
      await DB.prepare('INSERT INTO assignments (event_id, crew_id, role, was_manually_overridden) VALUES (?, ?, ?, 1)').bind(eventId, stageId, 'Stage').run()
    }
    return c.json({ success: true })
  })

  // Export crew CSV
  app.get('/api/assignments/export/csv', async (c) => {
    const { DB } = c.env
    const batchId = c.req.query('batch_id')

    const events = await DB.prepare(
      'SELECT * FROM events WHERE batch_id = ? ORDER BY event_date, program'
    ).bind(batchId).all()

    const assignments = await DB.prepare(`
      SELECT a.event_id, a.role, c.name as crew_name, c.level
      FROM assignments a JOIN events e ON a.event_id = e.id JOIN crew c ON a.crew_id = c.id
      WHERE e.batch_id = ? ORDER BY a.role DESC
    `).bind(batchId).all()

    const assignmentMap: Record<number, { foh: string, stage: string[] }> = {}
    const hiredCount: Record<number, number> = {}

    for (const a of assignments.results as any[]) {
      if (!assignmentMap[a.event_id]) { assignmentMap[a.event_id] = { foh: '', stage: [] }; hiredCount[a.event_id] = 0 }
      let name = a.crew_name
      if (a.level === 'Hired') { hiredCount[a.event_id]++; name = `OC${hiredCount[a.event_id]}` }
      if (a.role === 'FOH') assignmentMap[a.event_id].foh = name
      else assignmentMap[a.event_id].stage.push(name)
    }

    const esc = (val: string) => {
      if (!val) return '""'
      if (val.includes(',') || val.includes('"') || val.includes('\n')) return '"' + val.replace(/"/g, '""') + '"'
      return '"' + val + '"'
    }

    let csv = 'Date,Program,Venue,Team,Sound Requirements,Call Time,Crew\n'
    for (const e of events.results as any[]) {
      const a = assignmentMap[e.id] || { foh: '', stage: [] }
      const crewList = [a.foh, ...a.stage].filter(Boolean).join(', ')
      csv += `${e.event_date},${esc(e.program)},${esc(e.venue)},${esc(e.team)},${esc(e.sound_requirements)},${esc(e.call_time)},${esc(crewList)}\n`
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="crew_assignments_${batchId}.csv"`
      }
    })
  })

  // Workload report
  app.get('/api/crew/workload', async (c) => {
    const { DB } = c.env
    const month = c.req.query('month') || new Date().toISOString().substring(0, 7)
    const workload = await DB.prepare(`
      SELECT c.name, c.level, COALESCE(w.assignment_count, 0) as assignments
      FROM crew c LEFT JOIN workload_history w ON c.id = w.crew_id AND w.month = ?
      ORDER BY CASE c.level WHEN 'Senior' THEN 1 WHEN 'Mid' THEN 2 WHEN 'Junior' THEN 3 WHEN 'Hired' THEN 4 END, c.name
    `).bind(month).all()
    return c.json(workload.results)
  })
}
