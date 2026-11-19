import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
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

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthUserRecord extends UserProfile {
  passwordHash: string;
}

export interface DatabaseHealthStats {
  engine: string;
  storagePath: string;
  journalMode: string;
  usersCount: number;
  activeBreaksCount: number;
  communitiesCount: number;
  pendingResetRequests: number;
}

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

export class MidDayDatabase {
  private db: DatabaseSync;
  public readonly storagePath: string;
  private journalMode: string = 'wal';

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      process.env.DATABASE_PATH ||
      path.resolve(process.cwd(), '.data', 'midday-buddy.sqlite');

    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }

    this.storagePath = resolvedPath;
    this.db = new DatabaseSync(resolvedPath);

    // Production SQLite pragmas: WAL concurrency, strict foreign keys, busy timeout
    const jmRow = this.db.prepare('PRAGMA journal_mode = WAL;').get() as any;
    this.journalMode = jmRow?.journal_mode || 'wal';
    this.db.exec(`
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS communities (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        description TEXT DEFAULT '',
        member_count INTEGER DEFAULT 0,
        active_breaks_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL,
        name TEXT NOT NULL,
        zone TEXT NOT NULL,
        description TEXT DEFAULT '',
        is_popular INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
      );

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
        password_reset_requested INTEGER DEFAULT 0,
        password_reset_approved INTEGER DEFAULT 0,
        must_change_password INTEGER DEFAULT 0,
        bio TEXT DEFAULT '',
        icebreaker TEXT DEFAULT '',
        interests TEXT DEFAULT '[]',
        dietary TEXT DEFAULT 'Any',
        social_battery TEXT DEFAULT 'Balanced Banter',
        avatar_seed TEXT DEFAULT '',
        avatar_bg TEXT DEFAULT 'bg-indigo-600',
        registered_at TEXT NOT NULL,
        approved_at TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (campus_id) REFERENCES communities(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS breaks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        community_id TEXT NOT NULL,
        break_type TEXT NOT NULL CHECK(break_type IN ('tea', 'lunch', 'walk', 'sports')),
        status TEXT DEFAULT 'free_now',
        zone TEXT NOT NULL,
        location_name TEXT NOT NULL,
        custom_note TEXT DEFAULT '',
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
        is_system INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
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
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
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
        updated_at INTEGER NOT NULL
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

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_locations_community ON locations(community_id);
      CREATE INDEX IF NOT EXISTS idx_breaks_community_expires ON breaks(community_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_breaks_user ON breaks(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON reset_requests(status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    `);
  }

  /**
   * One-time idempotent database bootstrap:
   * - Seeds initial campuses & locations ONCE (guarded by system_metadata.seed_applied)
   * - Seeds initial Platform Administrator with PBKDF2-SHA256 hashed credentials if no admin exists
   */
  public async bootstrapInitialData(): Promise<void> {
    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    const seedRow = this.db
      .prepare(`SELECT value FROM system_metadata WHERE key = 'seed_applied'`)
      .get() as any;

    if (!seedRow) {
      const insertCommunity = this.db.prepare(`
        INSERT OR IGNORE INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertLocation = this.db.prepare(`
        INSERT OR IGNORE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      this.db.exec('BEGIN TRANSACTION');
      try {
        for (const comm of INITIAL_COMMUNITIES) {
          insertCommunity.run(
            comm.id,
            comm.slug,
            comm.name,
            comm.city,
            comm.description,
            comm.memberCount || 0,
            comm.activeBreaksCount || 0,
            now
          );
          for (const loc of comm.locations || []) {
            insertLocation.run(
              loc.id,
              comm.id,
              loc.name,
              loc.zone,
              loc.description || '',
              loc.isPopular ? 1 : 0,
              now
            );
          }
        }
        this.db
          .prepare(
            `INSERT OR REPLACE INTO system_metadata (key, value, updated_at) VALUES ('seed_applied', '1', ?)`
          )
          .run(now);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    // Ensure at least one administrator exists (using PBKDF2 hash, never plaintext)
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@middaybuddy.com').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

    const existingAdmin = this.db
      .prepare(`SELECT id FROM users WHERE role IN ('community_admin', 'platform_admin') LIMIT 1`)
      .get() as any;

    if (!existingAdmin) {
      const firstComm = this.db
        .prepare(`SELECT id FROM communities ORDER BY created_at ASC LIMIT 1`)
        .get() as any;
      const passwordHash = await hashPassword(adminPassword);

      this.db
        .prepare(`
          INSERT OR IGNORE INTO users (
            id, email, password_hash, name, employee_id, campus_id, role_title,
            status, role, password_reset_requested, password_reset_approved, must_change_password,
            bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
            registered_at, approved_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'usr_admin',
          adminEmail,
          passwordHash,
          'System Administrator',
          'ADM-001',
          firstComm?.id || null,
          'Platform Administrator',
          'approved',
          'platform_admin',
          'Platform administration and member verification for MidDay Buddy.',
          'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
          JSON.stringify(['Workplace Well-being', 'Technology', 'Community']),
          'Any',
          'Balanced Banter',
          'Admin',
          'bg-indigo-600',
          nowISO,
          nowISO,
          now
        );
    }
  }

  public close(): void {
    this.db.close();
  }

  // ==========================================
  // HEALTH & METRICS
  // ==========================================
  public getHealthStats(): DatabaseHealthStats {
    const now = Date.now();
    const usersCount = (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
    const activeBreaksCount =
      (
        this.db
          .prepare(`SELECT COUNT(*) as c FROM breaks WHERE expires_at > ? AND status != 'completed'`)
          .get(now) as any
      )?.c || 0;
    const communitiesCount =
      (this.db.prepare('SELECT COUNT(*) as c FROM communities').get() as any)?.c || 0;
    const pendingResetRequests =
      (
        this.db
          .prepare(`SELECT COUNT(*) as c FROM reset_requests WHERE status = 'pending'`)
          .get() as any
      )?.c || 0;

    return {
      engine: 'sqlite-persistent-wal',
      storagePath: path.basename(this.storagePath),
      journalMode: this.journalMode,
      usersCount,
      activeBreaksCount,
      communitiesCount,
      pendingResetRequests,
    };
  }

  // ==========================================
  // SESSIONS (SHA-256 HASHED TOKENS IN DB)
  // ==========================================
  public async createSession(userId: string): Promise<string> {
    const token = generateSecureToken('tok');
    const tokenHash = await hashToken(token);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    this.db
      .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .run(tokenHash, userId, expiresAt, now);

    return token;
  }

  public async getSessionUser(rawToken: string): Promise<UserProfile | null> {
    if (!rawToken) return null;
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();

    const row = this.db
      .prepare(`
        SELECT u.*
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.status != 'suspended'
      `)
      .get(tokenHash, now) as any;

    return row ? mapUserRow(row) : null;
  }

  public async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = await hashToken(rawToken);
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
  }

  public revokeUserSessions(userId: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  }

  public cleanupExpiredSessions(): number {
    const res = this.db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(Date.now());
    return Number(res.changes || 0);
  }

  // ==========================================
  // USERS & AUTHENTICATION
  // ==========================================
  public getUserByEmailWithAuth(email: string): AuthUserRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`)
      .get(email.trim()) as any;
    return row ? mapUserRowWithAuth(row) : null;
  }

  public getUserById(id: string): UserProfile | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as any;
    return row ? mapUserRow(row) : null;
  }

  public getUserByEmployeeId(employeeId: string): UserProfile | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE UPPER(employee_id) = UPPER(?)`)
      .get(employeeId.trim()) as any;
    return row ? mapUserRow(row) : null;
  }

  public listUsers(): UserProfile[] {
    const rows = this.db
      .prepare(`SELECT * FROM users ORDER BY created_at DESC`)
      .all() as any[];
    return rows.map(mapUserRow);
  }

  public hasAdmin(): boolean {
    const row = this.db
      .prepare(`SELECT id FROM users WHERE role IN ('community_admin', 'platform_admin') LIMIT 1`)
      .get() as any;
    return Boolean(row);
  }

  public async setupFirstAdmin(input: {
    name: string;
    email: string;
    employeeId: string;
    password: string;
    campusId?: string;
  }): Promise<UserProfile> {
    if (this.hasAdmin()) {
      throw Object.assign(
        new Error('Initial administrator setup is permanently locked because an administrator already exists.'),
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
    const user = this.getUserByEmailWithAuth(email);
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
  }): Promise<UserProfile> {
    const trimmedEmail = input.email.trim().toLowerCase();
    const trimmedEmpId = input.employeeId.trim().toUpperCase();

    const existingEmail = this.getUserByEmailWithAuth(trimmedEmail);
    if (existingEmail) {
      if (existingEmail.status === 'rejected') {
        this.db.prepare(`DELETE FROM users WHERE id = ?`).run(existingEmail.id);
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

    const existingEmp = this.getUserByEmployeeId(trimmedEmpId);
    if (existingEmp) {
      if (existingEmp.status === 'rejected') {
        this.db.prepare(`DELETE FROM users WHERE id = ?`).run(existingEmp.id);
      } else if (existingEmp.status === 'pending_approval') {
        throw Object.assign(
          new Error('Your registration with this Employee ID is already awaiting admin approval.'),
          { statusCode: 400 }
        );
      } else {
        throw Object.assign(
          new Error('This Employee ID is already registered to another active account. Please sign in.'),
          { statusCode: 409 }
        );
      }
    }

    // Resolve valid campus_id (must exist in communities or null)
    let campusId: string | null = input.campusId || 'comm_siruseri';
    const commExists = this.db
      .prepare(`SELECT id FROM communities WHERE id = ?`)
      .get(campusId) as any;
    if (!commExists) {
      const firstComm = this.db
        .prepare(`SELECT id FROM communities ORDER BY created_at ASC LIMIT 1`)
        .get() as any;
      campusId = firstComm?.id || null;
    }

    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const id = `usr_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await hashPassword(input.password);

    this.db
      .prepare(`
        INSERT INTO users (
          id, email, password_hash, name, employee_id, campus_id, role_title,
          status, role, password_reset_requested, password_reset_approved, must_change_password,
          bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
          registered_at, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', 'user', 0, 0, 0, ?, ?, ?, ?, 'Balanced Banter', ?, 'bg-indigo-600', ?, NULL, ?)
      `)
      .run(
        id,
        trimmedEmail,
        passwordHash,
        input.name.trim(),
        trimmedEmpId,
        campusId,
        input.roleTitle?.trim() || 'Software Engineer',
        '',
        input.icebreaker?.trim() || 'Always happy to talk tech, movies, or sports!',
        JSON.stringify(input.interests && input.interests.length > 0 ? input.interests : ['Tech & AI', 'Coffee & Chai']),
        input.dietary || 'Any',
        input.name.trim().toLowerCase().replace(/\s+/g, '-'),
        nowISO,
        now
      );

    return this.getUserById(id)!;
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
      input.role === 'platform_admin' || input.role === 'community_admin'
        ? input.role
        : 'user';

    let campusId: string | null = input.campusId || 'comm_siruseri';
    const commExists = this.db
      .prepare(`SELECT id FROM communities WHERE id = ?`)
      .get(campusId) as any;
    if (!commExists) {
      const firstComm = this.db
        .prepare(`SELECT id FROM communities ORDER BY created_at ASC LIMIT 1`)
        .get() as any;
      campusId = firstComm?.id || null;
    }

    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    const existing = this.db
      .prepare(`SELECT * FROM users WHERE LOWER(email) = ? OR UPPER(employee_id) = ? LIMIT 1`)
      .get(normalizedEmail, normalizedEmpId) as any;

    if (existing) {
      const nextPasswordHash = input.password
        ? await hashPassword(input.password)
        : existing.password_hash;

      this.db
        .prepare(`
          UPDATE users
          SET name = ?, email = ?, employee_id = ?, role = ?, role_title = ?,
              campus_id = ?, status = 'approved', password_hash = ?, approved_at = ?
          WHERE id = ?
        `)
        .run(
          input.name.trim(),
          normalizedEmail,
          normalizedEmpId,
          role,
          input.roleTitle?.trim() || (role === 'user' ? 'Software Engineer' : 'Campus Administrator'),
          campusId,
          nextPasswordHash,
          nowISO,
          existing.id
        );

      return { user: this.getUserById(existing.id)!, updated: true };
    }

    const id = `usr_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await hashPassword(input.password || 'Buddy@12345');

    this.db
      .prepare(`
        INSERT INTO users (
          id, email, password_hash, name, employee_id, campus_id, role_title,
          status, role, password_reset_requested, password_reset_approved, must_change_password,
          bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg,
          registered_at, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, 0, 0, 0, ?, ?, ?, 'Any', 'Balanced Banter', ?, ?, ?, ?, ?)
      `)
      .run(
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
        nowISO,
        now
      );

    return { user: this.getUserById(id)!, updated: false };
  }

  public approveUser(userId: string): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    this.db
      .prepare(`UPDATE users SET status = 'approved', approved_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), userId);
    return this.getUserById(userId);
  }

  public rejectUser(userId: string): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    // Delete rejected applicant record to release email & employee ID locks cleanly
    this.db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    return existing;
  }

  public toggleUserStatus(userId: string): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    const nextStatus: UserApprovalStatus = existing.status === 'approved' ? 'suspended' : 'approved';
    this.db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(nextStatus, userId);
    if (nextStatus === 'suspended') {
      this.revokeUserSessions(userId);
    }
    return this.getUserById(userId);
  }

  public updateUserRole(userId: string, role: UserRole): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    this.db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
    return this.getUserById(userId);
  }

  public deleteUser(userId: string): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;
    this.db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    return existing;
  }

  public updateUserProfile(
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
  ): UserProfile | null {
    const existing = this.getUserById(userId);
    if (!existing) return null;

    this.db
      .prepare(`
        UPDATE users
        SET name = ?, role_title = ?, bio = ?, icebreaker = ?, interests = ?, dietary = ?, social_battery = ?
        WHERE id = ?
      `)
      .run(
        updates.name?.trim() || existing.name,
        updates.roleTitle?.trim() || existing.roleTitle,
        updates.bio !== undefined ? updates.bio.trim() : existing.bio,
        updates.icebreaker !== undefined ? updates.icebreaker.trim() : existing.icebreaker,
        JSON.stringify(updates.interests !== undefined ? updates.interests : existing.interests),
        updates.dietary || existing.dietary,
        updates.socialBattery || existing.socialBattery,
        userId
      );

    return this.getUserById(userId);
  }

  public consumePasswordResetApproval(userId: string): void {
    this.db
      .prepare(
        `UPDATE users SET password_reset_approved = 0, must_change_password = 1 WHERE id = ?`
      )
      .run(userId);
  }

  public async setUserPassword(userId: string, newPassword: string): Promise<UserProfile | null> {
    const existing = this.getUserById(userId);
    if (!existing) return null;

    const passwordHash = await hashPassword(newPassword);

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db
        .prepare(`
          UPDATE users
          SET password_hash = ?, password_reset_requested = 0, password_reset_approved = 0, must_change_password = 0
          WHERE id = ?
        `)
        .run(passwordHash, userId);

      this.db
        .prepare(
          `UPDATE reset_requests SET status = 'completed' WHERE user_id = ? AND status = 'approved'`
        )
        .run(userId);

      // Invalidate all existing sessions so user must re-authenticate with new password
      this.db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getUserById(userId);
  }

  // ==========================================
  // PASSWORD RESET REQUESTS
  // ==========================================
  public createResetRequest(user: UserProfile, employeeId: string): PasswordResetRequest {
    const nowISO = new Date().toISOString();
    const id = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db
        .prepare(
          `UPDATE users SET password_reset_requested = 1, password_reset_approved = 0 WHERE id = ?`
        )
        .run(user.id);

      this.db
        .prepare(`
          INSERT INTO reset_requests (id, user_id, user_name, email, employee_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `)
        .run(id, user.id, user.name, user.email, employeeId, nowISO);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const row = this.db.prepare(`SELECT * FROM reset_requests WHERE id = ?`).get(id) as any;
    return mapResetRequestRow(row);
  }

  public listResetRequests(): PasswordResetRequest[] {
    const rows = this.db
      .prepare(`SELECT * FROM reset_requests ORDER BY created_at DESC`)
      .all() as any[];
    return rows.map(mapResetRequestRow);
  }

  public approveResetRequest(
    requestId: string,
    adminId: string
  ): PasswordResetRequest | null {
    const existing = this.db
      .prepare(`SELECT * FROM reset_requests WHERE id = ?`)
      .get(requestId) as any;
    if (!existing) return null;

    const nowISO = new Date().toISOString();
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db
        .prepare(
          `UPDATE reset_requests SET status = 'approved', approved_at = ?, admin_id = ? WHERE id = ?`
        )
        .run(nowISO, adminId, requestId);

      this.db
        .prepare(`
          UPDATE users
          SET password_reset_requested = 0, password_reset_approved = 1, must_change_password = 1
          WHERE id = ?
        `)
        .run(existing.user_id);

      // Revoke existing sessions on password reset approval
      this.db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(existing.user_id);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const updated = this.db
      .prepare(`SELECT * FROM reset_requests WHERE id = ?`)
      .get(requestId) as any;
    return mapResetRequestRow(updated);
  }

  // ==========================================
  // COMMUNITIES & CAMPUS LOCATIONS
  // ==========================================
  public listCommunities(): Community[] {
    const now = Date.now();
    const commRows = this.db
      .prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM users u WHERE u.campus_id = c.id AND u.status = 'approved') as live_member_count,
          (SELECT COUNT(*) FROM breaks b WHERE b.community_id = c.id AND b.expires_at > ? AND b.status != 'completed') as live_active_breaks
        FROM communities c
        WHERE c.id NOT IN (SELECT id FROM deleted_communities)
        ORDER BY c.created_at ASC
      `)
      .all(now) as any[];

    const locRows = this.db
      .prepare(`
        SELECT * FROM locations
        WHERE id NOT IN (SELECT id FROM deleted_locations)
        ORDER BY created_at ASC
      `)
      .all() as any[];

    const locsByComm = new Map<string, CampusLocation[]>();
    for (const row of locRows) {
      const loc = mapLocationRow(row);
      const arr = locsByComm.get(loc.communityId) || [];
      arr.push(loc);
      locsByComm.set(loc.communityId, arr);
    }

    return commRows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      city: String(row.city),
      description: String(row.description || ''),
      memberCount: Math.max(Number(row.member_count || 0), Number(row.live_member_count || 0)),
      activeBreaksCount: Number(row.live_active_breaks || 0),
      locations: locsByComm.get(String(row.id)) || [],
    }));
  }

  public getCommunityById(id: string): Community | null {
    return this.listCommunities().find((c) => c.id === id) || null;
  }

  public createCommunity(input: {
    name: string;
    city: string;
    description?: string;
  }): Community {
    const now = Date.now();
    const id = `comm_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const baseSlug = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'campus'}-${now.toString(36)}`;

    this.db
      .prepare(`
        INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?)
      `)
      .run(id, slug, input.name.trim(), input.city.trim(), input.description?.trim() || '', now);

    return this.getCommunityById(id)!;
  }

  public updateCommunity(
    id: string,
    updates: { name?: string; city?: string; description?: string }
  ): Community | null {
    const existing = this.getCommunityById(id);
    if (!existing) return null;

    this.db
      .prepare(`UPDATE communities SET name = ?, city = ?, description = ? WHERE id = ?`)
      .run(
        updates.name?.trim() || existing.name,
        updates.city?.trim() || existing.city,
        updates.description !== undefined ? updates.description.trim() : existing.description,
        id
      );

    return this.getCommunityById(id);
  }

  public deleteCommunity(id: string): Community | null {
    const existing = this.getCommunityById(id);
    const nowISO = new Date().toISOString();

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO deleted_communities (id, deleted_at) VALUES (?, ?)`)
        .run(id, nowISO);
      this.db.prepare(`DELETE FROM communities WHERE id = ?`).run(id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return existing;
  }

  public addLocation(
    communityId: string,
    loc: { id?: string; name: string; zone: string; description?: string; isPopular?: boolean }
  ): { location: CampusLocation; community: Community } | null {
    const comm = this.getCommunityById(communityId);
    if (!comm) return null;

    const now = Date.now();
    const id = loc.id || `loc_${now}_${Math.random().toString(36).slice(2, 6)}`;

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare(`DELETE FROM deleted_locations WHERE id = ?`).run(id);
      this.db
        .prepare(`
          INSERT OR REPLACE INTO locations (id, community_id, name, zone, description, is_popular, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          communityId,
          loc.name.trim(),
          loc.zone.trim(),
          loc.description?.trim() || '',
          loc.isPopular ? 1 : 0,
          now
        );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const updatedComm = this.getCommunityById(communityId)!;
    const savedLoc = updatedComm.locations.find((l) => l.id === id)!;
    return { location: savedLoc, community: updatedComm };
  }

  public updateLocation(
    communityId: string,
    locId: string,
    updates: Partial<CampusLocation>
  ): { location: CampusLocation; community: Community } | null {
    const row = this.db
      .prepare(`SELECT * FROM locations WHERE id = ? AND community_id = ?`)
      .get(locId, communityId) as any;
    if (!row) return null;

    const current = mapLocationRow(row);
    this.db
      .prepare(`
        UPDATE locations
        SET name = ?, zone = ?, description = ?, is_popular = ?
        WHERE id = ? AND community_id = ?
      `)
      .run(
        updates.name?.trim() || current.name,
        updates.zone?.trim() || current.zone,
        updates.description !== undefined ? updates.description.trim() : current.description,
        updates.isPopular !== undefined ? (updates.isPopular ? 1 : 0) : current.isPopular ? 1 : 0,
        locId,
        communityId
      );

    const updatedComm = this.getCommunityById(communityId)!;
    const savedLoc = updatedComm.locations.find((l) => l.id === locId)!;
    return { location: savedLoc, community: updatedComm };
  }

  public deleteLocation(
    communityId: string,
    locId: string
  ): { deletedName: string; community: Community } | null {
    const comm = this.getCommunityById(communityId);
    if (!comm) return null;

    const existing = this.db
      .prepare(`SELECT name FROM locations WHERE id = ? AND community_id = ?`)
      .get(locId, communityId) as any;

    const nowISO = new Date().toISOString();
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO deleted_locations (id, community_id, deleted_at) VALUES (?, ?, ?)`
        )
        .run(locId, communityId, nowISO);
      this.db
        .prepare(`DELETE FROM locations WHERE id = ? AND community_id = ?`)
        .run(locId, communityId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      deletedName: existing?.name || locId,
      community: this.getCommunityById(communityId)!,
    };
  }

  // ==========================================
  // BREAK POSTS
  // ==========================================
  public listBreaks(filters?: {
    communityId?: string;
    breakType?: string;
    zone?: string;
    activeNow?: boolean;
  }): BreakPost[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.communityId) {
      conditions.push('b.community_id = ?');
      params.push(filters.communityId);
    }
    if (filters?.breakType && filters.breakType !== 'all') {
      conditions.push('b.break_type = ?');
      params.push(filters.breakType);
    }
    if (filters?.zone && filters.zone !== 'all') {
      conditions.push('b.zone = ?');
      params.push(filters.zone);
    }
    if (filters?.activeNow) {
      conditions.push(`b.expires_at > ? AND b.status != 'completed'`);
      params.push(Date.now());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`
        SELECT b.*,
          u.name as user_name,
          u.role_title as user_role,
          u.avatar_seed as user_avatar_seed,
          u.avatar_bg as user_avatar_bg,
          u.dietary as dietary,
          u.interests as interests,
          u.icebreaker as icebreaker
        FROM breaks b
        JOIN users u ON b.user_id = u.id
        ${whereClause}
        ORDER BY b.created_at DESC
      `)
      .all(...params) as any[];

    return rows.map(mapBreakRow);
  }

  public getBreakById(id: string): BreakPost | null {
    const row = this.db
      .prepare(`
        SELECT b.*,
          u.name as user_name,
          u.role_title as user_role,
          u.avatar_seed as user_avatar_seed,
          u.avatar_bg as user_avatar_bg,
          u.dietary as dietary,
          u.interests as interests,
          u.icebreaker as icebreaker
        FROM breaks b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `)
      .get(id) as any;

    return row ? mapBreakRow(row) : null;
  }

  public createBreak(input: {
    userId: string;
    communityId: string;
    breakType: BreakType;
    durationMinutes: number;
    locationName: string;
    zone: string;
    customNote?: string;
  }): BreakPost {
    const now = Date.now();
    const duration = Math.max(5, Math.min(180, Number(input.durationMinutes) || 15));
    const expiresAt = now + duration * 60 * 1000;
    const id = `post_${now}_${Math.random().toString(36).slice(2, 6)}`;

    this.db
      .prepare(`
        INSERT INTO breaks (
          id, user_id, community_id, break_type, status, zone, location_name,
          custom_note, duration_minutes, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 'free_now', ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.userId,
        input.communityId,
        input.breakType || 'tea',
        input.zone.trim(),
        input.locationName.trim(),
        (input.customNote || '').trim(),
        duration,
        expiresAt,
        now
      );

    return this.getBreakById(id)!;
  }

  public extendBreak(id: string, extraMinutes = 10): BreakPost | null {
    const existing = this.getBreakById(id);
    if (!existing) return null;

    const baseExpiry = Math.max(existing.expiresAt, Date.now());
    const nextExpiresAt = baseExpiry + extraMinutes * 60 * 1000;
    const nextDuration = existing.durationMinutes + extraMinutes;

    this.db
      .prepare(`UPDATE breaks SET expires_at = ?, duration_minutes = ?, status = 'free_now' WHERE id = ?`)
      .run(nextExpiresAt, nextDuration, id);

    return this.getBreakById(id);
  }

  public completeBreak(id: string): BreakPost | null {
    const existing = this.getBreakById(id);
    if (!existing) return null;

    this.db
      .prepare(`UPDATE breaks SET expires_at = ?, status = 'completed' WHERE id = ?`)
      .run(Date.now() - 1000, id);

    return this.getBreakById(id);
  }

  // ==========================================
  // CHAT MESSAGES
  // ==========================================
  public listMessages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
      .all(conversationId) as any[];
    return rows.map(mapMessageRow);
  }

  public createMessage(input: {
    conversationId: string;
    senderId: string;
    senderName: string;
    text: string;
    isSystem?: boolean;
  }): ChatMessage {
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanText = input.text.trim().slice(0, 1000);

    this.db
      .prepare(`
        INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, is_system, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.conversationId,
        input.senderId,
        input.senderName,
        cleanText,
        input.isSystem ? 1 : 0,
        now
      );

    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as any;
    return mapMessageRow(row);
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  public listNotifications(userId: string, isAdmin = false): AppNotification[] {
    const rows = isAdmin
      ? (this.db
          .prepare(`
            SELECT * FROM notifications
            WHERE user_id = ? OR user_id = 'all' OR user_id = 'admin'
            ORDER BY created_at DESC
            LIMIT 50
          `)
          .all(userId) as any[])
      : (this.db
          .prepare(`
            SELECT * FROM notifications
            WHERE user_id = ? OR user_id = 'all'
            ORDER BY created_at DESC
            LIMIT 50
          `)
          .all(userId) as any[]);

    return rows.map(mapNotificationRow);
  }

  public createNotification(input: {
    userId: string;
    title: string;
    body: string;
    type: AppNotification['type'];
    referenceId?: string;
  }): AppNotification {
    const nowISO = new Date().toISOString();
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.db
      .prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at, reference_id)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .run(id, input.userId, input.title, input.body, input.type, nowISO, input.referenceId || null);

    const row = this.db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id) as any;
    return mapNotificationRow(row);
  }

  public markNotificationsRead(userId: string, isAdmin = false): void {
    if (isAdmin) {
      this.db
        .prepare(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id = 'all' OR user_id = 'admin'`
        )
        .run(userId);
    } else {
      this.db
        .prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id = 'all'`)
        .run(userId);
    }
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  public createAuditLog(input: {
    adminId: string;
    adminName: string;
    action: string;
    targetUserId?: string;
    targetUserName?: string;
    details: string;
  }): AuditLog {
    const nowISO = new Date().toISOString();
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.db
      .prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.adminId,
        input.adminName,
        input.action,
        input.targetUserId || null,
        input.targetUserName || null,
        input.details,
        nowISO
      );

    const row = this.db.prepare(`SELECT * FROM audit_logs WHERE id = ?`).get(id) as any;
    return mapAuditLogRow(row);
  }

  public listAuditLogs(limit = 100): AuditLog[] {
    const rows = this.db
      .prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`)
      .all(limit) as any[];
    return rows.map(mapAuditLogRow);
  }
}

export function createDatabase(dbPath?: string): MidDayDatabase {
  return new MidDayDatabase(dbPath);
}
