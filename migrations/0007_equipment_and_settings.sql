-- Equipment table for Quote Builder
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  rate INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- App settings table (singleton - only one row with id=1)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT DEFAULT 'ncpalivesound',
  password_hash TEXT,
  password_salt TEXT,
  anthropic_api_key TEXT,
  api_key_iv TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Initialize settings row if not exists
INSERT OR IGNORE INTO app_settings (id, username) VALUES (1, 'ncpalivesound');

-- Pre-seed equipment data (19 items from rate chart)
INSERT OR IGNORE INTO equipment (name, rate) VALUES
  ('D&B M4 MONITORS (FLOOR)', 2500),
  ('SENNHEISER G4 IN-EAR MONITORS', 1500),
  ('SHURE SM58', 300),
  ('SHURE SM57', 300),
  ('SHURE WIRELESS ULXD SM58/HEADSET/LAPEL', 1500),
  ('SHURE SM81', 550),
  ('SHURE BETA 98', 500),
  ('NEUMANN KM184', 750),
  ('SENNHEISER GUN MICS', 600),
  ('FLOOR MICS', 500),
  ('AKG C411', 500),
  ('BSS DI BOX', 250),
  ('2 TRACK RECORDING', 3000),
  ('MULTITRACK RECORDING', 12000),
  ('GOOSENECK PODIUM MICS (SHURE)', 1000),
  ('ALTAIR WIRELESS INTERCOMMS/BELTPACK', 2500),
  ('SENNHEISER E604 (DRUM KIT MICS)', 550),
  ('SHURE BETA 91', 550),
  ('SHURE BETA 52 A', 550);
