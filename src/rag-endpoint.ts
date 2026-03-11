// RAG Query Endpoint - Version 4.0
// Natural Language Search + Smart Analytics + Predictive Insights

import type { Context } from 'hono'
import type {
  Env,
  Event,
  RAGQueryRequest,
  RAGQueryResponse,
  ExtractedEntities,
  ClaudeSonnetRequest,
  ClaudeSonnetResponse
} from './types'
import {
  extractEntities,
  semanticSearch,
  getCrewWorkload,
  getVenueStats,
  predictAvailability,
  formatRAGResponse,
  resolveVenueName,
  expandVenueQuery
} from './rag-utils'

export async function handleRAGQuery(c: Context<{ Bindings: Env }>) {
  const startTime = Date.now()
  
  try {
    const body: RAGQueryRequest = await c.req.json()
    const { query, session_id, max_results = 50 } = body
    
    // Smart defaults: Only include analytics/predictions if query explicitly asks
    const queryLower = query.toLowerCase()
    const include_analytics = queryLower.includes('insight') || 
                             queryLower.includes('analyz') || 
                             queryLower.includes('pattern') || 
                             queryLower.includes('busiest') ||
                             queryLower.includes('most') ||
                             queryLower.includes('compare')
    
    const include_predictions = queryLower.includes('available') || 
                                queryLower.includes('free') || 
                                queryLower.includes('predict')
    
    // Detect aggregation queries (count, total, how many)
    const is_aggregation = queryLower.includes('how many') ||
                          queryLower.includes('count') ||
                          queryLower.includes('total') ||
                          queryLower.includes('number of')
    
    if (!query) {
      return c.json({ success: false, error: 'Query is required' }, 400)
    }
    
    const sessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const apiKey = c.env.ANTHROPIC_API_KEY
    
    // ============================================
    // STEP 1: Load Conversation History
    // ============================================
    const history = await c.env.DB.prepare(`
      SELECT user_query, ai_response 
      FROM conversation_history 
      WHERE session_id = ? AND success = 1
      ORDER BY created_at DESC 
      LIMIT 3
    `).bind(sessionId).all()
    
    const conversationHistory = history.results.map((h: any) => ({
      user: h.user_query,
      assistant: JSON.parse(h.ai_response).answer || ''
    })).reverse() // Oldest first
    
    // ============================================
    // STEP 2: Extract Entities with Claude Sonnet 4
    // ============================================
    console.log('🧠 Extracting entities...')
    const entities: ExtractedEntities = await extractEntities(
      query,
      apiKey,
      conversationHistory
    )
    console.log('✅ Entities:', JSON.stringify(entities))
    
    // ============================================
    // STEP 2.5: Validation & Clarification (if confidence is low)
    // ============================================
    if (entities.confidence && entities.confidence < 0.7) {
      console.log(`⚠️ Low confidence (${entities.confidence}) - requesting clarification`)
      
      // Generate clarification questions based on ambiguity
      const clarifications = []
      
      if (!entities.date && !entities.start_date && !entities.month && !entities.year) {
        clarifications.push("Which time period are you asking about? (e.g., this month, next week, specific date)")
      }
      
      if (queryLower.includes('december 25') && !queryLower.includes('25th') && !queryLower.includes('december 25th')) {
        clarifications.push("Did you mean: (1) December 25th (single day) or (2) December 2025 (entire month)?")
      }
      
      if (entities.venue && !await resolveVenueName(entities.venue, c.env.DB)) {
        clarifications.push(`I couldn't find a venue matching "${entities.venue}". Did you mean: Tata Theatre (TT), Jamshed Bhabha Theatre (JBT), or Experimental Theatre (TET)?`)
      }
      
      if (clarifications.length > 0) {
        return c.json({
          success: true,
          answer: `I need clarification to give you an accurate answer:\n\n${clarifications.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}`,
          events: [],
          needs_clarification: true,
          clarification_questions: clarifications,
          metadata: {
            query_intent: entities.intent,
            entities_extracted: entities,
            confidence: entities.confidence
          }
        })
      }
    }
    
    // ============================================
    // STEP 3: Resolve Venue Names
    // ============================================
    if (entities.venue) {
      const canonical = await resolveVenueName(entities.venue, c.env.DB)
      if (canonical) {
        entities.venue = canonical
      }
    }
    
    // ============================================
    // STEP 4: Semantic Search (optional, for ranking boost)
    // ============================================
    let semanticEventIds: number[] = []
    let vectorize_used = false
    
    try {
      if (c.env.VECTORIZE) {
        console.log('🔍 Performing semantic search...')
        semanticEventIds = await semanticSearch(query, entities, c.env, max_results * 2)
        vectorize_used = true
        console.log(`✅ Found ${semanticEventIds.length} semantic matches`)
      }
    } catch (error) {
      console.log('⚠️ Vectorize error, continuing with SQL only:', error)
    }
    
    // ============================================
    // STEP 5: SQL Query (ALWAYS EXECUTE - Vectorize is for ranking only)
    // ============================================
    let sqlQuery = 'SELECT * FROM events WHERE 1=1'
    const sqlParams: any[] = []
    
    // Date filters
    if (entities.start_date && entities.end_date) {
      sqlQuery += ' AND event_date >= ? AND event_date <= ?'
      sqlParams.push(entities.start_date, entities.end_date)
    } else if (entities.date) {
      sqlQuery += ' AND event_date = ?'
      sqlParams.push(entities.date)
    } else if (entities.month) {
      sqlQuery += ` AND strftime('%Y-%m', event_date) = ?`
      sqlParams.push(entities.month)
    } else if (entities.year) {
      sqlQuery += ` AND strftime('%Y', event_date) = ?`
      sqlParams.push(entities.year)
    } else {
      // Default: last 3 months + next 6 months
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const sixMonthsAhead = new Date()
      sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6)
      
      sqlQuery += ' AND event_date >= ? AND event_date <= ?'
      sqlParams.push(
        threeMonthsAgo.toISOString().split('T')[0],
        sixMonthsAhead.toISOString().split('T')[0]
      )
    }
    
    // Venue filter (use ALL aliases for accurate matching)
    if (entities.venue) {
      const venueAliases = await expandVenueQuery(entities.venue, c.env.DB)
      if (venueAliases.length > 0) {
        // Match ANY of the aliases (TT, TATA, Tata Theatre, etc.)
        const venueConditions = venueAliases.map(() => 'venue LIKE ?').join(' OR ')
        sqlQuery += ` AND (${venueConditions})`
        venueAliases.forEach(alias => sqlParams.push(`%${alias}%`))
        console.log(`🏛️ Venue filter expanded: ${entities.venue} → [${venueAliases.join(', ')}]`)
      } else {
        // Fallback to original venue name if no aliases found
        sqlQuery += ' AND venue LIKE ?'
        sqlParams.push(`%${entities.venue}%`)
      }
    }
    
    // Crew filter
    if (entities.crew) {
      const crewNames = entities.crew.split(',').map(c => c.trim())
      const crewConditions = crewNames.map(() => 'crew LIKE ?').join(' OR ')
      sqlQuery += ` AND (${crewConditions})`
      crewNames.forEach(crew => sqlParams.push(`%${crew}%`))
    }
    
    // Program filter
    if (entities.program) {
      sqlQuery += ' AND program LIKE ?'
      sqlParams.push(`%${entities.program}%`)
    }
    
    // NOTE: We do NOT filter SQL by Vectorize results anymore
    // Vectorize is only used for relevance ranking, not filtering
    // This ensures SQL always returns results even if Vectorize metadata filter fails
    
    // For aggregation, availability, and analytics queries, don't limit results
    // - Aggregation: Need ALL events to count accurately
    // - Availability: Need ALL events to calculate truly free dates
    // - Analytics: Need ALL events for accurate analysis (crew workload, venue stats)
    // - Other queries: Limit for performance
    const is_analytics = include_analytics && (entities.intent === 'analytics' || entities.intent === 'comparison')
    if (!is_aggregation && entities.intent !== 'availability' && !is_analytics) {
      sqlQuery += ` ORDER BY event_date ASC LIMIT ${max_results * 2}` // Get more results for filtering
    } else {
      sqlQuery += ` ORDER BY event_date ASC` // No limit for aggregation/availability/analytics queries
    }
    
    console.log('📊 Executing SQL:', sqlQuery.substring(0, 200))
    const eventsResult = await c.env.DB.prepare(sqlQuery).bind(...sqlParams).all()
    let events = eventsResult.results as Event[]
    
    console.log(`✅ Retrieved ${events.length} SQL results`)
    
    // ============================================
    // STEP 5.5: Smart Ranking & Filtering
    // ============================================
    // If Vectorize provided results, boost those events in ranking
    if (vectorize_used && semanticEventIds.length > 0) {
      const semanticSet = new Set(semanticEventIds)
      events = events.sort((a, b) => {
        const aIsSemanticMatch = semanticSet.has(a.id) ? 0 : 1
        const bIsSemanticMatch = semanticSet.has(b.id) ? 0 : 1
        if (aIsSemanticMatch !== bIsSemanticMatch) {
          return aIsSemanticMatch - bIsSemanticMatch // Semantic matches first
        }
        return new Date(a.event_date).getTime() - new Date(b.event_date).getTime() // Then by date
      })
      console.log(`🎯 Boosted ${semanticEventIds.length} semantic matches in ranking`)
    }
    
    // Limit to max_results (unless we need ALL events for accurate calculations)
    // - Aggregation queries: Need ALL events to count accurately
    // - Availability queries: Need ALL events to find truly free dates
    // - Analytics queries: Need ALL events for accurate statistics
    if (!is_aggregation && entities.intent !== 'availability' && !is_analytics) {
      events = events.slice(0, max_results)
    }
    console.log(`📋 Final result: ${events.length} events (is_aggregation: ${is_aggregation}, is_analytics: ${is_analytics}, intent: ${entities.intent})`)
    
    // ============================================
    // STEP 6: Generate Analytics (if requested)
    // ============================================
    let insights: any = undefined
    
    if (include_analytics && (entities.intent === 'analytics' || entities.intent === 'comparison')) {
      console.log('📈 Generating analytics...')
      
      const dateRange = {
        start: entities.start_date || events[0]?.event_date || '',
        end: entities.end_date || events[events.length - 1]?.event_date || ''
      }
      
      // Venue stats
      const venueStats = await getVenueStats(dateRange.start, dateRange.end, c.env.DB)
      const busiestVenue = Object.entries(venueStats).sort((a, b) => b[1] - a[1])[0]
      
      // Crew workload
      const crewWorkload: Record<string, number> = {}
      for (const event of events) {
        const crewNames = event.crew.split(',').map(c => c.trim())
        for (const crew of crewNames) {
          crewWorkload[crew] = (crewWorkload[crew] || 0) + 1
        }
      }
      const busiestCrew = Object.entries(crewWorkload).sort((a, b) => b[1] - a[1])[0]
      
      insights = {
        total_events: events.length,
        date_range: dateRange,
        busiest_venue: busiestVenue?.[0],
        busiest_crew: busiestCrew?.[0],
        venue_stats: venueStats,
        crew_workload: crewWorkload
      }
      
      console.log('✅ Analytics generated')
    }
    
    // ============================================
    // STEP 7: Generate Predictions (ALWAYS for availability queries)
    // ============================================
    let predictions: any = undefined
    
    // Auto-detect "free dates" / "available" queries
    if (include_predictions || entities.intent === 'availability') {
      console.log('🔮 Generating availability predictions...')
      
      if (entities.venue && entities.start_date && entities.end_date) {
        // Venue-specific availability
        const freeDates = await predictAvailability(
          entities.venue,
          entities.start_date,
          entities.end_date,
          c.env.DB
        )
        
        predictions = {
          venue: entities.venue,
          date_range: { start: entities.start_date, end: entities.end_date },
          free_dates: freeDates,
          free_date_count: freeDates.length,
          next_available: freeDates[0] || null,
          occupied_date_count: events.length
        }
        
        console.log(`✅ Venue predictions: ${freeDates.length} free dates, ${events.length} occupied dates`)
      } else if (!entities.venue && entities.start_date && entities.end_date) {
        // General availability (no specific venue) - calculate free dates across ALL venues
        console.log('📅 Calculating general free dates (no venue specified)...')
        
        // Get all dates in range
        const start = new Date(entities.start_date)
        const end = new Date(entities.end_date)
        const allDates: string[] = []
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          allDates.push(d.toISOString().split('T')[0])
        }
        
        // Get dates with events
        const occupiedDates = new Set(events.map(e => e.event_date))
        
        // Calculate free dates (dates with NO events at any venue)
        const freeDates = allDates.filter(date => !occupiedDates.has(date))
        
        predictions = {
          venue: 'ALL VENUES',
          date_range: { start: entities.start_date, end: entities.end_date },
          free_dates: freeDates,
          free_date_count: freeDates.length,
          next_available: freeDates[0] || null,
          occupied_date_count: allDates.length - freeDates.length
        }
        
        console.log(`✅ General predictions: ${freeDates.length} free dates (no events at any venue), ${occupiedDates.size} occupied dates`)
      }
    }
    
    // ============================================
    // STEP 8: Generate Natural Language Response with Claude Sonnet 4
    // ============================================
    console.log('🤖 Generating response with Claude Sonnet 4...')
    
    const systemPrompt = `You are a concise assistant for NCPA Sound Crew event management.

RESPONSE RULES:
1. **Be EXTREMELY concise** - max 2-3 sentences for simple queries
2. **Only elaborate if needed** - for complex analysis queries
3. **No unnecessary context** - get straight to the answer
4. **Format for scanning** - use lists for multiple items
5. **Omit obvious insights** - users know what they're looking at

CURRENT DATE: ${new Date().toISOString().split('T')[0]}`

    const contextPrompt = `
USER QUERY: "${query}"

EXTRACTED INTENT: ${entities.intent}
EXTRACTED ENTITIES: ${JSON.stringify(entities)}

MATCHING EVENTS (${events.length} results):
${events.length > 0 ? JSON.stringify(events.slice(0, 10), null, 2) : 'No events found'}
${events.length > 10 ? `\n... and ${events.length - 10} more events` : ''}

${insights ? `\nANALYTICS INSIGHTS:\n${JSON.stringify(insights, null, 2)}` : ''}

${predictions ? `\nPREDICTIVE INSIGHTS:\n${JSON.stringify(predictions, null, 2)}` : ''}

CONVERSATION HISTORY:
${conversationHistory.length > 0 
  ? conversationHistory.map(h => `User: ${h.user}\nAssistant: ${h.assistant}`).join('\n\n')
  : 'No previous conversation'}

TASK:
Answer the user's query in 1-2 sentences. If predictions show free dates, LIST THEM EXPLICITLY.

CRITICAL RULES FOR COUNT/AGGREGATION QUERIES:
1. LOOK AT "MATCHING EVENTS (X results)" above - that X is the EXACT count
2. For the query "${query}", the EXACT count is: ${events.length} events
3. State this EXACT number in your answer: "**${events.length} events**"
4. DO NOT use any other number. DO NOT estimate. DO NOT round.
5. If you see "MATCHING EVENTS (${events.length} results)", answer with ${events.length}

CRITICAL RULES FOR "FREE DATES" QUERIES:
1. If PREDICTIVE INSIGHTS shows free_dates → List those specific dates
2. If free_dates is empty → State "All dates are occupied"
3. NEVER say "based on X events" - just state the free dates directly
4. Format dates clearly: "Dec 1, 5, 7-9, 15" (use ranges for consecutive dates)

EXAMPLES:
- "How many events in December?" → "**${events.length} events** scheduled in December 2025"
- "What dates are free?" → (use predictions.free_dates, NOT events.length)
- "Show Ashwin's events" → "Ashwin has 11 events scheduled..."

Be direct. No fluff. Use EXACT numbers from the data above - NOT from memory or estimation.`

    const request: ClaudeSonnetRequest = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512, // Reduced from 2048 to encourage concise responses
      temperature: 0.5, // Lower temperature for more focused responses
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: contextPrompt
        }
      ]
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }
    
    const claudeResult: ClaudeSonnetResponse = await response.json()
    const answer = claudeResult.content[0].text.trim()
    const tokenCount = claudeResult.usage.input_tokens + claudeResult.usage.output_tokens
    
    console.log(`✅ Response generated (${tokenCount} tokens)`)
    
    // ============================================
    // STEP 9: Format Response
    // ============================================
    const recommendations: string[] = []
    
    // Auto-generate recommendations based on insights
    if (insights?.crew_workload) {
      const maxWorkload = Math.max(...Object.values(insights.crew_workload))
      const minWorkload = Math.min(...Object.values(insights.crew_workload))
      
      if (maxWorkload > minWorkload * 2) {
        recommendations.push('Consider balancing crew workload - some members are handling 2x more events')
      }
    }
    
    if (insights?.venue_stats) {
      const totalEvents = Object.values(insights.venue_stats).reduce((a: any, b: any) => a + b, 0)
      const venueCount = Object.keys(insights.venue_stats).length
      
      if (totalEvents > venueCount * 10) {
        recommendations.push('High event volume detected - review scheduling capacity')
      }
    }
    
    const responseTime = Date.now() - startTime
    
    // For aggregation and availability queries, don't return event objects
    // - Aggregation: The answer already contains the count
    // - Availability: The answer contains free dates; showing occupied events is confusing
    const displayEvents = (entities.intent === 'aggregation' || entities.intent === 'availability') ? [] : events
    
    const ragResponse: RAGQueryResponse = {
      success: true,
      answer,
      events: displayEvents,
      insights,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      ...formatRAGResponse(answer, displayEvents, entities, insights, recommendations),
      metadata: {
        query_intent: entities.intent,
        entities_extracted: entities,
        vectorize_used,
        claude_model: 'claude-sonnet-4-20250514',
        response_time_ms: responseTime,
        token_count: tokenCount,
        total_events_found: events.length // Keep actual count in metadata
      },
      session_id: sessionId
    }
    
    // ============================================
    // STEP 10: Save to Conversation History
    // ============================================
    await c.env.DB.prepare(`
      INSERT INTO conversation_history (
        session_id, user_query, ai_response, context_used, 
        entities_extracted, query_intent, token_count, 
        response_time_ms, success
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      query,
      JSON.stringify(ragResponse),
      JSON.stringify({ event_count: events.length, insights, predictions }),
      JSON.stringify(entities),
      entities.intent,
      tokenCount,
      responseTime,
      1
    ).run()
    
    console.log(`✅ RAG Query completed in ${responseTime}ms`)
    
    return c.json(ragResponse)
    
  } catch (error: any) {
    console.error('❌ RAG Query failed:', error)
    
    const responseTime = Date.now() - startTime
    
    return c.json({
      success: false,
      error: 'RAG query processing failed',
      details: error.message,
      metadata: {
        response_time_ms: responseTime
      }
    }, 500)
  }
}
