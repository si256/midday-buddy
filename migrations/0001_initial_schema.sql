-- Cloudflare D1 Migration: 0001_initial_schema.sql
-- MidDay Buddy Enterprise Schema v2.0
-- Zero hardcoded credentials, foreign key constraints, PBKDF2 hash support, tombstones

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
CREATE INDEX IF NOT EXISTS idx_reset_requests_user ON reset_requests(user_id);

-- Default corporate campuses
INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
VALUES 
  ('comm_siruseri', 'siruseri-campus', 'TCS Siruseri Campus', 'Chennai', 'The iconic 70-acre butterfly campus with the 400m Central Spine and vibrant cafeterias.', 342, 14, 1730000000000),
  ('comm_tidel', 'tidel-park', 'Tidel Park Campus', 'Chennai', 'Premier IT landmark on OMR with multi-floor food courts and garden patio.', 185, 6, 1730000000000),
  ('comm_manyata', 'manyata-tech-park', 'Manyata Tech Park', 'Bengaluru', 'Dynamic campus hub in North Bengaluru with rooftop cafes and sports courts.', 220, 9, 1730000000000);

INSERT OR IGNORE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
VALUES
  ('loc_spine_chai_core', 'comm_siruseri', 'Spine Chai Point (Near Core)', 'Central Spine', 'The most popular ginger chai and filter coffee kiosk by the central tower.', 1, 1730000000000),
  ('loc_spine_ccd', 'comm_siruseri', 'Café Coffee Day (Spine East)', 'Central Spine', 'Quiet coffee seating with air conditioning and espresso.', 0, 1730000000000),
  ('loc_fresh_juice', 'comm_siruseri', 'Fresh Juice & Fruit Counter', 'Central Spine', 'Cold-pressed seasonal juices, tender coconut, and fresh fruit bowls.', 1, 1730000000000),
  ('loc_fc1', 'comm_siruseri', 'Food Court 1 (South Indian & Thalis)', 'Food Court 1', 'Ground floor main cafeteria featuring hot dosas, Kerala meals, and thalis.', 1, 1730000000000),
  ('loc_fc2', 'comm_siruseri', 'Food Court 2 (Multi-Cuisine & Biryani)', 'Food Court 2', 'Executive cafeteria with North Indian gravies, rolls, and Hyderabad biryani.', 1, 1730000000000),
  ('loc_gazebo', 'comm_siruseri', 'Central Lawn Gazebo', 'Outdoor Greens', 'Shaded open-air seating for breezy midday discussions and walks.', 0, 1730000000000),
  ('loc_tidel_atrium', 'comm_tidel', 'Central Atrium Café', 'Ground Floor', 'Meeting point near the main lobby fountains.', 1, 1730000000000),
  ('loc_tidel_fc3', 'comm_tidel', 'Food Court Level 3', '3rd Floor', 'Wide variety of south and north Indian options.', 1, 1730000000000),
  ('loc_manyata_roof', 'comm_manyata', 'Sky Garden Bistro', 'Rooftop', 'Open terrace lunch and coffee with greenery view.', 1, 1730000000000);

INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
VALUES ('migration_0001', 'applied', 1730000000000);
