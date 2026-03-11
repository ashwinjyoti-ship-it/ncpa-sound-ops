-- Migration: Add RAG System Tables for Version 4.0
-- Created: 2025-11-30
-- Purpose: Enable semantic search, conversation memory, and analytics

-- 1. Add embedding_id to events table for vector search
ALTER TABLE events ADD COLUMN embedding_id TEXT;

-- 2. Event embeddings metadata table
CREATE TABLE IF NOT EXISTS event_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  embedding_text TEXT NOT NULL, -- Searchable text: "2025-12-05: Concert at Tata by Ashwin"
  metadata_json TEXT, -- JSON: {"venue": "Tata Theatre", "crew": "Ashwin", "month": "December"}
  vector_id TEXT, -- Vectorize index ID: "event-123"
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 3. Conversation history for context memory
CREATE TABLE IF NOT EXISTS conversation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_query TEXT NOT NULL,
  ai_response TEXT, -- JSON response from Claude
  context_used TEXT, -- What events/data was used
  entities_extracted TEXT, -- JSON: {"venue": "Tata", "crew": "Ashwin"}
  query_intent TEXT, -- search, analytics, prediction, availability
  token_count INTEGER DEFAULT 0,
  response_time_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Query analytics for learning and optimization
CREATE TABLE IF NOT EXISTS query_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_text TEXT NOT NULL,
  query_type TEXT, -- natural_language, structured, analytics
  result_count INTEGER DEFAULT 0,
  user_rating INTEGER, -- 1-5 stars for feedback
  execution_time_ms INTEGER DEFAULT 0,
  vectorize_used BOOLEAN DEFAULT 0,
  claude_model TEXT, -- sonnet-4, haiku, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Venue aliases for smart matching
CREATE TABLE IF NOT EXISTS venue_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL, -- "Tata Theatre"
  alias TEXT NOT NULL UNIQUE, -- "TT", "Tata", "Tata Theater"
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default venue aliases
INSERT OR IGNORE INTO venue_aliases (canonical_name, alias) VALUES
  ('Tata Theatre', 'Tata Theatre'),
  ('Tata Theatre', 'TT'),
  ('Tata Theatre', 'TATA'),
  ('Tata Theatre', 'Tata'),
  ('Tata Theatre', 'Tata Theater'),
  ('Jamshed Bhabha Theatre', 'Jamshed Bhabha Theatre'),
  ('Jamshed Bhabha Theatre', 'JBT'),
  ('Jamshed Bhabha Theatre', 'Bhabha'),
  ('Jamshed Bhabha Theatre', 'Jamshed Bhabha'),
  ('Experimental Theatre', 'Experimental Theatre'),
  ('Experimental Theatre', 'ET'),
  ('Experimental Theatre', 'Exp'),
  ('Experimental Theatre', 'Experimental'),
  ('Godrej Dance Theatre', 'Godrej Dance Theatre'),
  ('Godrej Dance Theatre', 'GDT'),
  ('Godrej Dance Theatre', 'Godrej'),
  ('Little Theatre', 'Little Theatre'),
  ('Little Theatre', 'LT'),
  ('Little Theatre', 'Little'),
  ('Sea View Room', 'Sea View Room'),
  ('Sea View Room', 'SVR'),
  ('Sea View Room', 'Sea View');

-- 6. Crew workload cache for analytics
CREATE TABLE IF NOT EXISTS crew_workload_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_name TEXT NOT NULL,
  month TEXT NOT NULL, -- "2025-12"
  event_count INTEGER DEFAULT 0,
  total_hours REAL DEFAULT 0,
  venues_worked TEXT, -- JSON array of venues
  busiest_date TEXT,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crew_name, month)
);

-- 7. Predictive patterns for availability
CREATE TABLE IF NOT EXISTS event_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL, -- venue_busy_days, crew_availability, seasonal_trend
  pattern_data TEXT NOT NULL, -- JSON with pattern details
  confidence_score REAL DEFAULT 0, -- 0.0 - 1.0
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_embeddings_event_id ON event_embeddings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_embeddings_vector_id ON event_embeddings(vector_id);
CREATE INDEX IF NOT EXISTS idx_conversation_session ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_type ON query_analytics(query_type);
CREATE INDEX IF NOT EXISTS idx_venue_aliases_canonical ON venue_aliases(canonical_name);
CREATE INDEX IF NOT EXISTS idx_crew_workload_month ON crew_workload_cache(month);
CREATE INDEX IF NOT EXISTS idx_events_embedding_id ON events(embedding_id);
