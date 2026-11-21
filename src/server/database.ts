import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import {
  UserProfile,
  Community,
  BreakPost,
  AuditLog,
  ChatMessage,
  AppNotification,
  CampusLocation,
  PasswordResetRequest,
  UserRole,
  UserApprovalStatus,
  BreakType,
  DietaryPreference,
  SocialBattery,
} from '../types/index.ts';
import { INITIAL_COMMUNITIES } from '../data/seedData.ts';
import { hashPassword, hashToken, generateSecureToken, verifyPassword } from '../utils/crypto.ts';
import { evaluateOnboardingApproval } from '../utils/onboarding.ts';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PostgresProvider = 'supabase' | 'self-managed';

export interface AuthUserRecord extends UserProfile {
  passwordHash: string;
}

export interface DatabaseHealthStats {
  engine: 'postgresql';
  provider: PostgresProvider;
  sslEnabled: boolean;
  usersCount: number;
  activeBreaksCount: number;
  communitiesCount: number;
  pendingResetRequests: number;
}

export class DatabaseNotConfiguredError extends Error {
  public readonly statusCode = 503;
  public readonly code = 'DB_NOT_CONFIGURED';

  constructor(
    message = 'Service temporarily unavailable. Database connection is not yet configured.'
  ) {
    super(message);
    this.name = 'DatabaseNotConfiguredError';
  }
}

export interface PgQueryLike {
  query: (text: string, values?: unknown[]) => Promise<Pick<QueryResult<any>, 'rows' | 'rowCount'>>;
}

export interface PgClientLike extends PgQueryLike {
  release: () => void;
}

export interface PgPoolLike extends PgQueryLike {
  connect: () => Promise<PgClientLike>;
  end: () => Promise<void>;
}

export interface ResolvedPostgresConfig {
  poolConfig: PoolConfig;
  provider: PostgresProvider;
  sslEnabled: boolean;
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'postgres' ||
    host === 'db' ||
    host.endsWith('.local')
  );
}

function detectProviderFromHost(hostname: string): PostgresProvider {
  const host = hostname.trim().toLowerCase();
  if (
    host.endsWith('.supabase.co') ||
    host.endsWith('.supabase.com') ||
    host.includes('.pooler.supabase.')
  ) {
    return 'supabase';
  }
  return 'self-managed';
}

function resolveSslOption(
  hostname: string,
  urlSslMode: string | null,
  env: Record<string, string | undefined>
): PoolConfig['ssl'] {
  const explicitSsl = (env.DATABASE_SSL || env.PGSSLMODE || urlSslMode || '').trim().toLowerCase();
  const sslCa = env.DATABASE_SSL_CA?.trim();

  if (explicitSsl === 'false' || explicitSsl === '0' || explicitSsl === 'disable') {
    return false;
  }

  if (sslCa) {
    return {
      rejectUnauthorized: true,
      ca: sslCa.replace(/\\n/g, '\n'),
    };
  }

  if (
    explicitSsl === 'true' ||
    explicitSsl === '1' ||
    explicitSsl === 'require' ||
    explicitSsl === 'verify-ca' ||
    explicitSsl === 'verify-full'
  ) {
    return { rejectUnauthorized: false };
  }

  // Automatic TLS for Supabase and remote managed PostgreSQL hosts; off for local/Docker private hosts
  if (hostname && !isLocalHostname(hostname)) {
    return { rejectUnauthorized: false };
  }

  return false;
}

/**
 * Resolves a standard PostgreSQL PoolConfig compatible with BOTH:
 *  - Supabase Managed PostgreSQL (Transaction Pooler :6543 or Direct :5432)
 *  - Self-Managed PostgreSQL (Docker, VPS, Kubernetes, RDS, etc.)
 *
 * Uses DATABASE_URL if set, or discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD variables.
 * Returns null if neither is configured so the HTTP server stays healthy and reports 503 cleanly.
 */
export function resolvePostgresConfig(
  env: Record<string, string | undefined> = process.env
): ResolvedPostgresConfig | null {
  const maxConnections = Math.max(
    1,
    Math.min(50, Number.parseInt(env.PGPOOL_MAX || '10', 10) || 10)
  );
  const connectionString = (env.DATABASE_URL || '').trim();

  if (connectionString) {
    let hostname = '';
    let urlSslMode: string | null = null;
    try {
      const parsed = new URL(connectionString);
      hostname = parsed.hostname || '';
      urlSslMode = parsed.searchParams.get('sslmode');
    } catch {
      // Let pg validate the connection string on demand if custom format
    }

    const ssl = resolveSslOption(hostname, urlSslMode, env);
    const provider = detectProviderFromHost(hostname);

    return {
      provider,
      sslEnabled: Boolean(ssl),
      poolConfig: {
        connectionString,
        ssl,
        max: maxConnections,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      },
    };
  }

  const host = (env.PGHOST || '').trim();
  const database = (env.PGDATABASE || '').trim();
  const user = (env.PGUSER || '').trim();
  const password = env.PGPASSWORD;

  if (host && database && user) {
    const port = Number.parseInt(env.PGPORT || '5432', 10) || 5432;
    const ssl = resolveSslOption(host, null, env);
    const provider = detectProviderFromHost(host);

    return {
      provider,
      sslEnabled: Boolean(ssl),
      poolConfig: {
        host,
        port,
        database,
        user,
        password,
        ssl,
        max: maxConnections,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      },
    };
  }

  return null;
}

