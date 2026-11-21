-- MidDay Buddy · Initial PostgreSQL Schema Migration
-- Auto-deployed by Supabase GitHub Integration (working directory: .)
-- Pure standard PostgreSQL 14+ DDL — 100% portable to self-managed PostgreSQL.

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0,
  active_breaks_count INTEGER NOT NULL DEFAULT 0,
  verified_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  invite_code TEXT,
  webhook_url TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_id TEXT,
  campus_id TEXT REFERENCES communities(id) ON DELETE SET NULL,
  role_title TEXT NOT NULL DEFAULT 'Software Engineer',
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'suspended')),
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'community_admin', 'platform_admin')),
  password_reset_requested BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_approved BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  bio TEXT NOT NULL DEFAULT '',
  icebreaker TEXT NOT NULL DEFAULT '',
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary TEXT NOT NULL DEFAULT 'Any',
  social_battery TEXT NOT NULL DEFAULT 'Balanced Banter',
  avatar_seed TEXT NOT NULL DEFAULT '',
  avatar_bg TEXT NOT NULL DEFAULT 'bg-indigo-600',
  registered_at TEXT NOT NULL,
  approved_at TEXT,
  created_at BIGINT NOT NULL
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
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  break_type TEXT NOT NULL CHECK (break_type IN ('tea', 'lunch', 'walk', 'sports')),
  status TEXT NOT NULL DEFAULT 'free_now',
  zone TEXT NOT NULL,
  location_name TEXT NOT NULL,
  custom_note TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'completed')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  admin_id TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  reference_id TEXT
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

CREATE TABLE IF NOT EXISTS system_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_communities (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_locations (
  id TEXT PRIMARY KEY,
  community_id TEXT,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_employee_id_upper ON users (UPPER(employee_id));
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_campus ON users (campus_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_locations_community ON locations (community_id);
CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks (community_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_breaks_user ON breaks (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
