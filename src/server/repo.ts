import { store } from './store.ts';
import {
  AuditLog,
  AppNotification,
  BreakPost,
  CampusLocation,
  ChatMessage,
  Community,
  PasswordResetRequest,
  UserProfile,
} from '../types/index.ts';
import { sanitizeCommunityForClient, sanitizeUserForClient } from '../utils/onboarding.ts';

export type StoredUser = UserProfile & { passwordHash?: string };

function mapPgUser(row: any): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    employeeId: row.employee_id || undefined,
    campusId: row.campus_id || 'comm_siruseri',
    roleTitle: row.role_title || 'Software Engineer',
    status: row.status,
    role: row.role,
    passwordResetRequested: Boolean(row.password_reset_requested),
    passwordResetApproved: Boolean(row.password_reset_approved),
    mustChangePassword: Boolean(row.must_change_password),
    bio: row.bio || '',
    icebreaker: row.icebreaker || '',
    interests: Array.isArray(row.interests) ? row.interests : [],
    dietary: row.dietary || 'Any',
    socialBattery: row.social_battery || 'Balanced Banter',
    avatarSeed: row.avatar_seed || row.name,
    avatarBgColor: row.avatar_bg || 'bg-indigo-600',
    registeredAt: row.registered_at || new Date().toISOString(),
    approvedAt: row.approved_at || undefined,
  };
}

function mapPgBreak(row: any): BreakPost {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    userAvatarSeed: row.user_avatar_seed || row.user_name,
    userAvatarBg: row.user_avatar_bg || 'bg-amber-600',
    communityId: row.community_id,
    breakType: row.break_type,
    status: row.status,
    timeLabel: row.time_label,
    durationMinutes: Number(row.duration_minutes),
    locationName: row.location_name,
    zone: row.zone,
    customNote: row.custom_note || '',
    dietary: row.dietary || 'Any',
    interests: Array.isArray(row.interests) ? row.interests : [],
    icebreaker: row.icebreaker || '',
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
  };
}

