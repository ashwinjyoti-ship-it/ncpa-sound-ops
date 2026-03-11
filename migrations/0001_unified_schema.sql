-- NCPA Sound Ops - Unified Database Schema
-- Merges ncpa-sound-manager and Crew-Assignment-Automation schemas

-- Core events table (from ncpa-sound-manager, extended)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date DATE NOT NULL,
  program TEXT NOT NULL,
  venue TEXT NOT NULL,
  team TEXT,
  sound_requirements TEXT,
  call_time TEXT,
  crew TEXT,
  requirements_updated BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Extended fields from Crew-Assignment-Automation
  batch_id TEXT,
  venue_normalized TEXT,
  vertical TEXT,
  stage_crew_needed INTEGER DEFAULT 1,
  event_group TEXT,
  needs_manual_review BOOLEAN DEFAULT 0,
  manual_flag_reason TEXT
);

-- Crew roster table (from Crew-Assignment-Automation)
CREATE TABLE IF NOT EXISTS crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Senior', 'Mid', 'Junior', 'Hired')),
  can_stage BOOLEAN DEFAULT 1,
  stage_only_if_urgent BOOLEAN DEFAULT 0,
  is_outside_crew BOOLEAN DEFAULT 0,
  venue_capabilities TEXT NOT NULL,
  vertical_capabilities TEXT NOT NULL,
  special_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Day-offs tracking
CREATE TABLE IF NOT EXISTS crew_unavailability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id INTEGER NOT NULL,
  unavailable_date TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE,
  UNIQUE(crew_id, unavailable_date)
);

-- Assignments table
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

-- Workload history
CREATE TABLE IF NOT EXISTS workload_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  assignment_count INTEGER DEFAULT 0,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE,
  UNIQUE(crew_id, month)
);

-- Equipment for Quote Builder (NEW)
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  rate INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_program ON events(program);
CREATE INDEX IF NOT EXISTS idx_venue ON events(venue);
CREATE INDEX IF NOT EXISTS idx_crew ON events(crew);
CREATE INDEX IF NOT EXISTS idx_team ON events(team);
CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events(batch_id);
CREATE INDEX IF NOT EXISTS idx_events_group ON events(event_group);
CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_crew ON assignments(crew_id);
CREATE INDEX IF NOT EXISTS idx_unavailability_date ON crew_unavailability(unavailable_date);
CREATE INDEX IF NOT EXISTS idx_unavailability_crew ON crew_unavailability(crew_id);
CREATE INDEX IF NOT EXISTS idx_workload_month ON workload_history(month);
CREATE INDEX IF NOT EXISTS idx_equipment_name ON equipment(name);
