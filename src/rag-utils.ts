// RAG System Utilities for NCPA Sound Crew
// Version 4.0 - Claude Sonnet 4 + Cloudflare Vectorize

import type {
  Env,
  Event,
  ExtractedEntities,
  QueryIntent,
  RAGQueryResponse,
  ClaudeSonnetRequest,
  ClaudeSonnetResponse,
  EmbeddingMetadata,
  VenueAlias
} from './types'

// ============================================
// 1. ENTITY EXTRACTION with Claude Sonnet 4
// ============================================

export async function extractEntities(
  query: string,
  apiKey: string,
  conversationHistory?: Array<{user: string; assistant: string}>
): Promise<ExtractedEntities> {
  
  const historyContext = conversationHistory?.length
    ? `\n\nCONVERSATION HISTORY:\n${conversationHistory.map(h => 
        `User: ${h.user}\nAssistant: ${h.assistant}`
      ).join('\n\n')}`
    : ''
  
  const systemPrompt = `You are an expert entity extraction system for NCPA Sound Crew event management.

Your job: Extract structured information from natural language queries about events, venues, crew, and schedules.

VENUE NAMES (be flexible with variations):
- Tata Theatre (TT, Tata, Tata Theater)
- Jamshed Bhabha Theatre (JBT, Bhabha, Jamshed Bhabha)
- Experimental Theatre (ET, Exp, Experimental)
- Godrej Dance Theatre (GDT, Godrej)
- Little Theatre (LT, Little)
- Sea View Room (SVR, Sea View)

CREW MEMBERS:
Ashwin, Naren, Sandeep, Coni, Nikhil, NS, Aditya, Viraj, Shridhar, Nazar, Omkar, Akshay, OC1, OC2, OC3

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

OUTPUT FORMAT (JSON only):
{
  "intent": "search|analytics|prediction|availability|comparison|aggregation",
  "venue": "canonical venue name or null",
  "crew": "crew name or null",
  "date": "YYYY-MM-DD or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "month": "YYYY-MM or null",
  "year": "YYYY or null",
  "program": "program keywords or null",
  "confidence": 0.0-1.0
}

INTENT CLASSIFICATION:
- "search": Find specific events (e.g., "Show me Tata events")
- "analytics": Ask about patterns, stats (e.g., "Which venue is busiest?")
- "prediction": Future availability (e.g., "When will Ashwin be free?")
- "availability": Check specific date/crew (e.g., "Is Tata free on Dec 5?")
- "comparison": Compare venues/crew (e.g., "Ashwin vs Naren workload")
- "aggregation": Count, sum, totals (e.g., "Total events in December")

EXAMPLES:

Q: "Show me all Ashwin's events in December"
A: {"intent":"search","venue":null,"crew":"Ashwin","date":null,"start_date":"2025-12-01","end_date":"2025-12-31","month":"2025-12","year":"2025","program":null,"confidence":0.95}

Q: "Which dates is Tata Theatre free next week?"
A: {"intent":"availability","venue":"Tata Theatre","crew":null,"date":null,"start_date":"2025-12-02","end_date":"2025-12-08","month":"2025-12","year":"2025","program":null,"confidence":0.90}

Q: "Compare Ashwin and Naren's workload in November"
A: {"intent":"comparison","venue":null,"crew":"Ashwin,Naren","date":null,"start_date":"2025-11-01","end_date":"2025-11-30","month":"2025-11","year":"2025","program":null,"confidence":0.92}

Q: "Busiest venue last month"
A: {"intent":"analytics","venue":null,"crew":null,"date":null,"start_date":"2025-11-01","end_date":"2025-11-30","month":"2025-11","year":"2025","program":null,"confidence":0.88}

Q: "Free dates at TATA" (no time specified)
A: {"intent":"availability","venue":"Tata Theatre","crew":null,"date":null,"start_date":"2025-12-01","end_date":"2025-12-31","month":"2025-12","year":"2025","program":null,"confidence":0.90}

Q: "How many events in December 25?" (ambiguous: could be Dec 25th or year 2025)
A: {"intent":"aggregation","venue":null,"crew":null,"date":null,"start_date":"2025-12-01","end_date":"2025-12-31","month":"2025-12","year":"2025","program":null,"confidence":0.85}

Q: "Events on December 25th" (clearly asking for single day)
A: {"intent":"search","venue":null,"crew":null,"date":"2025-12-25","start_date":null,"end_date":null,"month":"2025-12","year":"2025","program":null,"confidence":0.95}

IMPORTANT RULES:
1. "December 25" without "th" or "25th" → interpret as year 2025 (month December)
2. "December 25th" or "25th December" → interpret as single day (December 25, 2025)
3. If no date is specified, default to current/next month only (not past months)
4. Current date context: ${new Date().toISOString().split('T')[0]}`

  const request: ClaudeSonnetRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.1, // Low temperature for consistent extraction
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `${historyContext}\n\nEXTRACT ENTITIES FROM:\n"${query}"\n\nReturn ONLY the JSON object, no markdown, no explanations.`
      }
    ]
  }

  try {
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

    const result: ClaudeSonnetResponse = await response.json()
    const text = result.content[0].text.trim()
    
    // Clean markdown if present
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    
    const entities: ExtractedEntities = JSON.parse(cleaned)
    
    // ============================================
    // SMART DATE DEFAULTS: If no dates specified, use current month onwards
    // ============================================
    const now = new Date()
    const currentMonth = now.toISOString().substring(0, 7) // YYYY-MM
    const firstOfMonth = `${currentMonth}-01`
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().substring(0, 10) // Last day of current month
    
    // For queries without dates, default to current month
    // Applies to: availability, prediction, analytics, search
    if (!entities.start_date && !entities.date && !entities.month) {
      entities.start_date = firstOfMonth
      entities.end_date = lastOfMonth
      entities.month = currentMonth
      entities.year = now.getFullYear().toString()
      console.log(`🗓️ Applied smart date default: ${firstOfMonth} to ${lastOfMonth}`)
    }
    
    return entities
    
  } catch (error) {
    console.error('Entity extraction failed:', error)
    // Fallback to basic extraction
    return {
      intent: 'search',
      confidence: 0.3
    }
  }
}

