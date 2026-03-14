-- Add rider and notes fields to events
-- rider: technical rider doc reference — set manually; Word upload + CSV import leave NULL
-- notes: internal notes — set manually; CSV import does not overwrite
ALTER TABLE events ADD COLUMN rider TEXT;
ALTER TABLE events ADD COLUMN notes TEXT;
