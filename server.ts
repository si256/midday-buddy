/**
 * MidDay Buddy Development & Local Integration Server
 * CoreReacher Enterprises Enterprise Workplace Network
 * 
 * Strict Production Parity:
 * - PBKDF2 Password Hashing & Verification (Zero plaintext compatibility)
 * - Cryptographic Session Management (SHA-256 session token hashing)
 * - HttpOnly, Secure, SameSite Session Cookies & CSRF Protection
 * - Explicit Allowed-Origin CORS (No wildcard with credentials)
 * - Strict Role-Based Access Control (RBAC) & Campus Scope Isolation
 * - Secure First-Admin Provisioning (/api/auth/setup-admin)
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  INITIAL_COMMUNITIES 
} from './src/data/seedData.ts';
import { 
  UserProfile, 
  Community, 
  BreakPost, 
  AuditLog, 
  ChatMessage, 
  AppNotification, 
  CampusLocation,
  UserRole,
  UserApprovalStatus
} from './src/types/index.ts';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateSecureToken,
  generateCsrfToken
} from './src/utils/crypto.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// ==========================================
// 1. CORS WITH EXPLICIT ALLOWED ORIGINS & CREDENTIALS
// ==========================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '';
  const isAllowed =
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.run.app') ||
    origin.includes('localhost:') ||
    origin.includes('127.0.0.1:');

  const allowedOrigin = isAllowed ? origin : 'http://localhost:3000';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ==========================================
// 2. IN-MEMORY DATABASE WITH STRICT PARITY
// ==========================================
interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: UserApprovalStatus;
  role: UserRole;
  employeeId?: string;
  campusId?: string;
  roleTitle?: string;
  registeredAt?: string;
  approvedAt?: string;
  avatarSeed?: string;
  avatarBgColor?: string;
  bio?: string;
  icebreaker?: string;
  interests?: string[];
  dietary?: any;
  socialBattery?: any;
  passwordResetApproved?: boolean;
  mustChangePassword?: boolean;
  rejectionReason?: string;
}

let dbUsers: UserRecord[] = [];
let dbCommunities: Community[] = [...INITIAL_COMMUNITIES];
let dbDeletedCommunities: Set<string> = new Set();
let dbDeletedLocations: Set<string> = new Set();
let dbBreaks: BreakPost[] = [];
let dbAuditLogs: AuditLog[] = [];
let dbMessages: Record<string, ChatMessage[]> = {};
let dbSessions: Record<string, { userId: string; expiresAt: number; rawToken: string }> = {}; // tokenHash -> session
let dbResetRequests: any[] = [];
let dbNotifications: AppNotification[] = [];

// Cookie helpers
function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

// Session authentication middleware
async function getAuthenticatedUser(req: Request): Promise<UserRecord | null> {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const tokenDigest = await hashToken(token);
    const session = dbSessions[tokenDigest];
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      delete dbSessions[tokenDigest];
      return null;
    }

    const user = dbUsers.find((u) => u.id === session.userId);
    if (!user || user.status === 'suspended') return null;

    // CSRF verification on state-modifying requests (POST, PUT, DELETE)
    const method = req.method.toUpperCase();
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      const clientCsrf = req.headers['x-csrf-token'];
      const expectedCsrf = await generateCsrfToken(token);
      if (!clientCsrf || clientCsrf !== expectedCsrf) {
        return null; // CSRF mismatch
      }
    }

    return user;
  } catch {
    return null;
  }
}

// ==========================================
// 3. HEALTH CHECK & FIRST-ADMIN STATUS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  const hasAdmin = dbUsers.some((u) => (u.role === 'community_admin' || u.role === 'platform_admin') && u.status === 'approved');
  res.json({
    status: 'online',
    message: 'MidDay Buddy Authoritative Backend Server Active (CoreReacher Enterprises)',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    hasAdmin,
    stats: {
      usersCount: dbUsers.length,
      activeBreaksCount: dbBreaks.filter((b) => b.expiresAt > Date.now()).length,
      communitiesCount: dbCommunities.filter((c) => !dbDeletedCommunities.has(c.id)).length,
      pendingResetRequests: dbResetRequests.filter((r) => r.status === 'pending').length,
    },
  });
});

app.get('/api/auth/admin-status', (req: Request, res: Response) => {
  const hasAdmin = dbUsers.some((u) => (u.role === 'community_admin' || u.role === 'platform_admin') && u.status === 'approved');
  res.json({ hasAdmin });
});

// ==========================================
// 4. SECURE FIRST-ADMIN PROVISIONING
// ==========================================
app.post('/api/auth/setup-admin', async (req: Request, res: Response) => {
  try {
    const hasAdmin = dbUsers.some((u) => (u.role === 'community_admin' || u.role === 'platform_admin') && u.status === 'approved');
    if (hasAdmin) {
      return res.status(403).json({ error: 'Forbidden: Administrator already provisioned. Initial setup is permanently locked.' });
    }

    const { name, email, password, employeeId, campusId } = req.body;
    if (!name || !email || !password || !employeeId) {
      return res.status(400).json({ error: 'Name, email, employee ID, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Administrator password must be at least 8 characters long.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();
    const adminId = `usr_admin_${Date.now()}`;
    const nowISO = new Date().toISOString();

    const passwordHash = await hashPassword(password);

    const newAdmin: UserRecord = {
      id: adminId,
      email: trimmedEmail,
      name: name.trim(),
      employeeId: trimmedEmpId,
      campusId: campusId || 'comm_siruseri',
      roleTitle: 'Platform Administrator',
      status: 'approved',
      role: 'platform_admin',
      passwordHash,
      registeredAt: nowISO,
      approvedAt: nowISO,
    };

    dbUsers.push(newAdmin);

    const rawToken = generateSecureToken('sess');
    const tokenDigest = await hashToken(rawToken);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    dbSessions[tokenDigest] = { userId: adminId, expiresAt, rawToken };
    const csrfToken = await generateCsrfToken(rawToken);

    setSessionCookie(res, rawToken);

    // Audit log
    dbAuditLogs.unshift({
      id: `log_${Date.now()}`,
      adminId,
      adminName: name.trim(),
      action: 'PROVISION_FIRST_ADMIN',
      targetUserId: adminId,
      targetUserName: name.trim(),
      details: `Initial platform administrator provisioned: ${trimmedEmail} (${trimmedEmpId})`,
      timestamp: nowISO,
    });

    const { passwordHash: _, ...safeUser } = newAdmin;
    res.status(201).json({
      success: true,
      token: rawToken,
      csrfToken,
      user: safeUser,
      message: 'Platform administrator provisioned successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Administrator provisioning failed.' });
  }
});

// ==========================================
// 5. AUTHENTICATION (LOGIN, REGISTER, ME, LOGOUT)
// ==========================================
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email ID and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid Email ID or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by campus administration.' });
    }

    if (user.status === 'pending_approval') {
      return res.status(403).json({ error: 'Your account is pending administrator review and approval.' });
    }

    // Check if password reset was approved
    if (user.passwordResetApproved) {
      user.passwordResetApproved = false;
      user.mustChangePassword = true;

      const rawToken = generateSecureToken('sess');
      const tokenDigest = await hashToken(rawToken);
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      dbSessions[tokenDigest] = { userId: user.id, expiresAt, rawToken };

      const csrfToken = await generateCsrfToken(rawToken);
      setSessionCookie(res, rawToken);

      const { passwordHash: _, ...safeUser } = user;
      return res.json({
        token: rawToken,
        csrfToken,
        user: { ...safeUser, mustChangePassword: true },
        mustChangePassword: true,
        message: 'Password reset was approved by admin. Please choose a new password now.',
      });
    }

    // Strict PBKDF2 hash verification ONLY (No plaintext fallback)
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid Email ID or password.' });
    }

    const rawToken = generateSecureToken('sess');
    const tokenDigest = await hashToken(rawToken);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    dbSessions[tokenDigest] = { userId: user.id, expiresAt, rawToken };

    const csrfToken = await generateCsrfToken(rawToken);
    setSessionCookie(res, rawToken);

    const { passwordHash: _, ...safeUser } = user;
    res.json({
      token: rawToken,
      csrfToken,
      user: safeUser,
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } = req.body;
    const employeeId = (req.body.employeeId || req.body.employee_id || '').trim();

    if (!name || !email || !password || !employeeId) {
      return res.status(400).json({ error: 'Name, Email ID, Employee ID, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();

    // Check duplicate email
    const existingEmail = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
    if (existingEmail) {
      if (existingEmail.status === 'rejected') {
        dbUsers = dbUsers.filter((u) => u.id !== existingEmail.id);
      } else if (existingEmail.status === 'pending_approval') {
        return res.status(400).json({ error: 'An application with this Email ID is already awaiting admin approval.' });
      } else {
        return res.status(409).json({ error: 'This Email ID is already registered. Please sign in.' });
      }
    }

    // Check duplicate employee ID
    const existingEmp = dbUsers.find((u) => u.employeeId && u.employeeId.toUpperCase() === trimmedEmpId);
    if (existingEmp) {
      if (existingEmp.status === 'rejected') {
        dbUsers = dbUsers.filter((u) => u.id !== existingEmp.id);
      } else if (existingEmp.status === 'pending_approval') {
        return res.status(400).json({ error: 'An application with this Employee ID is already awaiting admin approval.' });
      } else {
        return res.status(409).json({ error: 'This Employee ID is already registered to another active account.' });
      }
    }

    const passwordHash = await hashPassword(password);
    const newUserId = `usr_${Date.now()}`;
    const nowISO = new Date().toISOString();

    const newUser: UserRecord = {
      id: newUserId,
      name: name.trim(),
      email: trimmedEmail,
      employeeId: trimmedEmpId,
      campusId: campusId || 'comm_siruseri',
      roleTitle: roleTitle?.trim() || 'Software Engineer',
      status: 'pending_approval',
      role: 'user',
      passwordHash,
      registeredAt: nowISO,
      bio: `Colleague at ${campusId || 'Workplace Campus'}.`,
      icebreaker: icebreaker?.trim() || 'Let us grab chai and exchange ideas!',
      interests: Array.isArray(interests) ? interests : ['Chai', 'Technology'],
      dietary: dietary || 'Any',
      socialBattery: 'Balanced Banter',
      avatarSeed: name.toLowerCase().replace(/\s+/g, '-'),
      avatarBgColor: 'bg-emerald-600',
    };

    dbUsers.push(newUser);

    // Notify admins
    dbNotifications.unshift({
      id: `notif_approval_${Date.now()}`,
      userId: 'all',
      title: 'New Member Waiting Approval',
      body: `${newUser.name} (Employee ID: ${trimmedEmpId}) registered. Waiting approval by admin.`,
      type: 'approval',
      isRead: false,
      read: 0,
      createdAt: nowISO,
    });

    const { passwordHash: _, ...safeUser } = newUser;
    // Strictly NO token returned for pending accounts!
    res.status(201).json({
      success: true,
      user: safeUser,
      message: 'Registration submitted successfully. Your account is pending administrator review and approval.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session.' });
  }

  const token = extractToken(req);
  const csrfToken = token ? await generateCsrfToken(token) : null;
  const { passwordHash: _, ...safeUser } = user;

  res.json({ user: safeUser, csrfToken });
});

app.post('/api/auth/logout', async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (token) {
    const tokenDigest = await hashToken(token);
    delete dbSessions[tokenDigest];
  }
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Forgot Password Request
app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email, employeeId } = req.body;
  if (!email || !employeeId) {
    return res.status(400).json({ error: 'Email ID and Employee ID are required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedEmpId = employeeId.trim().toUpperCase();

  const user = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail && u.employeeId?.toUpperCase() === trimmedEmpId);
  if (!user) {
    return res.status(404).json({ error: 'No matching account found with this Email ID and Employee ID combination.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact your campus administrator.' });
  }

  const requestId = `reset_${Date.now()}`;
  const nowISO = new Date().toISOString();

  dbResetRequests.unshift({
    id: requestId,
    userId: user.id,
    userName: user.name,
    email: user.email,
    employeeId: trimmedEmpId,
    status: 'pending',
    createdAt: nowISO,
  });

  res.json({
    success: true,
    message: 'Password reset request submitted. Awaiting approval by campus administrator.',
  });
});

// Admin: Get Reset Requests
app.get('/api/auth/reset-requests', async (req: Request, res: Response) => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser || (currentUser.role !== 'community_admin' && currentUser.role !== 'platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  if (currentUser.role === 'community_admin') {
    const campusUsers = new Set(dbUsers.filter((u) => u.campusId === currentUser.campusId).map((u) => u.id));
    return res.json(dbResetRequests.filter((r) => campusUsers.has(r.userId)));
  }

  res.json(dbResetRequests);
});

// Admin: Approve Reset Request
app.post('/api/auth/approve-reset/:id', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'community_admin' && adminUser.role !== 'platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  const { id } = req.params;
  const resetReq = dbResetRequests.find((r) => r.id === id);
  if (!resetReq) {
    return res.status(404).json({ error: 'Reset request not found.' });
  }

  const targetUser = dbUsers.find((u) => u.id === resetReq.userId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  if (adminUser.role === 'community_admin' && targetUser.campusId !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only approve requests in your campus.' });
  }

  resetReq.status = 'approved';
  resetReq.approvedAt = new Date().toISOString();
  resetReq.adminId = adminUser.id;

  targetUser.passwordResetApproved = true;
  targetUser.mustChangePassword = true;

  // Invalidate target user sessions
  for (const [key, sess] of Object.entries(dbSessions)) {
    if (sess.userId === targetUser.id) {
      delete dbSessions[key];
    }
  }

  const nowISO = new Date().toISOString();
  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'APPROVE_PASSWORD_RESET',
    targetUserId: targetUser.id,
    targetUserName: targetUser.name,
    details: `Approved password reset for ${targetUser.name} (${targetUser.email})`,
    timestamp: nowISO,
  });

  res.json({
    success: true,
    message: 'Password reset request approved.',
  });
});

// Set New Password
app.post('/api/auth/set-new-password', async (req: Request, res: Response) => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  currentUser.passwordHash = await hashPassword(newPassword);
  currentUser.mustChangePassword = false;
  currentUser.passwordResetApproved = false;

  // Invalidate sessions so user logs in cleanly
  for (const [key, sess] of Object.entries(dbSessions)) {
    if (sess.userId === currentUser.id) {
      delete dbSessions[key];
    }
  }

  clearSessionCookie(res);
  res.json({ success: true, message: 'Password updated successfully. Please sign in.' });
});

// ==========================================
// 6. COMMUNITIES & LOCATIONS (ADMIN PROTECTED)
// ==========================================
app.get('/api/communities', (req: Request, res: Response) => {
  const activeComms = dbCommunities
    .filter((c) => !dbDeletedCommunities.has(c.id))
    .map((c) => ({
      ...c,
      locations: (c.locations || []).filter((loc) => !dbDeletedLocations.has(loc.id)),
    }));
  res.json(activeComms);
});

app.post('/api/communities', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || adminUser.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: Only platform administrators can create campuses.' });
  }

  const { name, city, description } = req.body;
  if (!name || !city) {
    return res.status(400).json({ error: 'Name and city are required.' });
  }

  const id = `comm_${Date.now()}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  dbDeletedCommunities.delete(id);

  const newComm: Community = {
    id,
    slug,
    name: name.trim(),
    city: city.trim(),
    description: description?.trim() || '',
    memberCount: 0,
    activeBreaksCount: 0,
    locations: [],
  };

  dbCommunities.push(newComm);

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'ADD_COMMUNITY',
    details: `Created new campus: ${name} (${city})`,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({ success: true, community: newComm });
});

app.put('/api/communities/:id', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  const { id } = req.params;
  if (adminUser.role === 'community_admin' && adminUser.campusId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own campus.' });
  }

  const comm = dbCommunities.find((c) => c.id === id);
  if (!comm) {
    return res.status(404).json({ error: 'Campus not found.' });
  }

  const { name, city, description } = req.body;
  if (name) comm.name = name.trim();
  if (city) comm.city = city.trim();
  if (description !== undefined) comm.description = description.trim();

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'UPDATE_COMMUNITY',
    details: `Updated campus details for ${comm.name}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, community: comm });
});

app.delete('/api/communities/:id', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || adminUser.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: Only platform administrators can delete campuses.' });
  }

  const { id } = req.params;
  dbDeletedCommunities.add(id);
  dbCommunities = dbCommunities.filter((c) => c.id !== id);

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'DELETE_COMMUNITY',
    details: `Deleted campus ${id}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, deletedCommunityId: id });
});

// Campus Locations
app.post('/api/communities/:id/locations', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id } = req.params;
  if (adminUser.role === 'community_admin' && adminUser.campusId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only add spots to your assigned campus.' });
  }

  const comm = dbCommunities.find((c) => c.id === id);
  if (!comm) {
    return res.status(404).json({ error: 'Campus not found.' });
  }

  const { name, zone, description, isPopular } = req.body;
  if (!name || !zone) {
    return res.status(400).json({ error: 'Name and zone are required.' });
  }

  const locId = `loc_${Date.now()}`;
  dbDeletedLocations.delete(locId);

  const newLoc: CampusLocation = {
    id: locId,
    communityId: id,
    name: name.trim(),
    zone: zone.trim(),
    description: description?.trim() || '',
    isPopular: !!isPopular,
  };

  comm.locations.push(newLoc);

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'ADD_LOCATION',
    details: `Added spot "${name}" (${zone}) in campus ${id}`,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({ success: true, location: newLoc });
});

app.put('/api/communities/:id/locations/:locId', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id, locId } = req.params;
  if (adminUser.role === 'community_admin' && adminUser.campusId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only update spots in your assigned campus.' });
  }

  const comm = dbCommunities.find((c) => c.id === id);
  const loc = comm?.locations.find((l) => l.id === locId);
  if (!loc) {
    return res.status(404).json({ error: 'Spot not found.' });
  }

  const { name, zone, description, isPopular } = req.body;
  if (name) loc.name = name.trim();
  if (zone) loc.zone = zone.trim();
  if (description !== undefined) loc.description = description.trim();
  if (isPopular !== undefined) loc.isPopular = !!isPopular;

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'UPDATE_LOCATION',
    details: `Updated spot "${loc.name}" (${loc.zone}) in campus ${id}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, location: loc });
});

app.delete('/api/communities/:id/locations/:locId', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id, locId } = req.params;
  if (adminUser.role === 'community_admin' && adminUser.campusId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete spots in your assigned campus.' });
  }

  dbDeletedLocations.add(locId);
  const comm = dbCommunities.find((c) => c.id === id);
  if (comm) {
    comm.locations = (comm.locations || []).filter((l) => l.id !== locId);
  }

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'DELETE_LOCATION',
    details: `Deleted spot ${locId} from campus ${id}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, deletedLocationId: locId });
});

// ==========================================
// 7. USER MANAGEMENT (RBAC)
// ==========================================
app.get('/api/users', async (req: Request, res: Response) => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }

  const isAdmin = currentUser.role === 'community_admin' || currentUser.role === 'platform_admin';

  if (!isAdmin) {
    // Non-admins only see approved colleagues in their campus, with email/employeeId redacted
    const members = dbUsers
      .filter((u) => u.status === 'approved' && u.campusId === currentUser.campusId)
      .map(({ passwordHash: _, email: __, employeeId: ___, ...safe }) => safe);
    return res.json(members);
  }

  if (currentUser.role === 'community_admin') {
    const campusMembers = dbUsers
      .filter((u) => u.campusId === currentUser.campusId)
      .map(({ passwordHash: _, ...safe }) => safe);
    return res.json(campusMembers);
  }

  // platform_admin sees all
  res.json(dbUsers.map(({ passwordHash: _, ...safe }) => safe));
});

app.post('/api/users', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { name, email, employeeId, role, roleTitle, campusId, password } = req.body;
  if (!name || !email || !employeeId || !password) {
    return res.status(400).json({ error: 'Name, email, employee ID, and password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const targetCampus = campusId || adminUser.campusId || 'comm_siruseri';
  if (adminUser.role === 'community_admin' && targetCampus !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only add users to your assigned campus.' });
  }

  const assignedRole = (role === 'community_admin' && adminUser.role === 'platform_admin') ? 'community_admin' : 'user';
  const passwordHash = await hashPassword(password);
  const id = `usr_${Date.now()}`;
  const nowISO = new Date().toISOString();

  const newUser: UserRecord = {
    id,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    employeeId: employeeId.trim().toUpperCase(),
    campusId: targetCampus,
    roleTitle: roleTitle?.trim() || (assignedRole === 'community_admin' ? 'Campus Administrator' : 'Software Engineer'),
    status: 'approved',
    role: assignedRole,
    passwordHash,
    registeredAt: nowISO,
    approvedAt: nowISO,
  };

  dbUsers.push(newUser);

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'PROVISION_USER',
    targetUserId: id,
    targetUserName: name.trim(),
    details: `Directly provisioned member ${name.trim()} (${employeeId}) in campus ${targetCampus}`,
    timestamp: nowISO,
  });

  const { passwordHash: _, ...safeUser } = newUser;
  res.status(201).json({ success: true, user: safeUser });
});

const approveUserHandler = async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id } = req.params;
  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (adminUser.role === 'community_admin' && user.campusId !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only approve applicants in your designated campus.' });
  }

  user.status = 'approved';
  user.approvedAt = new Date().toISOString();

  const nowISO = new Date().toISOString();
  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'APPROVE_USER',
    targetUserId: id,
    targetUserName: user.name,
    details: `Approved membership application for ${user.name} (${user.email})`,
    timestamp: nowISO,
  };
  dbAuditLogs.unshift(log);

  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser, log });
};
app.post('/api/users/:id/approve', approveUserHandler);
app.put('/api/users/:id/approve', approveUserHandler);

app.post('/api/users/:id/reject', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id } = req.params;
  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (adminUser.role === 'community_admin' && user.campusId !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only reject applicants in your designated campus.' });
  }

  dbUsers = dbUsers.filter((u) => u.id !== id);
  dbResetRequests = dbResetRequests.filter((r) => r.userId !== id);

  const nowISO = new Date().toISOString();
  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'REJECT_USER',
    targetUserId: id,
    targetUserName: user.name,
    details: `Rejected and cleaned application for ${user.name} (${user.email})`,
    timestamp: nowISO,
  };
  dbAuditLogs.unshift(log);

  res.json({ success: true, log });
});

app.put('/api/users/:id/role', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || adminUser.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: Only platform administrators can change roles.' });
  }

  const { id } = req.params;
  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { role } = req.body;
  const newRole = role === 'community_admin' ? 'community_admin' : 'user';

  user.role = newRole;
  user.roleTitle = newRole === 'community_admin' ? 'Campus Administrator' : 'Software Engineer';

  const nowISO = new Date().toISOString();
  const actionText = newRole === 'community_admin' ? 'Promoted to Campus Admin' : 'Revoked Campus Admin rights';

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'CHANGE_ROLE',
    targetUserId: id,
    targetUserName: user.name,
    details: `${actionText} for ${user.name}`,
    timestamp: nowISO,
  };
  dbAuditLogs.unshift(log);

  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser, log });
});

app.put('/api/users/:id/toggle-status', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id } = req.params;
  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (adminUser.role === 'community_admin' && user.campusId !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only moderate members in your campus.' });
  }

  user.status = user.status === 'suspended' ? 'approved' : 'suspended';

  if (user.status === 'suspended') {
    for (const [key, sess] of Object.entries(dbSessions)) {
      if (sess.userId === user.id) {
        delete dbSessions[key];
      }
    }
  }

  const nowISO = new Date().toISOString();
  const actionText = user.status === 'suspended' ? 'Suspended member access' : 'Reactivated member access';

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'TOGGLE_STATUS',
    targetUserId: id,
    targetUserName: user.name,
    details: `${actionText} for ${user.name}`,
    timestamp: nowISO,
  };
  dbAuditLogs.unshift(log);

  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser, log });
});

app.delete('/api/users/:id', async (req: Request, res: Response) => {
  const adminUser = await getAuthenticatedUser(req);
  if (!adminUser || (adminUser.role !== 'platform_admin' && adminUser.role !== 'community_admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }

  const { id } = req.params;
  if (id === adminUser.id) {
    return res.status(403).json({ error: 'Forbidden: You cannot delete your own administrator account.' });
  }

  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (adminUser.role === 'community_admin' && user.campusId !== adminUser.campusId) {
    return res.status(403).json({ error: 'Forbidden: You can only delete members in your campus.' });
  }

  dbUsers = dbUsers.filter((u) => u.id !== id);
  for (const [key, sess] of Object.entries(dbSessions)) {
    if (sess.userId === id) {
      delete dbSessions[key];
    }
  }

  const nowISO = new Date().toISOString();
  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name,
    action: 'DELETE_USER',
    targetUserId: id,
    targetUserName: user.name,
    details: `Deleted member account ${user.name} (${user.email})`,
    timestamp: nowISO,
  };
  dbAuditLogs.unshift(log);

  res.json({ success: true, log });
});

// ==========================================
// 8. BREAK BROADCASTS & CHAT (MEMBERSHIP & CAMPUS GATED)
// ==========================================
app.get('/api/breaks', (req: Request, res: Response) => {
  const { communityId, breakType } = req.query;
  const now = Date.now();
  let list = dbBreaks.filter((b) => b.expiresAt > now);

  if (communityId) {
    list = list.filter((b) => b.communityId === communityId);
  }
  if (breakType && breakType !== 'all') {
    list = list.filter((b) => b.breakType === breakType);
  }

  res.json(list);
});

app.post('/api/breaks', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user || user.status !== 'approved') {
    return res.status(403).json({ error: 'Forbidden: Only verified and approved members can broadcast breaks.' });
  }

  const { breakType, zone, locationName, customNote, durationMinutes, communityId } = req.body;
  const id = `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();
  const duration = Math.min(Math.max(parseInt(durationMinutes, 10) || 15, 5), 60);

  const newPost: BreakPost = {
    id,
    userId: user.id, // Strictly derived from session!
    userName: user.name,
    userRole: user.roleTitle || 'Software Engineer',
    userAvatarSeed: user.avatarSeed || user.name,
    userAvatarBg: user.avatarBgColor || 'bg-amber-500',
    communityId: communityId || user.campusId || 'comm_siruseri',
    breakType: ['tea', 'lunch', 'walk', 'sports'].includes(breakType) ? breakType : 'tea',
    status: 'free_now',
    timeLabel: 'Free Right Now',
    zone: zone || 'Central Spine',
    locationName: locationName || 'Central Spine Kiosk',
    customNote: customNote || '',
    durationMinutes: duration,
    interests: user.interests || ['Chai'],
    icebreaker: user.icebreaker || 'Connecting over a quick break!',
    expiresAt: now + duration * 60 * 1000,
    createdAt: now,
  };

  dbBreaks.unshift(newPost);
  res.status(201).json(newPost);
});

app.post('/api/breaks/:id/extend', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const post = dbBreaks.find((b) => b.id === id);
  if (!post) return res.status(404).json({ error: 'Break not found.' });

  if (post.userId !== user.id && user.role !== 'community_admin' && user.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: You can only extend your own breaks.' });
  }

  post.expiresAt += 10 * 60 * 1000;
  post.durationMinutes += 10;
  res.json({ success: true, post });
});

app.post('/api/breaks/:id/complete', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const post = dbBreaks.find((b) => b.id === id);
  if (!post) return res.status(404).json({ error: 'Break not found.' });

  if (post.userId !== user.id && user.role !== 'community_admin' && user.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: You can only complete your own breaks.' });
  }

  post.expiresAt = Date.now();
  res.json({ success: true, completedBreakId: id });
});

// Chat Endpoints
app.get('/api/chat/:conversationId', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user || user.status !== 'approved') {
    return res.status(401).json({ error: 'Unauthorized: Verified login required.' });
  }

  const { conversationId } = req.params;
  if (conversationId !== 'general') {
    const post = dbBreaks.find((b) => b.id === conversationId);
    if (!post) {
      return res.status(404).json({ error: 'Break conversation not found.' });
    }
    if (user.role !== 'platform_admin' && user.campusId !== post.communityId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access conversations outside your registered campus.' });
    }
  }

  res.json(dbMessages[conversationId] || []);
});

app.post('/api/chat/:conversationId', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user || user.status !== 'approved') {
    return res.status(401).json({ error: 'Unauthorized: Verified login required.' });
  }

  const { conversationId } = req.params;
  if (conversationId !== 'general') {
    const post = dbBreaks.find((b) => b.id === conversationId);
    if (!post) {
      return res.status(404).json({ error: 'Break conversation not found.' });
    }
    if (user.role !== 'platform_admin' && user.campusId !== post.communityId) {
      return res.status(403).json({ error: 'Forbidden: You cannot send messages outside your registered campus.' });
    }
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  const msg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    conversationId,
    senderId: user.id, // Strictly derived from session!
    senderName: user.name,
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };

  if (!dbMessages[conversationId]) {
    dbMessages[conversationId] = [];
  }
  dbMessages[conversationId].push(msg);

  res.status(201).json(msg);
});

// Notifications
app.get('/api/notifications', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const userNotifs = dbNotifications.filter((n) => n.userId === user.id || n.userId === 'all');
  res.json(userNotifs);
});

app.post('/api/notifications/mark-read', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const { id } = req.body;
  dbNotifications.forEach((n) => {
    if ((n.userId === user.id || n.userId === 'all') && (!id || n.id === id)) {
      n.isRead = true;
      n.read = 1;
    }
  });

  res.json({ success: true });
});

// Audit Logs
app.get('/api/audit-logs', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user || (user.role !== 'community_admin' && user.role !== 'platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  if (user.role === 'community_admin') {
    const campus = user.campusId || '';
    return res.json(dbAuditLogs.filter((l) => (campus && l.details.includes(campus)) || l.adminId === user.id));
  }

  res.json(dbAuditLogs);
});

// Catch-all 404 for unhandled API routes
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    timestamp: Date.now(),
  });
});

// ==========================================
// 9. DEV & PRODUCTION SERVER MOUNT
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MidDay Buddy authoritative backend server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