export const Repo = {
  // --- USERS ---
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const norm = email.trim().toLowerCase();
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [norm]);
      return rows[0] ? mapPgUser(rows[0]) : null;
    }
    const state = store.getFileState();
    return state.users.find((u) => u.email.toLowerCase() === norm) || null;
  },

  async findUserByEmployeeId(empId: string): Promise<StoredUser | null> {
    const norm = empId.trim().toUpperCase();
    if (!norm) return null;
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM users WHERE UPPER(employee_id) = $1 LIMIT 1', [norm]);
      return rows[0] ? mapPgUser(rows[0]) : null;
    }
    const state = store.getFileState();
    return state.users.find((u) => u.employeeId && u.employeeId.toUpperCase() === norm) || null;
  },

  async findUserById(id: string): Promise<StoredUser | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return rows[0] ? mapPgUser(rows[0]) : null;
    }
    const state = store.getFileState();
    return state.users.find((u) => u.id === id) || null;
  },

  async listUsers(opts: { search?: string; status?: string; limit: number; offset: number }): Promise<UserProfile[]> {
    const pool = store.getPool();
    if (pool) {
      const conditions: string[] = [];
      const params: any[] = [];
      if (opts.status) {
        params.push(opts.status);
        conditions.push(`status = $${params.length}`);
      }
      if (opts.search?.trim()) {
        params.push(`%${opts.search.trim().toLowerCase()}%`);
        const idx = params.length;
        conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(COALESCE(employee_id, '')) LIKE $${idx})`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(opts.limit, opts.offset);
      const { rows } = await pool.query(
        `SELECT * FROM users ${where} ORDER BY registered_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows.map((r) => sanitizeUserForClient(mapPgUser(r)));
    }

    const state = store.getFileState();
    let list = state.users;
    if (opts.status) {
      list = list.filter((u) => u.status === opts.status);
    }
    if (opts.search?.trim()) {
      const q = opts.search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.employeeId && u.employeeId.toLowerCase().includes(q))
      );
    }
    return list.slice(opts.offset, opts.offset + opts.limit).map(sanitizeUserForClient);
  },

  async createUser(user: StoredUser): Promise<StoredUser> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO users (
          id, email, password_hash, name, employee_id, campus_id, role_title,
          status, role, password_reset_requested, password_reset_approved, must_change_password,
          bio, icebreaker, interests, dietary, social_battery, avatar_seed, avatar_bg, registered_at, approved_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21)`,
        [
          user.id,
          user.email,
          user.passwordHash || '',
          user.name,
          user.employeeId || null,
          user.campusId,
          user.roleTitle,
          user.status,
          user.role,
          Boolean(user.passwordResetRequested),
          Boolean(user.passwordResetApproved),
          Boolean(user.mustChangePassword),
          user.bio || '',
          user.icebreaker || '',
          JSON.stringify(user.interests || []),
          user.dietary || 'Any',
          user.socialBattery || 'Balanced Banter',
          user.avatarSeed,
          user.avatarBgColor,
          user.registeredAt,
          user.approvedAt || null,
        ]
      );
      return user;
    }

    const state = store.getFileState();
    state.users.unshift(user);
    await store.persistState();
    return user;
  },

  async updateUser(id: string, patch: Partial<StoredUser>): Promise<StoredUser | null> {
    const pool = store.getPool();
    if (pool) {
      const existing = await this.findUserById(id);
      if (!existing) return null;
      const merged: StoredUser = { ...existing, ...patch };
      await pool.query(
        `UPDATE users SET
          email=$2, password_hash=$3, name=$4, employee_id=$5, campus_id=$6, role_title=$7,
          status=$8, role=$9, password_reset_requested=$10, password_reset_approved=$11,
          must_change_password=$12, bio=$13, icebreaker=$14, interests=$15::jsonb,
          dietary=$16, social_battery=$17, approved_at=$18
         WHERE id=$1`,
        [
          id,
          merged.email,
          merged.passwordHash || '',
          merged.name,
          merged.employeeId || null,
          merged.campusId,
          merged.roleTitle,
          merged.status,
          merged.role,
          Boolean(merged.passwordResetRequested),
          Boolean(merged.passwordResetApproved),
          Boolean(merged.mustChangePassword),
          merged.bio || '',
          merged.icebreaker || '',
          JSON.stringify(merged.interests || []),
          merged.dietary || 'Any',
          merged.socialBattery || 'Balanced Banter',
          merged.approvedAt || null,
        ]
      );
      return merged;
    }

    const state = store.getFileState();
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    state.users[idx] = { ...state.users[idx], ...patch };
    await store.persistState();
    return state.users[idx];
  },

  async deleteUser(id: string): Promise<StoredUser | null> {
    const pool = store.getPool();
    if (pool) {
      const existing = await this.findUserById(id);
      if (!existing) return null;
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return existing;
    }
    const state = store.getFileState();
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    const [removed] = state.users.splice(idx, 1);
    for (const [k, s] of Object.entries(state.sessions)) {
      if (s.userId === id) delete state.sessions[k];
    }
    await store.persistState();
    return removed;
  },

  // --- SESSIONS ---
  async createSession(tokenHash: string, userId: string): Promise<void> {
    const now = Date.now();
    const expiresAt = now + store.getSessionTTL();
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
        [tokenHash, userId, expiresAt, now]
      );
      return;
    }
    const state = store.getFileState();
    state.sessions[tokenHash] = { tokenHash, userId, expiresAt, createdAt: now };
    await store.persistState();
  },

  async getUserBySessionTokenHash(tokenHash: string): Promise<StoredUser | null> {
    const now = Date.now();
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.status != 'suspended' LIMIT 1`,
        [tokenHash, now]
      );
      return rows[0] ? mapPgUser(rows[0]) : null;
    }
    const state = store.getFileState();
    const sess = state.sessions[tokenHash];
    if (!sess || sess.expiresAt <= now) {
      if (sess) {
        delete state.sessions[tokenHash];
        await store.persistState();
      }
      return null;
    }
    const user = state.users.find((u) => u.id === sess.userId);
    if (!user || user.status === 'suspended') return null;
    return user;
  },

  async deleteSession(tokenHash: string): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      return;
    }
    const state = store.getFileState();
    if (state.sessions[tokenHash]) {
      delete state.sessions[tokenHash];
      await store.persistState();
    }
  },

  async deleteUserSessions(userId: string): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      return;
    }
    const state = store.getFileState();
    for (const [k, sess] of Object.entries(state.sessions)) {
      if (sess.userId === userId) delete state.sessions[k];
    }
    await store.persistState();
  },

  // --- COMMUNITIES & LOCATIONS ---
  async listCommunities(includeAdminSecrets: boolean): Promise<Community[]> {
    const pool = store.getPool();
    if (pool) {
      const { rows: commRows } = await pool.query('SELECT * FROM communities ORDER BY created_at ASC');
      const { rows: locRows } = await pool.query('SELECT * FROM locations');
      const locsByComm = new Map<string, CampusLocation[]>();
      for (const l of locRows) {
        const list = locsByComm.get(l.community_id) || [];
        list.push({
          id: l.id,
          communityId: l.community_id,
          name: l.name,
          zone: l.zone,
          description: l.description || '',
          isPopular: Boolean(l.is_popular),
        });
        locsByComm.set(l.community_id, list);
      }
      return commRows.map((c) =>
        sanitizeCommunityForClient(
          {
            id: c.id,
            slug: c.slug,
            name: c.name,
            city: c.city,
            description: c.description || '',
            memberCount: Number(c.member_count || 0),
            activeBreaksCount: Number(c.active_breaks_count || 0),
            locations: locsByComm.get(c.id) || [],
            verifiedDomains: Array.isArray(c.verified_domains) ? c.verified_domains : [],
            inviteCode: c.invite_code || undefined,
            webhookUrl: c.webhook_url || undefined,
          },
          includeAdminSecrets
        )
      );
    }

    const state = store.getFileState();
    const deletedComms = new Set(state.deletedCommunities);
    const deletedLocs = new Set(state.deletedLocations);
    return state.communities
      .filter((c) => !deletedComms.has(c.id))
      .map((c) =>
        sanitizeCommunityForClient(
          {
            ...c,
            locations: (c.locations || []).filter((l) => !deletedLocs.has(l.id)),
          },
          includeAdminSecrets
        )
      );
  },

  async findCommunityById(id: string): Promise<Community | null> {
    const all = await this.listCommunities(true);
    return all.find((c) => c.id === id) || null;
  },

  async createCommunity(comm: Community): Promise<Community> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, verified_domains, invite_code, webhook_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
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
          comm.webhookUrl || null,
        ]
      );
      return comm;
    }
    const state = store.getFileState();
    state.communities.push(comm);
    await store.persistState();
    return comm;
  },

  async updateCommunity(id: string, patch: Partial<Community>): Promise<Community | null> {
    const pool = store.getPool();
    if (pool) {
      const existing = await this.findCommunityById(id);
      if (!existing) return null;
      const merged = { ...existing, ...patch };
      await pool.query(
        `UPDATE communities SET name=$2, city=$3, description=$4, verified_domains=$5::jsonb, invite_code=$6, webhook_url=$7 WHERE id=$1`,
        [
          id,
          merged.name,
          merged.city,
          merged.description || '',
          JSON.stringify(merged.verifiedDomains || []),
          merged.inviteCode || null,
          merged.webhookUrl || null,
        ]
      );
      return merged;
    }
    const state = store.getFileState();
    const comm = state.communities.find((c) => c.id === id);
    if (!comm) return null;
    Object.assign(comm, patch);
    await store.persistState();
    return comm;
  },

  async deleteCommunity(id: string): Promise<string | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('DELETE FROM communities WHERE id = $1 RETURNING name', [id]);
      return rows[0]?.name || null;
    }
    const state = store.getFileState();
    if (!state.deletedCommunities.includes(id)) {
      state.deletedCommunities.push(id);
    }
    const idx = state.communities.findIndex((c) => c.id === id);
    let removedName: string | null = id;
    if (idx !== -1) {
      removedName = state.communities.splice(idx, 1)[0].name;
    }
    state.breaks = state.breaks.filter((b) => b.communityId !== id);
    await store.persistState();
    return removedName;
  },

  async upsertLocation(communityId: string, location: CampusLocation): Promise<CampusLocation | null> {
    const pool = store.getPool();
    if (pool) {
      const comm = await this.findCommunityById(communityId);
      if (!comm) return null;
      await pool.query(
        `INSERT INTO locations (id, community_id, name, zone, description, is_popular)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, zone=EXCLUDED.zone, description=EXCLUDED.description, is_popular=EXCLUDED.is_popular`,
        [location.id, communityId, location.name, location.zone, location.description || '', Boolean(location.isPopular)]
      );
      return location;
    }
    const state = store.getFileState();
    const comm = state.communities.find((c) => c.id === communityId);
    if (!comm) return null;
    state.deletedLocations = state.deletedLocations.filter((l) => l !== location.id);
    comm.locations = (comm.locations || []).filter((l) => l.id !== location.id);
    comm.locations.push(location);
    await store.persistState();
    return location;
  },

  async updateLocation(communityId: string, locId: string, patch: Partial<CampusLocation>): Promise<CampusLocation | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        'SELECT * FROM locations WHERE id = $1 AND community_id = $2 LIMIT 1',
        [locId, communityId]
      );
      if (!rows[0]) return null;
      const merged: CampusLocation = {
        id: rows[0].id,
        communityId,
        name: patch.name !== undefined ? patch.name : rows[0].name,
        zone: patch.zone !== undefined ? patch.zone : rows[0].zone,
        description: patch.description !== undefined ? patch.description : rows[0].description,
        isPopular: patch.isPopular !== undefined ? patch.isPopular : Boolean(rows[0].is_popular),
      };
      await pool.query(
        'UPDATE locations SET name=$2, zone=$3, description=$4, is_popular=$5 WHERE id=$1 AND community_id=$6',
        [locId, merged.name, merged.zone, merged.description, Boolean(merged.isPopular), communityId]
      );
      return merged;
    }
    const state = store.getFileState();
    const comm = state.communities.find((c) => c.id === communityId);
    if (!comm) return null;
    const loc = (comm.locations || []).find((l) => l.id === locId);
    if (!loc) return null;
    Object.assign(loc, patch);
    await store.persistState();
    return loc;
  },

  async deleteLocation(communityId: string, locId: string): Promise<string | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        'DELETE FROM locations WHERE id = $1 AND community_id = $2 RETURNING name',
        [locId, communityId]
      );
      return rows[0]?.name || null;
    }
    const state = store.getFileState();
    const comm = state.communities.find((c) => c.id === communityId);
    if (!comm) return null;
    if (!state.deletedLocations.includes(locId)) {
      state.deletedLocations.push(locId);
    }
    const idx = (comm.locations || []).findIndex((l) => l.id === locId);
    if (idx === -1) return null;
    const [removed] = comm.locations.splice(idx, 1);
    await store.persistState();
    return removed.name;
  },

  // --- BREAKS ---
  async listBreaks(opts: {
    communityId?: string;
    breakType?: string;
    zone?: string;
    activeNow?: boolean;
    limit: number;
    offset: number;
  }): Promise<BreakPost[]> {
    const now = Date.now();
    const pool = store.getPool();
    if (pool) {
      const conditions: string[] = [];
      const params: any[] = [];
      if (opts.communityId) {
        params.push(opts.communityId);
        conditions.push(`community_id = $${params.length}`);
      }
      if (opts.breakType && opts.breakType !== 'all') {
        params.push(opts.breakType);
        conditions.push(`break_type = $${params.length}`);
      }
      if (opts.zone && opts.zone !== 'all') {
        params.push(opts.zone);
        conditions.push(`zone = $${params.length}`);
      }
      if (opts.activeNow) {
        params.push(now);
        conditions.push(`expires_at > $${params.length}`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(opts.limit, opts.offset);
      const { rows } = await pool.query(
        `SELECT * FROM breaks ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows.map(mapPgBreak);
    }

    const state = store.getFileState();
    let list = [...state.breaks];
    if (opts.communityId) list = list.filter((b) => b.communityId === opts.communityId);
    if (opts.breakType && opts.breakType !== 'all') list = list.filter((b) => b.breakType === opts.breakType);
    if (opts.zone && opts.zone !== 'all') list = list.filter((b) => b.zone === opts.zone);
    if (opts.activeNow) list = list.filter((b) => b.expiresAt > now);
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(opts.offset, opts.offset + opts.limit);
  },

  async findBreakById(id: string): Promise<BreakPost | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM breaks WHERE id = $1 LIMIT 1', [id]);
      return rows[0] ? mapPgBreak(rows[0]) : null;
    }
    const state = store.getFileState();
    return state.breaks.find((b) => b.id === id) || null;
  },

  async createBreak(post: BreakPost): Promise<BreakPost> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO breaks (
          id, user_id, user_name, user_role, user_avatar_seed, user_avatar_bg,
          community_id, break_type, status, time_label, duration_minutes,
          location_name, zone, custom_note, dietary, interests, icebreaker, expires_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19)`,
        [
          post.id,
          post.userId,
          post.userName,
          post.userRole,
          post.userAvatarSeed,
          post.userAvatarBg,
          post.communityId,
          post.breakType,
          post.status,
          post.timeLabel,
          post.durationMinutes,
          post.locationName,
          post.zone,
          post.customNote,
          post.dietary || 'Any',
          JSON.stringify(post.interests || []),
          post.icebreaker || '',
          post.expiresAt,
          post.createdAt,
        ]
      );
      return post;
    }
    const state = store.getFileState();
    state.breaks.unshift(post);
    await store.persistState();
    return post;
  },

  async updateBreak(id: string, patch: Partial<BreakPost>): Promise<BreakPost | null> {
    const pool = store.getPool();
    if (pool) {
      const existing = await this.findBreakById(id);
      if (!existing) return null;
      const merged = { ...existing, ...patch };
      await pool.query(
        `UPDATE breaks SET status=$2, duration_minutes=$3, expires_at=$4, time_label=$5 WHERE id=$1`,
        [id, merged.status, merged.durationMinutes, merged.expiresAt, merged.timeLabel]
      );
      return merged;
    }
    const state = store.getFileState();
    const post = state.breaks.find((b) => b.id === id);
    if (!post) return null;
    Object.assign(post, patch);
    await store.persistState();
    return post;
  },

  // --- CHAT MESSAGES ---
  async listMessages(conversationId: string, limit = 100): Promise<ChatMessage[]> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
        [conversationId, limit]
      );
      return rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        senderId: r.sender_id,
        senderName: r.sender_name,
        text: r.text,
        timestamp: r.timestamp,
        createdAt: Number(r.created_at),
        isSystem: Boolean(r.is_system),
      }));
    }
    const state = store.getFileState();
    const msgs = state.messages[conversationId] || [];
    return msgs.slice(-limit);
  },

  async addMessage(msg: ChatMessage & { createdAt: number }): Promise<ChatMessage> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, timestamp, is_system, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [msg.id, msg.conversationId, msg.senderId, msg.senderName, msg.text, msg.timestamp, Boolean(msg.isSystem), msg.createdAt]
      );
      return msg;
    }
    const state = store.getFileState();
    if (!state.messages[msg.conversationId]) {
      state.messages[msg.conversationId] = [];
    }
    state.messages[msg.conversationId].push(msg);
    if (state.messages[msg.conversationId].length > 500) {
      state.messages[msg.conversationId] = state.messages[msg.conversationId].slice(-500);
    }
    await store.persistState();
    return msg;
  },

  // --- NOTIFICATIONS ---
  async listNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 OR user_id = 'all' ORDER BY created_at DESC LIMIT $2`,
        [userId, limit]
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        body: r.body,
        type: r.type,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
        referenceId: r.reference_id || undefined,
      }));
    }
    const state = store.getFileState();
    return state.notifications
      .filter((n) => n.userId === userId || n.userId === 'all')
      .slice(0, limit);
  },

  async addNotification(notif: AppNotification): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at, reference_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [notif.id, notif.userId, notif.title, notif.body, notif.type, Boolean(notif.isRead), notif.createdAt, notif.referenceId || null]
      );
      return;
    }
    const state = store.getFileState();
    state.notifications.unshift(notif);
    await store.persistState();
  },

  async markNotificationsRead(userId: string): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 OR user_id = 'all'`,
        [userId]
      );
      return;
    }
    const state = store.getFileState();
    state.notifications.forEach((n) => {
      if (n.userId === userId || n.userId === 'all') n.isRead = true;
    });
    await store.persistState();
  },

  // --- RESET REQUESTS ---
  async listResetRequests(): Promise<PasswordResetRequest[]> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM reset_requests ORDER BY requested_at DESC LIMIT 100');
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        email: r.email,
        employeeId: r.employee_id,
        status: r.status,
        requestedAt: r.requested_at,
        approvedAt: r.approved_at || undefined,
        adminId: r.admin_id || undefined,
      }));
    }
    return store.getFileState().resetRequests;
  },

  async createResetRequest(reqItem: PasswordResetRequest): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO reset_requests (id, user_id, user_name, email, employee_id, status, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [reqItem.id, reqItem.userId, reqItem.userName, reqItem.email, reqItem.employeeId, reqItem.status, reqItem.requestedAt]
      );
      return;
    }
    const state = store.getFileState();
    state.resetRequests.unshift(reqItem);
    await store.persistState();
  },

  async findResetRequestById(id: string): Promise<PasswordResetRequest | null> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query('SELECT * FROM reset_requests WHERE id = $1 LIMIT 1', [id]);
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        email: r.email,
        employeeId: r.employee_id,
        status: r.status,
        requestedAt: r.requested_at,
        approvedAt: r.approved_at || undefined,
        adminId: r.admin_id || undefined,
      };
    }
    return store.getFileState().resetRequests.find((r) => r.id === id) || null;
  },

  async updateResetRequest(id: string, patch: Partial<PasswordResetRequest>): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `UPDATE reset_requests SET status=COALESCE($2, status), approved_at=COALESCE($3, approved_at), admin_id=COALESCE($4, admin_id) WHERE id=$1`,
        [id, patch.status || null, patch.approvedAt || null, patch.adminId || null]
      );
      return;
    }
    const state = store.getFileState();
    const item = state.resetRequests.find((r) => r.id === id);
    if (item) {
      Object.assign(item, patch);
      await store.persistState();
    }
  },

  async markUserResetCompleted(userId: string): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(`UPDATE reset_requests SET status = 'completed' WHERE user_id = $1 AND status = 'approved'`, [userId]);
      return;
    }
    const state = store.getFileState();
    const reqItem = state.resetRequests.find((r) => r.userId === userId && r.status === 'approved');
    if (reqItem) {
      reqItem.status = 'completed';
      await store.persistState();
    }
  },

  // --- AUDIT LOGS ---
  async listAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    const pool = store.getPool();
    if (pool) {
      const { rows } = await pool.query(
        'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      return rows.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        adminName: r.admin_name,
        action: r.action,
        targetUserId: r.target_user_id || undefined,
        targetUserName: r.target_user_name || undefined,
        details: r.details,
        timestamp: r.timestamp,
      }));
    }
    const logs = store.getFileState().auditLogs;
    return logs.slice(offset, offset + limit);
  },

  async addAuditLog(log: AuditLog): Promise<void> {
    const pool = store.getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [log.id, log.adminId, log.adminName, log.action, log.targetUserId || null, log.targetUserName || null, log.details, log.timestamp]
      );
      return;
    }
    const state = store.getFileState();
    state.auditLogs.unshift(log);
    await store.persistState();
  },

  // --- STATS ---
  async getStats() {
    const now = Date.now();
    const pool = store.getPool();
    if (pool) {
      const [u, b, c, r] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS cnt FROM users'),
        pool.query('SELECT COUNT(*)::int AS cnt FROM breaks WHERE expires_at > $1', [now]),
        pool.query('SELECT COUNT(*)::int AS cnt FROM communities'),
        pool.query("SELECT COUNT(*)::int AS cnt FROM reset_requests WHERE status = 'pending'"),
      ]);
      return {
        storageMode: 'postgresql',
        usersCount: u.rows[0].cnt,
        activeBreaksCount: b.rows[0].cnt,
        communitiesCount: c.rows[0].cnt,
        pendingResetRequests: r.rows[0].cnt,
      };
    }
    const state = store.getFileState();
    return {
      storageMode: 'persistent-file',
      usersCount: state.users.length,
      activeBreaksCount: state.breaks.filter((b) => b.expiresAt > now).length,
      communitiesCount: state.communities.length,
      pendingResetRequests: state.resetRequests.filter((r) => r.status === 'pending').length,
    };
  },
};
