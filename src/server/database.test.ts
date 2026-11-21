import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatabase,
  DatabaseNotConfiguredError,
  PgPoolLike,
  resolvePostgresConfig,
} from './database.ts';

/**
 * Lightweight PostgreSQL query recorder/executor for unit-testing SQL parameterization,
 * schema bootstrapping, transactions, and domain rules in CI without live DB secrets.
 */
function createMockPgPool() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const tables: Record<string, any[]> = {
    communities: [],
    locations: [],
    users: [],
    sessions: [],
    breaks: [],
    messages: [],
    reset_requests: [],
    notifications: [],
    audit_logs: [],
    system_metadata: [],
    deleted_communities: [],
    deleted_locations: [],
  };

  let failNextQuery: Error | null = null;

  async function execute(sql: string, params: unknown[] = []) {
    queries.push({ sql: sql.trim(), params });
    if (failNextQuery) {
      const err = failNextQuery;
      failNextQuery = null;
      throw err;
    }

    const q = sql.replace(/\s+/g, ' ').trim();

    if (
      q.startsWith('CREATE TABLE') ||
      q.startsWith('CREATE INDEX') ||
      q === 'BEGIN' ||
      q === 'COMMIT' ||
      q === 'ROLLBACK'
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (q.startsWith("SELECT value FROM system_metadata WHERE key = 'seed_applied'")) {
      const row = tables.system_metadata.find((r) => r.key === 'seed_applied');
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('INSERT INTO system_metadata')) {
      const existing = tables.system_metadata.find((r) => r.key === 'seed_applied');
      if (existing) {
        existing.value = '1';
        existing.updated_at = params[0];
      } else {
        tables.system_metadata.push({ key: 'seed_applied', value: '1', updated_at: params[0] });
      }
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO communities')) {
      const [id, slug, name, city, description, member_count, active_breaks_count] = params;
      if (!tables.communities.some((c) => c.id === id)) {
        const hasOnboardingCols = q.includes('verified_domains');
        tables.communities.push({
          id,
          slug,
          name,
          city,
          description,
          member_count: hasOnboardingCols ? member_count : 0,
          active_breaks_count: hasOnboardingCols ? active_breaks_count : 0,
          verified_domains: hasOnboardingCols ? JSON.parse(String(params[7] || '[]')) : [],
          invite_code: hasOnboardingCols ? params[8] : null,
          webhook_url: null,
          created_at: hasOnboardingCols ? params[9] : params[5],
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO locations')) {
      const [id, community_id, name, zone, description, is_popular, created_at] = params;
      const idx = tables.locations.findIndex((l) => l.id === id);
      const row = { id, community_id, name, zone, description, is_popular: Boolean(is_popular), created_at };
      if (idx >= 0) tables.locations[idx] = row;
      else tables.locations.push(row);
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('SELECT id, verified_domains, invite_code FROM communities WHERE id = $1')) {
      const row = tables.communities.find((c) => c.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT id, verified_domains, invite_code FROM communities ORDER BY created_at')) {
      const row = tables.communities[0];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT id FROM communities WHERE id = $1')) {
      const row = tables.communities.find((c) => c.id === params[0]);
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT id FROM communities ORDER BY created_at ASC LIMIT 1')) {
      const row = tables.communities[0];
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT c.*,') && q.includes('FROM communities c')) {
      const now = Number(params[0]);
      const deletedIds = new Set(tables.deleted_communities.map((d) => d.id));
      const rows = tables.communities
        .filter((c) => !deletedIds.has(c.id))
        .map((c) => ({
          ...c,
          live_member_count: tables.users.filter((u) => u.campus_id === c.id && u.status === 'approved').length,
          live_active_breaks: tables.breaks.filter(
            (b) => b.community_id === c.id && b.expires_at > now && b.status !== 'completed'
          ).length,
        }));
      return { rows, rowCount: rows.length };
    }

    if (q.startsWith('SELECT * FROM locations WHERE id NOT IN')) {
      const deletedIds = new Set(tables.deleted_locations.map((d) => d.id));
      const rows = tables.locations.filter((l) => !deletedIds.has(l.id));
      return { rows, rowCount: rows.length };
    }

    if (q.startsWith('SELECT id FROM users WHERE role IN')) {
      const rows = tables.users.filter((u) => u.role === 'community_admin' || u.role === 'platform_admin');
      return { rows: rows.slice(0, 1).map((r) => ({ id: r.id })), rowCount: Math.min(1, rows.length) };
    }

    if (q.startsWith('SELECT * FROM users WHERE LOWER(email) = LOWER($1)')) {
      const target = String(params[0]).toLowerCase();
      const row = tables.users.find((u) => u.email.toLowerCase() === target);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT * FROM users WHERE LOWER(email) = $1 OR UPPER(employee_id) = $2')) {
      const email = String(params[0]).toLowerCase();
      const empId = String(params[1]).toUpperCase();
      const row = tables.users.find(
        (u) => u.email.toLowerCase() === email || (u.employee_id && u.employee_id.toUpperCase() === empId)
      );
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT * FROM users WHERE UPPER(employee_id) = UPPER($1)')) {
      const target = String(params[0]).toUpperCase();
      const row = tables.users.find((u) => u.employee_id && u.employee_id.toUpperCase() === target);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('SELECT * FROM users WHERE id = $1')) {
      const row = tables.users.find((u) => u.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith('INSERT INTO users')) {
      const isBootstrapAdmin = q.includes("'platform_admin'");
      const isAdminUpsert = q.includes("'approved', $8");
      if (isBootstrapAdmin) {
        const [
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          bio,
          icebreaker,
          interests,
          nowISO,
          now,
        ] = params;
        tables.users.push({
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          status: 'approved',
          role: 'platform_admin',
          password_reset_requested: false,
          password_reset_approved: false,
          must_change_password: false,
          bio,
          icebreaker,
          interests: JSON.parse(String(interests)),
          dietary: 'Any',
          social_battery: 'Balanced Banter',
          avatar_seed: 'Admin',
          avatar_bg: 'bg-indigo-600',
          registered_at: nowISO,
          approved_at: nowISO,
          created_at: now,
        });
      } else if (isAdminUpsert) {
        const [
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          role,
          bio,
          icebreaker,
          interests,
          avatar_seed,
          avatar_bg,
          nowISO,
          now,
        ] = params;
        tables.users.push({
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          status: 'approved',
          role,
          password_reset_requested: false,
          password_reset_approved: false,
          must_change_password: false,
          bio,
          icebreaker,
          interests: JSON.parse(String(interests)),
          dietary: 'Any',
          social_battery: 'Balanced Banter',
          avatar_seed,
          avatar_bg,
          registered_at: nowISO,
          approved_at: nowISO,
          created_at: now,
        });
      } else {
        const [
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          status,
          bio,
          icebreaker,
          interests,
          dietary,
          avatar_seed,
          registered_at,
          approved_at,
          created_at,
        ] = params;
        tables.users.push({
          id,
          email,
          password_hash,
          name,
          employee_id,
          campus_id,
          role_title,
          status,
          role: 'user',
          password_reset_requested: false,
          password_reset_approved: false,
          must_change_password: false,
          bio,
          icebreaker,
          interests: JSON.parse(String(interests)),
          dietary,
          social_battery: 'Balanced Banter',
          avatar_seed,
          avatar_bg: 'bg-indigo-600',
          registered_at,
          approved_at,
          created_at,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO sessions')) {
      const [token_hash, user_id, expires_at, created_at] = params;
      tables.sessions.push({ token_hash, user_id, expires_at, created_at });
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('SELECT u.* FROM sessions s JOIN users u')) {
      const [tokenHash, now] = params;
      const sess = tables.sessions.find((s) => s.token_hash === tokenHash && s.expires_at > Number(now));
      if (!sess) return { rows: [], rowCount: 0 };
      const user = tables.users.find((u) => u.id === sess.user_id && u.status !== 'suspended');
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (q.startsWith('DELETE FROM sessions WHERE token_hash = $1')) {
      const before = tables.sessions.length;
      tables.sessions = tables.sessions.filter((s) => s.token_hash !== params[0]);
      return { rows: [], rowCount: before - tables.sessions.length };
    }

    if (q.startsWith('SELECT COUNT(*)::int AS c FROM users')) {
      return { rows: [{ c: tables.users.length }], rowCount: 1 };
    }
    if (q.startsWith('SELECT COUNT(*)::int AS c FROM breaks')) {
      const now = Number(params[0]);
      const c = tables.breaks.filter((b) => b.expires_at > now && b.status !== 'completed').length;
      return { rows: [{ c }], rowCount: 1 };
    }
    if (q.startsWith('SELECT COUNT(*)::int AS c FROM communities')) {
      return { rows: [{ c: tables.communities.length }], rowCount: 1 };
    }
    if (q.startsWith('SELECT COUNT(*)::int AS c FROM reset_requests')) {
      const c = tables.reset_requests.filter((r) => r.status === 'pending').length;
      return { rows: [{ c }], rowCount: 1 };
    }

    throw new Error(`Unhandled mock SQL query: ${q}`);
  }

  const pool: PgPoolLike = {
    query: execute,
    async connect() {
      return {
        query: execute,
        release() {},
      };
    },
    async end() {},
  };

  return {
    pool,
    queries,
    tables,
    setNextFailure(err: Error) {
      failNextQuery = err;
    },
  };
}

test('resolvePostgresConfig supports Supabase pooler, Supabase direct, and self-managed PostgreSQL seamlessly', () => {
  // 1. Supabase Transaction Pooler (port 6543) -> auto TLS + supabase provider
  const supabasePooler = resolvePostgresConfig({
    DATABASE_URL:
      'postgresql://postgres.abcd1234:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
    PGPOOL_MAX: '15',
  });
  assert.ok(supabasePooler);
  assert.equal(supabasePooler.provider, 'supabase');
  assert.equal(supabasePooler.sslEnabled, true);
  assert.equal(supabasePooler.poolConfig.max, 15);
  assert.deepEqual(supabasePooler.poolConfig.ssl, { rejectUnauthorized: false });

  // 2. Self-managed local / Docker PostgreSQL -> SSL off by default
  const selfHostedDocker = resolvePostgresConfig({
    DATABASE_URL: 'postgresql://midday:pw@postgres:5432/midday_buddy',
  });
  assert.ok(selfHostedDocker);
  assert.equal(selfHostedDocker.provider, 'self-managed');
  assert.equal(selfHostedDocker.sslEnabled, false);
  assert.equal(selfHostedDocker.poolConfig.ssl, false);

  // 3. Self-managed remote PostgreSQL with strict CA certificate
  const selfHostedTls = resolvePostgresConfig({
    DATABASE_URL: 'postgresql://midday:pw@db.internal.company.com:5432/midday_buddy',
    DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----',
  });
  assert.ok(selfHostedTls);
  assert.equal(selfHostedTls.provider, 'self-managed');
  assert.equal(selfHostedTls.sslEnabled, true);
  assert.deepEqual(selfHostedTls.poolConfig.ssl, {
    rejectUnauthorized: true,
    ca: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
  });

  // 4. Discrete PGHOST/PGDATABASE vars (no DATABASE_URL)
  const discreteSelfHosted = resolvePostgresConfig({
    PGHOST: '127.0.0.1',
    PGPORT: '5433',
    PGDATABASE: 'midday_buddy',
    PGUSER: 'postgres',
    PGPASSWORD: 'secret',
  });
  assert.ok(discreteSelfHosted);
  assert.equal(discreteSelfHosted.provider, 'self-managed');
  assert.equal(discreteSelfHosted.poolConfig.port, 5433);
  assert.equal(discreteSelfHosted.sslEnabled, false);

  // 5. Unconfigured environment returns null (zero SQLite / JSON fallback)
  assert.equal(resolvePostgresConfig({}), null);
});

test('MidDayDatabase throws DatabaseNotConfiguredError (503) when DATABASE_URL is missing', async () => {
  const db = createDatabase({ env: {} });
  assert.equal(db.isConfigured(), false);

  await assert.rejects(
    async () => {
      await db.listCommunities();
    },
    (err: any) => {
      assert.ok(err instanceof DatabaseNotConfiguredError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, 'DB_NOT_CONFIGURED');
      return true;
    }
  );
});

test('PostgreSQL bootstrap seeds campuses once, skips hardcoded admin passwords when ADMIN_PASSWORD is unset, and locks first-admin setup', async () => {
  const mock = createMockPgPool();
  const db = createDatabase({
    pool: mock.pool,
    provider: 'supabase',
    sslEnabled: true,
    env: {},
  });

  assert.equal(db.isConfigured(), true);
  const communities = await db.listCommunities();
  assert.ok(communities.length >= 3, 'Initial campus communities should be seeded once');
  assert.equal(await db.hasAdmin(), false, 'No hardcoded admin account should be seeded without ADMIN_PASSWORD');

  // First-run admin setup succeeds once
  const admin = await db.setupFirstAdmin({
    name: 'Campus Lead',
    email: 'lead@company.com',
    employeeId: 'ADM-100',
    password: 'StrongAdminPassword!1',
  });
  assert.equal(admin.role, 'platform_admin');
  assert.equal(admin.status, 'approved');
  assert.equal(await db.hasAdmin(), true);

  // Second attempt is permanently locked with 403
  await assert.rejects(
    async () => {
      await db.setupFirstAdmin({
        name: 'Attacker',
        email: 'evil@company.com',
        employeeId: 'ADM-999',
        password: 'AnotherPassword!1',
      });
    },
    (err: any) => err?.statusCode === 403
  );

  // Register standard member, verify PBKDF2 password, create & revoke SHA-256 session
  const member = await db.registerUser({
    name: 'Priya Nair',
    email: 'priya@corp.com',
    password: 'UserPass@2026',
    employeeId: 'EMP-501',
    campusId: communities[0].id,
  });
  assert.equal(member.status, 'pending_approval');

  const verified = await db.verifyUserCredentials('priya@corp.com', 'UserPass@2026');
  assert.ok(verified);
  assert.equal(verified.id, member.id);
  assert.equal(await db.verifyUserCredentials('priya@corp.com', 'WrongPassword'), null);

  const token = await db.createSession(member.id);
  const sessionUser = await db.getSessionUser(token);
  assert.ok(sessionUser);
  assert.equal(sessionUser.id, member.id);

  await db.revokeSession(token);
  assert.equal(await db.getSessionUser(token), null);

  const health = await db.getHealthStats();
  assert.equal(health.engine, 'postgresql');
  assert.equal(health.provider, 'supabase');
  assert.equal(health.sslEnabled, true);
  assert.equal(health.usersCount, 2);

  // Raw PostgreSQL driver errors are sanitized before reaching callers
  mock.setNextFailure(new Error('FATAL: password authentication failed for user "postgres"'));
  await assert.rejects(
    async () => {
      await db.getUserById(member.id);
    },
    (err: any) => {
      assert.equal(err.message, 'Database operation failed. Please try again later.');
      assert.ok(!err.message.includes('password authentication failed'));
      return true;
    }
  );

  await db.close();
});

test('runMigrations applies supabase/migrations SQL files transactionally, skips on re-run, and detects checksum drift', async () => {
  const { runMigrations } = await import('../../scripts/db-migrate.ts');
  const appliedRows: Array<{ filename: string; checksum: string }> = [];
  const executedSql: string[] = [];

  const mockMigrationPool: PgPoolLike = {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim();
      executedSql.push(q);
      if (q.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('SELECT filename, checksum FROM schema_migrations')) {
        return { rows: [...appliedRows], rowCount: appliedRows.length };
      }
      if (q.startsWith('INSERT INTO schema_migrations')) {
        appliedRows.push({ filename: String(params[0]), checksum: String(params[1]) });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return {
        query: (sql: string, params?: unknown[]) => mockMigrationPool.query(sql, params),
        release() {},
      };
    },
    async end() {},
  };

  // First run applies 20261120000000_initial_schema.sql inside BEGIN/COMMIT
  const firstRun = await runMigrations(mockMigrationPool);
  assert.deepEqual(firstRun.applied, ['20261120000000_initial_schema.sql']);
  assert.deepEqual(firstRun.skipped, []);
  assert.ok(executedSql.includes('BEGIN'));
  assert.ok(executedSql.includes('COMMIT'));

  // Second run skips already-applied migration cleanly
  const secondRun = await runMigrations(mockMigrationPool);
  assert.deepEqual(secondRun.applied, []);
  assert.deepEqual(secondRun.skipped, ['20261120000000_initial_schema.sql']);

  // Mutating an applied migration's checksum raises a drift protection error
  appliedRows[0].checksum = 'corrupted_checksum';
  await assert.rejects(
    async () => {
      await runMigrations(mockMigrationPool);
    },
    /Migration checksum mismatch/
  );
});
