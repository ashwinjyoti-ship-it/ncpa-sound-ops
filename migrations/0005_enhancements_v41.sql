-- NCPA Sound Crew v4.1 Enhancements
-- New tables and fields for advanced features

-- 1. Crew assignment history (for smart suggestions)
CREATE TABLE IF NOT EXISTS crew_assignment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_name TEXT NOT NULL,
  venue TEXT NOT NULL,
  event_type TEXT,
  assignment_count INTEGER DEFAULT 1,
  last_assigned_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crew_venue ON crew_assignment_history(crew_name, venue);
CREATE INDEX IF NOT EXISTS idx_venue_history ON crew_assignment_history(venue);

-- 2. Event status tracking (using CREATE TABLE to avoid ALTER issues)
-- Check if status column exists, if not add it via table recreation
-- SQLite doesn't support DROP COLUMN, so we'll add columns separately
-- Note: Run these commands manually if migration fails:
-- ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'confirmed';
-- ALTER TABLE events ADD COLUMN tags TEXT;

-- 4. Export tracking (for Google Sheets sync)
CREATE TABLE IF NOT EXISTS export_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_type TEXT NOT NULL, -- 'csv', 'excel', 'google_sheets'
  event_ids TEXT, -- Comma-separated event IDs
  exported_by TEXT,
  export_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_checksum TEXT -- For change detection
);

-- 5. Conflict detection cache
CREATE TABLE IF NOT EXISTS event_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id_1 INTEGER NOT NULL,
  event_id_2 INTEGER NOT NULL,
  conflict_type TEXT NOT NULL, -- 'venue_overlap', 'crew_overlap', 'time_conflict'
  conflict_severity TEXT DEFAULT 'warning', -- 'warning', 'error', 'critical'
  resolved BOOLEAN DEFAULT 0,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id_1) REFERENCES events(id),
  FOREIGN KEY (event_id_2) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolved ON event_conflicts(resolved);

-- 6. User preferences (for filters, views, etc.)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preference_key TEXT UNIQUE NOT NULL,
  preference_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Google Calendar sync (for integration)
CREATE TABLE IF NOT EXISTS calendar_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  google_event_id TEXT,
  last_synced_at DATETIME,
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'failed', 'deleted'
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_google_event ON calendar_sync(google_event_id);
CREATE INDEX IF NOT EXISTS idx_sync_status ON calendar_sync(sync_status);
