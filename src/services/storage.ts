/**
 * Client Storage Cache Service
 * Strictly for caching UI preferences, public campus lists, and client tombstones.
 * Zero authentication or authorization logic. Server is the sole authority.
 */

import { 
  UserProfile, 
  Community, 
  BreakPost, 
  AppNotification, 
  CampusLocation,
  AuditLog
} from '../types';
import { INITIAL_COMMUNITIES } from '../data/seedData';

const KEYS = {
  USERS: 'mdb_users_cache_v3',
  SESSION_USER: 'mdb_session_user_v3',
  COMMUNITIES: 'mdb_communities_cache_v3',
  BREAKS: 'mdb_breaks_cache_v3',
  NOTIFICATIONS: 'mdb_notifications_cache_v3',
  DELETED_COMMUNITIES: 'mdb_deleted_community_ids_v1',
  DELETED_LOCATIONS: 'mdb_deleted_location_ids_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeStorage<T>(key: string, data: T): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    // ignore
  }
}

export const StorageService = {
  // --- USERS CACHE ---
  getUsers(): UserProfile[] {
    return readStorage<UserProfile[]>(KEYS.USERS, []);
  },

  saveUsers(users: UserProfile[]): void {
    // Redact any password fields before caching
    const safeUsers = users.map(({ password: _, ...rest }) => rest as UserProfile);
    writeStorage(KEYS.USERS, safeUsers);
  },

  getUserById(id: string): UserProfile | undefined {
    return this.getUsers().find((u) => u.id === id);
  },

  updateUser(updated: UserProfile): void {
    const { password: _, ...safe } = updated;
    const users = this.getUsers().map((u) => (u.id === safe.id ? (safe as UserProfile) : u));
    this.saveUsers(users);
  },

  // --- SESSION USER CACHE ---
  getCurrentSessionUser(): UserProfile | null {
    return readStorage<UserProfile | null>(KEYS.SESSION_USER, null);
  },

  setCurrentSessionUser(user: UserProfile | null): void {
    if (user) {
      const { password: _, ...safe } = user;
      writeStorage(KEYS.SESSION_USER, safe);
    } else {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(KEYS.SESSION_USER);
      }
    }
  },

  // --- TOMBSTONES ---
  getDeletedCommunityIds(): string[] {
    return readStorage<string[]>(KEYS.DELETED_COMMUNITIES, []);
  },

  getDeletedLocationIds(): string[] {
    return readStorage<string[]>(KEYS.DELETED_LOCATIONS, []);
  },

  addDeletedLocationId(locId: string): void {
    const current = new Set(this.getDeletedLocationIds());
    current.add(locId);
    writeStorage(KEYS.DELETED_LOCATIONS, Array.from(current));
  },

  removeDeletedLocationId(locId: string): void {
    const current = new Set(this.getDeletedLocationIds());
    current.delete(locId);
    writeStorage(KEYS.DELETED_LOCATIONS, Array.from(current));
  },

  // --- COMMUNITIES CACHE ---
  getCommunities(): Community[] {
    const deletedIds = new Set(this.getDeletedCommunityIds());
    const deletedLocIds = new Set(this.getDeletedLocationIds());
    let comms = readStorage<Community[]>(KEYS.COMMUNITIES, []);

    if (comms.length === 0) {
      comms = INITIAL_COMMUNITIES;
    }

    let active = comms
      .filter((c) => !deletedIds.has(c.id))
      .map((c) => ({
        ...c,
        locations: (c.locations || []).filter((loc) => !deletedLocIds.has(loc.id)),
      }));

    if (active.length === 0 && INITIAL_COMMUNITIES.length > 0) {
      active = [{
        ...INITIAL_COMMUNITIES[0],
        locations: (INITIAL_COMMUNITIES[0].locations || []).filter((loc) => !deletedLocIds.has(loc.id)),
      }];
    }
    return active;
  },

  saveCommunities(communities: Community[]): void {
    const deletedIds = new Set(this.getDeletedCommunityIds());
    const deletedLocIds = new Set(this.getDeletedLocationIds());
    const filtered = communities
      .filter((c) => !deletedIds.has(c.id))
      .map((c) => ({
        ...c,
        locations: (c.locations || []).filter((loc) => !deletedLocIds.has(loc.id)),
      }));
    writeStorage(KEYS.COMMUNITIES, filtered);
  },

  addLocationToCommunity(communityId: string, location: CampusLocation): void {
    this.removeDeletedLocationId(location.id);
    const comms = this.getCommunities().map((c) => {
      if (c.id === communityId) {
        const without = (c.locations || []).filter((l) => l.id !== location.id);
        return { ...c, locations: [...without, location] };
      }
      return c;
    });
    this.saveCommunities(comms);
  },

  updateLocationInCommunity(communityId: string, locId: string, updates: Partial<CampusLocation>): void {
    const comms = this.getCommunities().map((c) => {
      if (c.id === communityId) {
        return {
          ...c,
          locations: (c.locations || []).map((loc) => (loc.id === locId ? { ...loc, ...updates } : loc)),
        };
      }
      return c;
    });
    this.saveCommunities(comms);
  },

  deleteLocationFromCommunity(communityId: string, locId: string): void {
    this.addDeletedLocationId(locId);
    const comms = this.getCommunities().map((c) => {
      if (c.id === communityId) {
        return {
          ...c,
          locations: (c.locations || []).filter((loc) => loc.id !== locId),
        };
      }
      return c;
    });
    this.saveCommunities(comms);
  },

  addCommunity(community: Community): void {
    const deletedIds = this.getDeletedCommunityIds().filter((id) => id !== community.id);
    writeStorage(KEYS.DELETED_COMMUNITIES, deletedIds);
    const comms = this.getCommunities().filter((c) => c.id !== community.id);
    this.saveCommunities([...comms, community]);
  },

  updateCommunity(communityId: string, updates: Partial<Community>): void {
    const comms = this.getCommunities().map((c) => (c.id === communityId ? { ...c, ...updates } : c));
    this.saveCommunities(comms);
  },

  deleteCommunity(communityId: string): void {
    const deletedIds = Array.from(new Set([...this.getDeletedCommunityIds(), communityId]));
    writeStorage(KEYS.DELETED_COMMUNITIES, deletedIds);
    const comms = this.getCommunities().filter((c) => c.id !== communityId);
    this.saveCommunities(comms);
  },

  // --- BREAKS CACHE ---
  getBreaks(): BreakPost[] {
    return readStorage<BreakPost[]>(KEYS.BREAKS, []);
  },

  saveBreaks(breaks: BreakPost[]): void {
    writeStorage(KEYS.BREAKS, breaks);
  },

  // --- NOTIFICATIONS CACHE ---
  getNotifications(userId: string): AppNotification[] {
    const all = readStorage<AppNotification[]>(KEYS.NOTIFICATIONS, []);
    return all.filter((n) => n.userId === userId || n.userId === 'all');
  },

  saveNotifications(notifs: AppNotification[]): void {
    writeStorage(KEYS.NOTIFICATIONS, notifs);
  },

  markNotificationsRead(userId: string): void {
    const all = readStorage<AppNotification[]>(KEYS.NOTIFICATIONS, []);
    const updated = all.map((n) =>
      n.userId === userId || n.userId === 'all' ? { ...n, isRead: true, read: 1 } : n
    );
    writeStorage(KEYS.NOTIFICATIONS, updated);
  },

  // --- AUDIT LOGS CACHE ---
  getAuditLogs(): AuditLog[] {
    return readStorage<AuditLog[]>('mbu_audit_logs', []);
  },

  saveAuditLogs(logs: AuditLog[]): void {
    writeStorage('mbu_audit_logs', logs);
  },
};
