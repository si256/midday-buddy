/**
 * Server-Authoritative API Service (Enterprise Standard)
 * The server is the sole authority for authentication, RBAC, and data persistence.
 * Zero client-side fake auth fallbacks.
 * Uses HttpOnly/Secure/SameSite session cookies with X-CSRF-Token headers and Bearer auth.
 */

import { 
  UserProfile, 
  Community, 
  BreakPost, 
  AuditLog, 
  ChatMessage, 
  AppNotification, 
  CampusLocation, 
  AuthResponse, 
  UserRole 
} from '../types';
import { StorageService } from './storage';

const API_BASE = '/api';
const TOKEN_KEY = 'mdb_auth_token_v2';
const CSRF_KEY = 'mdb_csrf_token_v2';

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

  getCsrfToken(): string | null {
    return localStorage.getItem(CSRF_KEY);
  },

  setCsrfToken(csrfToken: string | null): void {
    if (csrfToken) {
      localStorage.setItem(CSRF_KEY, csrfToken);
    } else {
      localStorage.removeItem(CSRF_KEY);
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
    const csrf = this.getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    return headers;
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      credentials: 'include', // Transmit and receive HttpOnly session cookies
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {}),
      },
    });
    return handleResponse<T>(res);
  },

  // --- HEALTH & FIRST-ADMIN STATUS ---
  async checkHealth(): Promise<{ status: string; hasAdmin: boolean; [key: string]: any }> {
    return this.request('/health');
  },

  async getAdminStatus(): Promise<{ hasAdmin: boolean }> {
    return this.request('/auth/admin-status');
  },

  async setupFirstAdmin(data: {
    name: string;
    email: string;
    password: string;
    employeeId: string;
    campusId: string;
  }): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (result.token) this.setToken(result.token);
    if (result.csrfToken) this.setCsrfToken(result.csrfToken);
    if (result.user) {
      StorageService.setCurrentSessionUser(result.user);
    }
    return result;
  },

  // --- AUTHENTICATION ---
  async login(credentials: { email: string; password?: string }): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (result.token) this.setToken(result.token);
    if (result.csrfToken) this.setCsrfToken(result.csrfToken);
    if (result.user) {
      StorageService.setCurrentSessionUser(result.user);
    }
    return result;
  },

  async register(userData: {
    name: string;
    email: string;
    password?: string;
    campusId: string;
    roleTitle: string;
    employeeId?: string;
    interests?: string[];
    dietary?: any;
    icebreaker?: string;
  }): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async forgotPassword(email: string, employeeId: string): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, employeeId }),
    });
  },

  async getResetRequests(): Promise<any[]> {
    return this.request('/auth/reset-requests');
  },

  async approveResetRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/auth/approve-reset/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async setNewPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const result = await this.request<{ success: boolean; message: string }>('/auth/set-new-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword }),
    });
    this.setToken(null);
    this.setCsrfToken(null);
    StorageService.setCurrentSessionUser(null);
    return result;
  },

  async me(): Promise<UserProfile> {
    return this.getMe();
  },

  async getMe(): Promise<UserProfile> {
    const res = await this.request<{ user: UserProfile; csrfToken?: string }>('/auth/me');
    if (res.csrfToken) {
      this.setCsrfToken(res.csrfToken);
    }
    if (res.user) {
      StorageService.setCurrentSessionUser(res.user);
      return res.user;
    }
    throw new Error('Unauthorized');
  },

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // ignore
    } finally {
      this.setToken(null);
      this.setCsrfToken(null);
      StorageService.setCurrentSessionUser(null);
    }
  },

  // --- COMMUNITIES ---
  async getCommunities(): Promise<Community[]> {
    const data = await this.request<Community[]>('/communities');
    const deletedCommIds = new Set(StorageService.getDeletedCommunityIds());
    const deletedLocIds = new Set(StorageService.getDeletedLocationIds());
    const filtered = (data || [])
      .filter((c) => !deletedCommIds.has(c.id))
      .map((c) => ({
        ...c,
        locations: (c.locations || []).filter((loc) => !deletedLocIds.has(loc.id)),
      }));
    StorageService.saveCommunities(filtered);
    return filtered;
  },

  async createCommunity(data: { name: string; city: string; description?: string }): Promise<{ success: boolean; community: Community }> {
    const result = await this.request<{ success: boolean; community: Community }>('/communities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.community) {
      StorageService.addCommunity(result.community);
    }
    return result;
  },

  async updateCommunity(communityId: string, updates: Partial<Community>): Promise<{ success: boolean; community: Community }> {
    const result = await this.request<{ success: boolean; community: Community }>(`/communities/${encodeURIComponent(communityId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (result.community) {
      StorageService.updateCommunity(communityId, result.community);
    }
    return result;
  },

  async deleteCommunity(communityId: string): Promise<{ success: boolean; deletedCommunityId: string }> {
    StorageService.deleteCommunity(communityId);
    return this.request<{ success: boolean; deletedCommunityId: string }>(`/communities/${encodeURIComponent(communityId)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  },

  // --- CAMPUS LOCATIONS / SPOTS ---
  async addLocation(communityId: string, location: CampusLocation): Promise<{ success: boolean; location: CampusLocation }> {
    const result = await this.request<{ success: boolean; location: CampusLocation }>(`/communities/${encodeURIComponent(communityId)}/locations`, {
      method: 'POST',
      body: JSON.stringify(location),
    });
    if (result.location) {
      StorageService.addLocationToCommunity(communityId, result.location);
    }
    return result;
  },

  async updateLocation(communityId: string, locId: string, updates: Partial<CampusLocation>): Promise<{ success: boolean; location: CampusLocation }> {
    const result = await this.request<{ success: boolean; location: CampusLocation }>(`/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (result.location) {
      StorageService.updateLocationInCommunity(communityId, locId, result.location);
    }
    return result;
  },

  async deleteLocation(communityId: string, locId: string): Promise<{ success: boolean; deletedLocationId: string }> {
    StorageService.deleteLocationFromCommunity(communityId, locId);
    return this.request<{ success: boolean; deletedLocationId: string }>(`/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  },

  // --- BREAKS ---
  async getBreaks(communityId?: string, breakType?: string): Promise<BreakPost[]> {
    const params = new URLSearchParams();
    if (communityId) params.append('communityId', communityId);
    if (breakType && breakType !== 'all') params.append('breakType', breakType);
    return this.request<BreakPost[]>(`/breaks?${params.toString()}`);
  },

  async createBreak(postData: Partial<BreakPost>): Promise<BreakPost> {
    return this.request<BreakPost>('/breaks', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  },

  async broadcastBreak(postData: Partial<BreakPost>): Promise<BreakPost> {
    return this.createBreak(postData);
  },

  async extendBreak(breakId: string): Promise<{ success: boolean; post: BreakPost }> {
    return this.request<{ success: boolean; post: BreakPost }>(`/breaks/${encodeURIComponent(breakId)}/extend`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async completeBreak(breakId: string): Promise<{ success: boolean; completedBreakId: string }> {
    return this.request<{ success: boolean; completedBreakId: string }>(`/breaks/${encodeURIComponent(breakId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // --- CHAT ---
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.request<ChatMessage[]>(`/chat/${encodeURIComponent(conversationId)}`);
  },

  async sendMessage(conversationId: string, payload: string | { text: string; [key: string]: any }): Promise<ChatMessage> {
    const text = typeof payload === 'string' ? payload : payload.text;
    return this.request<ChatMessage>(`/chat/${encodeURIComponent(conversationId)}`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // --- USERS ---
  async getUsers(): Promise<UserProfile[]> {
    return this.request<UserProfile[]>('/users');
  },

  async getUser(userId: string): Promise<UserProfile> {
    return this.request<UserProfile>(`/users/${encodeURIComponent(userId)}`);
  },

  async updateUser(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    return this.request<{ success: boolean; user: UserProfile }>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    return this.updateUser(userId, updates);
  },

  async createUser(userData: {
    name: string;
    email: string;
    employeeId: string;
    role?: UserRole;
    roleTitle?: string;
    campusId?: string;
    password?: string;
  }): Promise<{ success: boolean; user: UserProfile }> {
    return this.request<{ success: boolean; user: UserProfile }>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async approveUser(userId: string): Promise<{ success: boolean; user?: UserProfile; log?: AuditLog }> {
    return this.request<{ success: boolean; user?: UserProfile; log?: AuditLog }>(`/users/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async rejectUser(userId: string): Promise<{ success: boolean; log?: AuditLog }> {
    return this.request<{ success: boolean; log?: AuditLog }>(`/users/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async updateUserRole(userId: string, role: UserRole): Promise<{ success: boolean; user: UserProfile; log?: AuditLog }> {
    return this.request<{ success: boolean; user: UserProfile; log?: AuditLog }>(`/users/${encodeURIComponent(userId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  async toggleUserStatus(userId: string): Promise<{ success: boolean; user: UserProfile; log?: AuditLog }> {
    return this.request<{ success: boolean; user: UserProfile; log?: AuditLog }>(`/users/${encodeURIComponent(userId)}/toggle-status`, {
      method: 'PUT',
      body: JSON.stringify({}),
    });
  },

  async deleteUser(userId: string): Promise<{ success: boolean; log?: AuditLog }> {
    return this.request<{ success: boolean; log?: AuditLog }>(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  },

  // --- NOTIFICATIONS & AUDIT ---
  async getNotifications(userId?: string): Promise<AppNotification[]> {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return this.request<AppNotification[]>(`/notifications${query}`);
  },

  async markNotificationRead(notificationId?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ id: notificationId }),
    });
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/audit-logs');
  },
};
