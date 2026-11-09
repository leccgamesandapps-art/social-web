-- LE Social Web · Supabase schema
-- Roles: 0 = user, 1 = owner (only one allowed), 2 = admin

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

-- Guarantee at most ONE owner (role = 1)
CREATE UNIQUE INDEX IF NOT EXISTS users_one_owner_idx
  ON users ((role))
  WHERE role = 1;

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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id);
CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships (user_a);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships (user_b);
CREATE INDEX IF NOT EXISTS moderation_logs_username_idx ON moderation_logs (username);
