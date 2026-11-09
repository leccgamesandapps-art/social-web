-- LE Social Web · Full schema
-- Roles (site): 0 = user, 1 = owner (max 1), 2 = admin

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  bio TEXT DEFAULT '',
  role SMALLINT NOT NULL DEFAULT 0 CHECK (role IN (0, 1, 2)),
  status VARCHAR(20) DEFAULT 'active',
  status_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_one_owner_idx
  ON users ((role)) WHERE role = 1;

CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(32) PRIMARY KEY,
  author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id VARCHAR(32) REFERENCES posts(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  PRIMARY KEY (post_id, username)
);

CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) REFERENCES posts(id) ON DELETE CASCADE,
  author VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Friendships: status = pending | accepted | blocked
CREATE TABLE IF NOT EXISTS friendships (
  user_a VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  user_b VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS moderation_logs (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  action VARCHAR(40) NOT NULL,
  by_role VARCHAR(20),
  by_name VARCHAR(64),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- CHAT SYSTEM (Discord-style)
-- ═══════════════════════════════════════════

-- Direct messages (1-to-1). dm_key is sorted "user1:user2" so each pair is unique.
CREATE TABLE IF NOT EXISTS dm_threads (
  id VARCHAR(32) PRIMARY KEY,
  dm_key VARCHAR(80) UNIQUE NOT NULL,
  user_a VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  user_b VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id VARCHAR(32) PRIMARY KEY,
  thread_id VARCHAR(32) NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group chats (GC). Need at least 1 friend to create.
CREATE TABLE IF NOT EXISTS group_chats (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  owner VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  invite_code VARCHAR(16) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gc_members (
  gc_id VARCHAR(32) REFERENCES group_chats(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (gc_id, username)
);

CREATE TABLE IF NOT EXISTS gc_messages (
  id VARCHAR(32) PRIMARY KEY,
  gc_id VARCHAR(32) NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Communities (like Discord servers)
CREATE TABLE IF NOT EXISTS communities (
  id VARCHAR(32) PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL,
  description TEXT DEFAULT '',
  owner VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id VARCHAR(32) REFERENCES communities(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, username)
);

-- Roles inside a community (Mute, Mod, etc.) — owner has no role row, owns everything
CREATE TABLE IF NOT EXISTS community_roles (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  color VARCHAR(16) DEFAULT '#a78bfa',
  permissions JSONB DEFAULT '{}',
  position INT DEFAULT 0,
  UNIQUE (community_id, name)
);

CREATE TABLE IF NOT EXISTS community_member_roles (
  community_id VARCHAR(32) REFERENCES communities(id) ON DELETE CASCADE,
  username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE,
  role_id VARCHAR(32) REFERENCES community_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (community_id, username, role_id)
);

-- Categories + channels (chats) inside community
CREATE TABLE IF NOT EXISTS community_categories (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  position INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS community_channels (
  id VARCHAR(32) PRIMARY KEY,
  community_id VARCHAR(32) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  category_id VARCHAR(32) REFERENCES community_categories(id) ON DELETE SET NULL,
  name VARCHAR(40) NOT NULL,
  position INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS community_messages (
  id VARCHAR(32) PRIMARY KEY,
  channel_id VARCHAR(32) NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id);
CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships (user_a);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships (user_b);
CREATE INDEX IF NOT EXISTS dm_messages_thread_idx ON dm_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS gc_messages_gc_idx ON gc_messages (gc_id, created_at);
CREATE INDEX IF NOT EXISTS community_messages_ch_idx ON community_messages (channel_id, created_at);
