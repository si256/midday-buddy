import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabase, MidDayDatabase } from './src/server/database.ts';
import { UserProfile, UserRole } from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthedRequest extends Request {
  authUser?: UserProfile;
  authToken?: string;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export function createApp(db: MidDayDatabase) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Production security headers (iframe-compatible for embedded previews)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Helper: extract Bearer token
  function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return null;
  }

  // Middleware: require valid persistent session token
  async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
      }
      const user = await db.getSessionUser(token);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session token.' });
      }
      req.authUser = user;
      req.authToken = token;
      next();
    } catch (err) {
      console.error('Auth middleware error:', err);
      return res.status(500).json({ error: 'Authentication verification failed.' });
    }
  }

  // Middleware: require administrator role
  function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }
    if (user.status !== 'approved') {
      return res.status(403).json({ error: 'Forbidden: Account is not active.' });
    }
    if (user.role !== 'community_admin' && user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    }
    next();
  }

  function hasCampusScope(admin: UserProfile, targetCampusId?: string): boolean {
    if (admin.role === 'platform_admin') return true;
    if (!targetCampusId) return true;
    return admin.campusId === targetCampusId;
  }

  // ==========================================
  // 1. HEALTH CHECK & STATUS
  // ==========================================
  app.get('/api/health', (_req: Request, res: Response) => {
    try {
      const stats = db.getHealthStats();
      res.json({
        status: 'online',
        message: 'MidDay Buddy Production API Server (Persistent SQLite WAL)',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        stats,
      });
    } catch (err) {
      console.error('Health check error:', err);
      res.status(503).json({ status: 'degraded', error: 'Database unavailable' });
    }
  });

  // ==========================================
  // 2. AUTHENTICATION & PASSWORD MANAGEMENT
  // ==========================================
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email ID is required.' });
      }

      const trimmedEmail = email.trim().toLowerCase();
      const userRecord = db.getUserByEmailWithAuth(trimmedEmail);

      if (!userRecord) {
        return res.status(401).json({ error: 'Invalid Email ID or password.' });
      }

      if (userRecord.status === 'suspended') {
        return res
          .status(403)
          .json({ error: 'Your account has been suspended. Please contact your campus admin.' });
      }

      // One-time admin-approved passwordless login for forced password reset
      if (userRecord.passwordResetApproved) {
        db.consumePasswordResetApproval(userRecord.id);
        const token = await db.createSession(userRecord.id);
        const freshUser = db.getUserById(userRecord.id)!;
        return res.json({
          token,
          user: freshUser,
          mustChangePassword: true,
          message: 'Password reset was approved by admin. Please choose a new password now.',
        });
      }

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required.' });
      }

      const verified = await db.verifyUserCredentials(trimmedEmail, password);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid Email ID or password.' });
      }

      const token = await db.createSession(verified.id);
      const safeUser = db.getUserById(verified.id)!;

      res.json({
        token,
        user: safeUser,
        mustChangePassword: Boolean(safeUser.mustChangePassword),
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Authentication service error. Please try again.' });
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } =
        req.body || {};
      const employeeId = (req.body?.employeeId || req.body?.employee_id || '').trim();

      if (!name || !email || !password || !employeeId) {
        return res
          .status(400)
          .json({ error: 'Name, Email ID, Employee ID, and password are required.' });
      }
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      const newUser = await db.registerUser({
        name,
        email,
        password,
        employeeId,
        campusId,
        roleTitle,
        interests,
        dietary,
        icebreaker,
      });

      const token = await db.createSession(newUser.id);

      db.createNotification({
        userId: 'admin',
        title: 'New Member Waiting Approval',
        body: `${newUser.name} (Employee ID: ${newUser.employeeId}, ${newUser.email}) registered. Waiting approval by admin.`,
        type: 'approval',
        referenceId: newUser.id,
      });

      res.status(201).json({
        token,
        user: newUser,
        message: 'Account created. Waiting approval by admin.',
      });
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status >= 500) {
        console.error('Register error:', err);
      }
      res.status(status).json({ error: err?.message || 'Registration failed.' });
    }
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    try {
      const { email, employeeId } = req.body || {};
      if (!email || !employeeId) {
        return res.status(400).json({ error: 'Email ID and Employee ID are required.' });
      }

      const trimmedEmail = String(email).trim().toLowerCase();
      const trimmedEmpId = String(employeeId).trim().toUpperCase();

      const user = db.getUserByEmailWithAuth(trimmedEmail);
      if (!user) {
        return res.status(404).json({ error: 'No account registered with this Email ID.' });
      }
      if (user.employeeId && user.employeeId.toUpperCase() !== trimmedEmpId) {
        return res
          .status(400)
          .json({ error: 'Employee ID does not match records for this Email ID.' });
      }

      const resetReq = db.createResetRequest(user, trimmedEmpId);

      db.createNotification({
        userId: 'admin',
        title: 'Password Reset Request',
        body: `${user.name} (Employee ID: ${trimmedEmpId}) requested password reset. Waiting approval by admin.`,
        type: 'approval',
        referenceId: resetReq.id,
      });

      res.json({
        success: true,
        message: 'Password reset request submitted. Waiting approval by admin.',
        requestId: resetReq.id,
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to submit password reset request.' });
    }
  });

  app.get('/api/auth/reset-requests', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response) => {
    try {
      res.json(db.listResetRequests());
    } catch (err) {
      console.error('List reset requests error:', err);
      res.status(500).json({ error: 'Failed to load password reset requests.' });
    }
  });

  app.post('/api/auth/approve-reset/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      const approved = db.approveResetRequest(id, admin.id);
      if (!approved) {
        return res.status(404).json({ error: 'Reset request not found.' });
      }

      db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'APPROVE_PASSWORD_RESET',
        targetUserId: approved.userId,
        targetUserName: approved.userName,
        details: `Approved password reset for ${approved.userName} (Employee ID: ${approved.employeeId}). Existing sessions revoked.`,
      });

      res.json({
        success: true,
        message:
          'Password reset approved by admin. User can now sign in without password to set a new password.',
      });
    } catch (err) {
      console.error('Approve reset error:', err);
      res.status(500).json({ error: 'Failed to approve password reset.' });
    }
  });

  app.post('/api/auth/set-new-password', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId, newPassword } = req.body || {};
      const actor = req.authUser!;
      const targetUserId = userId || actor.id;

      // Only the authenticated user themselves (or a platform_admin) can change this password
      if (targetUserId !== actor.id && actor.role !== 'platform_admin') {
        return res.status(403).json({ error: 'Forbidden: You can only update your own password.' });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      const updated = await db.setUserPassword(targetUserId, newPassword);
      if (!updated) {
        return res.status(404).json({ error: 'User not found.' });
      }

      db.createAuditLog({
        adminId: actor.id,
        adminName: actor.name,
        action: 'REINSTATE_USER',
        targetUserId: updated.id,
        targetUserName: updated.name,
        details: `Password updated for ${updated.name}. All active sessions invalidated.`,
      });

      res.json({
        success: true,
        message: 'Password changed successfully! Please log in again with your new password.',
      });
    } catch (err) {
      console.error('Set new password error:', err);
      res.status(500).json({ error: 'Failed to update password.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const token = extractToken(req);
      if (token) {
        await db.revokeSession(token);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Logout error:', err);
      res.json({ success: true });
    }
  });

  app.get('/api/auth/admin-status', (_req: Request, res: Response) => {
    try {
      res.json({ hasAdmin: db.hasAdmin() });
    } catch (err) {
      console.error('Admin status error:', err);
      res.status(500).json({ error: 'Failed to check administrator status.' });
    }
  });

  app.post('/api/auth/setup-first-admin', async (req: Request, res: Response) => {
    try {
      const { name, email, employeeId, password, campusId } = req.body || {};
      if (!name || !email || !employeeId || !password) {
        return res
          .status(400)
          .json({ error: 'Name, email, employee ID, and password are required.' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res
          .status(400)
          .json({ error: 'Administrator password must be at least 8 characters long.' });
      }

      const adminUser = await db.setupFirstAdmin({
        name,
        email,
        employeeId,
        password,
        campusId,
      });

      const token = await db.createSession(adminUser.id);
      res.status(201).json({ token, user: adminUser });
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status >= 500) console.error('Setup first admin error:', err);
      res.status(status).json({ error: err?.message || 'Administrator setup failed.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      const { currentPassword, newPassword } = req.body || {};

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: 'Current password and new password are required.' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'New password must be at least 6 characters long.' });
      }

      const verified = await db.verifyUserCredentials(actor.email, String(currentPassword));
      if (!verified) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      await db.setUserPassword(actor.id, newPassword);
      // Issue fresh session token for the active user after invalidating old sessions
      const newToken = await db.createSession(actor.id);

      res.json({
        success: true,
        token: newToken,
        message: 'Password updated successfully.',
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Failed to update password.' });
    }
  });

  // ==========================================
  // 3. COMMUNITIES & CAMPUS LOCATIONS
  // ==========================================
  app.get('/api/communities', (_req: Request, res: Response) => {
    try {
      res.json(db.listCommunities());
    } catch (err) {
      console.error('List communities error:', err);
      res.status(500).json({ error: 'Failed to load communities.' });
    }
  });

  app.post('/api/communities', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const { name, city, description } = req.body || {};
      const admin = req.authUser!;

      if (!name || !city) {
        return res.status(400).json({ error: 'Name and city are required.' });
      }

      const community = db.createCommunity({ name, city, description });

      db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'ADD_COMMUNITY',
        details: `Added new campus: ${community.name} (${community.city})`,
      });

      res.status(201).json({ success: true, community });
    } catch (err) {
      console.error('Create community error:', err);
      res.status(500).json({ error: 'Failed to create campus.' });
    }
  });

  app.put('/api/communities/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { name, city, description } = req.body || {};
      const admin = req.authUser!;

      if (!hasCampusScope(admin, id)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
      }

      const community = db.updateCommunity(id, { name, city, description });
      if (!community) {
        return res.status(404).json({ error: 'Community not found.' });
      }

      db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'UPDATE_COMMUNITY',
        details: `Updated campus info for ${community.name}`,
      });

      res.json({ success: true, community });
    } catch (err) {
      console.error('Update community error:', err);
      res.status(500).json({ error: 'Failed to update campus.' });
    }
  });

  app.delete('/api/communities/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      if (!hasCampusScope(admin, id)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
      }

      const removed = db.deleteCommunity(id);

      db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'DELETE_COMMUNITY',
        details: `Deleted campus ${removed?.name || id}`,
      });

      res.json({ success: true, deletedCommunityId: id });
    } catch (err) {
      console.error('Delete community error:', err);
      res.status(500).json({ error: 'Failed to delete campus.' });
    }
  });

  app.post(
    '/api/communities/:id/locations',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { id: locId, name, zone, description, isPopular } = req.body || {};
        const admin = req.authUser!;

        if (!hasCampusScope(admin, id)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
        }

        if (!name || !zone) {
          return res.status(400).json({ error: 'Name and zone are required.' });
        }

        const result = db.addLocation(id, { id: locId, name, zone, description, isPopular });
        if (!result) {
          return res.status(404).json({ error: 'Community not found.' });
        }

        db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'ADD_LOCATION',
          details: `Added new landmark "${result.location.name}" in ${result.location.zone}`,
        });

        res.status(201).json({ success: true, ...result });
      } catch (err) {
        console.error('Add location error:', err);
        res.status(500).json({ error: 'Failed to add location spot.' });
      }
    }
  );

  app.put(
    '/api/communities/:id/locations/:locId',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const locId = String(req.params.locId);
        const { name, zone, description, isPopular } = req.body || {};
        const admin = req.authUser!;

        if (!hasCampusScope(admin, id)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
        }

        const result = db.updateLocation(id, locId, { name, zone, description, isPopular });
        if (!result) {
          return res.status(404).json({ error: 'Location spot not found.' });
        }

        db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'UPDATE_LOCATION',
          details: `Updated spot "${result.location.name}" (${result.location.zone}) in ${result.community.name}`,
        });

        res.json({ success: true, ...result });
      } catch (err) {
        console.error('Update location error:', err);
        res.status(500).json({ error: 'Failed to update location spot.' });
      }
    }
  );

  app.delete(
    '/api/communities/:id/locations/:locId',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const locId = String(req.params.locId);
        const admin = req.authUser!;

        if (!hasCampusScope(admin, id)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
        }

        const result = db.deleteLocation(id, locId);
        if (!result) {
          return res.status(404).json({ error: 'Community not found.' });
        }

        db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'DELETE_LOCATION',
          details: `Deleted spot "${result.deletedName}" from ${result.community.name}`,
        });

        res.json({ success: true, deletedLocationId: locId, community: result.community });
      } catch (err) {
        console.error('Delete location error:', err);
        res.status(500).json({ error: 'Failed to delete location spot.' });
      }
    }
  );

  // ==========================================
  // 4. BREAKS (DIRECTORY, BROADCAST, EXTEND, COMPLETE)
  // ==========================================
  app.get('/api/breaks', (req: Request, res: Response) => {
    try {
      const { communityId, breakType, zone, activeNow } = req.query;
      const breaks = db.listBreaks({
        communityId: typeof communityId === 'string' ? communityId : undefined,
        breakType: typeof breakType === 'string' ? breakType : undefined,
        zone: typeof zone === 'string' ? zone : undefined,
        activeNow: activeNow === 'true',
      });
      res.json(breaks);
    } catch (err) {
      console.error('List breaks error:', err);
      res.status(500).json({ error: 'Failed to load breaks.' });
    }
  });

  app.post('/api/breaks', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      if (actor.status !== 'approved') {
        return res.status(403).json({ error: 'User must be approved by admin to post breaks.' });
      }

      const { communityId, breakType, durationMinutes, locationName, zone, customNote } =
        req.body || {};

      if (!locationName || !zone) {
        return res.status(400).json({ error: 'Location name and zone are required.' });
      }

      const targetCommId = communityId || actor.campusId;
      const comm = db.getCommunityById(targetCommId);
      if (!comm) {
        return res.status(400).json({ error: 'Selected campus community does not exist.' });
      }

      const newPost = db.createBreak({
        userId: actor.id,
        communityId: targetCommId,
        breakType: breakType || 'tea',
        durationMinutes: Number(durationMinutes) || 15,
        locationName,
        zone,
        customNote,
      });

      db.createNotification({
        userId: 'all',
        title: `${actor.name} is on a ${newPost.breakType.toUpperCase()} break!`,
        body: `Meeting at ${newPost.locationName} (${newPost.zone}).${newPost.customNote ? ` "${newPost.customNote}"` : ''}`,
        type: 'ping',
        referenceId: newPost.id,
      });

      res.status(201).json(newPost);
    } catch (err) {
      console.error('Create break error:', err);
      res.status(500).json({ error: 'Failed to broadcast break.' });
    }
  });

  app.post('/api/breaks/:id/extend', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const existing = db.getBreakById(id);

      if (!existing) {
        return res.status(404).json({ error: 'Break not found.' });
      }

      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      if (existing.userId !== actor.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only extend your own break.' });
      }

      const post = db.extendBreak(id, 10);
      res.json({ success: true, post });
    } catch (err) {
      console.error('Extend break error:', err);
      res.status(500).json({ error: 'Failed to extend break.' });
    }
  });

  app.post('/api/breaks/:id/complete', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const existing = db.getBreakById(id);

      if (!existing) {
        return res.status(404).json({ error: 'Break not found.' });
      }

      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      if (existing.userId !== actor.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only complete your own break.' });
      }

      const post = db.completeBreak(id);
      res.json({ success: true, post });
    } catch (err) {
      console.error('Complete break error:', err);
      res.status(500).json({ error: 'Failed to complete break.' });
    }
  });

  // ==========================================
  // 5. USERS & ADMIN USER MANAGEMENT
  // ==========================================
  app.get('/api/users', async (req: AuthedRequest, res: Response) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.json([]);
      }
      const actor = await db.getSessionUser(token);
      if (!actor) {
        return res.json([]);
      }

      const users = db.listUsers();
      if (actor.role === 'platform_admin') {
        return res.json(users);
      }
      if (actor.role === 'community_admin') {
        return res.json(users.filter((u) => u.campusId === actor.campusId || u.id === actor.id));
      }

      // Approved regular member: return only approved members without private metadata
      const safeMembers = users
        .filter((u) => u.status === 'approved' || u.id === actor.id)
        .map((u) => ({
          ...u,
          email: u.id === actor.id ? u.email : '',
          employeeId: u.id === actor.id ? u.employeeId : undefined,
        }));
      res.json(safeMembers);
    } catch (err) {
      console.error('List users error:', err);
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });

  app.get('/api/users/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const user = db.getUserById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      res.json(user);
    } catch (err) {
      console.error('Get user error:', err);
      res.status(500).json({ error: 'Failed to fetch user.' });
    }
  });

  app.post('/api/users', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, email, employeeId, role, roleTitle, campusId, password } = req.body || {};
      const admin = req.authUser!;

      if (!name || !email || !employeeId) {
        return res.status(400).json({ error: 'Name, email, and employee ID are required.' });
      }

      const targetCampusId = campusId || admin.campusId || 'comm_siruseri';
      if (!hasCampusScope(admin, targetCampusId)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: You cannot add users to another campus.' });
      }

      const { user, updated } = await db.upsertAdminCreatedUser({
        name,
        email,
        employeeId,
        role,
        roleTitle,
        campusId: targetCampusId,
        password,
      });

      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: updated ? 'ADD_MEMBER' : 'CREATE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: updated
          ? `Admin verified and configured account for ${user.name} (Emp ID: ${user.employeeId})`
          : `Directly registered ${user.role === 'user' ? 'Member' : 'Campus Admin'} ${user.name}`,
      });

      res.status(updated ? 200 : 201).json({ success: true, user, log });
    } catch (err) {
      console.error('Create user error:', err);
      res.status(500).json({ error: 'Failed to create user.' });
    }
  });

  app.put('/api/users/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';

      if (actor.id !== id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
      }

      const { name, roleTitle, bio, icebreaker, interests, dietary, socialBattery } =
        req.body || {};

      const updated = db.updateUserProfile(id, {
        name,
        roleTitle,
        bio,
        icebreaker,
        interests,
        dietary,
        socialBattery,
      });

      if (!updated) {
        return res.status(404).json({ error: 'User not found.' });
      }

      res.json({ success: true, user: updated });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.post('/api/users/:id/approve', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;
      const target = db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const user = db.approveUser(id)!;

      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'APPROVE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `Approved membership for ${user.name} (${user.email}).`,
      });

      db.createNotification({
        userId: user.id,
        title: 'Account Approved!',
        body: 'Your campus break directory access is approved. You can now broadcast breaks!',
        type: 'approval',
      });

      res.json({ success: true, user, log });
    } catch (err) {
      console.error('Approve user error:', err);
      res.status(500).json({ error: 'Failed to approve user.' });
    }
  });

  app.post('/api/users/:id/reject', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { reason } = req.body || {};
      const admin = req.authUser!;
      const target = db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const rejectedUser = db.rejectUser(id)!;

      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'REJECT_USER',
        targetUserId: rejectedUser.id,
        targetUserName: rejectedUser.name,
        details: `Rejected registration for ${rejectedUser.name}. Reason: ${reason || 'Invalid campus credentials'}`,
      });

      res.json({ success: true, rejectedUserId: id, log });
    } catch (err) {
      console.error('Reject user error:', err);
      res.status(500).json({ error: 'Failed to reject user.' });
    }
  });

  app.post('/api/users/:id/toggle-status', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;
      const target = db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (target.id === 'usr_admin') {
        return res.status(403).json({ error: 'Master Administrator cannot be suspended.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const user = db.toggleUserStatus(id)!;

      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: user.status === 'suspended' ? 'SUSPEND_USER' : 'REINSTATE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `${user.status === 'suspended' ? 'Suspended' : 'Reactivated'} account access for ${user.name}.`,
      });

      res.json({ success: true, user, log });
    } catch (err) {
      console.error('Toggle user status error:', err);
      res.status(500).json({ error: 'Failed to update user status.' });
    }
  });

  app.post('/api/users/:id/role', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { role } = req.body || {};
      const admin = req.authUser!;
      const target = db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const newRole: UserRole = role === 'community_admin' ? 'community_admin' : 'user';
      if ((id === 'usr_admin' || id === 'admin') && newRole !== 'community_admin') {
        return res.status(403).json({ error: 'Master Administrator role cannot be revoked.' });
      }

      const user = db.updateUserRole(id, newRole)!;

      const actionText =
        newRole === 'community_admin'
          ? 'Promoted to Campus Admin'
          : 'Revoked Campus Admin rights';
      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'CHANGE_ROLE',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `${actionText} for ${user.name}`,
      });

      res.json({ success: true, user, log });
    } catch (err) {
      console.error('Change role error:', err);
      res.status(500).json({ error: 'Failed to update user role.' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      if (id === 'usr_admin' || id === 'admin') {
        return res.status(403).json({ error: 'Master Administrator account cannot be deleted.' });
      }

      const target = db.getUserById(id);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const deletedUser = db.deleteUser(id)!;

      const log = db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'DELETE_USER',
        targetUserId: deletedUser.id,
        targetUserName: deletedUser.name,
        details: `Deleted user account for ${deletedUser.name}`,
      });

      res.json({ success: true, deletedUserId: id, log });
    } catch (err) {
      console.error('Delete user error:', err);
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  });

  // ==========================================
  // 6. CHAT CONVERSATIONS & MESSAGES
  // ==========================================
  app.get('/api/chat/:conversationId', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      if (actor.status !== 'approved') {
        return res.status(403).json({ error: 'Approved account required to access chat.' });
      }
      const conversationId = String(req.params.conversationId);
      res.json(db.listMessages(conversationId));
    } catch (err) {
      console.error('List messages error:', err);
      res.status(500).json({ error: 'Failed to load messages.' });
    }
  });

  app.post('/api/chat/:conversationId', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      if (actor.status !== 'approved') {
        return res.status(403).json({ error: 'Approved account required to send messages.' });
      }

      const conversationId = String(req.params.conversationId);
      const { text, isSystem } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Message text is required.' });
      }

      const newMsg = db.createMessage({
        conversationId,
        senderId: isSystem ? 'system' : actor.id,
        senderName: isSystem ? 'MidDay Buddy' : actor.name,
        text: text.trim(),
        isSystem: Boolean(isSystem),
      });

      res.status(201).json(newMsg);
    } catch (err) {
      console.error('Send message error:', err);
      res.status(500).json({ error: 'Failed to send message.' });
    }
  });

  // ==========================================
  // 7. NOTIFICATIONS & AUDIT LOGS
  // ==========================================
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      res.json(db.listNotifications(actor.id, isAdmin));
    } catch (err) {
      console.error('List notifications error:', err);
      res.status(500).json({ error: 'Failed to load notifications.' });
    }
  });

  app.post('/api/notifications/mark-read', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      db.markNotificationsRead(actor.id, isAdmin);
      res.json({ success: true });
    } catch (err) {
      console.error('Mark notifications read error:', err);
      res.status(500).json({ error: 'Failed to mark notifications read.' });
    }
  });

  app.get('/api/audit-logs', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response) => {
    try {
      res.json(db.listAuditLogs());
    } catch (err) {
      console.error('List audit logs error:', err);
      res.status(500).json({ error: 'Failed to load audit logs.' });
    }
  });

  // Explicit 404 handler for unhandled API routes
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path,
      timestamp: Date.now(),
    });
  });

  return app;
}

// ==========================================
// 8. SERVER STARTUP & GRACEFUL SHUTDOWN
// ==========================================
async function startServer() {
  const db = createDatabase();
  await db.bootstrapInitialData();
  db.cleanupExpiredSessions();

  const app = createApp(db);
  const httpServer = http.createServer(app);
  let viteServer: { close: () => Promise<void> } | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `MidDay Buddy production server listening on http://0.0.0.0:${PORT} (DB: ${db.storagePath})`
    );
  });

  const shutdown = () => {
    server.close(async () => {
      if (viteServer) {
        await viteServer.close().catch(() => {});
      }
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Only start listening when executed directly as entry point
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
