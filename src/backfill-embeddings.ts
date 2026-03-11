// Embedding Backfill Script for Version 4.0
// Generates embeddings for all existing events

import type { Env, Event } from './types'
import { generateEventEmbedding } from './rag-utils'

export async function backfillEmbeddings(c: any, batchSize: number = 50) {
  const startTime = Date.now()
  let totalProcessed = 0
  let totalSuccess = 0
  let totalFailed = 0
  let totalSkipped = 0
  
  console.log('🚀 Starting embedding backfill...')
  
  try {
    // Get all events without embeddings
    const eventsWithoutEmbeddings = await c.env.DB.prepare(`
      SELECT * FROM events 
      WHERE embedding_id IS NULL 
      ORDER BY event_date DESC
    `).all()
    
    const events = eventsWithoutEmbeddings.results as Event[]
    const totalEvents = events.length
    
    console.log(`📊 Found ${totalEvents} events without embeddings`)
    
    if (totalEvents === 0) {
      return {
        success: true,
        message: 'No events need embeddings',
        stats: {
          total: 0,
          processed: 0,
          success: 0,
          failed: 0,
          skipped: 0,
          duration_ms: Date.now() - startTime
        }
      }
    }
    
    // Process in batches
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, Math.min(i + batchSize, events.length))
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(events.length / batchSize)
      
      console.log(`🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} events)`)
      
      const batchResults = await Promise.allSettled(
        batch.map(async (event) => {
          try {
            // Check if already has embedding (race condition protection)
            if (event.embedding_id) {
              totalSkipped++
              return { status: 'skipped', event_id: event.id }
            }
            
            // Generate embedding
            const { text, vector, metadata } = await generateEventEmbedding(event, c.env.AI)
            
            // Store in Vectorize
            if (c.env.VECTORIZE) {
              await c.env.VECTORIZE.insert([{
                id: `event-${event.id}`,
                values: vector,
                metadata
              }])
            }
            
            // Store embedding metadata in DB
            await c.env.DB.prepare(`
              INSERT INTO event_embeddings (event_id, embedding_text, metadata_json, vector_id)
              VALUES (?, ?, ?, ?)
            `).bind(
              event.id,
              text,
              JSON.stringify(metadata),
              `event-${event.id}`
            ).run()
            
            // Update event with embedding_id
            await c.env.DB.prepare(`
              UPDATE events SET embedding_id = ? WHERE id = ?
            `).bind(`event-${event.id}`, event.id).run()
            
            totalSuccess++
            totalProcessed++
            
            return { status: 'success', event_id: event.id }
            
          } catch (error: any) {
            console.error(`❌ Failed to process event ${event.id}:`, error.message)
            totalFailed++
            totalProcessed++
            
            return { status: 'failed', event_id: event.id, error: error.message }
          }
        })
      )
      
      // Log batch results
      const batchSuccess = batchResults.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'success').length
      const batchFailed = batchResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).status === 'failed')).length
      
      console.log(`✅ Batch ${batchNum} complete: ${batchSuccess} success, ${batchFailed} failed`)
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < events.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    const duration = Date.now() - startTime
    const avgTimePerEvent = duration / totalProcessed
    
    console.log(`🎉 Backfill complete!`)
    console.log(`📊 Stats: ${totalSuccess} success, ${totalFailed} failed, ${totalSkipped} skipped`)
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s (${avgTimePerEvent.toFixed(0)}ms per event)`)
    
    return {
      success: true,
      message: `Successfully generated embeddings for ${totalSuccess} events`,
      stats: {
        total: totalEvents,
        processed: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        skipped: totalSkipped,
        duration_ms: duration,
        avg_time_per_event_ms: Math.round(avgTimePerEvent)
      }
    }
    
  } catch (error: any) {
    console.error('💥 Backfill failed:', error)
    
    return {
      success: false,
      error: 'Backfill operation failed',
      details: error.message,
      stats: {
        total: 0,
        processed: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        skipped: totalSkipped,
        duration_ms: Date.now() - startTime
      }
    }
  }
}
