-- ============================================
-- NCPA Workflow Suite - Unified D1 Schema
-- Consolidates: ncpa-sound-manager + crew-assignment-automation + quote-builder
-- ============================================

-- AUTH: Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  approved_by TEXT
);

-- AUTH: Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- EVENTS: Core events table (unified from ncpa-sound-manager + crew-assignment-automation)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Core fields from ncpa-sound-manager
  event_date TEXT NOT NULL,          -- YYYY-MM-DD
  program TEXT NOT NULL,             -- event name/program
  venue TEXT NOT NULL,               -- original venue text
  team TEXT,                         -- curator/team
  sound_requirements TEXT,
  call_time TEXT,
  crew TEXT,                         -- legacy text field
  requirements_updated BOOLEAN DEFAULT 0,
  -- Fields from crew-assignment-automation
  venue_normalized TEXT,             -- mapped venue for rules engine
  vertical TEXT,                     -- derived from team
  batch_id TEXT,                     -- groups uploads together
  stage_crew_needed INTEGER DEFAULT 1,
  event_group TEXT,                  -- for multi-day events
  needs_manual_review BOOLEAN DEFAULT 0,
  manual_flag_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CREW: Crew members with capability matrix
CREATE TABLE IF NOT EXISTS crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Senior', 'Mid', 'Junior', 'Hired')),
  can_stage BOOLEAN DEFAULT 1,
  stage_only_if_urgent BOOLEAN DEFAULT 0,
  is_outside_crew BOOLEAN DEFAULT 0,
  venue_capabilities TEXT NOT NULL,   -- JSON: {"JBT": "Y*", "Tata": "Y", ...}
  vertical_capabilities TEXT NOT NULL, -- JSON: {"Indian Music": "Y", "Intl Music": "Y*", ...}
  special_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CREW: Day-offs / unavailability
CREATE TABLE IF NOT EXISTS crew_unavailability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id INTEGER NOT NULL,
  unavailable_date TEXT NOT NULL,    -- YYYY-MM-DD
  reason TEXT,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE,
  UNIQUE(crew_id, unavailable_date)
);

-- CREW: Assignments per event
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  crew_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('FOH', 'Stage')),
  was_engine_suggestion BOOLEAN DEFAULT 1,
  was_manually_overridden BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE
);

-- CREW: Monthly workload history
CREATE TABLE IF NOT EXISTS workload_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id INTEGER NOT NULL,
  month TEXT NOT NULL,               -- YYYY-MM
  assignment_count INTEGER DEFAULT 0,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE,
  UNIQUE(crew_id, month)
);

-- QUOTES: Quote headers
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  event_name TEXT,
  event_date TEXT,
  venue TEXT,
  quote_date TEXT DEFAULT (date('now')),
  subtotal REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 18,
  gst_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft',       -- draft | sent | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- QUOTES: Line items
CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

-- QUOTES: Equipment catalog (from quote-builder)
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  rate_per_item REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_program ON events(program);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue);
CREATE INDEX IF NOT EXISTS idx_events_crew ON events(crew);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events(batch_id);
CREATE INDEX IF NOT EXISTS idx_events_group ON events(event_group);
CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_crew ON assignments(crew_id);
CREATE INDEX IF NOT EXISTS idx_unavailability_date ON crew_unavailability(unavailable_date);
CREATE INDEX IF NOT EXISTS idx_unavailability_crew ON crew_unavailability(crew_id);
CREATE INDEX IF NOT EXISTS idx_workload_month ON workload_history(month);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