const POSTGRES_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS communities (
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
  )`,
  `CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    zone TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS breaks (
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
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reset_requests (
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
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    reference_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    target_user_name TEXT,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deleted_communities (
    id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deleted_locations (
    id TEXT PRIMARY KEY,
    community_id TEXT,
    deleted_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))`,
  `CREATE INDEX IF NOT EXISTS idx_users_employee_id_upper ON users (UPPER(employee_id))`,
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`,
  `CREATE INDEX IF NOT EXISTS idx_users_campus ON users (campus_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_locations_community ON locations (community_id)`,
  `CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks (community_id, expires_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_breaks_user ON breaks (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests (status)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC)`,
];

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val !== 'string' || !val.trim()) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function mapUserRow(row: any): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name || ''),
    employeeId: row.employee_id ? String(row.employee_id) : undefined,
    campusId: String(row.campus_id || 'comm_siruseri'),
    roleTitle: String(row.role_title || 'Software Engineer'),
    status: (row.status || 'pending_approval') as UserApprovalStatus,
    role: (row.role || 'user') as UserRole,
    bio: String(row.bio || ''),
    icebreaker: String(row.icebreaker || ''),
    interests: parseJsonArray(row.interests),
    dietary: (row.dietary || 'Any') as DietaryPreference,
    socialBattery: (row.social_battery || 'Balanced Banter') as SocialBattery,
    avatarSeed: String(row.avatar_seed || row.name || 'user'),
    avatarBgColor: String(row.avatar_bg || 'bg-indigo-600'),
    registeredAt: String(row.registered_at || new Date().toISOString()),
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    passwordResetRequested: Boolean(row.password_reset_requested),
    passwordResetApproved: Boolean(row.password_reset_approved),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function mapUserRowWithAuth(row: any): AuthUserRecord {
  return {
    ...mapUserRow(row),
    passwordHash: String(row.password_hash || ''),
  };
}

function mapLocationRow(row: any): CampusLocation {
  return {
    id: String(row.id),
    communityId: String(row.community_id),
    name: String(row.name),
    zone: String(row.zone),
    description: String(row.description || ''),
    isPopular: Boolean(row.is_popular),
  };
}

function mapBreakRow(row: any): BreakPost {
  const expiresAt = Number(row.expires_at);
  const durationMinutes = Number(row.duration_minutes || 15);
  const status =
    row.status === 'completed' || expiresAt <= Date.now()
      ? 'completed'
      : 'free_now';

  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.user_name || 'Colleague'),
    userRole: String(row.user_role || 'Software Engineer'),
    userAvatarSeed: String(row.user_avatar_seed || row.user_name || 'user'),
    userAvatarBg: String(row.user_avatar_bg || 'bg-indigo-600'),
    communityId: String(row.community_id),
    breakType: (row.break_type || 'tea') as BreakType,
    status,
    timeLabel:
      status === 'completed'
        ? 'Completed'
        : `Free Right Now (${durationMinutes}m)`,
    durationMinutes,
    locationName: String(row.location_name),
    zone: String(row.zone),
    customNote: String(row.custom_note || ''),
    dietary: (row.dietary || 'Any') as DietaryPreference,
    interests: parseJsonArray(row.interests),
    icebreaker: String(row.icebreaker || ''),
    expiresAt,
    createdAt: Number(row.created_at),
  };
}

function mapMessageRow(row: any): ChatMessage {
  const createdAt = Number(row.created_at || Date.now());
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    senderName: String(row.sender_name),
    text: String(row.text),
    timestamp: new Date(createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    isSystem: Boolean(row.is_system),
  };
}

function mapNotificationRow(row: any): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    body: String(row.body),
    type: (row.type || 'ping') as AppNotification['type'],
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at),
    referenceId: row.reference_id ? String(row.reference_id) : undefined,
  };
}

function mapAuditLogRow(row: any): AuditLog {
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    adminName: String(row.admin_name),
    action: row.action as AuditLog['action'],
    targetUserId: row.target_user_id ? String(row.target_user_id) : undefined,
    targetUserName: row.target_user_name ? String(row.target_user_name) : undefined,
    details: String(row.details),
    timestamp: String(row.timestamp),
  };
}

function mapResetRequestRow(row: any): PasswordResetRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.user_name),
    email: String(row.email),
    employeeId: String(row.employee_id),
    status: row.status as PasswordResetRequest['status'],
    requestedAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    adminId: row.admin_id ? String(row.admin_id) : undefined,
  };
}

export interface MidDayDatabaseOptions {
  pool?: PgPoolLike | null;
  provider?: PostgresProvider;
  sslEnabled?: boolean;
  env?: Record<string, string | undefined>;
}

export class MidDayDatabase {
  private pool: PgPoolLike | null;
  public readonly provider: PostgresProvider;
  public readonly sslEnabled: boolean;
  private readonly env: Record<string, string | undefined>;
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  constructor(options: MidDayDatabaseOptions = {}) {
    this.env = options.env || process.env;

    if (options.pool !== undefined) {
      this.pool = options.pool;
      this.provider = options.provider || 'self-managed';
      this.sslEnabled = Boolean(options.sslEnabled);
    } else {
      const resolved = resolvePostgresConfig(this.env);
      if (resolved) {
        const pgPool = new Pool(resolved.poolConfig);
        pgPool.on('error', (err) => {
          console.error('Unexpected error on idle PostgreSQL client:', err);
        });
        this.pool = pgPool;
        this.provider = resolved.provider;
        this.sslEnabled = resolved.sslEnabled;
      } else {
        this.pool = null;
        this.provider = 'supabase';
        this.sslEnabled = false;
      }
    }
  }

  public isConfigured(): boolean {
    return this.pool !== null;
  }

  public getConnectionSummary(): string {
    if (!this.pool) {
      return 'PostgreSQL (not configured — set DATABASE_URL)';
    }
    const modeLabel =
      this.provider === 'supabase' ? 'Supabase PostgreSQL' : 'Self-Managed PostgreSQL';
    return `${modeLabel} (TLS: ${this.sslEnabled ? 'on' : 'off'})`;
  }

