import type { D1Database } from './env';

let isSchemaEnsured = false;

export async function ensureD1Schema(db: D1Database): Promise<void> {
  if (isSchemaEnsured) return;

  try {
    // 0. Enable foreign keys in SQLite
    await db.prepare(`PRAGMA foreign_keys = ON;`).run().catch(() => {});

    // 1. Ensure 'communities' table exists first (parent of users, locations, breaks)
    await db.prepare(`
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
    `).run().catch(() => {});

    // 2. Ensure 'users' table exists with modern cryptographic password_hash
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
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
    `).run().catch(() => {});

    // 3. Ensure 'locations' table exists
    await db.prepare(`
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
    `).run().catch(() => {});

    // 4. Ensure 'breaks' table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS breaks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        community_id TEXT NOT NULL,
        break_type TEXT NOT NULL,
        zone TEXT NOT NULL,
        location_name TEXT NOT NULL,
        custom_note TEXT,
        duration_minutes INTEGER DEFAULT 15,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
      );
    `).run().catch(() => {});

    // 5. Ensure 'messages' table exists
    await db.prepare(`
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
    `).run().catch(() => {});

    // 6. Ensure 'sessions' table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `).run().catch(() => {});

    // 7. Ensure 'reset_requests' table exists
    await db.prepare(`
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
    `).run().catch(() => {});

    // 8. Ensure 'notifications' table exists
    await db.prepare(`
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
    `).run().catch(() => {});

    // 9. Ensure 'audit_logs' table exists
    await db.prepare(`
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
    `).run().catch(() => {});

    // 10. System metadata and tombstones
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deleted_communities (
        id TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      );
    `).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deleted_locations (
        id TEXT PRIMARY KEY,
        community_id TEXT,
        deleted_at TEXT NOT NULL
      );
    `).run().catch(() => {});

    // 11. Indexes for performance and uniqueness
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`).run().catch(() => {});
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);`).run().catch(() => {});
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`).run().catch(() => {});
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_locations_community ON locations(community_id);`).run().catch(() => {});
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_breaks_community ON breaks(community_id);`).run().catch(() => {});
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`).run().catch(() => {});

    // 12. Seed default communities ONCE only via authoritative system migration flag
    // (NO hardcoded administrator is seeded; admin is provisioned securely via /api/auth/setup-admin)
    const seedMeta = await db.prepare(`SELECT value FROM system_metadata WHERE key = 'seed_applied';`).first<{ value: string }>().catch(() => null);
    if (!seedMeta) {
      const existingCount = await db.prepare(`SELECT COUNT(*) as count FROM communities;`).first<{ count: number }>().catch(() => ({ count: 0 }));
      if (!existingCount || existingCount.count === 0) {
        await db.prepare(`
          INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
          VALUES ('comm_siruseri', 'siruseri-campus', 'TCS Siruseri Campus', 'Chennai', 'Iconic 70-acre butterfly campus with Central Spine', 342, 14, 1730000000000);
        `).run().catch(() => {});

        await db.prepare(`
          INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
          VALUES ('comm_tidel', 'tidel-park', 'Tidel Park Campus', 'Chennai', 'IT landmark on OMR with multi-floor food courts', 185, 6, 1730000000000);
        `).run().catch(() => {});

        await db.prepare(`
          INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
          VALUES ('comm_manyata', 'manyata-tech-park', 'Manyata Tech Park', 'Bengaluru', 'Dynamic tech campus in North Bengaluru', 220, 9, 1730000000000);
        `).run().catch(() => {});

        await db.prepare(`
          INSERT OR IGNORE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
          VALUES ('loc_spine_chai_core', 'comm_siruseri', 'Spine Chai Point (Near Core)', 'Central Spine', 'Popular ginger chai and filter coffee kiosk', 1, 1730000000000);
        `).run().catch(() => {});
      }

      await db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('seed_applied', '1', ?);
      `).bind(Date.now()).run().catch(() => {});
    }

    isSchemaEnsured = true;
  } catch (err) {
    console.error('ensureD1Schema error:', err);
  }
}
