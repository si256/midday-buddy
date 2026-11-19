-- ============================================================================
-- MidDay Buddy Production Database Migration Script for Cloudflare D1 / SQLite
-- Backed by CoreReacher Enterprises
-- Purpose: 
--   1. Fix missing 'password' and other missing columns in 'users' table
--   2. Establish complete foreign key relationships and cascade rules
--   3. Resolve duplicate/rejected employee ID locks preventing registration
--   4. Seed and protect master administrator account
--
-- How to apply this migration to your Cloudflare D1 database:
--   npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file=migration.sql
-- Or for production remote database:
--   npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --remote --file=migration.sql
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- STEP 1: Ensure All Required Tables Exist
-- ----------------------------------------------------------------------------

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
  created_at INTEGER,
  FOREIGN KEY (campus_id) REFERENCES communities(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  description TEXT,
  is_popular INTEGER DEFAULT 0,
  created_at INTEGER,
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
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_communities (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- STEP 2: Dynamically Add Missing Columns to Pre-Existing 'users' Table
-- (SQLite ignores ALTER TABLE ADD COLUMN if the column already exists)
-- ----------------------------------------------------------------------------

-- Add password column (solves table users has no column named password)
ALTER TABLE users ADD COLUMN password TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN employee_id TEXT;
ALTER TABLE users ADD COLUMN campus_id TEXT DEFAULT 'comm_siruseri';
ALTER TABLE users ADD COLUMN role_title TEXT DEFAULT 'Software Engineer';
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending_approval';
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN password_reset_approved INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN icebreaker TEXT;
ALTER TABLE users ADD COLUMN interests TEXT;
ALTER TABLE users ADD COLUMN dietary TEXT DEFAULT 'Any';
ALTER TABLE users ADD COLUMN social_battery TEXT DEFAULT 'Balanced Banter';
ALTER TABLE users ADD COLUMN avatar_seed TEXT;
ALTER TABLE users ADD COLUMN avatar_bg TEXT;
ALTER TABLE users ADD COLUMN registered_at TEXT;
ALTER TABLE users ADD COLUMN approved_at TEXT;
ALTER TABLE users ADD COLUMN created_at INTEGER;

-- ----------------------------------------------------------------------------
-- STEP 3: Normalize Authentication Passwords
-- Synchronize password and password_hash columns across all users
-- ----------------------------------------------------------------------------

UPDATE users 
SET password = password_hash 
WHERE password IS NULL AND password_hash IS NOT NULL;

UPDATE users 
SET password_hash = password 
WHERE password_hash IS NULL AND password IS NOT NULL;

-- ----------------------------------------------------------------------------
-- STEP 4: Resolve Rejected & Duplicate Employee ID Locks
-- Clean up orphaned or rejected records so employees can re-apply cleanly
-- ----------------------------------------------------------------------------

-- Remove rejected applications that lock employee IDs without admin visibility
DELETE FROM users 
WHERE status = 'rejected';

-- Clean up any orphaned breaks whose parent user was deleted
DELETE FROM breaks 
WHERE user_id NOT IN (SELECT id FROM users);

-- Clean up any orphaned locations whose parent community was deleted
DELETE FROM locations 
WHERE community_id NOT IN (SELECT id FROM communities);

-- Clean up any orphaned messages whose break conversation was deleted
DELETE FROM messages 
WHERE conversation_id NOT IN (SELECT id FROM breaks);

-- Clean up any orphaned reset requests
DELETE FROM reset_requests 
WHERE user_id NOT IN (SELECT id FROM users);

-- ----------------------------------------------------------------------------
-- STEP 5: Create Performance and Integrity Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);
CREATE INDEX IF NOT EXISTS idx_locations_community ON locations(community_id);
CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks(community_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_breaks_user ON breaks(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_reset_requests_user ON reset_requests(user_id);

-- ----------------------------------------------------------------------------
-- STEP 6: Ensure Master Admin & Default Communities Exist
-- ----------------------------------------------------------------------------

INSERT OR REPLACE INTO users (
  id, email, password, password_hash, name, employee_id, campus_id, role_title,
  status, role, password_reset_approved, must_change_password, bio, icebreaker,
  dietary, social_battery, registered_at, approved_at, created_at
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
  '2026-11-01T00:00:00Z',
  1730000000000
);

INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
VALUES 
  ('comm_siruseri', 'siruseri-campus', 'TCS Siruseri Campus', 'Chennai', 'The iconic 70-acre butterfly campus with the 400m Central Spine and vibrant cafeterias.', 342, 14, 1730000000000),
  ('comm_tidel', 'tidel-park', 'Tidel Park Campus', 'Chennai', 'Premier IT landmark on OMR with multi-floor food courts and garden patio.', 185, 6, 1730000000000),
  ('comm_manyata', 'manyata-tech-park', 'Manyata Tech Park', 'Bengaluru', 'Dynamic campus hub in North Bengaluru with rooftop cafes and sports courts.', 220, 9, 1730000000000);

INSERT OR IGNORE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
VALUES
  ('loc_spine_chai_core', 'comm_siruseri', 'Spine Chai Point (Near Core)', 'Central Spine', 'The most popular ginger chai and filter coffee kiosk by the central tower.', 1, 1730000000000),
  ('loc_spine_ccd', 'comm_siruseri', 'Café Coffee Day (Spine East)', 'Central Spine', 'Quiet coffee seating with air conditioning and espresso.', 0, 1730000000000),
  ('loc_fc1', 'comm_siruseri', 'Food Court 1 (South Indian & Thalis)', 'Food Court 1', 'Ground floor main cafeteria featuring hot dosas, Kerala meals, and thalis.', 1, 1730000000000),
  ('loc_fc2', 'comm_siruseri', 'Food Court 2 (Multi-Cuisine & Biryani)', 'Food Court 2', 'Executive cafeteria with North Indian gravies, rolls, and Hyderabad biryani.', 1, 1730000000000),
  ('loc_gazebo', 'comm_siruseri', 'Central Lawn Gazebo', 'Outdoor Greens', 'Shaded open-air seating for breezy midday discussions and walks.', 0, 1730000000000);

-- Record migration completion
INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
VALUES ('migration_schema_v2', 'applied', 1730000000000);