// ============================================
// 2. GENERATE EMBEDDINGS with Cloudflare AI
// ============================================

export async function generateEmbedding(
  text: string,
  aiBinding: any
): Promise<number[]> {
  try {
    // Use BGE-base-en-v1.5 (768 dimensions)
    const result = await aiBinding.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    })
    
    return result.data[0] as number[]
  } catch (error) {
    console.error('Embedding generation failed:', error)
    throw error
  }
}

export async function generateEventEmbedding(
  event: Event,
  aiBinding: any
): Promise<{ text: string; vector: number[]; metadata: EmbeddingMetadata }> {
  
  // Create rich searchable text
  const embeddingText = [
    `Date: ${event.event_date}`,
    `Program: ${event.program}`,
    `Venue: ${event.venue}`,
    `Crew: ${event.crew}`,
    `Team: ${event.team}`,
    event.sound_requirements ? `Sound: ${event.sound_requirements}` : '',
    event.call_time ? `Call time: ${event.call_time}` : ''
  ].filter(Boolean).join(' | ')
  
  const vector = await generateEmbedding(embeddingText, aiBinding)
  
  const date = new Date(event.event_date)
  const metadata: EmbeddingMetadata = {
    event_id: event.id,
    venue: event.venue,
    crew: event.crew,
    date: event.event_date,
    month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    year: String(date.getFullYear())
  }
  
  return { text: embeddingText, vector, metadata }
}

// ============================================
// 3. SEMANTIC SEARCH with Vectorize
// ============================================

export async function semanticSearch(
  query: string,
  entities: ExtractedEntities,
  env: Env,
  topK: number = 30
): Promise<number[]> {
  
  try {
    // Generate query embedding
    const queryVector = await generateEmbedding(query, env.AI)
    
    // Build metadata filters - ONLY use month/year for accuracy
    // Venue/crew matching is too strict due to name variations
    const filter: Record<string, any> = {}
    
    // Only filter by date ranges (these are reliable)
    if (entities.month) {
      filter.month = entities.month
    }
    if (entities.year) {
      filter.year = entities.year
    }
    
    // NOTE: We DO NOT filter by venue/crew in Vectorize metadata
    // because venue names vary (e.g., "Tata Theatre" vs "TATA" vs "TT")
    // Instead, we let semantic search find relevant events,
    // then filter by venue/crew in SQL post-processing
    
    console.log('🔍 Vectorize metadata filter:', JSON.stringify(filter))
    
    // Query Vectorize
    const results = await env.VECTORIZE.query(queryVector, {
      topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      returnMetadata: true
    })
    
    // Extract event IDs
    return results.matches.map(m => 
      parseInt(m.id.replace('event-', ''))
    )
    
  } catch (error) {
    console.error('Semantic search failed:', error)
    return []
  }
}

