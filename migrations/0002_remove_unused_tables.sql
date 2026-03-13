-- ============================================
-- Remove tables replaced by shared-password auth
-- Run against existing production DB once
-- ============================================
DROP TABLE IF EXISTS quote_line_items;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
