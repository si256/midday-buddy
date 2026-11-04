import { 
  UserProfile, 
  Community, 
  BreakPost, 
  Conversation, 
  ChatMessage, 
  AppNotification, 
  AuditLog, 
  CampusLocation 
} from '../types';
import { 
  INITIAL_COMMUNITIES, 
  INITIAL_USERS, 
  INITIAL_BREAK_POSTS, 
  INITIAL_AUDIT_LOGS 
} from '../data/seedData';

const KEYS = {
  USERS: 'mdb_users_v2',
  SESSION: 'mdb_session_user_id_v2',
  COMMUNITIES: 'mdb_communities_v2',
  BREAKS: 'mdb_breaks_v2',
  CONVERSATIONS: 'mdb_conversations_v2',
  MESSAGES: 'mdb_messages_v2',
  NOTIFICATIONS: 'mdb_notifications_v2',
  AUDIT_LOGS: 'mdb_audit_logs_v2',
};

// Seed initial notifications for realism
const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif_welcome',
    userId: 'usr_dinesh',
    title: 'Welcome to Siruseri Break Network!',
    body: 'Your account was verified by Campus Culture Lead Kavitha Sundaram.',
    type: 'approval',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif_ping',
    userId: 'usr_dinesh',
    title: 'Aravind Swaminathan is grabbing chai',
    body: 'Aravind is free right now at Spine Chai Point (Near Core).',
    type: 'ping',
    isRead: false,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    referenceId: 'post_1',
  },
];

// Helper to safely read from localStorage
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${key} from localStorage:`, err);
    return fallback;
  }
}

// Helper to safely write to localStorage
function writeStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error writing ${key} to localStorage:`, err);
  }
}

export const StorageService = {
  // --- USERS ---
  getUsers(): UserProfile[] {
    const users = readStorage<UserProfile[]>(KEYS.USERS, []);
    if (users.length === 0) {
      writeStorage(KEYS.USERS, INITIAL_USERS);
      return INITIAL_USERS;
    }
    return users;
  },

  saveUsers(users: UserProfile[]): void {
    writeStorage(KEYS.USERS, users);
  },

  getUserById(id: string): UserProfile | undefined {
    return this.getUsers().find((u) => u.id === id);
  },

  updateUser(updated: UserProfile): void {
    const users = this.getUsers().map((u) => (u.id === updated.id ? updated : u));
    this.saveUsers(users);
  },

  // --- SESSIONS ---
  getCurrentSessionUser(): UserProfile | null {
    const userId = localStorage.getItem(KEYS.SESSION);
    if (!userId) {
      return null;
    }
    return this.getUserById(userId) || null;
  },

  setCurrentSessionUser(user: UserProfile | null): void {
    if (user) {
      localStorage.setItem(KEYS.SESSION, user.id);
    } else {
      localStorage.removeItem(KEYS.SESSION);
    }
  },

  // --- COMMUNITIES ---
  getCommunities(): Community[] {
    const comms = readStorage<Community[]>(KEYS.COMMUNITIES, []);
    if (comms.length === 0) {
      writeStorage(KEYS.COMMUNITIES, INITIAL_COMMUNITIES);
      return INITIAL_COMMUNITIES;
    }
    return comms;
  },

  saveCommunities(communities: Community[]): void {
    writeStorage(KEYS.COMMUNITIES, communities);
  },

  addLocationToCommunity(communityId: string, location: CampusLocation): void {
    const comms = this.getCommunities().map((c) => {
      if (c.id === communityId) {
        return { ...c, locations: [...c.locations, location] };
      }
      return c;
    });
    this.saveCommunities(comms);
  },

  // --- BREAK POSTS ---
  getBreaks(): BreakPost[] {
    const breaks = readStorage<BreakPost[]>(KEYS.BREAKS, []);
    if (breaks.length === 0) {
      // Map seed breaks with initial durationMinutes
      const mapped = INITIAL_BREAK_POSTS.map((b) => ({
        ...b,
        durationMinutes: b.breakType === 'tea' ? 15 : b.breakType === 'lunch' ? 30 : 20,
      }));
      writeStorage(KEYS.BREAKS, mapped);
      return mapped;
    }
    return breaks;
  },

  saveBreaks(breaks: BreakPost[]): void {
    writeStorage(KEYS.BREAKS, breaks);
  },

  addBreak(post: BreakPost): void {
    const current = this.getBreaks();
    this.saveBreaks([post, ...current]);
  },

  // --- CONVERSATIONS & CHAT ---
  getConversations(): Conversation[] {
    return readStorage<Conversation[]>(KEYS.CONVERSATIONS, []);
  },

  saveConversations(convs: Conversation[]): void {
    writeStorage(KEYS.CONVERSATIONS, convs);
  },

  getMessages(conversationId: string): ChatMessage[] {
    const allMessages = readStorage<Record<string, ChatMessage[]>>(KEYS.MESSAGES, {});
    return allMessages[conversationId] || [];
  },

  saveMessage(conversationId: string, message: ChatMessage): void {
    const allMessages = readStorage<Record<string, ChatMessage[]>>(KEYS.MESSAGES, {});
    const roomMessages = allMessages[conversationId] || [];
    allMessages[conversationId] = [...roomMessages, message];
    writeStorage(KEYS.MESSAGES, allMessages);

    // Update conversation lastMessage snippet
    const convs = this.getConversations().map((c) => {
      if (c.id === conversationId) {
        return { ...c, lastMessage: message.text, lastMessageAt: Date.now() };
      }
      return c;
    });
    this.saveConversations(convs);
  },

  // --- NOTIFICATIONS ---
  getNotifications(userId: string): AppNotification[] {
    const all = readStorage<AppNotification[]>(KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    return all.filter((n) => n.userId === userId);
  },

  addNotification(notification: AppNotification): void {
    const all = readStorage<AppNotification[]>(KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    writeStorage(KEYS.NOTIFICATIONS, [notification, ...all]);
  },

  markNotificationsRead(userId: string): void {
    const all = readStorage<AppNotification[]>(KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    const updated = all.map((n) => (n.userId === userId ? { ...n, isRead: true } : n));
    writeStorage(KEYS.NOTIFICATIONS, updated);
  },

  // --- AUDIT LOGS ---
  getAuditLogs(): AuditLog[] {
    const logs = readStorage<AuditLog[]>(KEYS.AUDIT_LOGS, []);
    if (logs.length === 0) {
      writeStorage(KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
      return INITIAL_AUDIT_LOGS;
    }
    return logs;
  },

  addAuditLog(log: AuditLog): void {
    const logs = this.getAuditLogs();
    writeStorage(KEYS.AUDIT_LOGS, [log, ...logs]);
  },
};
