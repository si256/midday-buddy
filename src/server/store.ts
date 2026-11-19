import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { INITIAL_COMMUNITIES } from '../data/seedData.ts';
import { hashPassword } from '../utils/crypto.ts';
import {
  AuditLog,
  AppNotification,
  BreakPost,
  ChatMessage,
  Community,
  PasswordResetRequest,
  UserProfile,
} from '../types/index.ts';

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
}

export interface DatabaseState {
  users: Array<UserProfile & { passwordHash?: string }>;
  communities: Community[];
  deletedCommunities: string[];
  deletedLocations: string[];
  breaks: BreakPost[];
  auditLogs: AuditLog[];
  messages: Record<string, ChatMessage[]>;
  sessions: Record<string, SessionRecord>; // tokenHash -> SessionRecord
  resetRequests: PasswordResetRequest[];
  notifications: AppNotification[];
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BREAK_RETENTION_MS = 24 * 60 * 60 * 1000; // Retain expired breaks up to 24h

function buildInitialCommunities(): Community[] {
  return INITIAL_COMMUNITIES.map((c, idx) => ({
    ...c,
    verifiedDomains: idx === 0 ? ['tcs.com', 'middaybuddy.com'] : ['middaybuddy.com'],
    inviteCode: idx === 0 ? 'SIRUSERI-2026' : undefined,
    locations: (c.locations || []).map((l) => ({ ...l })),
  }));
}

export class ServerStore {
  private pool: Pool | null = null;
  private filePath: string;
  private state: DatabaseState | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private initPromise: Promise<void> | null = null;

  constructor(dataDir = path.resolve(process.cwd(), '.data')) {
    this.filePath = path.join(dataDir, 'midday-db.json');
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (dbUrl) {
      this.pool = new Pool({
        connectionString: dbUrl,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
      await this.ensurePostgresSchema();
      await this.ensureMasterAdminInPostgres();
      return;
    }

    // Persistent atomic file-backed store (survives server restarts cleanly)
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      this.state = {
        users: parsed.users || [],
        communities: parsed.communities && parsed.communities.length > 0 ? parsed.communities : buildInitialCommunities(),
        deletedCommunities: parsed.deletedCommunities || [],
        deletedLocations: parsed.deletedLocations || [],
        breaks: parsed.breaks || [],
        auditLogs: parsed.auditLogs || [],
        messages: parsed.messages || {},
        sessions: parsed.sessions || {},
        resetRequests: parsed.resetRequests || [],
        notifications: parsed.notifications || [],
      };
    } catch {
      this.state = {
        users: [],
        communities: buildInitialCommunities(),
        deletedCommunities: [],
        deletedLocations: [],
        breaks: [],
        auditLogs: [],
        messages: {},
        sessions: {},
        resetRequests: [],
        notifications: [],
      };
    }

    await this.ensureMasterAdminInMemoryState();
    this.pruneExpiredInState();
    await this.persistState();
  }

  isPostgres(): boolean {
    return Boolean(this.pool);
  }

  private async ensureMasterAdminInMemoryState(): Promise<void> {
    if (!this.state) return;
    const initialAdminPwd = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@12345';
    const existing = this.state.users.find((u) => u.email.toLowerCase() === 'admin@middaybuddy.com');
    if (!existing) {
      const pwdHash = await hashPassword(initialAdminPwd);
      this.state.users.unshift({
        id: 'usr_admin',
        email: 'admin@middaybuddy.com',
        passwordHash: pwdHash,
        name: 'System Administrator',
        employeeId: 'ADM-001',
        roleTitle: 'Platform Administrator',
        campusId: 'comm_siruseri',
        avatarSeed: 'Admin',
        avatarBgColor: 'bg-indigo-600',
        bio: 'Platform administration and member verification for MidDay Buddy.',
        icebreaker: 'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
        interests: ['Workplace Well-being', 'Technology', 'Community'],
        dietary: 'Any',
        socialBattery: 'Balanced Banter',
        role: 'platform_admin',
        status: 'approved',
        registeredAt: '2026-11-01T00:00:00Z',
        approvedAt: '2026-11-01T00:00:00Z',
      });
    } else if (!existing.passwordHash && existing.password) {
      existing.passwordHash = await hashPassword(existing.password);
      delete existing.password;
    }
  }

  private pruneExpiredInState(): void {
    if (!this.state) return;
    const now = Date.now();
    for (const [hash, sess] of Object.entries(this.state.sessions)) {
      if (sess.expiresAt <= now) {
        delete this.state.sessions[hash];
      }
    }
    this.state.breaks = this.state.breaks.filter((b) => b.expiresAt > now - BREAK_RETENTION_MS);
    if (this.state.auditLogs.length > 1000) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 1000);
    }
    if (this.state.notifications.length > 1000) {
      this.state.notifications = this.state.notifications.slice(0, 1000);
    }
  }

