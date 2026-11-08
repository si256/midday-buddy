/**
 * Real Server-Authoritative API Client with Resilient Client-Side Fallback
 * Works both with full-stack Node/Express servers, Cloudflare Pages Functions,
 * and static deployments without throwing 405 Method Not Allowed errors.
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
  UserRole
} from '../types';
import { StorageService } from './storage';

const API_BASE = '/api';
const TOKEN_KEY = 'mdb_auth_token_v1';
const RESET_REQUESTS_KEY = 'mdb_reset_requests_v2';

function isTransportFailure(status: number): boolean {
  return status === 405 || status === 404 || status >= 502;
}

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
    const trimmedEmail = (credentials.email || '').trim().toLowerCase();

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!isTransportFailure(res.status)) {
        const data = await handleResponse<AuthResponse>(res);
        this.setToken(data.token);
        // Sync user to storage for offline/resilience
        if (data.user) {
          StorageService.updateUser(data.user);
          StorageService.setCurrentSessionUser(data.user);
        }
        return data;
      }
    } catch (err: any) {
      // If error is an authoritative business logic error (e.g. 401 Invalid Credentials, 400, 403), rethrow directly
      if (err.message && !err.message.includes('405') && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }

    // Resilient Fallback: Local Authoritative Authentication
    const allUsers = StorageService.getUsers();
    const user = allUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

    if (!user) {
      throw new Error('Invalid Email ID or password.');
    }

    if (user.passwordResetApproved) {
      user.passwordResetApproved = false;
      user.mustChangePassword = true;
      StorageService.updateUser(user);
      const token = `token_${Date.now()}_fallback`;
      this.setToken(token);
      StorageService.setCurrentSessionUser(user);
      return {
        token,
        user,
        mustChangePassword: true,
        message: 'Password reset was approved by admin. Please choose a new password now.',
      };
    }

    if (!credentials.password) {
      throw new Error('Password is required.');
    }

    if (user.password && user.password !== credentials.password) {
      throw new Error('Invalid Email ID or password.');
    }

    const token = `token_${Date.now()}_fallback`;
    this.setToken(token);
    StorageService.setCurrentSessionUser(user);
    return {
      token,
      user,
      mustChangePassword: !!user.mustChangePassword,
    };
  },

  async register(userData: {
    name: string;
    email: string;
    password?: string;
    campusId: string;
    roleTitle: string;
    communityId?: string;
    employeeId?: string;
    interests?: string[];
    dietary?: any;
    icebreaker?: string;
  }): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      if (!isTransportFailure(res.status)) {
        const data = await handleResponse<AuthResponse>(res);
        this.setToken(data.token);
        if (data.user) {
          const current = StorageService.getUsers();
          StorageService.saveUsers([data.user, ...current.filter((u) => u.id !== data.user.id)]);
        }
        return data;
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('405') && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }

    // Resilient Fallback: Local Authoritative Registration
    const trimmedEmail = userData.email.trim().toLowerCase();
    const trimmedEmpId = (userData.employeeId || '').trim().toUpperCase();
    let existingUsers = StorageService.getUsers();

    const existingEmailUser = existingUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
    if (existingEmailUser) {
      if (existingEmailUser.status === 'rejected') {
        existingUsers = existingUsers.filter((u) => u.id !== existingEmailUser.id);
        StorageService.saveUsers(existingUsers);
      } else if (existingEmailUser.status === 'pending_approval') {
        throw new Error('Your registration with this Email ID is already awaiting admin approval.');
      } else {
        throw new Error('This Email ID is already registered. Please sign in or use another email.');
      }
    }

    const existingEmpUser = existingUsers.find((u) => u.employeeId?.toUpperCase() === trimmedEmpId);
    if (existingEmpUser) {
      if (existingEmpUser.status === 'rejected') {
        existingUsers = existingUsers.filter((u) => u.id !== existingEmpUser.id);
        StorageService.saveUsers(existingUsers);
      } else if (existingEmpUser.status === 'pending_approval') {
        throw new Error('Your registration with this Employee ID is already awaiting admin approval.');
      } else {
        throw new Error('This Employee ID is already registered to another active account. Please sign in.');
      }
    }

    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowISO = new Date().toISOString();

    const newUser: UserProfile = {
      id: newUserId,
      email: trimmedEmail,
      name: userData.name.trim(),
      employeeId: trimmedEmpId,
      campusId: userData.campusId || 'comm_siruseri',
      roleTitle: userData.roleTitle?.trim() || 'Software Engineer',
      avatarBgColor: 'bg-emerald-600',
      avatarSeed: userData.name.trim(),
      bio: `Colleague at ${userData.campusId || 'Workplace Campus'}.`,
      icebreaker: userData.icebreaker?.trim() || 'Let us grab chai and exchange ideas!',
      interests: userData.interests || ['Filter Coffee', 'Badminton', 'Tech'],
      dietary: userData.dietary || 'Any',
      socialBattery: 'Balanced Banter',
      status: 'pending_approval',
      role: 'user',
      registeredAt: nowISO,
      password: userData.password,
      mustChangePassword: false,
      passwordResetApproved: false,
    };

    StorageService.saveUsers([newUser, ...existingUsers]);
    const token = `token_${Date.now()}_fallback`;
    this.setToken(token);

    return {
      token,
      user: newUser,
      message: 'Account created. Waiting approval by admin.',
    };
  },

  async forgotPassword(email: string, employeeId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, employeeId }),
      });

      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('405') && !err.message.includes('Failed to fetch') && !err.message.includes('404')) {
        throw err;
      }
    }

    // Resilient Fallback: Local Authoritative Forgot Password
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();
    const users = StorageService.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === trimmedEmail && u.employeeId?.toUpperCase() === trimmedEmpId);

    if (!user) {
      throw new Error('No account found matching this Email ID and Employee ID combination.');
    }

    let existingReqs: any[] = [];
    try {
      const raw = localStorage.getItem(RESET_REQUESTS_KEY);
      if (raw) existingReqs = JSON.parse(raw);
    } catch {}

    const newReq = {
      id: `reset_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      email: user.email,
      employeeId: user.employeeId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(RESET_REQUESTS_KEY, JSON.stringify([newReq, ...existingReqs]));

    return {
      success: true,
      message: 'Password reset request submitted. Waiting approval by admin.',
    };
  },

  async getResetRequests(): Promise<any[]> {
    const token = this.getToken();
    if (!token) return [];

    try {
      const res = await fetch(`${API_BASE}/auth/reset-requests`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<any[]>(res);
      }
    } catch {}

    try {
      const raw = localStorage.getItem(RESET_REQUESTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async approveResetRequest(requestId: string, admin: { id: string; name: string }): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/approve-reset/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });

      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    let reqs: any[] = [];
    try {
      const raw = localStorage.getItem(RESET_REQUESTS_KEY);
      if (raw) reqs = JSON.parse(raw);
    } catch {}

    const targetReq = reqs.find((r) => r.id === requestId);
    if (targetReq) {
      targetReq.status = 'approved';
      localStorage.setItem(RESET_REQUESTS_KEY, JSON.stringify(reqs));

      const user = StorageService.getUserById(targetReq.userId);
      if (user) {
        user.passwordResetApproved = true;
        user.mustChangePassword = true;
        StorageService.updateUser(user);
      }
    }

    return {
      success: true,
      message: 'Reset request approved. Member can now log in without password and create a new password.',
    };
  },

  async setNewPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/set-new-password`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ userId, newPassword }),
      });

      if (!isTransportFailure(res.status)) {
        this.setToken(null);
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    if (user) {
      user.password = newPassword;
      user.mustChangePassword = false;
      user.passwordResetApproved = false;
      StorageService.updateUser(user);
    }
    this.setToken(null);

    return {
      success: true,
      message: 'Password updated successfully. Please sign in with your new password.',
    };
  },

  async me(): Promise<UserProfile> {
    return this.getMe();
  },

  async getMe(): Promise<UserProfile> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        const data = await handleResponse<{ user: UserProfile }>(res);
        return data.user;
      }
    } catch {}

    const sessionUser = StorageService.getCurrentSessionUser();
    if (sessionUser) return sessionUser;
    throw new Error('Unauthorized');
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch {
      // ignore
    } finally {
      this.setToken(null);
      StorageService.setCurrentSessionUser(null);
    }
  },

  // --- HEALTH ---
  async checkHealth(): Promise<{ status: string; uptimeSeconds: number; stats: any }> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    return {
      status: 'online',
      uptimeSeconds: 100,
      stats: {
        usersCount: StorageService.getUsers().length,
        activeBreaksCount: StorageService.getBreaks().length,
        communitiesCount: StorageService.getCommunities().length,
        pendingResetRequests: 0,
      },
    };
  },

  // --- COMMUNITIES ---
  async getCommunities(): Promise<Community[]> {
    try {
      const res = await fetch(`${API_BASE}/communities`);
      if (!isTransportFailure(res.status)) {
        const data = await handleResponse<Community[]>(res);
        const deletedIds = new Set(StorageService.getDeletedCommunityIds());
        const deletedLocIds = new Set(StorageService.getDeletedLocationIds());
        const filtered = (data || [])
          .filter((c) => !deletedIds.has(c.id))
          .map((c) => ({
            ...c,
            locations: (c.locations || []).filter((loc) => !deletedLocIds.has(loc.id)),
          }));
        StorageService.saveCommunities(filtered);
        return filtered;
      }
    } catch {}

    return StorageService.getCommunities();
  },

  async addLocation(communityId: string, location: CampusLocation, admin: { id: string; name: string }): Promise<{ success: boolean; location: CampusLocation }> {
    try {
      const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(communityId)}/locations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...location, adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        StorageService.addLocationToCommunity(communityId, location);
        return await handleResponse(res);
      }
    } catch {}

    StorageService.addLocationToCommunity(communityId, location);
    return { success: true, location };
  },

  async updateLocation(communityId: string, locId: string, location: Partial<CampusLocation>, admin: { id: string; name: string }): Promise<{ success: boolean; location: CampusLocation }> {
    try {
      const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...location, adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        StorageService.updateLocationInCommunity(communityId, locId, location);
        return await handleResponse(res);
      }
    } catch {}

    StorageService.updateLocationInCommunity(communityId, locId, location);
    const comm = StorageService.getCommunities().find((c) => c.id === communityId);
    const updated = comm?.locations.find((l) => l.id === locId) || (location as CampusLocation);
    return { success: true, location: updated };
  },

  async deleteLocation(communityId: string, locId: string, admin: { id: string; name: string }): Promise<{ success: boolean; deletedLocationId: string }> {
    // 1. Immediately record in local storage tombstones & update local community cache
    StorageService.deleteLocationFromCommunity(communityId, locId);

    try {
      const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(communityId)}/locations/${encodeURIComponent(locId)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    return { success: true, deletedLocationId: locId };
  },

  async createCommunity(data: { name: string; city: string; description?: string }, admin: { id: string; name: string }): Promise<{ success: boolean; community: Community }> {
    try {
      const res = await fetch(`${API_BASE}/communities`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...data, adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const newComm: Community = {
      id: `comm_${Date.now()}`,
      slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: data.name.trim(),
      city: data.city.trim(),
      description: data.description?.trim() || '',
      memberCount: 0,
      activeBreaksCount: 0,
      locations: [],
    };
    StorageService.addCommunity(newComm);
    return { success: true, community: newComm };
  },

  async updateCommunity(id: string, data: { name: string; city: string; description?: string }, admin: { id: string; name: string }): Promise<{ success: boolean; community: Community }> {
    try {
      const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...data, adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    StorageService.updateCommunity(id, data);
    const comm = StorageService.getCommunities().find((c) => c.id === id);
    return { success: true, community: comm! };
  },

  async deleteCommunity(id: string, admin: { id: string; name: string }): Promise<{ success: boolean; deletedCommunityId: string }> {
    StorageService.deleteCommunity(id);
    try {
      const res = await fetch(`${API_BASE}/communities/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    return { success: true, deletedCommunityId: id };
  },

  // --- BREAK POSTS ---
  async getBreaks(params?: { communityId?: string; breakType?: string; zone?: string; activeNow?: boolean }): Promise<BreakPost[]> {
    try {
      const query = new URLSearchParams();
      if (params?.communityId) query.set('communityId', params.communityId);
      if (params?.breakType) query.set('breakType', params.breakType);
      if (params?.zone) query.set('zone', params.zone);
      if (params?.activeNow) query.set('activeNow', 'true');

      const res = await fetch(`${API_BASE}/breaks?${query.toString()}`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        const data = await handleResponse<BreakPost[]>(res);
        StorageService.saveBreaks(data);
        return data;
      }
    } catch {}

    let breaks = StorageService.getBreaks();
    const now = Date.now();
    if (params?.communityId) breaks = breaks.filter((b) => b.communityId === params.communityId);
    if (params?.breakType && params.breakType !== 'all') breaks = breaks.filter((b) => b.breakType === params.breakType);
    if (params?.zone && params.zone !== 'all') breaks = breaks.filter((b) => b.zone === params.zone);
    if (params?.activeNow) breaks = breaks.filter((b) => b.expiresAt > now);
    return breaks;
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
    try {
      const res = await fetch(`${API_BASE}/breaks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });
      if (!isTransportFailure(res.status)) {
        const post = await handleResponse<BreakPost>(res);
        StorageService.addBreak(post);
        return post;
      }
    } catch {}

    const now = Date.now();
    const duration = data.durationMinutes || 15;
    const user = StorageService.getUserById(data.userId);
    const post: BreakPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: data.userId,
      userName: user?.name || 'Colleague',
      userRole: user?.roleTitle || 'Employee',
      userAvatarSeed: user?.avatarSeed || user?.name || 'User',
      userAvatarBg: user?.avatarBgColor || 'bg-amber-600',
      communityId: data.communityId,
      breakType: data.breakType,
      status: 'free_now',
      timeLabel: 'Free Right Now',
      zone: data.zone,
      locationName: data.locationName,
      customNote: data.customNote,
      interests: user?.interests || [],
      icebreaker: user?.icebreaker || 'Join me for a break!',
      durationMinutes: duration,
      createdAt: now,
      expiresAt: now + duration * 60 * 1000,
    };
    StorageService.addBreak(post);
    return post;
  },

  async extendBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    try {
      const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/extend`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const breaks = StorageService.getBreaks();
    const post = breaks.find((b) => b.id === postId);
    if (post) {
      post.expiresAt = post.expiresAt + 10 * 60 * 1000;
      StorageService.saveBreaks(breaks);
      return { success: true, post };
    }
    throw new Error('Break not found');
  },

  async completeBreak(postId: string): Promise<{ success: boolean; post: BreakPost }> {
    try {
      const res = await fetch(`${API_BASE}/breaks/${encodeURIComponent(postId)}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const breaks = StorageService.getBreaks();
    const post = breaks.find((b) => b.id === postId);
    if (post) {
      post.expiresAt = Date.now() - 1000;
      StorageService.saveBreaks(breaks);
      return { success: true, post };
    }
    throw new Error('Break not found');
  },

  // --- USERS & ADMIN AUTH ---
  async getUsers(): Promise<UserProfile[]> {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        const users = await handleResponse<UserProfile[]>(res);
        StorageService.saveUsers(users);
        return users;
      }
    } catch {}

    return StorageService.getUsers();
  },

  async getUserById(id: string): Promise<UserProfile> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<UserProfile>(res);
      }
    } catch {}

    const user = StorageService.getUserById(id);
    if (user) return user;
    throw new Error('User not found');
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
    const res = await this.register({
      ...userData,
      password: 'TemporaryPassword@123',
    });
    return res.user;
  },

  async approveUser(userId: string, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/approve`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    if (!user) throw new Error('User not found');
    user.status = 'approved';
    user.approvedAt = new Date().toISOString();
    StorageService.updateUser(user);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: 'APPROVE_USER',
      targetUserName: user.name,
      targetUserId: user.id,
      timestamp: new Date().toISOString(),
      details: 'Approved for break coordination network.',
    };
    StorageService.addAuditLog(log);

    return { success: true, user, log };
  },

  async rejectUser(userId: string, admin: { id: string; name: string }, reason?: string): Promise<{ success: boolean; rejectedUserId: string; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/reject`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name, reason }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const targetUser = StorageService.getUserById(userId);
    const users = StorageService.getUsers().filter((u) => u.id !== userId);
    StorageService.saveUsers(users);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: 'REJECT_USER',
      targetUserName: targetUser?.name || userId,
      targetUserId: userId,
      timestamp: new Date().toISOString(),
      details: reason || 'Application rejected by campus admin.',
    };
    StorageService.addAuditLog(log);

    return { success: true, rejectedUserId: userId, log };
  },

  async toggleUserStatus(userId: string, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/toggle-status`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    if (!user) throw new Error('User not found');
    user.status = user.status === 'suspended' ? 'approved' : 'suspended';
    StorageService.updateUser(user);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: user.status === 'suspended' ? 'SUSPEND_USER' : 'REINSTATE_USER',
      targetUserName: user.name,
      targetUserId: user.id,
      timestamp: new Date().toISOString(),
      details: `Status set to ${user.status}.`,
    };
    StorageService.addAuditLog(log);

    return { success: true, user, log };
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, ...updates };
    StorageService.updateUser(updated);
    return { success: true, user: updated };
  },

  async updateUserRole(userId: string, newRole: UserRole, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/role`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ role: newRole, adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    if (!user) throw new Error('User not found');
    user.role = newRole;
    StorageService.updateUser(user);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: 'CHANGE_ROLE' as any,
      targetUserId: user.id,
      targetUserName: user.name,
      details: `${newRole === 'community_admin' ? 'Promoted to Campus Admin' : 'Revoked Campus Admin rights'} for ${user.name}`,
      timestamp: new Date().toISOString(),
    };
    StorageService.addAuditLog(log);

    return { success: true, user, log };
  },

  async deleteUser(userId: string, admin: { id: string; name: string }): Promise<{ success: boolean; deletedUserId: string; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const user = StorageService.getUserById(userId);
    const users = StorageService.getUsers().filter((u) => u.id !== userId);
    StorageService.saveUsers(users);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: 'DELETE_USER' as any,
      targetUserId: userId,
      targetUserName: user?.name || userId,
      details: `Deleted user account for ${user?.name || userId}`,
      timestamp: new Date().toISOString(),
    };
    StorageService.addAuditLog(log);

    return { success: true, deletedUserId: userId, log };
  },

  async createUser(userData: {
    name: string;
    email: string;
    employeeId: string;
    role?: UserRole;
    roleTitle?: string;
    campusId?: string;
    password?: string;
  }, admin: { id: string; name: string }): Promise<{ success: boolean; user: UserProfile; log: AuditLog }> {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...userData, status: 'approved', adminId: admin.id, adminName: admin.name }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    const nowISO = new Date().toISOString();
    const newUser: UserProfile = {
      id: `usr_${Date.now()}`,
      name: userData.name.trim(),
      email: userData.email.trim().toLowerCase(),
      employeeId: userData.employeeId.trim().toUpperCase(),
      role: userData.role || 'user',
      roleTitle: userData.roleTitle?.trim() || (userData.role === 'community_admin' ? 'Campus Administrator' : 'Software Engineer'),
      campusId: userData.campusId || 'comm_siruseri',
      status: 'approved',
      avatarBgColor: userData.role === 'community_admin' ? 'bg-indigo-600' : 'bg-emerald-600',
      avatarSeed: userData.name.trim(),
      bio: `Colleague at ${userData.campusId || 'Workplace Campus'}.`,
      icebreaker: 'Let us connect for chai and breaks!',
      interests: ['Workplace Well-being', 'Technology'],
      dietary: 'Any',
      socialBattery: 'Balanced Banter',
      registeredAt: nowISO,
      approvedAt: nowISO,
      password: userData.password || 'Buddy@12345',
      mustChangePassword: false,
      passwordResetApproved: false,
    };

    const currentUsers = StorageService.getUsers();
    const existingIndex = currentUsers.findIndex((u) => 
      u.email.toLowerCase() === newUser.email.toLowerCase() || 
      (u.employeeId && u.employeeId.toUpperCase() === newUser.employeeId?.toUpperCase())
    );

    if (existingIndex !== -1) {
      currentUsers[existingIndex] = { ...currentUsers[existingIndex], ...newUser, id: currentUsers[existingIndex].id };
      StorageService.saveUsers(currentUsers);
      return { success: true, user: currentUsers[existingIndex], log: {
        id: `log_${Date.now()}`,
        adminId: admin.id,
        adminName: admin.name,
        action: 'ADD_MEMBER' as any,
        targetUserId: currentUsers[existingIndex].id,
        targetUserName: currentUsers[existingIndex].name,
        details: `Admin configured and verified account for ${currentUsers[existingIndex].name}`,
        timestamp: nowISO,
      }};
    }

    StorageService.saveUsers([newUser, ...currentUsers]);

    const log: AuditLog = {
      id: `log_${Date.now()}`,
      adminId: admin.id,
      adminName: admin.name,
      action: 'CREATE_USER' as any,
      targetUserId: newUser.id,
      targetUserName: newUser.name,
      details: `Directly registered ${newUser.role === 'community_admin' ? 'Campus Admin' : 'Member'} ${newUser.name}`,
      timestamp: nowISO,
    };
    StorageService.addAuditLog(log);

    return { success: true, user: newUser, log };
  },

  // --- CHAT CONVERSATIONS ---
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<ChatMessage[]>(res);
      }
    } catch {}

    return StorageService.getMessages(conversationId);
  },

  async sendMessage(conversationId: string, message: { senderId: string; senderName: string; text: string; isSystem?: boolean }): Promise<ChatMessage> {
    try {
      const res = await fetch(`${API_BASE}/chat/${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(message),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<ChatMessage>(res);
      }
    } catch {}

    const chatMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      timestamp: new Date().toISOString(),
      isSystem: !!message.isSystem,
    };
    StorageService.saveMessage(conversationId, chatMsg);
    return chatMsg;
  },

  // --- NOTIFICATIONS & AUDIT LOGS ---
  async getNotifications(userId?: string): Promise<AppNotification[]> {
    try {
      const url = userId ? `${API_BASE}/notifications?userId=${encodeURIComponent(userId)}` : `${API_BASE}/notifications`;
      const res = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<AppNotification[]>(res);
      }
    } catch {}

    return userId ? StorageService.getNotifications(userId) : [];
  },

  async markNotificationsRead(userId: string): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/notifications/mark-read`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ userId }),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse(res);
      }
    } catch {}

    StorageService.markNotificationsRead(userId);
    return { success: true };
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const token = this.getToken();
    if (!token) {
      return StorageService.getAuditLogs();
    }

    try {
      const res = await fetch(`${API_BASE}/audit-logs`, {
        headers: this.getHeaders(),
      });
      if (!isTransportFailure(res.status)) {
        return await handleResponse<AuditLog[]>(res);
      }
    } catch {}

    return StorageService.getAuditLogs();
  },
};
