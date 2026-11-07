import type { D1Database } from './env';

let isSchemaEnsured = false;

export async function ensureD1Schema(db: D1Database): Promise<void> {
  if (isSchemaEnsured) return;

  try {
    // 1. Ensure 'users' table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        password_hash TEXT,
        name TEXT,
        employee_id TEXT,
        campus_id TEXT,
        role_title TEXT,
        status TEXT DEFAULT 'pending_approval',
        role TEXT DEFAULT 'user',
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
    `).run().catch(() => {});

    // 2. Fetch current columns of 'users' to dynamically heal any missing columns
    const tableInfo = await db.prepare(`PRAGMA table_info(users);`).all<{ name: string }>().catch(() => ({ results: [] }));
    const existingColumns = new Set((tableInfo?.results || []).map((col) => col.name.toLowerCase()));

    const columnsToAdd: Array<{ name: string; ddl: string }> = [
      { name: 'password', ddl: 'ALTER TABLE users ADD COLUMN password TEXT;' },
      { name: 'password_hash', ddl: 'ALTER TABLE users ADD COLUMN password_hash TEXT;' },
      { name: 'employee_id', ddl: 'ALTER TABLE users ADD COLUMN employee_id TEXT;' },
      { name: 'password_reset_approved', ddl: 'ALTER TABLE users ADD COLUMN password_reset_approved INTEGER DEFAULT 0;' },
      { name: 'must_change_password', ddl: 'ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;' },
      { name: 'campus_id', ddl: 'ALTER TABLE users ADD COLUMN campus_id TEXT;' },
      { name: 'role_title', ddl: 'ALTER TABLE users ADD COLUMN role_title TEXT;' },
      { name: 'name', ddl: 'ALTER TABLE users ADD COLUMN name TEXT;' },
      { name: 'status', ddl: "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending_approval';" },
      { name: 'role', ddl: "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';" },
      { name: 'bio', ddl: 'ALTER TABLE users ADD COLUMN bio TEXT;' },
      { name: 'icebreaker', ddl: 'ALTER TABLE users ADD COLUMN icebreaker TEXT;' },
      { name: 'interests', ddl: 'ALTER TABLE users ADD COLUMN interests TEXT;' },
      { name: 'dietary', ddl: "ALTER TABLE users ADD COLUMN dietary TEXT DEFAULT 'Any';" },
      { name: 'social_battery', ddl: "ALTER TABLE users ADD COLUMN social_battery TEXT DEFAULT 'Balanced Banter';" },
      { name: 'avatar_seed', ddl: 'ALTER TABLE users ADD COLUMN avatar_seed TEXT;' },
      { name: 'avatar_bg', ddl: 'ALTER TABLE users ADD COLUMN avatar_bg TEXT;' },
      { name: 'registered_at', ddl: 'ALTER TABLE users ADD COLUMN registered_at TEXT;' },
      { name: 'approved_at', ddl: 'ALTER TABLE users ADD COLUMN approved_at TEXT;' },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name.toLowerCase())) {
        try {
          await db.prepare(col.ddl).run();
        } catch {
          // column may already exist or cannot be added, ignore
        }
      }
    }

    // 3. Ensure 'communities' table exists
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

    // 4. Ensure 'locations' table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL,
        name TEXT NOT NULL,
        zone TEXT NOT NULL,
        description TEXT,
        is_popular INTEGER DEFAULT 0,
        created_at INTEGER
      );
    `).run().catch(() => {});

    // 5. Ensure 'breaks' table exists
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
        created_at INTEGER NOT NULL
      );
    `).run().catch(() => {});

    // 6. Ensure 'messages' table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        approved_at TEXT,
        admin_id TEXT
      );
    `).run().catch(() => {});

    // 8. Ensure 'audit_logs' table exists
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

    // 9. Ensure 'system_metadata' and 'deleted_communities' tables exist for industrial migrations
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

    // 10. Seed Master Admin if not present
    const adminUser = await db.prepare(`SELECT id FROM users WHERE LOWER(email) = 'admin@middaybuddy.com';`).first().catch(() => null);
    if (!adminUser) {
      await db.prepare(`
        INSERT OR IGNORE INTO users (
          id, email, password, password_hash, name, employee_id, campus_id, role_title,
          status, role, password_reset_approved, must_change_password, registered_at, approved_at
        ) VALUES (
          'usr_admin', 'admin@middaybuddy.com', 'Admin@12345', 'Admin@12345', 'System Administrator',
          'ADM-001', 'comm_siruseri', 'Platform Administrator', 'approved', 'community_admin', 0, 0,
          '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'
        );
      `).run().catch(() => {});
    }

    // 11. Seed default communities ONCE only via authoritative system migration flag
    const seedMeta = await db.prepare(`SELECT value FROM system_metadata WHERE key = 'seed_applied';`).first<{ value: string }>().catch(() => null);
    if (!seedMeta) {
      // Check existing count to avoid overwriting existing data
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
          VALUES ('loc_spine_chai', 'comm_siruseri', 'Spine Chai Point (Near Core)', 'Central Spine', 'Popular ginger chai and filter coffee kiosk', 1, 1730000000000);
        `).run().catch(() => {});
      }

      await db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('seed_applied', '1', ?);
      `).bind(Date.now()).run().catch(() => {});
    }

    isSchemaEnsured = true;
  } catch (err) {
    console.error('ensureD1Schema error (graceful fallback):', err);
  }
}
