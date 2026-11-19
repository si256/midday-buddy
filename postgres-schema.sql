-- MidDay Buddy PostgreSQL Production Schema (for 3+ Backend Docker Nodes)
-- Auto-applied on startup by src/server/store.ts when DATABASE_URL is set,
-- or run manually with: psql "$DATABASE_URL" -f postgres-schema.sql

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT DEFAULT '',
  member_count INTEGER DEFAULT 0,
  active_breaks_count INTEGER DEFAULT 0,
  verified_domains JSONB DEFAULT '[]'::jsonb,
  invite_code TEXT,
  webhook_url TEXT,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_popular BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_id TEXT,
  campus_id TEXT REFERENCES communities(id) ON DELETE SET NULL,
  role_title TEXT DEFAULT 'Software Engineer',
  status TEXT DEFAULT 'pending_approval',
  role TEXT DEFAULT 'user',
  password_reset_requested BOOLEAN DEFAULT FALSE,
  password_reset_approved BOOLEAN DEFAULT FALSE,
  must_change_password BOOLEAN DEFAULT FALSE,
  bio TEXT DEFAULT '',
  icebreaker TEXT DEFAULT '',
  interests JSONB DEFAULT '[]'::jsonb,
  dietary TEXT DEFAULT 'Any',
  social_battery TEXT DEFAULT 'Balanced Banter',
  avatar_seed TEXT DEFAULT '',
  avatar_bg TEXT DEFAULT 'bg-indigo-600',
  registered_at TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS breaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_avatar_seed TEXT DEFAULT '',
  user_avatar_bg TEXT DEFAULT 'bg-amber-600',
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  break_type TEXT NOT NULL,
  status TEXT NOT NULL,
  time_label TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  zone TEXT NOT NULL,
  custom_note TEXT DEFAULT '',
  dietary TEXT DEFAULT 'Any',
  interests JSONB DEFAULT '[]'::jsonb,
  icebreaker TEXT DEFAULT '',
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  approved_at TEXT,
  admin_id TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_user_name TEXT,
  details TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TEXT NOT NULL,
  reference_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_emp ON users (UPPER(employee_id));
CREATE INDEX IF NOT EXISTS idx_breaks_comm_exp ON breaks (community_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications (user_id, created_at DESC);
