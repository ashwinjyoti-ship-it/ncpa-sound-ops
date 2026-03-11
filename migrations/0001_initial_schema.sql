-- NCPA Sound Crew Events Database Schema
-- Create events table with all required fields

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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_program ON events(program);
CREATE INDEX IF NOT EXISTS idx_venue ON events(venue);
CREATE INDEX IF NOT EXISTS idx_crew ON events(crew);
CREATE INDEX IF NOT EXISTS idx_team ON events(team);
CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
