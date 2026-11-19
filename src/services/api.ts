/**
 * Production Server-Authoritative API Client
 * Communicates strictly with the persistent backend database API.
 * No client-side mock database or localStorage data fallback.
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
  AuthResponse,
  UserRole,
  PasswordResetRequest,
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
      // ignore non-JSON error body
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const ApiService = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // ignore storage unavailability
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
    password: string;
    campusId: string;
    roleTitle: string;
    communityId?: string;
    employeeId: string;
    inviteCode?: string;
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

  async forgotPassword(
    email: string,
    employeeId: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, employeeId }),
    });
    return handleResponse(res);
  },

  async getResetRequests(): Promise<PasswordResetRequest[]> {
    if (!this.getToken()) return [];
    const res = await fetch(`${API_BASE}/auth/reset-requests`, {
      headers: this.getHeaders(),
    });
    return handleResponse<PasswordResetRequest[]>(res);
  },

  async approveResetRequest(
    requestId: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/approve-reset/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  async setNewPassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/set-new-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId, newPassword }),
    });
    const data = await handleResponse<{ success: boolean; message: string }>(res);
    this.setToken(null);
    return data;
  },

  async me(): Promise<UserProfile> {
    return this.getMe();
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

  async getAdminStatus(): Promise<{ hasAdmin: boolean }> {
    const res = await fetch(`${API_BASE}/auth/admin-status`, {
      headers: this.getHeaders(),
    });
    return handleResponse<{ hasAdmin: boolean }>(res);
  },

  async setupFirstAdmin(data: {
    name: string;
    email: string;
    employeeId: string;
    password: string;
    campusId?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/setup-first-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const auth = await handleResponse<AuthResponse>(res);
    this.setToken(auth.token);
    return auth;
  },

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string; token?: string }> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await handleResponse<{ success: boolean; message: string; token?: string }>(res);
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  // --- HEALTH ---
  async checkHealth(): Promise<{ status: string; uptimeSeconds: number; stats: any }> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse(res);
  },

  // --- COMMUNITIES & LOCATIONS ---
  async getCommunities(): Promise<Community[]> {
    const res = await fetch(`${API_BASE}/communities`, {
      headers: this.getHeaders(),
    });
    return handleResponse<Community[]>(res);
  },

  async addLocation(
    communityId: string,
    location: CampusLocation,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; location: CampusLocation; community: Community }> {
    const res = await fetch(
      `${API_BASE}/communities/${encodeURIComponent(communityId)}/locations`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(location),
      }
    );
    return handleResponse(res);
  },

  async updateLocation(
    communityId: string,
    locId: string,
    location: Partial<CampusLocation>,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; location: CampusLocation; community: Community }> {
    const res = await fetch(
      `${API_BASE}/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(location),
      }
    );
    return handleResponse(res);
  },

  async deleteLocation(
    communityId: string,
    locId: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; deletedLocationId: string; community: Community }> {
    const res = await fetch(
      `${API_BASE}/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      }
    );
    return handleResponse(res);
  },

  async createCommunity(
    data: { name: string; city: string; description?: string },
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; community: Community }> {
    const res = await fetch(`${API_BASE}/communities`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateCommunity(
    id: string,
    data: { name: string; city: string; description?: string },
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; community: Community }> {
    const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteCommunity(
    id: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; deletedCommunityId: string }> {
    const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  // --- BREAK POSTS ---
  async getBreaks(params?: {
    communityId?: string;
    breakType?: string;
    zone?: string;
    activeNow?: boolean;
  }): Promise<BreakPost[]> {
    const query = new URLSearchParams();
    if (params?.communityId) query.set('communityId', params.communityId);
    if (params?.breakType) query.set('breakType', params.breakType);
    if (params?.zone) query.set('zone', params.zone);
    if (params?.activeNow) query.set('activeNow', 'true');

    const qs = query.toString();
    const res = await fetch(`${API_BASE}/breaks${qs ? `?${qs}` : ''}`, {
      headers: this.getHeaders(),
    });
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
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<BreakPost>(res);
  },

  async extendBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/extend`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return handleResponse(res);
  },

  async completeBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/complete`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return handleResponse(res);
  },

  // --- USERS & ADMIN MANAGEMENT ---
  async getUsers(): Promise<UserProfile[]> {
    if (!this.getToken()) return [];
    const res = await fetch(`${API_BASE}/users`, {
      headers: this.getHeaders(),
    });
    return handleResponse<UserProfile[]>(res);
  },

  async getUserById(id: string): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`, {
      headers: this.getHeaders(),
    });
    return handleResponse<UserProfile>(res);
  },

  async approveUser(
    userId: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  async rejectUser(
    userId: string,
    _admin?: { id: string; name: string },
    reason?: string
  ): Promise<{ success: boolean; rejectedUserId: string; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res);
  },

  async toggleUserStatus(
    userId: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/toggle-status`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ success: boolean; user: UserProfile }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async updateUserRole(
    userId: string,
    newRole: UserRole,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/role`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ role: newRole }),
    });
    return handleResponse(res);
  },

  async deleteUser(
    userId: string,
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; deletedUserId: string; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  async createUser(
    userData: {
      name: string;
      email: string;
      employeeId: string;
      role?: UserRole;
      roleTitle?: string;
      campusId?: string;
      password?: string;
    },
    _admin?: { id: string; name: string }
  ): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(userData),
    });
    return handleResponse(res);
  },

  // --- CHAT CONVERSATIONS ---
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`, {
      headers: this.getHeaders(),
    });
    return handleResponse<ChatMessage[]>(res);
  },

  async sendMessage(
    conversationId: string,
    message: { senderId: string; senderName: string; text: string; isSystem?: boolean }
  ): Promise<ChatMessage> {
    const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(message),
    });
    return handleResponse<ChatMessage>(res);
  },

  // --- NOTIFICATIONS & AUDIT LOGS ---
  async getNotifications(_userId?: string): Promise<AppNotification[]> {
    if (!this.getToken()) return [];
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: this.getHeaders(),
    });
    return handleResponse<AppNotification[]>(res);
  },

  async markNotificationsRead(_userId?: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/notifications/mark-read`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (!this.getToken()) return [];
    const res = await fetch(`${API_BASE}/audit-logs`, {
      headers: this.getHeaders(),
    });
    return handleResponse<AuditLog[]>(res);
  },
};
