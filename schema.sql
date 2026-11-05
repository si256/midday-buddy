-- MidDay Buddy Production Database Schema for Cloudflare D1 / SQLite
-- Backed by CoreReacher Enterprises

-- 1. Users Table (with Employee Verification & Password Authentication)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  password_hash TEXT,
  name TEXT NOT NULL,
  employee_id TEXT,
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
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);

-- 2. Communities Table (Campus Hubs)
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT,
  member_count INTEGER DEFAULT 0,
  active_breaks_count INTEGER DEFAULT 0,
  created_at INTEGER
);

-- 3. Locations Table (Spine Kiosks & Dining Courts)
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  description TEXT,
  is_popular INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_locations_community ON locations(community_id);

-- 4. Breaks Table (Live Companions & Activity Posts)
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
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks(community_id, expires_at);

-- 5. Chat Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- 6. Password Reset Requests Table (Admin Approval Workflow)
CREATE TABLE IF NOT EXISTS reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'completed')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  admin_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests(status);

-- 7. Audit Logs Table (Admin Security Logging)
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

-- ==========================================
-- INITIAL PRODUCTION SEED DATA
-- ==========================================

-- Master Administrator
INSERT OR IGNORE INTO users (
  id, email, password, password_hash, name, employee_id, campus_id, role_title,
  status, role, password_reset_approved, must_change_password, bio, icebreaker,
  dietary, social_battery, registered_at, approved_at
) VALUES (
  'usr_admin',
  'admin@middaybuddy.com',
  'Admin@12345',
  'Admin@12345',
  'System Administrator',
  'ADM-001',
  'comm_siruseri',
  'Platform Administrator',
  'approved',
  'community_admin',
  0,
  0,
  'Platform administration and member verification for MidDay Buddy.',
  'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
  'Any',
  'Balanced Banter',
  '2026-11-01T00:00:00Z',
  '2026-11-01T00:00:00Z'
);

-- Campus Communities
INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
VALUES 
  ('comm_siruseri', 'siruseri-campus', 'TCS Siruseri Campus', 'Chennai', 'The iconic 70-acre butterfly campus with the 400m Central Spine and vibrant cafeterias.', 342, 14, 1730000000000),
  ('comm_tidel', 'tidel-park', 'Tidel Park Campus', 'Chennai', 'Premier IT landmark on OMR with multi-floor food courts and garden patio.', 185, 6, 1730000000000),
  ('comm_manyata', 'manyata-tech-park', 'Manyata Tech Park', 'Bengaluru', 'Dynamic campus hub in North Bengaluru with rooftop cafes and sports courts.', 220, 9, 1730000000000);

-- Cafeteria & Spine Locations
INSERT OR IGNORE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
VALUES
  ('loc_spine_chai_core', 'comm_siruseri', 'Spine Chai Point (Near Core)', 'Central Spine', 'The most popular ginger chai and filter coffee kiosk by the central tower.', 1, 1730000000000),
  ('loc_spine_ccd', 'comm_siruseri', 'Café Coffee Day (Spine East)', 'Central Spine', 'Quiet coffee seating with air conditioning and espresso.', 0, 1730000000000),
  ('loc_fc1', 'comm_siruseri', 'Food Court 1 (South Indian & Thalis)', 'Food Court 1', 'Ground floor main cafeteria featuring hot dosas, Kerala meals, and thalis.', 1, 1730000000000),
  ('loc_fc2', 'comm_siruseri', 'Food Court 2 (Multi-Cuisine & Biryani)', 'Food Court 2', 'Executive cafeteria with North Indian gravies, rolls, and Hyderabad biryani.', 1, 1730000000000),
  ('loc_gazebo', 'comm_siruseri', 'Central Lawn Gazebo', 'Outdoor Greens', 'Shaded open-air seating for breezy midday discussions and walks.', 0, 1730000000000);
