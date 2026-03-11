-- Query context and learning memory
CREATE TABLE IF NOT EXISTS query_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  intent TEXT NOT NULL,
  context_data TEXT,
  resolved BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_query_context_session ON query_context(session_id);
CREATE INDEX IF NOT EXISTS idx_query_context_intent ON query_context(intent);
