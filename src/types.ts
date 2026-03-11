// Type definitions for NCPA Sound Crew RAG System
// Version 4.0

export interface Env {
  DB: D1Database;
  AI: any; // Cloudflare Workers AI
  VECTORIZE: VectorizeIndex;
  ANTHROPIC_API_KEY: string;
}

export interface Event {
  id: number;
  event_date: string;
  program: string;
  venue: string;
  team: string;
  sound_requirements: string;
  call_time: string;
  crew: string;
  created_at: string;
  embedding_id?: string;
}

export interface EventEmbedding {
  id: number;
  event_id: number;
  embedding_text: string;
  metadata_json: string;
  vector_id: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationHistory {
  id: number;
  session_id: string;
  user_query: string;
  ai_response: string;
  context_used: string;
  entities_extracted: string;
  query_intent: string;
  token_count: number;
  response_time_ms: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface ExtractedEntities {
  venue?: string;
  crew?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  month?: string;
  year?: string;
  program?: string;
  intent: QueryIntent;
  confidence: number;
}

export type QueryIntent =
  | 'search'          // "Show me events at Tata"
  | 'analytics'       // "Which venue is busiest?"
  | 'prediction'      // "When will Tata be free next?"
  | 'availability'    // "Is Ashwin free on Dec 5?"
  | 'comparison'      // "Compare workload of Ashwin vs Naren"
  | 'aggregation'     // "Total events in December"
  | 'unknown';

export interface RAGQueryRequest {
  query: string;
  session_id?: string;
  include_analytics?: boolean;
  include_predictions?: boolean;
  max_results?: number;
}

export interface RAGQueryResponse {
  success: boolean;
  answer: string;
  events: Event[];
  insights?: {
    total_events: number;
    date_range: { start: string; end: string };
    busiest_venue?: string;
    busiest_crew?: string;
    crew_workload?: Record<string, number>;
    venue_stats?: Record<string, number>;
    patterns?: string[];
  };
  recommendations?: string[];
  follow_up_queries?: string[];
  metadata: {
    query_intent: QueryIntent;
    entities_extracted: ExtractedEntities;
    vectorize_used: boolean;
    claude_model: string;
    response_time_ms: number;
    token_count: number;
  };
  session_id: string;
}

export interface VenueAlias {
  canonical_name: string;
  alias: string;
}

export interface CrewWorkloadCache {
  crew_name: string;
  month: string;
  event_count: number;
  total_hours: number;
  venues_worked: string[];
  busiest_date: string;
  calculated_at: string;
}

export interface EventPattern {
  pattern_type: 'venue_busy_days' | 'crew_availability' | 'seasonal_trend';
  pattern_data: any;
  confidence_score: number;
  last_updated: string;
}

export interface ClaudeSonnetRequest {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  system?: string;
  temperature?: number;
}

export interface ClaudeSonnetResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface EmbeddingMetadata {
  event_id: number;
  venue: string;
  crew: string;
  date: string;
  program_type?: string;
  month: string;
  year: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: EmbeddingMetadata;
  values?: number[];
}

// Cloudflare Vectorize types (simplified)
export interface VectorizeIndex {
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
  insert(vectors: VectorizeVector[]): Promise<VectorizeInsertResult>;
  upsert(vectors: VectorizeVector[]): Promise<VectorizeUpsertResult>;
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
  deleteByIds(ids: string[]): Promise<VectorizeDeleteResult>;
}

export interface VectorizeQueryOptions {
  topK?: number;
  filter?: Record<string, any>;
  returnValues?: boolean;
  returnMetadata?: boolean;
}

export interface VectorizeMatches {
  matches: Array<{
    id: string;
    score: number;
    values?: number[];
    metadata?: Record<string, any>;
  }>;
  count: number;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

export interface VectorizeInsertResult {
  count: number;
  ids: string[];
}

export interface VectorizeUpsertResult {
  count: number;
  ids: string[];
}

export interface VectorizeDeleteResult {
  count: number;
  ids: string[];
}