  private requirePool(): PgPoolLike {
    if (!this.pool) {
      throw new DatabaseNotConfiguredError();
    }
    return this.pool;
  }

  private async query<T extends QueryResultRow = any>(
    text: string,
    values: unknown[] = [],
    skipInit = false
  ): Promise<Pick<QueryResult<T>, 'rows' | 'rowCount'>> {
    const pool = this.requirePool();
    if (!skipInit) {
      await this.ensureInitialized();
    }
    try {
      return await pool.query(text, values);
    } catch (err: any) {
      if (err instanceof DatabaseNotConfiguredError || typeof err?.statusCode === 'number') {
        throw err;
      }
      console.error('PostgreSQL query failed:', err);
      throw new Error('Database operation failed. Please try again later.', { cause: err });
    }
  }

  private async withTransaction<T>(
    fn: (client: PgQueryLike) => Promise<T>,
    skipInit = false
  ): Promise<T> {
    const pool = this.requirePool();
    if (!skipInit) {
      await this.ensureInitialized();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors if connection dropped
      }
      if (err instanceof DatabaseNotConfiguredError || typeof err?.statusCode === 'number') {
        throw err;
      }
      console.error('PostgreSQL transaction failed:', err);
      throw new Error('Database transaction failed. Please try again later.', { cause: err });
    } finally {
      client.release();
    }
  }

  /**
   * Lazy, idempotent PostgreSQL schema & one-time campus seed initialization.
   * Safe for multi-instance Cloud Run / Docker deployments (uses ON CONFLICT DO NOTHING).
   */
  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.requirePool();

    if (!this.initPromise) {
      this.initPromise = this.runInitialization()
        .then(() => {
          this.initialized = true;
        })
        .catch((err) => {
          // Reset so a subsequent request can initialize once DB is reachable
          this.initPromise = null;
          throw err;
        });
    }

    return this.initPromise;
  }

  private async runInitialization(): Promise<void> {
    const pool = this.requirePool();
    for (const stmt of POSTGRES_SCHEMA_STATEMENTS) {
      await pool.query(stmt);
    }
    await this.bootstrapInitialDataInternal();
  }

  /**
   * Public hook for explicit startup/test initialization when DATABASE_URL is configured.
   */
  public async bootstrapInitialData(): Promise<void> {
    await this.ensureInitialized();
  }

  private async bootstrapInitialDataInternal(): Promise<void> {
    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    const seedCheck = await this.query(
      `SELECT value FROM system_metadata WHERE key = 'seed_applied' LIMIT 1`,
      [],
      true
    );

    if (seedCheck.rows.length === 0) {
      await this.withTransaction(async (client) => {
        for (const comm of INITIAL_COMMUNITIES) {
          await client.query(
            `INSERT INTO communities (
              id, slug, name, city, description, member_count, active_breaks_count,
              verified_domains, invite_code, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
            ON CONFLICT (id) DO NOTHING`,
            [
              comm.id,
              comm.slug,
              comm.name,
              comm.city,
              comm.description || '',
              comm.memberCount || 0,
              comm.activeBreaksCount || 0,
              JSON.stringify(comm.verifiedDomains || []),
              comm.inviteCode || null,
              now,
            ]
          );

          for (const loc of comm.locations || []) {
            await client.query(
              `INSERT INTO locations (
                id, community_id, name, zone, description, is_popular, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO NOTHING`,
              [
                loc.id,
                comm.id,
                loc.name,
                loc.zone,
                loc.description || '',
                Boolean(loc.isPopular),
                now,
              ]
            );
          }
        }

        await client.query(
          `INSERT INTO system_metadata (key, value, updated_at)
           VALUES ('seed_applied', '1', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [now]
        );
      }, true);
    }

    // Optional initial administrator bootstrap ONLY when ADMIN_PASSWORD is explicitly provided in env.
    // Otherwise /admin presents the built-in one-time first-admin setup flow (zero hardcoded passwords).
    const configuredAdminPassword = (this.env.ADMIN_PASSWORD || '').trim();
    if (configuredAdminPassword) {
      const adminEmail = (this.env.ADMIN_EMAIL || 'admin@middaybuddy.com').trim().toLowerCase();
      const existingAdmin = await this.query(
        `SELECT id FROM users WHERE role IN ('community_admin', 'platform_admin') LIMIT 1`,
        [],
        true
      );

      if (existingAdmin.rows.length === 0) {
        const firstComm = await this.query(
          `SELECT id FROM communities ORDER BY created_at ASC LIMIT 1`,
          [],
          true
        );
        const passwordHash = await hashPassword(configuredAdminPassword);

        await this.query(
          `INSERT INTO users (
            id, email, password_hash, name, employee_id, campus_id, role_title,
            status, role, password_reset_requested, password_reset_approved, must_change_password,
            bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
            registered_at, approved_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            'approved', 'platform_admin', FALSE, FALSE, FALSE,
            $8, $9, $10::jsonb, 'Any', 'Balanced Banter', 'Admin', 'bg-indigo-600',
            $11, $11, $12
          )
          ON CONFLICT (email) DO NOTHING`,
          [
            'usr_admin',
            adminEmail,
            passwordHash,
            'System Administrator',
            'ADM-001',
            firstComm.rows[0]?.id || null,
            'Platform Administrator',
            'Platform administration and member verification for MidDay Buddy.',
            'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
            JSON.stringify(['Workplace Well-being', 'Technology', 'Community']),
            nowISO,
            now,
          ],
          true
        );
      }
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      this.initPromise = null;
    }
  }

  // ==========================================
  // HEALTH & METRICS
  // ==========================================
  public async getHealthStats(): Promise<DatabaseHealthStats> {
    const now = Date.now();
    const [usersRes, breaksRes, commsRes, resetsRes] = await Promise.all([
      this.query('SELECT COUNT(*)::int AS c FROM users'),
      this.query(
        `SELECT COUNT(*)::int AS c FROM breaks WHERE expires_at > $1 AND status != 'completed'`,
        [now]
      ),
      this.query('SELECT COUNT(*)::int AS c FROM communities'),
      this.query(`SELECT COUNT(*)::int AS c FROM reset_requests WHERE status = 'pending'`),
    ]);

    return {
      engine: 'postgresql',
      provider: this.provider,
      sslEnabled: this.sslEnabled,
      usersCount: Number(usersRes.rows[0]?.c || 0),
      activeBreaksCount: Number(breaksRes.rows[0]?.c || 0),
      communitiesCount: Number(commsRes.rows[0]?.c || 0),
      pendingResetRequests: Number(resetsRes.rows[0]?.c || 0),
    };
  }

  // ==========================================
  // SESSIONS (SHA-256 HASHED TOKENS IN POSTGRES)
  // ==========================================
  public async createSession(userId: string): Promise<string> {
    const token = generateSecureToken('tok');
    const tokenHash = await hashToken(token);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    await this.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenHash, userId, expiresAt, now]
    );

    return token;
  }

  public async getSessionUser(rawToken: string): Promise<UserProfile | null> {
    if (!rawToken) return null;
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();

    const { rows } = await this.query(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.status != 'suspended'
       LIMIT 1`,
      [tokenHash, now]
    );

    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  public async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = await hashToken(rawToken);
    await this.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  public async revokeUserSessions(userId: string): Promise<void> {
    await this.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const res = await this.query(`DELETE FROM sessions WHERE expires_at <= $1`, [Date.now()]);
    return Number(res.rowCount || 0);
  }

  // ==========================================
  // USERS & AUTHENTICATION
  // ==========================================
  public async getUserByEmailWithAuth(email: string): Promise<AuthUserRecord | null> {
    const { rows } = await this.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email.trim()]
    );
    return rows[0] ? mapUserRowWithAuth(rows[0]) : null;
  }

  public async getUserById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  public async getUserByEmployeeId(employeeId: string): Promise<UserProfile | null> {
    const { rows } = await this.query(
      `SELECT * FROM users WHERE UPPER(employee_id) = UPPER($1) LIMIT 1`,
      [employeeId.trim()]
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  public async listUsers(): Promise<UserProfile[]> {
    const { rows } = await this.query(`SELECT * FROM users ORDER BY created_at DESC`);
    return rows.map(mapUserRow);
  }

  public async hasAdmin(): Promise<boolean> {
    const { rows } = await this.query(
      `SELECT id FROM users WHERE role IN ('community_admin', 'platform_admin') LIMIT 1`
    );
    return rows.length > 0;
  }

  public async setupFirstAdmin(input: {
    name: string;
    email: string;
    employeeId: string;
    password: string;
    campusId?: string;
  }): Promise<UserProfile> {
    const adminExists = await this.hasAdmin();
    if (adminExists) {
      throw Object.assign(
        new Error(
          'Initial administrator setup is permanently locked because an administrator already exists.'
        ),
        { statusCode: 403 }
      );
    }

    const { user } = await this.upsertAdminCreatedUser({
      name: input.name,
      email: input.email,
      employeeId: input.employeeId,
      password: input.password,
      campusId: input.campusId,
      role: 'platform_admin',
      roleTitle: 'Platform Administrator',
    });

    return user;
  }

  public async verifyUserCredentials(
    email: string,
    password: string
  ): Promise<AuthUserRecord | null> {
    const user = await this.getUserByEmailWithAuth(email);
    if (!user) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? user : null;
  }

  public async registerUser(input: {
    name: string;
    email: string;
    password: string;
    employeeId: string;
    campusId?: string;
    roleTitle?: string;
    interests?: string[];
    dietary?: DietaryPreference;
    icebreaker?: string;
    inviteCode?: string;
  }): Promise<UserProfile> {
    const trimmedEmail = input.email.trim().toLowerCase();
    const trimmedEmpId = input.employeeId.trim().toUpperCase();

    const existingEmail = await this.getUserByEmailWithAuth(trimmedEmail);
    if (existingEmail) {
      if (existingEmail.status === 'rejected') {
        await this.query(`DELETE FROM users WHERE id = $1`, [existingEmail.id]);
      } else if (existingEmail.status === 'pending_approval') {
        throw Object.assign(
          new Error('Your registration with this Email ID is already awaiting admin approval.'),
          { statusCode: 400 }
        );
      } else {
        throw Object.assign(
          new Error('An account with this Email ID already exists. Please sign in.'),
          { statusCode: 409 }
        );
      }
    }

    const existingEmp = await this.getUserByEmployeeId(trimmedEmpId);
    if (existingEmp) {
      if (existingEmp.status === 'rejected') {
        await this.query(`DELETE FROM users WHERE id = $1`, [existingEmp.id]);
      } else if (existingEmp.status === 'pending_approval') {
        throw Object.assign(
          new Error('Your registration with this Employee ID is already awaiting admin approval.'),
          { statusCode: 400 }
        );
      } else {
        throw Object.assign(
          new Error(
            'This Employee ID is already registered to another active account. Please sign in.'
          ),
          { statusCode: 409 }
        );
      }
    }

    // Resolve valid campus_id and onboarding policy
    let campusId: string | null = input.campusId || 'comm_siruseri';
    const commCheck = await this.query(
      `SELECT id, verified_domains, invite_code FROM communities WHERE id = $1 LIMIT 1`,
      [campusId]
    );
    let targetCommunity: Pick<Community, 'verifiedDomains' | 'inviteCode'> | null = null;
    if (commCheck.rows[0]) {
      targetCommunity = {
        verifiedDomains: parseJsonArray(commCheck.rows[0].verified_domains),
        inviteCode: commCheck.rows[0].invite_code || undefined,
      };
    } else {
      const firstComm = await this.query(
        `SELECT id, verified_domains, invite_code FROM communities ORDER BY created_at ASC LIMIT 1`
      );
      campusId = firstComm.rows[0]?.id || null;
      if (firstComm.rows[0]) {
        targetCommunity = {
          verifiedDomains: parseJsonArray(firstComm.rows[0].verified_domains),
          inviteCode: firstComm.rows[0].invite_code || undefined,
        };
      }
    }

    const onboarding = evaluateOnboardingApproval({
      email: trimmedEmail,
      inviteCode: input.inviteCode,
      community: targetCommunity,
    });
    const status: UserApprovalStatus = onboarding.autoApprove ? 'approved' : 'pending_approval';

    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const id = `usr_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await hashPassword(input.password);

    await this.query(
      `INSERT INTO users (
        id, email, password_hash, name, employee_id, campus_id, role_title,
        status, role, password_reset_requested, password_reset_approved, must_change_password,
        bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
        registered_at, approved_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, 'user', FALSE, FALSE, FALSE,
        $9, $10, $11::jsonb, $12, 'Balanced Banter', $13, 'bg-indigo-600',
        $14, $15, $16
      )`,
      [
        id,
        trimmedEmail,
        passwordHash,
        input.name.trim(),
        trimmedEmpId,
        campusId,
        input.roleTitle?.trim() || 'Software Engineer',
        status,
        '',
        input.icebreaker?.trim() || 'Always happy to talk tech, movies, or sports!',
        JSON.stringify(
          input.interests && input.interests.length > 0
            ? input.interests
            : ['Tech & AI', 'Coffee & Chai']
        ),
        input.dietary || 'Any',
        input.name.trim().toLowerCase().replace(/\s+/g, '-'),
        nowISO,
        status === 'approved' ? nowISO : null,
        now,
      ]
    );

    const created = await this.getUserById(id);
    if (!created) {
      throw new Error('Failed to retrieve newly registered user.');
    }
    return created;
  }

  public async upsertAdminCreatedUser(input: {
    name: string;
    email: string;
    employeeId: string;
    role?: UserRole;
    roleTitle?: string;
    campusId?: string;
    password?: string;
  }): Promise<{ user: UserProfile; updated: boolean }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedEmpId = input.employeeId.trim().toUpperCase();
    const role: UserRole =
      input.role === 'platform_admin' || input.role === 'community_admin' ? input.role : 'user';

    let campusId: string | null = input.campusId || 'comm_siruseri';
    const commCheck = await this.query(`SELECT id FROM communities WHERE id = $1 LIMIT 1`, [
      campusId,
    ]);
    if (commCheck.rows.length === 0) {
      const firstComm = await this.query(
        `SELECT id FROM communities ORDER BY created_at ASC LIMIT 1`
      );
      campusId = firstComm.rows[0]?.id || null;
    }

    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    const existingRes = await this.query(
      `SELECT * FROM users WHERE LOWER(email) = $1 OR UPPER(employee_id) = $2 LIMIT 1`,
      [normalizedEmail, normalizedEmpId]
    );
    const existing = existingRes.rows[0];

    if (existing) {
      const nextPasswordHash = input.password
        ? await hashPassword(input.password)
        : existing.password_hash;

      await this.query(
        `UPDATE users
         SET name = $1, email = $2, employee_id = $3, role = $4, role_title = $5,
             campus_id = $6, status = 'approved', password_hash = $7, approved_at = $8
         WHERE id = $9`,
        [
          input.name.trim(),
          normalizedEmail,
          normalizedEmpId,
          role,
          input.roleTitle?.trim() || (role === 'user' ? 'Software Engineer' : 'Campus Administrator'),
          campusId,
          nextPasswordHash,
          nowISO,
          existing.id,
        ]
      );

      const user = await this.getUserById(existing.id);
      return { user: user!, updated: true };
    }

    if (!input.password) {
      throw Object.assign(new Error('An initial password is required when creating a new user.'), {
        statusCode: 400,
      });
    }

    const id = `usr_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await hashPassword(input.password);

    await this.query(
      `INSERT INTO users (
        id, email, password_hash, name, employee_id, campus_id, role_title,
        status, role, password_reset_requested, password_reset_approved, must_change_password,
        bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
        registered_at, approved_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'approved', $8, FALSE, FALSE, FALSE,
        $9, $10, $11::jsonb, 'Any', 'Balanced Banter', $12, $13,
        $14, $14, $15
      )`,
      [
        id,
        normalizedEmail,
        passwordHash,
        input.name.trim(),
        normalizedEmpId,
        campusId,
        input.roleTitle?.trim() || (role === 'user' ? 'Software Engineer' : 'Campus Administrator'),
        role,
        `Colleague at ${campusId || 'Workplace Campus'}.`,
        'Let us connect for chai and breaks!',
        JSON.stringify(['Workplace Well-being', 'Technology']),
        input.name.trim(),
        role === 'user' ? 'bg-emerald-600' : 'bg-indigo-600',
        nowISO,
        now,
      ]
    );

    const user = await this.getUserById(id);
    return { user: user!, updated: false };
  }

  public async approveUser(userId: string): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    await this.query(`UPDATE users SET status = 'approved', approved_at = $1 WHERE id = $2`, [
      new Date().toISOString(),
      userId,
    ]);
    return this.getUserById(userId);
  }

  public async rejectUser(userId: string): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    await this.query(`DELETE FROM users WHERE id = $1`, [userId]);
    return existing;
  }

  public async toggleUserStatus(userId: string): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    const nextStatus: UserApprovalStatus =
      existing.status === 'approved' ? 'suspended' : 'approved';
    await this.query(`UPDATE users SET status = $1 WHERE id = $2`, [nextStatus, userId]);
    if (nextStatus === 'suspended') {
      await this.revokeUserSessions(userId);
    }
    return this.getUserById(userId);
  }

  public async updateUserRole(userId: string, role: UserRole): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    await this.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, userId]);
    return this.getUserById(userId);
  }

  public async deleteUser(userId: string): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    await this.query(`DELETE FROM users WHERE id = $1`, [userId]);
    return existing;
  }

  public async updateUserProfile(
    userId: string,
    updates: {
      name?: string;
      roleTitle?: string;
      bio?: string;
      icebreaker?: string;
      interests?: string[];
      dietary?: DietaryPreference;
      socialBattery?: SocialBattery;
    }
  ): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;

    await this.query(
      `UPDATE users
       SET name = $1, role_title = $2, bio = $3, icebreaker = $4,
           interests = $5::jsonb, dietary = $6, social_battery = $7
       WHERE id = $8`,
      [
        updates.name?.trim() || existing.name,
        updates.roleTitle?.trim() || existing.roleTitle,
        updates.bio !== undefined ? updates.bio.trim() : existing.bio,
        updates.icebreaker !== undefined ? updates.icebreaker.trim() : existing.icebreaker,
        JSON.stringify(updates.interests !== undefined ? updates.interests : existing.interests),
        updates.dietary || existing.dietary,
        updates.socialBattery || existing.socialBattery,
        userId,
      ]
    );

    return this.getUserById(userId);
  }

  public async consumePasswordResetApproval(userId: string): Promise<void> {
    await this.query(
      `UPDATE users SET password_reset_approved = FALSE, must_change_password = TRUE WHERE id = $1`,
      [userId]
    );
  }

  public async setUserPassword(userId: string, newPassword: string): Promise<UserProfile | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;

    const passwordHash = await hashPassword(newPassword);

    await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             password_reset_requested = FALSE,
             password_reset_approved = FALSE,
             must_change_password = FALSE
         WHERE id = $2`,
        [passwordHash, userId]
      );

      await client.query(
        `UPDATE reset_requests SET status = 'completed' WHERE user_id = $1 AND status = 'approved'`,
        [userId]
      );

      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    });

    return this.getUserById(userId);
  }

  // ==========================================
  // PASSWORD RESET REQUESTS
  // ==========================================
  public async createResetRequest(
    user: UserProfile,
    employeeId: string
  ): Promise<PasswordResetRequest> {
    const nowISO = new Date().toISOString();
    const id = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET password_reset_requested = TRUE, password_reset_approved = FALSE WHERE id = $1`,
        [user.id]
      );

      await client.query(
        `INSERT INTO reset_requests (id, user_id, user_name, email, employee_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [id, user.id, user.name, user.email, employeeId, nowISO]
      );
    });

    const { rows } = await this.query(`SELECT * FROM reset_requests WHERE id = $1 LIMIT 1`, [id]);
    return mapResetRequestRow(rows[0]);
  }

  public async listResetRequests(): Promise<PasswordResetRequest[]> {
    const { rows } = await this.query(`SELECT * FROM reset_requests ORDER BY created_at DESC`);
    return rows.map(mapResetRequestRow);
  }

  public async approveResetRequest(
    requestId: string,
    adminId: string
  ): Promise<PasswordResetRequest | null> {
    const existingRes = await this.query(`SELECT * FROM reset_requests WHERE id = $1 LIMIT 1`, [
      requestId,
    ]);
    const existing = existingRes.rows[0];
    if (!existing) return null;

    const nowISO = new Date().toISOString();
    await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE reset_requests SET status = 'approved', approved_at = $1, admin_id = $2 WHERE id = $3`,
        [nowISO, adminId, requestId]
      );

      await client.query(
        `UPDATE users
         SET password_reset_requested = FALSE,
             password_reset_approved = TRUE,
             must_change_password = TRUE
         WHERE id = $1`,
        [existing.user_id]
      );

      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [existing.user_id]);
    });

    const { rows } = await this.query(`SELECT * FROM reset_requests WHERE id = $1 LIMIT 1`, [
      requestId,
    ]);
    return rows[0] ? mapResetRequestRow(rows[0]) : null;
  }

  // ==========================================
  // COMMUNITIES & CAMPUS LOCATIONS
  // ==========================================
  public async listCommunities(): Promise<Community[]> {
    const now = Date.now();
    const [commRes, locRes] = await Promise.all([
      this.query(
        `SELECT c.*,
          (SELECT COUNT(*)::int FROM users u WHERE u.campus_id = c.id AND u.status = 'approved') AS live_member_count,
          (SELECT COUNT(*)::int FROM breaks b WHERE b.community_id = c.id AND b.expires_at > $1 AND b.status != 'completed') AS live_active_breaks
         FROM communities c
         WHERE c.id NOT IN (SELECT id FROM deleted_communities)
         ORDER BY c.created_at ASC`,
        [now]
      ),
      this.query(
        `SELECT * FROM locations
         WHERE id NOT IN (SELECT id FROM deleted_locations)
         ORDER BY created_at ASC`
      ),
    ]);

    const locsByComm = new Map<string, CampusLocation[]>();
    for (const row of locRes.rows) {
      const loc = mapLocationRow(row);
      const arr = locsByComm.get(loc.communityId) || [];
      arr.push(loc);
      locsByComm.set(loc.communityId, arr);
    }

    return commRes.rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      city: String(row.city),
      description: String(row.description || ''),
      memberCount: Math.max(Number(row.member_count || 0), Number(row.live_member_count || 0)),
      activeBreaksCount: Number(row.live_active_breaks || 0),
      verifiedDomains: parseJsonArray(row.verified_domains),
      inviteCode: row.invite_code ? String(row.invite_code) : undefined,
      webhookUrl: row.webhook_url ? String(row.webhook_url) : undefined,
      locations: locsByComm.get(String(row.id)) || [],
    }));
  }

  public async getCommunityById(id: string): Promise<Community | null> {
    const comms = await this.listCommunities();
    return comms.find((c) => c.id === id) || null;
  }

  public async createCommunity(input: {
    name: string;
    city: string;
    description?: string;
  }): Promise<Community> {
    const now = Date.now();
    const id = `comm_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const baseSlug = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'campus'}-${now.toString(36)}`;

    await this.query(
      `INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, $6)`,
      [id, slug, input.name.trim(), input.city.trim(), input.description?.trim() || '', now]
    );

    const created = await this.getCommunityById(id);
    return created!;
  }

  public async updateCommunity(
    id: string,
    updates: { name?: string; city?: string; description?: string }
  ): Promise<Community | null> {
    const existing = await this.getCommunityById(id);
    if (!existing) return null;

    await this.query(
      `UPDATE communities SET name = $1, city = $2, description = $3 WHERE id = $4`,
      [
        updates.name?.trim() || existing.name,
        updates.city?.trim() || existing.city,
        updates.description !== undefined ? updates.description.trim() : existing.description,
        id,
      ]
    );

    return this.getCommunityById(id);
  }

  public async deleteCommunity(id: string): Promise<Community | null> {
    const existing = await this.getCommunityById(id);
    const nowISO = new Date().toISOString();

    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO deleted_communities (id, deleted_at)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
        [id, nowISO]
      );
      await client.query(`DELETE FROM communities WHERE id = $1`, [id]);
    });

    return existing;
  }

  public async addLocation(
    communityId: string,
    loc: { id?: string; name: string; zone: string; description?: string; isPopular?: boolean }
  ): Promise<{ location: CampusLocation; community: Community } | null> {
    const comm = await this.getCommunityById(communityId);
    if (!comm) return null;

    const now = Date.now();
    const id = loc.id || `loc_${now}_${Math.random().toString(36).slice(2, 6)}`;

    await this.withTransaction(async (client) => {
      await client.query(`DELETE FROM deleted_locations WHERE id = $1`, [id]);
      await client.query(
        `INSERT INTO locations (id, community_id, name, zone, description, is_popular, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           community_id = EXCLUDED.community_id,
           name = EXCLUDED.name,
           zone = EXCLUDED.zone,
           description = EXCLUDED.description,
           is_popular = EXCLUDED.is_popular`,
        [
          id,
          communityId,
          loc.name.trim(),
          loc.zone.trim(),
          loc.description?.trim() || '',
          Boolean(loc.isPopular),
          now,
        ]
      );
    });

    const updatedComm = (await this.getCommunityById(communityId))!;
    const savedLoc = updatedComm.locations.find((l) => l.id === id)!;
    return { location: savedLoc, community: updatedComm };
  }

  public async updateLocation(
    communityId: string,
    locId: string,
    updates: Partial<CampusLocation>
  ): Promise<{ location: CampusLocation; community: Community } | null> {
    const { rows } = await this.query(
      `SELECT * FROM locations WHERE id = $1 AND community_id = $2 LIMIT 1`,
      [locId, communityId]
    );
    if (!rows[0]) return null;

    const current = mapLocationRow(rows[0]);
    await this.query(
      `UPDATE locations
       SET name = $1, zone = $2, description = $3, is_popular = $4
       WHERE id = $5 AND community_id = $6`,
      [
        updates.name?.trim() || current.name,
        updates.zone?.trim() || current.zone,
        updates.description !== undefined ? updates.description.trim() : current.description,
        updates.isPopular !== undefined ? Boolean(updates.isPopular) : current.isPopular,
        locId,
        communityId,
      ]
    );

    const updatedComm = (await this.getCommunityById(communityId))!;
    const savedLoc = updatedComm.locations.find((l) => l.id === locId)!;
    return { location: savedLoc, community: updatedComm };
  }

  public async deleteLocation(
    communityId: string,
    locId: string
  ): Promise<{ deletedName: string; community: Community } | null> {
    const comm = await this.getCommunityById(communityId);
    if (!comm) return null;

    const existingRes = await this.query(
      `SELECT name FROM locations WHERE id = $1 AND community_id = $2 LIMIT 1`,
      [locId, communityId]
    );

    const nowISO = new Date().toISOString();
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO deleted_locations (id, community_id, deleted_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET community_id = EXCLUDED.community_id, deleted_at = EXCLUDED.deleted_at`,
        [locId, communityId, nowISO]
      );
      await client.query(`DELETE FROM locations WHERE id = $1 AND community_id = $2`, [
        locId,
        communityId,
      ]);
    });

    return {
      deletedName: existingRes.rows[0]?.name || locId,
      community: (await this.getCommunityById(communityId))!,
    };
  }

  // ==========================================
  // BREAK POSTS
  // ==========================================
  public async listBreaks(filters?: {
    communityId?: string;
    breakType?: string;
    zone?: string;
    activeNow?: boolean;
  }): Promise<BreakPost[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.communityId) {
      params.push(filters.communityId);
      conditions.push(`b.community_id = $${params.length}`);
    }
    if (filters?.breakType && filters.breakType !== 'all') {
      params.push(filters.breakType);
      conditions.push(`b.break_type = $${params.length}`);
    }
    if (filters?.zone && filters.zone !== 'all') {
      params.push(filters.zone);
      conditions.push(`b.zone = $${params.length}`);
    }
    if (filters?.activeNow) {
      params.push(Date.now());
      conditions.push(`b.expires_at > $${params.length} AND b.status != 'completed'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.query(
      `SELECT b.*,
        u.name AS user_name,
        u.role_title AS user_role,
        u.avatar_seed AS user_avatar_seed,
        u.avatar_bg AS user_avatar_bg,
        u.dietary AS dietary,
        u.interests AS interests,
        u.icebreaker AS icebreaker
       FROM breaks b
       JOIN users u ON b.user_id = u.id
       ${whereClause}
       ORDER BY b.created_at DESC`,
      params
    );

    return rows.map(mapBreakRow);
  }

  public async getBreakById(id: string): Promise<BreakPost | null> {
    const { rows } = await this.query(
      `SELECT b.*,
        u.name AS user_name,
        u.role_title AS user_role,
        u.avatar_seed AS user_avatar_seed,
        u.avatar_bg AS user_avatar_bg,
        u.dietary AS dietary,
        u.interests AS interests,
        u.icebreaker AS icebreaker
       FROM breaks b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = $1
       LIMIT 1`,
      [id]
    );

    return rows[0] ? mapBreakRow(rows[0]) : null;
  }

  public async createBreak(input: {
    userId: string;
    communityId: string;
    breakType: BreakType;
    durationMinutes: number;
    locationName: string;
    zone: string;
    customNote?: string;
  }): Promise<BreakPost> {
    const now = Date.now();
    const duration = Math.max(5, Math.min(180, Number(input.durationMinutes) || 15));
    const expiresAt = now + duration * 60 * 1000;
    const id = `post_${now}_${Math.random().toString(36).slice(2, 6)}`;

    await this.query(
      `INSERT INTO breaks (
        id, user_id, community_id, break_type, status, zone, location_name,
        custom_note, duration_minutes, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, 'free_now', $5, $6, $7, $8, $9, $10)`,
      [
        id,
        input.userId,
        input.communityId,
        input.breakType || 'tea',
        input.zone.trim(),
        input.locationName.trim(),
        (input.customNote || '').trim(),
        duration,
        expiresAt,
        now,
      ]
    );

    return (await this.getBreakById(id))!;
  }

  public async extendBreak(id: string, extraMinutes = 10): Promise<BreakPost | null> {
    const existing = await this.getBreakById(id);
    if (!existing) return null;

    const baseExpiry = Math.max(existing.expiresAt, Date.now());
    const nextExpiresAt = baseExpiry + extraMinutes * 60 * 1000;
    const nextDuration = existing.durationMinutes + extraMinutes;

    await this.query(
      `UPDATE breaks SET expires_at = $1, duration_minutes = $2, status = 'free_now' WHERE id = $3`,
      [nextExpiresAt, nextDuration, id]
    );

    return this.getBreakById(id);
  }

  public async completeBreak(id: string): Promise<BreakPost | null> {
    const existing = await this.getBreakById(id);
    if (!existing) return null;

    await this.query(
      `UPDATE breaks SET expires_at = $1, status = 'completed' WHERE id = $2`,
      [Date.now() - 1000, id]
    );

    return this.getBreakById(id);
  }

  // ==========================================
  // CHAT MESSAGES
  // ==========================================
  public async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const { rows } = await this.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows.map(mapMessageRow);
  }

  public async createMessage(input: {
    conversationId: string;
    senderId: string;
    senderName: string;
    text: string;
    isSystem?: boolean;
  }): Promise<ChatMessage> {
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanText = input.text.trim().slice(0, 1000);

    await this.query(
      `INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, is_system, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.conversationId,
        input.senderId,
        input.senderName,
        cleanText,
        Boolean(input.isSystem),
        now,
      ]
    );

    const { rows } = await this.query(`SELECT * FROM messages WHERE id = $1 LIMIT 1`, [id]);
    return mapMessageRow(rows[0]);
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  public async listNotifications(userId: string, isAdmin = false): Promise<AppNotification[]> {
    const sql = isAdmin
      ? `SELECT * FROM notifications
         WHERE user_id = $1 OR user_id = 'all' OR user_id = 'admin'
         ORDER BY created_at DESC
         LIMIT 50`
      : `SELECT * FROM notifications
         WHERE user_id = $1 OR user_id = 'all'
         ORDER BY created_at DESC
         LIMIT 50`;

    const { rows } = await this.query(sql, [userId]);
    return rows.map(mapNotificationRow);
  }

  public async createNotification(input: {
    userId: string;
    title: string;
    body: string;
    type: AppNotification['type'];
    referenceId?: string;
  }): Promise<AppNotification> {
    const nowISO = new Date().toISOString();
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await this.query(
      `INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at, reference_id)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)`,
      [id, input.userId, input.title, input.body, input.type, nowISO, input.referenceId || null]
    );

    const { rows } = await this.query(`SELECT * FROM notifications WHERE id = $1 LIMIT 1`, [id]);
    return mapNotificationRow(rows[0]);
  }

  public async markNotificationsRead(userId: string, isAdmin = false): Promise<void> {
    if (isAdmin) {
      await this.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 OR user_id = 'all' OR user_id = 'admin'`,
        [userId]
      );
    } else {
      await this.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 OR user_id = 'all'`,
        [userId]
      );
    }
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  public async createAuditLog(input: {
    adminId: string;
    adminName: string;
    action: string;
    targetUserId?: string;
    targetUserName?: string;
    details: string;
  }): Promise<AuditLog> {
    const nowISO = new Date().toISOString();
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await this.query(
      `INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        input.adminId,
        input.adminName,
        input.action,
        input.targetUserId || null,
        input.targetUserName || null,
        input.details,
        nowISO,
      ]
    );

    const { rows } = await this.query(`SELECT * FROM audit_logs WHERE id = $1 LIMIT 1`, [id]);
    return mapAuditLogRow(rows[0]);
  }

  public async listAuditLogs(limit = 100): Promise<AuditLog[]> {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const { rows } = await this.query(
      `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1`,
      [safeLimit]
    );
    return rows.map(mapAuditLogRow);
  }
}

export function createDatabase(options?: MidDayDatabaseOptions): MidDayDatabase {
  return new MidDayDatabase(options);
}
