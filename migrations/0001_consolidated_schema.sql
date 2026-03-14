-- ============================================
-- NCPA Workflow Suite - Unified D1 Schema
-- Events + Crew + Equipment (no user accounts - shared password auth)
-- ============================================

-- EVENTS: Core events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,          -- YYYY-MM-DD
  program TEXT NOT NULL,             -- event name/program
  venue TEXT NOT NULL,               -- original venue text
  team TEXT,                         -- curator/team
  sound_requirements TEXT,
  call_time TEXT,
  requirements_updated BOOLEAN DEFAULT 0,
  -- Crew assignment fields
  venue_normalized TEXT,             -- mapped venue for rules engine
  vertical TEXT,                     -- derived from team
  batch_id TEXT,                     -- groups crew assignment uploads
  stage_crew_needed INTEGER DEFAULT 1,
  event_group TEXT,                  -- for multi-day events
  needs_manual_review BOOLEAN DEFAULT 0,
  manual_flag_reason TEXT,
  rider TEXT,                        -- technical rider (set manually; not touched by CSV import)
  notes TEXT,                        -- internal notes (set manually; not touched by CSV import)
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

-- QUOTES: Equipment catalog (rates only - quotes are not saved)
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  rate_per_item REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- APP SETTINGS: Key-value store for runtime config (e.g. Anthropic API key)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_program ON events(program);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events(batch_id);
CREATE INDEX IF NOT EXISTS idx_events_group ON events(event_group);
CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_crew ON assignments(crew_id);
CREATE INDEX IF NOT EXISTS idx_unavailability_date ON crew_unavailability(unavailable_date);
CREATE INDEX IF NOT EXISTS idx_unavailability_crew ON crew_unavailability(crew_id);
CREATE INDEX IF NOT EXISTS idx_workload_month ON workload_history(month);
