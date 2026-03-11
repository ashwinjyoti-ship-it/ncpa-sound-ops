-- NCPA Sound Ops - App Settings Table
-- Stores credentials and API keys in D1 instead of Cloudflare secrets

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row allowed
  username TEXT NOT NULL DEFAULT 'ncpalivesound',
  password_hash TEXT NOT NULL, -- PBKDF2 hashed
  password_salt TEXT NOT NULL, -- Salt for PBKDF2
  jwt_secret TEXT NOT NULL, -- Random secret for JWT signing
  anthropic_api_key TEXT, -- Encrypted with AES-GCM
  api_key_iv TEXT, -- IV for AES-GCM decryption
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default row with initial credentials
-- Password: hangover123 (will be hashed on first use)
-- JWT secret will be generated on first login
INSERT OR IGNORE INTO app_settings (id, username, password_hash, password_salt, jwt_secret)
VALUES (1, 'ncpalivesound', 'NEEDS_INIT', 'NEEDS_INIT', 'NEEDS_INIT');
