/**
 * Real Server-Authoritative API Client
 * All requests are executed as real HTTP network calls against backend endpoints.
 */

import { 
  UserProfile, 
  Community, 
  BreakPost, 
  AuditLog, 
  ChatMessage, 
  AppNotification, 
  CampusLocation,
  BreakType,
  AuthResponse 
} from '../types';

const API_BASE = '/api';
const TOKEN_KEY = 'mdb_auth_token_v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errorDetail = errJson.error;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const ApiService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string | null): void {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  // --- AUTHENTICATION ---
  async login(credentials: { email: string; password?: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await handleResponse<AuthResponse>(res);
    this.setToken(data.token);
    return data;
  },

  async register(userData: {
    name: string;
    email: string;
    password?: string;
    campusId: string;
    roleTitle: string;
    communityId?: string;
    interests?: string[];
    dietary?: any;
    icebreaker?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await handleResponse<AuthResponse>(res);
    this.setToken(data.token);
    return data;
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: this.getHeaders(),
    });
    const data = await handleResponse<{ user: UserProfile }>(res);
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } finally {
      this.setToken(null);
    }
  },

  // --- HEALTH ---
  async checkHealth(): Promise<{ status: string; uptimeSeconds: number; stats: any }> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse(res);
  },

  // --- COMMUNITIES ---
  async getCommunities(): Promise<Community[]> {
    const res = await fetch(`${API_BASE}/communities`);
    return handleResponse<Community[]>(res);
  },

  async addLocation(communityId: string, location: CampusLocation, admin: { id: string; name: string }): Promise<{ success: boolean; location: CampusLocation }> {
    const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(communityId)}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...location, adminId: admin.id, adminName: admin.name }),
    });
    return handleResponse(res);
  },

  // --- BREAK POSTS ---
  async getBreaks(params?: { communityId?: string; breakType?: string; zone?: string; activeNow?: boolean }): Promise<BreakPost[]> {
    const query = new URLSearchParams();
    if (params?.communityId) query.set('communityId', params.communityId);
    if (params?.breakType) query.set('breakType', params.breakType);
    if (params?.zone) query.set('zone', params.zone);
    if (params?.activeNow) query.set('activeNow', 'true');

    const res = await fetch(`${API_BASE}/breaks?${query.toString()}`);
    return handleResponse<BreakPost[]>(res);
  },

  async broadcastBreak(data: {
    userId: string;
    communityId: string;
    breakType: BreakType;
    durationMinutes: number;
    locationName: string;
    zone: string;
    customNote: string;
  }): Promise<BreakPost> {
    const res = await fetch(`${API_BASE}/breaks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<BreakPost>(res);
  },

  async extendBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/extend`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async completeBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/complete`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  // --- USERS & ADMIN AUTH ---
  async getUsers(): Promise<UserProfile[]> {
    const res = await fetch(`${API_BASE}/users`);
    return handleResponse<UserProfile[]>(res);
  },

  async getUserById(id: string): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`);
    return handleResponse<UserProfile>(res);
  },

  async registerUser(userData: {
    name: string;
    email: string;
    campusId: string;
    roleTitle: string;
    communityId: string;
    interests?: string[];
    dietary?: any;
    icebreaker?: string;
  }): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse<UserProfile>(res);
  },

  async approveUser(userId: string, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
    });
    return handleResponse(res);
  },

  async rejectUser(userId: string, admin: { id: string; name: string }, reason?: string): Promise<{ success: boolean; rejectedUserId: string; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: admin.id, adminName: admin.name, reason }),
    });
    return handleResponse(res);
  },

  async toggleUserStatus(userId: string, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/toggle-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
    });
    return handleResponse(res);
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  // --- CHAT CONVERSATIONS ---
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`);
    return handleResponse<ChatMessage[]>(res);
  },

  async sendMessage(conversationId: string, message: { senderId: string; senderName: string; text: string; isSystem?: boolean }): Promise<ChatMessage> {
    const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return handleResponse<ChatMessage>(res);
  },

  // --- NOTIFICATIONS & AUDIT LOGS ---
  async getNotifications(userId?: string): Promise<AppNotification[]> {
    const url = userId ? `${API_BASE}/notifications?userId=${encodeURIComponent(userId)}` : `${API_BASE}/notifications`;
    const res = await fetch(url);
    return handleResponse<AppNotification[]>(res);
  },

  async markNotificationsRead(userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/notifications/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return handleResponse(res);
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch(`${API_BASE}/audit-logs`);
    return handleResponse<AuditLog[]>(res);
  },
};
