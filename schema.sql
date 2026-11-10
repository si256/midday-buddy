-- ============================================================================
-- MidDay Buddy D1 Production Schema
-- Backed by CoreReacher Enterprises
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT,
  member_count INTEGER DEFAULT 0,
  active_breaks_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_id TEXT UNIQUE,
  campus_id TEXT DEFAULT 'comm_siruseri',
  role_title TEXT DEFAULT 'Software Engineer',
  status TEXT DEFAULT 'pending_approval' CHECK(status IN ('pending_approval', 'approved', 'rejected', 'suspended')),
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'community_admin', 'platform_admin')),
  password_reset_approved INTEGER DEFAULT 0,
  must_change_password INTEGER DEFAULT 0,
  bio TEXT,
  icebreaker TEXT,
  interests TEXT,
  dietary TEXT DEFAULT 'Any',
  social_battery TEXT DEFAULT 'Balanced Banter',
  avatar_seed TEXT,
  avatar_bg TEXT,
  registered_at TEXT,
  approved_at TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (campus_id) REFERENCES communities(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  description TEXT,
  is_popular INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS breaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  break_type TEXT NOT NULL CHECK(break_type IN ('tea', 'lunch', 'walk', 'sports')),
  zone TEXT NOT NULL,
  location_name TEXT NOT NULL,
  custom_note TEXT,
  duration_minutes INTEGER DEFAULT 15,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES breaks(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'completed')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  admin_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  data TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS deleted_communities (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_locations (
  id TEXT PRIMARY KEY,
  community_id TEXT,
  deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);
CREATE INDEX IF NOT EXISTS idx_locations_community ON locations(community_id);
CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks(community_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_breaks_user ON breaks(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests(status);
