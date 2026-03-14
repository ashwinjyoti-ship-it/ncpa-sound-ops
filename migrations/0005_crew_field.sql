-- Add crew text field to events (matches original ncpa-sound-manager schema)
-- Stores comma-separated crew names for quick manual assignment / CSV import
ALTER TABLE events ADD COLUMN crew TEXT DEFAULT '';