// ============================================
// 4. VENUE NAME RESOLUTION
// ============================================

export async function resolveVenueName(
  alias: string,
  db: D1Database
): Promise<string | null> {
  
  const result = await db.prepare(`
    SELECT canonical_name 
    FROM venue_aliases 
    WHERE LOWER(alias) = LOWER(?)
    LIMIT 1
  `).bind(alias).first()
  
  return result?.canonical_name || null
}

export async function expandVenueQuery(
  venueName: string,
  db: D1Database
): Promise<string[]> {
  
  const results = await db.prepare(`
    SELECT alias 
    FROM venue_aliases 
    WHERE canonical_name = (
      SELECT canonical_name 
      FROM venue_aliases 
      WHERE LOWER(alias) = LOWER(?)
      LIMIT 1
    )
  `).bind(venueName).all()
  
  return results.results.map((r: any) => r.alias)
}

// ============================================
// 5. ANALYTICS HELPERS
// ============================================

export async function getCrewWorkload(
  crewName: string,
  month: string,
  db: D1Database
): Promise<{ event_count: number; events: Event[] }> {
  
  const events = await db.prepare(`
    SELECT * FROM events 
    WHERE crew LIKE ? 
      AND strftime('%Y-%m', event_date) = ?
    ORDER BY event_date ASC
  `).bind(`%${crewName}%`, month).all()
  
  return {
    event_count: events.results.length,
    events: events.results as Event[]
  }
}

export async function getVenueStats(
  startDate: string,
  endDate: string,
  db: D1Database
): Promise<Record<string, number>> {
  
  const results = await db.prepare(`
    SELECT venue, COUNT(*) as count 
    FROM events 
    WHERE event_date >= ? AND event_date <= ?
    GROUP BY venue 
    ORDER BY count DESC
  `).bind(startDate, endDate).all()
  
  const stats: Record<string, number> = {}
  for (const row of results.results as any[]) {
    stats[row.venue] = row.count
  }
  
  return stats
}

export async function predictAvailability(
  venue: string,
  startDate: string,
  endDate: string,
  db: D1Database
): Promise<string[]> {
  
  // Get all dates in range
  const start = new Date(startDate)
  const end = new Date(endDate)
  const allDates: string[] = []
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0])
  }
  
  // Resolve venue name to get ALL possible aliases
  const canonicalVenue = await resolveVenueName(venue, db)
  const venueAliases = canonicalVenue 
    ? await expandVenueQuery(canonicalVenue, db)
    : [venue]
  
  console.log(`🔍 Checking availability for venue: "${venue}" → Aliases: [${venueAliases.join(', ')}]`)
  
  // Build query with OR conditions for all aliases
  const venueConditions = venueAliases.map(() => 'venue = ?').join(' OR ')
  
  const booked = await db.prepare(`
    SELECT DISTINCT event_date, venue
    FROM events 
    WHERE (${venueConditions})
      AND event_date >= ? 
      AND event_date <= ?
  `).bind(...venueAliases, startDate, endDate).all()
  
  console.log(`📅 Found ${booked.results.length} booked dates for ${venue}`)
  
  const bookedDates = new Set(booked.results.map((r: any) => r.event_date))
  const freeDates = allDates.filter(d => !bookedDates.has(d))
  
  console.log(`✅ ${freeDates.length} free dates, ${bookedDates.size} occupied dates`)
  
  // Return free dates
  return freeDates
}

// ============================================
// 6. RESPONSE FORMATTING
// ============================================

export function formatRAGResponse(
  answer: string,
  events: Event[],
  entities: ExtractedEntities,
  insights?: any,
  recommendations?: string[]
): Partial<RAGQueryResponse> {
  
  const follow_up_queries: string[] = []
  
  // Generate contextual follow-ups based on intent
  if (entities.intent === 'search' && events.length > 0) {
    follow_up_queries.push(
      `Show crew workload for these events`,
      `Which venues are used most?`,
      `Are there any scheduling conflicts?`
    )
  } else if (entities.intent === 'analytics') {
    follow_up_queries.push(
      `Show detailed breakdown`,
      `Compare with previous month`,
      `Predict next month's pattern`
    )
  } else if (entities.intent === 'availability') {
    follow_up_queries.push(
      `Check crew availability for these dates`,
      `Show alternative venues`,
      `What's the booking pattern?`
    )
  }
  
  return {
    answer,
    events,
    insights,
    recommendations,
    follow_up_queries
  }
}
