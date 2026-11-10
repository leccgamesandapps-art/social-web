-- ═══════════════════════════════════════════════════════════
-- THREE TABLES: users | admins | owner
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Normal members (app login: username + password)
-- users table should already exist from earlier schema

-- Admins (panel login: password only; can also use app with username+password)
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  status_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Owner — ONLY 1 ROW allowed
CREATE TABLE IF NOT EXISTS owner (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT 'Owner',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce max 1 owner
CREATE UNIQUE INDEX IF NOT EXISTS owner_single_row
  ON owner ((true));

-- Optional: seed default panel accounts if empty
-- (password hashes will be set by the app on first panel-login)
-- You can also insert manually after first successful panel login.

-- Move old role-based panel accounts out of users (if they still exist there)
INSERT INTO admins (username, password_hash, display_name, status)
SELECT username, password_hash, COALESCE(display_name, username), COALESCE(status, 'active')
FROM users
WHERE role = 2
  AND username NOT IN (SELECT username FROM admins)
ON CONFLICT (username) DO NOTHING;

INSERT INTO owner (username, password_hash, display_name)
SELECT username, password_hash, COALESCE(display_name, 'Owner')
FROM users
WHERE role = 1
  AND NOT EXISTS (SELECT 1 FROM owner)
LIMIT 1
ON CONFLICT (username) DO NOTHING;

-- Keep panel accounts out of the normal users list (optional cleanup)
-- DELETE FROM users WHERE role IN (1, 2);
-- Safer: demote leftover role flags
UPDATE users SET role = 0 WHERE role IN (1, 2);
