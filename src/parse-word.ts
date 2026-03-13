import { Hono } from 'hono'
import type { Bindings } from './types'

// Helper: Parse a chunk of document text with Claude Sonnet 4
// EXACT implementation from ncpa-sound-manager
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
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Chunk ${chunkNumber} AI error:`, error)
    throw new Error(`AI parsing failed for chunk ${chunkNumber}`)
  }

  const aiResult = await response.json() as any
  let aiResponse = aiResult.content[0].text.trim()
  aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '')

  try {
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      let cleanedJson = jsonMatch[0]
        .replace(/,(\s*[\]}])/g, '$1')
        .replace(/("[^"]*)\n([^"]*")/g, '$1 $2')
      return JSON.parse(cleanedJson)
    } else {
      return JSON.parse(aiResponse)
    }
  } catch (parseError: any) {
    console.error(`Failed to parse chunk ${chunkNumber} response:`, parseError.message)
    return []
  }
}

// Helper: Remove duplicate events
function deduplicateEvents(events: any[]): any[] {
  const seen = new Set()
  const unique = []
  for (const event of events) {
    const key = `${event.event_date}|${event.program}|${event.venue}`.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(event)
    }
  }
  return unique
}

export function setupParseWordEndpoints(app: Hono<{ Bindings: Bindings }>) {

  // AI-powered Word document parser with chunked processing
  // EXACT from ncpa-sound-manager
  app.post('/api/ai/parse-word', async (c) => {
    try {
      const body = await c.req.json()
      const { text, filename } = body

      if (!text) {
        return c.json({ success: false, error: 'Document text is required' }, 400)
      }

      // Read API key from D1 settings first, fall back to env var
      const keyRow = await c.env.DB.prepare(
        "SELECT value FROM app_settings WHERE key = 'anthropic_api_key'"
      ).first() as any
      const apiKey = keyRow?.value || c.env.ANTHROPIC_API_KEY || ''
      if (!apiKey) {
        return c.json({
          success: false,
          error: 'Anthropic API key not configured. Add it in Settings → AI Key.'
        }, 500)
      }

      let contextHint = ''
      if (filename) {
        const monthMatch = filename.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i)
        const yearMatch = filename.match(/20\d{2}/)
        if (monthMatch || yearMatch) {
          contextHint = `\n\nContext from filename: ${monthMatch?.[0] || ''} ${yearMatch?.[0] || ''}`
        }
      }

      console.log(`📄 Processing Word document: ${text.length} characters`)

      // CHUNKED PROCESSING: Split at 18K chars, split intelligently at event boundaries
      const CHUNK_SIZE = 18000
      const chunks: string[] = []

      if (text.length <= CHUNK_SIZE) {
        chunks.push(text)
      } else {
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          let chunkEnd = Math.min(i + CHUNK_SIZE, text.length)
          if (chunkEnd < text.length) {
            const searchArea = text.substring(chunkEnd, Math.min(chunkEnd + 500, text.length))
            const dayMatch = searchArea.match(/\n(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}(st|nd|rd|th)/i)
            if (dayMatch && dayMatch.index !== undefined) {
              chunkEnd += dayMatch.index
            }
          }
          chunks.push(text.substring(i, chunkEnd))
        }
      }

      console.log(`📊 Split into ${chunks.length} chunks`)

      const allEvents: any[] = []
      for (let i = 0; i < chunks.length; i++) {
        console.log(`🤖 Processing chunk ${i + 1}/${chunks.length}...`)
        try {
          const chunkEvents = await parseChunkWithClaude(chunks[i], contextHint, apiKey, i + 1, chunks.length)
          console.log(`✅ Chunk ${i + 1}: Found ${chunkEvents.length} events`)
          allEvents.push(...chunkEvents)
        } catch (chunkError: any) {
          console.error(`❌ Chunk ${i + 1} failed:`, chunkError.message)
        }
      }

      let validEvents = allEvents.filter(event => event.event_date && event.program && event.venue)
      validEvents = deduplicateEvents(validEvents)
      validEvents.sort((a, b) => a.event_date.localeCompare(b.event_date))

      console.log(`✅ Parsed ${validEvents.length} unique events from ${chunks.length} chunks`)

      return c.json({
        success: true,
        events: validEvents,
        message: `Found ${validEvents.length} events (processed in ${chunks.length} chunks)`,
        chunks: chunks.length,
        totalEvents: allEvents.length,
        uniqueEvents: validEvents.length
      })

    } catch (error: any) {
      console.error('Word parsing error:', error)
      return c.json({ success: false, error: error.message || 'Failed to parse document' }, 500)
    }
  })
}
