-- ═══════════════════════════════════════════════════════════
-- FULL DATABASE RESET — Social Web
-- Run ALL of this in Supabase → SQL Editor → Run
-- WARNING: deletes ALL data
-- ═══════════════════════════════════════════════════════════

-- Drop everything (order matters for FKs)
DROP TABLE IF EXISTS community_messages CASCADE;
DROP TABLE IF EXISTS community_channels CASCADE;
DROP TABLE IF EXISTS community_categories CASCADE;
DROP TABLE IF EXISTS community_member_roles CASCADE;
DROP TABLE IF EXISTS community_roles CASCADE;
DROP TABLE IF EXISTS community_members CASCADE;
DROP TABLE IF EXISTS communities CASCADE;
DROP TABLE IF EXISTS gc_messages CASCADE;
DROP TABLE IF EXISTS gc_members CASCADE;
DROP TABLE IF EXISTS group_chats CASCADE;
DROP TABLE IF EXISTS dm_messages CASCADE;
DROP TABLE IF EXISTS dm_threads CASCADE;
DROP TABLE IF EXISTS moderation_logs CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS owner CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ── users (normal members only) ────────────────────────────
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  role INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  status_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── admins (panel accounts) ────────────────────────────────
CREATE TABLE admins (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  status_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── owner (exactly 1 row) ──────────────────────────────────
CREATE TABLE owner (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT 'Owner',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX owner_single_row ON owner ((true));

-- ── posts ──────────────────────────────────────────────────
CREATE TABLE posts (
  id VARCHAR(32) PRIMARY KEY,
  author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE post_likes (
  post_id VARCHAR(32) REFERENCES posts(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, username)
);

CREATE TABLE comments (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE friendships (
  id BIGSERIAL PRIMARY KEY,
  from_user VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  to_user VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_user, to_user)
);

CREATE TABLE moderation_logs (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  action VARCHAR(40) NOT NULL,
  by_role VARCHAR(20) NOT NULL,
  by_name VARCHAR(32) NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── chat ───────────────────────────────────────────────────
CREATE TABLE dm_threads (
  id VARCHAR(32) PRIMARY KEY,
  dm_key VARCHAR(80) UNIQUE NOT NULL,
  user_a VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  user_b VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dm_messages (
  id VARCHAR(32) PRIMARY KEY,
  thread_id VARCHAR(32) NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE group_chats (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  owner VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  invite_code VARCHAR(16) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gc_members (
  gc_id VARCHAR(32) REFERENCES group_chats(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (gc_id, username)
);

CREATE TABLE gc_messages (
  id VARCHAR(32) PRIMARY KEY,
  gc_id VARCHAR(32) NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE communities (
  id VARCHAR(32) PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL,
  description TEXT DEFAULT '',
  owner VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE community_members (
  community_id VARCHAR(32) REFERENCES communities(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, username)
);

CREATE TABLE community_roles (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  color VARCHAR(16) DEFAULT '#a78bfa',
  permissions JSONB DEFAULT '{}',
  position INT DEFAULT 0,
  UNIQUE (community_id, name)
);

CREATE TABLE community_member_roles (
  community_id VARCHAR(32) REFERENCES communities(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  role_id VARCHAR(32) REFERENCES community_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (community_id, username, role_id)
);

CREATE TABLE community_categories (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  position INT DEFAULT 0
);

CREATE TABLE community_channels (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  category_id VARCHAR(32) REFERENCES community_categories(id) ON DELETE SET NULL,
  name VARCHAR(40) NOT NULL,
  position INT DEFAULT 0
);

CREATE TABLE community_messages (
  id VARCHAR(32) PRIMARY KEY,
  channel_id VARCHAR(32) NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX dm_messages_thread_idx ON dm_messages (thread_id, created_at);
CREATE INDEX gc_messages_gc_idx ON gc_messages (gc_id, created_at);
CREATE INDEX community_messages_ch_idx ON community_messages (channel_id, created_at);
CREATE INDEX posts_author_idx ON posts (author, created_at DESC);
