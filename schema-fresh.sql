-- ═══════════════════════════════════════════════════
-- FRESH START — wipe accounts + add deletion columns
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Clear regular users + related data
TRUNCATE users CASCADE;
TRUNCATE admins CASCADE;
TRUNCATE owner CASCADE;
TRUNCATE moderation_logs CASCADE;

-- Account deletion schedule (72 hours)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS delete_scheduled_at TIMESTAMPTZ;

-- Seed Owner (O) — password: swowner26
INSERT INTO owner (username, password_hash, display_name)
VALUES ('owner', 'panel:swowner26', 'Owner');

-- Seed Admin (A) — password: swadmin26
INSERT INTO admins (username, password_hash, display_name, status)
VALUES ('admin1', 'panel:swadmin26', 'Admin 1', 'active');

-- users table stays EMPTY until someone registers on /
