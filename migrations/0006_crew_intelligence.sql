-- NCPA Sound Crew - Crew Intelligence System
-- Phase 1: Enhanced Learning for Automatic Assignment
-- Created: December 6, 2025

-- 1. Crew Skills & Expertise Tracking
CREATE TABLE IF NOT EXISTS crew_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_name TEXT NOT NULL,
  venue TEXT,
  event_type TEXT, -- Classical, Dance, Theatre, Corporate, etc.
  skill_score REAL DEFAULT 0.0, -- 0.0 to 1.0 (calculated from performance)
  total_assignments INTEGER DEFAULT 0,
  successful_assignments INTEGER DEFAULT 0, -- No conflicts, no issues
  last_assignment_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crew_name, venue, event_type)
);

CREATE INDEX IF NOT EXISTS idx_crew_skills_name ON crew_skills(crew_name);
CREATE INDEX IF NOT EXISTS idx_crew_skills_venue ON crew_skills(venue);
CREATE INDEX IF NOT EXISTS idx_crew_skills_type ON crew_skills(event_type);

-- 2. Crew Workload Tracking (Monthly)
CREATE TABLE IF NOT EXISTS crew_workload (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_name TEXT NOT NULL,
  month TEXT NOT NULL, -- Format: YYYY-MM
  total_events INTEGER DEFAULT 0,
  total_hours REAL DEFAULT 0.0,
  workload_score REAL DEFAULT 0.0, -- 0.0 = underutilized, 1.0 = overloaded
  preferred_venues TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crew_name, month)
);

CREATE INDEX IF NOT EXISTS idx_crew_workload_month ON crew_workload(month);
CREATE INDEX IF NOT EXISTS idx_crew_workload_name ON crew_workload(crew_name);

-- 3. Crew Availability Patterns
CREATE TABLE IF NOT EXISTS crew_availability_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_name TEXT NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  availability_rate REAL DEFAULT 1.0, -- 0.0 to 1.0
  total_assignments INTEGER DEFAULT 0,
  declined_assignments INTEGER DEFAULT 0, -- Future feature
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crew_name, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_availability_name ON crew_availability_patterns(crew_name);

-- 4. Assignment Recommendations Log
CREATE TABLE IF NOT EXISTS assignment_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  recommended_crew TEXT NOT NULL, -- JSON array of crew with scores
  actual_crew_assigned TEXT,
  recommendation_accepted BOOLEAN DEFAULT 0,
  confidence_score REAL DEFAULT 0.0,
  reasoning TEXT, -- Why this crew was recommended
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_event ON assignment_recommendations(event_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_accepted ON assignment_recommendations(recommendation_accepted);

-- 5. Fairness & Balance Metrics
CREATE TABLE IF NOT EXISTS fairness_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  crew_name TEXT NOT NULL,
  expected_assignments INTEGER DEFAULT 0, -- Based on availability & capacity
  actual_assignments INTEGER DEFAULT 0,
  fairness_score REAL DEFAULT 1.0, -- 1.0 = perfectly fair distribution
  overload_flag BOOLEAN DEFAULT 0,
  underutilized_flag BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crew_name, month)
);

CREATE INDEX IF NOT EXISTS idx_fairness_month ON fairness_metrics(month);
CREATE INDEX IF NOT EXISTS idx_fairness_flags ON fairness_metrics(overload_flag, underutilized_flag);

-- 6. Event Type Classification (Auto-learned)
CREATE TABLE IF NOT EXISTS event_type_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT UNIQUE NOT NULL,
  typical_venues TEXT, -- JSON array
  typical_crew_size INTEGER DEFAULT 2,
  typical_duration_hours REAL DEFAULT 2.0,
  complexity_score REAL DEFAULT 0.5, -- 0.0 = simple, 1.0 = complex
  keywords TEXT, -- Comma-separated keywords for auto-classification
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial event types (will learn more over time)
INSERT OR IGNORE INTO event_type_patterns (event_type, typical_venues, typical_crew_size, complexity_score, keywords) VALUES
  ('Classical Music', '["JBT", "TET", "TATA"]', 2, 0.7, 'classical,concert,music,recital,orchestra'),
  ('Dance Performance', '["GDT", "JBT", "TET"]', 3, 0.8, 'dance,ballet,contemporary,kathak,bharatanatyam'),
  ('Theatre/Drama', '["LT", "TET", "Experimental"]', 2, 0.6, 'play,theatre,drama,rehearsal'),
  ('Corporate Event', '["SVR", "TATA"]', 2, 0.4, 'corporate,meeting,conference,talk,seminar'),
  ('Film Screening', '["JBT", "LT"]', 1, 0.3, 'film,movie,screening,cinema'),
  ('Workshop', '["SVR", "LT"]', 1, 0.3, 'workshop,training,masterclass');

-- 7. Learning Model Performance
CREATE TABLE IF NOT EXISTS learning_model_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL,
  metric_value REAL,
  data_points INTEGER DEFAULT 0,
  confidence_level REAL DEFAULT 0.0, -- How confident we are in predictions
  last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initialize stats
INSERT OR IGNORE INTO learning_model_stats (metric_name, metric_value, data_points, confidence_level) VALUES
  ('total_assignments_analyzed', 0, 0, 0.0),
  ('crew_expertise_confidence', 0.0, 0, 0.0),
  ('workload_balance_score', 0.0, 0, 0.0),
  ('recommendation_accuracy', 0.0, 0, 0.0),
  ('days_of_learning', 0, 0, 0.0);