  async persistState(): Promise<void> {
    if (this.pool || !this.state) return;
    this.pruneExpiredInState();
    const snapshot = JSON.stringify(this.state, null, 2);
    const tmpPath = `${this.filePath}.tmp`;

    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(tmpPath, snapshot, 'utf-8');
      await fs.rename(tmpPath, this.filePath);
    });
    return this.writeQueue;
  }

  getFileState(): DatabaseState {
    if (!this.state) {
      throw new Error('ServerStore not initialized');
    }
    return this.state;
  }

  // =========================================================
  // POSTGRESQL BACKEND FOR MULTI-NODE DOCKER DEPLOYMENTS
  // =========================================================
  private async ensurePostgresSchema(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
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
    `);

    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM communities');
    if (rows[0].cnt === 0) {
      for (const comm of buildInitialCommunities()) {
        await this.pool.query(
          `INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, verified_domains, invite_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) ON CONFLICT (id) DO NOTHING`,
          [
            comm.id,
            comm.slug,
            comm.name,
            comm.city,
            comm.description,
            comm.memberCount,
            comm.activeBreaksCount,
            JSON.stringify(comm.verifiedDomains || []),
            comm.inviteCode || null,
          ]
        );
        for (const loc of comm.locations || []) {
          await this.pool.query(
            `INSERT INTO locations (id, community_id, name, zone, description, is_popular)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [loc.id, comm.id, loc.name, loc.zone, loc.description || '', Boolean(loc.isPopular)]
          );
        }
      }
    }
  }

  private async ensureMasterAdminInPostgres(): Promise<void> {
    if (!this.pool) return;
    const { rows } = await this.pool.query(
      `SELECT id FROM users WHERE LOWER(email) = 'admin@middaybuddy.com' LIMIT 1`
    );
    if (rows.length === 0) {
      const initialAdminPwd = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@12345';
      const pwdHash = await hashPassword(initialAdminPwd);
      await this.pool.query(
        `INSERT INTO users (id, email, password_hash, name, employee_id, campus_id, role_title, status, role, bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg, registered_at, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', 'platform_admin', $8, $9, $10::jsonb, 'Any', 'Balanced Banter', 'Admin', 'bg-indigo-600', $11, $11)
         ON CONFLICT (email) DO NOTHING`,
        [
          'usr_admin',
          'admin@middaybuddy.com',
          pwdHash,
          'System Administrator',
          'ADM-001',
          'comm_siruseri',
          'Platform Administrator',
          'Platform administration and member verification for MidDay Buddy.',
          'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
          JSON.stringify(['Workplace Well-being', 'Technology', 'Community']),
          '2026-11-01T00:00:00Z',
        ]
      );
    }
  }

  getPool(): Pool | null {
    return this.pool;
  }

  getSessionTTL(): number {
    return SESSION_TTL_MS;
  }
}

export const store = new ServerStore();
