import express, { Request, Response, NextFunction, Router } from 'express';
import {
  DatabaseNotConfiguredError,
  MidDayDatabase,
} from './database.ts';
import { UserProfile, UserRole } from '../types/index.ts';
import { sanitizeCommunityForClient, sanitizeUserForClient } from '../utils/onboarding.ts';

export interface AuthedRequest extends Request {
  authUser?: UserProfile;
  authToken?: string;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function hasCampusScope(admin: UserProfile, targetCampusId?: string): boolean {
  if (admin.role === 'platform_admin') return true;
  if (!targetCampusId) return true;
  return admin.campusId === targetCampusId;
}

function handleApiError(res: Response, err: any, fallbackMessage: string, context: string) {
  if (err instanceof DatabaseNotConfiguredError || err?.code === 'DB_NOT_CONFIGURED') {
    return res.status(503).json({
      error: err.message,
      code: 'DB_NOT_CONFIGURED',
    });
  }

  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (statusCode >= 500) {
    console.error(`${context}:`, err);
    return res.status(statusCode).json({ error: fallbackMessage });
  }

  return res.status(statusCode).json({ error: err?.message || fallbackMessage });
}

/**
 * Clean Backend REST API Router (mounted under /api).
 * All routes are server-authoritative and backed strictly by PostgreSQL (Supabase or self-managed).
 */
export function createApiRouter(db: MidDayDatabase): Router {
  const router = express.Router();

  // Middleware: require valid persistent PostgreSQL session token
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
      return handleApiError(res, err, 'Authentication verification failed.', 'Auth middleware error');
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

  // ==========================================
  // 1. HEALTH CHECK & STATUS
  // ==========================================
  router.get('/health', async (_req: Request, res: Response) => {
    if (!db.isConfigured()) {
      return res.status(503).json({
        status: 'unconfigured',
        engine: 'postgresql',
        message:
          'PostgreSQL database is not configured. Set DATABASE_URL (Supabase or self-managed PostgreSQL) in server environment variables.',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
      });
    }

    try {
      const stats = await db.getHealthStats();
      res.json({
        status: 'online',
        message:
          stats.provider === 'supabase'
            ? 'MidDay Buddy Backend API (Supabase Managed PostgreSQL)'
            : 'MidDay Buddy Backend API (Self-Managed PostgreSQL)',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        stats,
      });
    } catch (err) {
      console.error('Health check error:', err);
      res.status(503).json({
        status: 'degraded',
        engine: 'postgresql',
        error: 'PostgreSQL database is currently unreachable.',
        timestamp: Date.now(),
      });
    }
  });

  // ==========================================
  // 2. AUTHENTICATION & PASSWORD MANAGEMENT
  // ==========================================
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email ID is required.' });
      }

      const trimmedEmail = email.trim().toLowerCase();
      const userRecord = await db.getUserByEmailWithAuth(trimmedEmail);

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
        await db.consumePasswordResetApproval(userRecord.id);
        const token = await db.createSession(userRecord.id);
        const freshUser = (await db.getUserById(userRecord.id))!;
        return res.json({
          token,
          user: sanitizeUserForClient(freshUser),
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
      const safeUser = (await db.getUserById(verified.id))!;

      res.json({
        token,
        user: sanitizeUserForClient(safeUser),
        mustChangePassword: Boolean(safeUser.mustChangePassword),
      });
    } catch (err) {
      return handleApiError(res, err, 'Authentication service error. Please try again.', 'Login error');
    }
  });

  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        password,
        campusId,
        communityId,
        roleTitle,
        interests,
        dietary,
        icebreaker,
        inviteCode,
      } = req.body || {};
      const employeeId = String(req.body?.employeeId || req.body?.employee_id || '').trim();

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
        campusId: campusId || communityId,
        roleTitle,
        interests,
        dietary,
        icebreaker,
        inviteCode,
      });

      const isAutoApproved = newUser.status === 'approved';
      const token = isAutoApproved ? await db.createSession(newUser.id) : null;

      await db.createNotification({
        userId: 'admin',
        title: isAutoApproved ? 'New Verified Member Joined' : 'New Member Waiting Approval',
        body: isAutoApproved
          ? `${newUser.name} (Employee ID: ${newUser.employeeId}, ${newUser.email}) joined via verified domain/invite code.`
          : `${newUser.name} (Employee ID: ${newUser.employeeId}, ${newUser.email}) registered. Waiting approval by admin.`,
        type: 'approval',
        referenceId: newUser.id,
      });

      res.status(201).json({
        token,
        user: sanitizeUserForClient(newUser),
        message: isAutoApproved
          ? 'Account verified and ready to use!'
          : 'Account created. Waiting approval by admin.',
      });
    } catch (err) {
      return handleApiError(res, err, 'Registration failed.', 'Register error');
    }
  });

  router.post('/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email, employeeId } = req.body || {};
      if (!email || !employeeId) {
        return res.status(400).json({ error: 'Email ID and Employee ID are required.' });
      }

      const trimmedEmail = String(email).trim().toLowerCase();
      const trimmedEmpId = String(employeeId).trim().toUpperCase();

      const user = await db.getUserByEmailWithAuth(trimmedEmail);
      if (!user) {
        return res.status(404).json({ error: 'No account registered with this Email ID.' });
      }
      if (user.employeeId && user.employeeId.toUpperCase() !== trimmedEmpId) {
        return res
          .status(400)
          .json({ error: 'Employee ID does not match records for this Email ID.' });
      }

      const resetReq = await db.createResetRequest(user, trimmedEmpId);

      await db.createNotification({
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
      return handleApiError(
        res,
        err,
        'Failed to submit password reset request.',
        'Forgot password error'
      );
    }
  });

  router.get('/auth/reset-requests', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      res.json(await db.listResetRequests());
    } catch (err) {
      return handleApiError(res, err, 'Failed to load password reset requests.', 'List reset requests error');
    }
  });

  router.post('/auth/approve-reset/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      const approved = await db.approveResetRequest(id, admin.id);
      if (!approved) {
        return res.status(404).json({ error: 'Reset request not found.' });
      }

      await db.createAuditLog({
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
      return handleApiError(res, err, 'Failed to approve password reset.', 'Approve reset error');
    }
  });

  router.post('/auth/set-new-password', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId, newPassword } = req.body || {};
      const actor = req.authUser!;
      const targetUserId = userId || actor.id;

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

      await db.createAuditLog({
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
      return handleApiError(res, err, 'Failed to update password.', 'Set new password error');
    }
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: sanitizeUserForClient(req.authUser!) });
  });

  router.post('/auth/logout', async (req: Request, res: Response) => {
    try {
      const token = extractToken(req);
      if (token && db.isConfigured()) {
        await db.revokeSession(token);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Logout error:', err);
      res.json({ success: true });
    }
  });

  router.get('/auth/admin-status', async (_req: Request, res: Response) => {
    try {
      res.json({ hasAdmin: await db.hasAdmin() });
    } catch (err) {
      return handleApiError(res, err, 'Failed to check administrator status.', 'Admin status error');
    }
  });

  router.post('/auth/setup-first-admin', async (req: Request, res: Response) => {
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
      res.status(201).json({ token, user: sanitizeUserForClient(adminUser) });
    } catch (err) {
      return handleApiError(res, err, 'Administrator setup failed.', 'Setup first admin error');
    }
  });

  router.post('/auth/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
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
      const newToken = await db.createSession(actor.id);

      res.json({
        success: true,
        token: newToken,
        message: 'Password updated successfully.',
      });
    } catch (err) {
      return handleApiError(res, err, 'Failed to update password.', 'Change password error');
    }
  });

  // ==========================================
  // 3. COMMUNITIES & CAMPUS LOCATIONS
  // ==========================================
  router.get('/communities', async (req: Request, res: Response) => {
    try {
      const token = extractToken(req);
      let isAdmin = false;
      if (token) {
        const actor = await db.getSessionUser(token).catch(() => null);
        isAdmin = Boolean(
          actor && (actor.role === 'platform_admin' || actor.role === 'community_admin')
        );
      }
      const communities = await db.listCommunities();
      res.json(communities.map((c) => sanitizeCommunityForClient(c, isAdmin)));
    } catch (err) {
      return handleApiError(res, err, 'Failed to load communities.', 'List communities error');
    }
  });

  router.post('/communities', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, city, description } = req.body || {};
      const admin = req.authUser!;

      if (!name || !city) {
        return res.status(400).json({ error: 'Name and city are required.' });
      }

      const community = await db.createCommunity({ name, city, description });

      await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'ADD_COMMUNITY',
        details: `Added new campus: ${community.name} (${community.city})`,
      });

      res.status(201).json({ success: true, community });
    } catch (err) {
      return handleApiError(res, err, 'Failed to create campus.', 'Create community error');
    }
  });

  router.put('/communities/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { name, city, description } = req.body || {};
      const admin = req.authUser!;

      if (!hasCampusScope(admin, id)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
      }

      const community = await db.updateCommunity(id, { name, city, description });
      if (!community) {
        return res.status(404).json({ error: 'Community not found.' });
      }

      await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'UPDATE_COMMUNITY',
        details: `Updated campus info for ${community.name}`,
      });

      res.json({ success: true, community });
    } catch (err) {
      return handleApiError(res, err, 'Failed to update campus.', 'Update community error');
    }
  });

  router.delete('/communities/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      if (!hasCampusScope(admin, id)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
      }

      const removed = await db.deleteCommunity(id);

      await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'DELETE_COMMUNITY',
        details: `Deleted campus ${removed?.name || id}`,
      });

      res.json({ success: true, deletedCommunityId: id });
    } catch (err) {
      return handleApiError(res, err, 'Failed to delete campus.', 'Delete community error');
    }
  });

  router.post(
    '/communities/:id/locations',
    requireAuth,
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
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

        const result = await db.addLocation(id, { id: locId, name, zone, description, isPopular });
        if (!result) {
          return res.status(404).json({ error: 'Community not found.' });
        }

        await db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'ADD_LOCATION',
          details: `Added new landmark "${result.location.name}" in ${result.location.zone}`,
        });

        res.status(201).json({ success: true, ...result });
      } catch (err) {
        return handleApiError(res, err, 'Failed to add location spot.', 'Add location error');
      }
    }
  );

  router.put(
    '/communities/:id/locations/:locId',
    requireAuth,
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
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

        const result = await db.updateLocation(id, locId, { name, zone, description, isPopular });
        if (!result) {
          return res.status(404).json({ error: 'Location spot not found.' });
        }

        await db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'UPDATE_LOCATION',
          details: `Updated spot "${result.location.name}" (${result.location.zone}) in ${result.community.name}`,
        });

        res.json({ success: true, ...result });
      } catch (err) {
        return handleApiError(res, err, 'Failed to update location spot.', 'Update location error');
      }
    }
  );

  router.delete(
    '/communities/:id/locations/:locId',
    requireAuth,
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const locId = String(req.params.locId);
        const admin = req.authUser!;

        if (!hasCampusScope(admin, id)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You do not have administrative authority over this campus.' });
        }

        const result = await db.deleteLocation(id, locId);
        if (!result) {
          return res.status(404).json({ error: 'Community not found.' });
        }

        await db.createAuditLog({
          adminId: admin.id,
          adminName: admin.name,
          action: 'DELETE_LOCATION',
          details: `Deleted spot "${result.deletedName}" from ${result.community.name}`,
        });

        res.json({ success: true, deletedLocationId: locId, community: result.community });
      } catch (err) {
        return handleApiError(res, err, 'Failed to delete location spot.', 'Delete location error');
      }
    }
  );

  // ==========================================
  // 4. BREAKS (DIRECTORY, BROADCAST, EXTEND, COMPLETE)
  // ==========================================
  router.get('/breaks', async (req: Request, res: Response) => {
    try {
      const { communityId, breakType, zone, activeNow } = req.query;
      const breaks = await db.listBreaks({
        communityId: typeof communityId === 'string' ? communityId : undefined,
        breakType: typeof breakType === 'string' ? breakType : undefined,
        zone: typeof zone === 'string' ? zone : undefined,
        activeNow: activeNow === 'true',
      });
      res.json(breaks);
    } catch (err) {
      return handleApiError(res, err, 'Failed to load breaks.', 'List breaks error');
    }
  });

  router.post('/breaks', requireAuth, async (req: AuthedRequest, res: Response) => {
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
      const comm = await db.getCommunityById(targetCommId);
      if (!comm) {
        return res.status(400).json({ error: 'Selected campus community does not exist.' });
      }

      const newPost = await db.createBreak({
        userId: actor.id,
        communityId: targetCommId,
        breakType: breakType || 'tea',
        durationMinutes: Number(durationMinutes) || 15,
        locationName,
        zone,
        customNote,
      });

      await db.createNotification({
        userId: 'all',
        title: `${actor.name} is on a ${newPost.breakType.toUpperCase()} break!`,
        body: `Meeting at ${newPost.locationName} (${newPost.zone}).${newPost.customNote ? ` "${newPost.customNote}"` : ''}`,
        type: 'ping',
        referenceId: newPost.id,
      });

      res.status(201).json(newPost);
    } catch (err) {
      return handleApiError(res, err, 'Failed to broadcast break.', 'Create break error');
    }
  });

  router.post('/breaks/:id/extend', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const existing = await db.getBreakById(id);

      if (!existing) {
        return res.status(404).json({ error: 'Break not found.' });
      }

      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      if (existing.userId !== actor.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only extend your own break.' });
      }

      const post = await db.extendBreak(id, 10);
      res.json({ success: true, post });
    } catch (err) {
      return handleApiError(res, err, 'Failed to extend break.', 'Extend break error');
    }
  });

  router.post('/breaks/:id/complete', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const existing = await db.getBreakById(id);

      if (!existing) {
        return res.status(404).json({ error: 'Break not found.' });
      }

      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      if (existing.userId !== actor.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only complete your own break.' });
      }

      const post = await db.completeBreak(id);
      res.json({ success: true, post });
    } catch (err) {
      return handleApiError(res, err, 'Failed to complete break.', 'Complete break error');
    }
  });

  // ==========================================
  // 5. USERS & ADMIN USER MANAGEMENT
  // ==========================================
  router.get('/users', async (req: AuthedRequest, res: Response) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.json([]);
      }
      const actor = await db.getSessionUser(token);
      if (!actor) {
        return res.json([]);
      }

      const users = await db.listUsers();
      if (actor.role === 'platform_admin') {
        return res.json(users.map(sanitizeUserForClient));
      }
      if (actor.role === 'community_admin') {
        return res.json(
          users
            .filter((u) => u.campusId === actor.campusId || u.id === actor.id)
            .map(sanitizeUserForClient)
        );
      }

      const safeMembers = users
        .filter((u) => u.status === 'approved' || u.id === actor.id)
        .map((u) =>
          sanitizeUserForClient({
            ...u,
            email: u.id === actor.id ? u.email : '',
            employeeId: u.id === actor.id ? u.employeeId : undefined,
          })
        );
      res.json(safeMembers);
    } catch (err) {
      return handleApiError(res, err, 'Failed to load users.', 'List users error');
    }
  });

  router.get('/users/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const user = await db.getUserById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      res.json(sanitizeUserForClient(user));
    } catch (err) {
      return handleApiError(res, err, 'Failed to fetch user.', 'Get user error');
    }
  });

  router.post('/users', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
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

      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: updated ? 'ADD_MEMBER' : 'CREATE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: updated
          ? `Admin verified and configured account for ${user.name} (Emp ID: ${user.employeeId})`
          : `Directly registered ${user.role === 'user' ? 'Member' : 'Campus Admin'} ${user.name}`,
      });

      res.status(updated ? 200 : 201).json({
        success: true,
        user: sanitizeUserForClient(user),
        log,
      });
    } catch (err) {
      return handleApiError(res, err, 'Failed to create user.', 'Create user error');
    }
  });

  router.put('/users/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';

      if (actor.id !== id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
      }

      const { name, roleTitle, bio, icebreaker, interests, dietary, socialBattery } =
        req.body || {};

      const updated = await db.updateUserProfile(id, {
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

      res.json({ success: true, user: sanitizeUserForClient(updated) });
    } catch (err) {
      return handleApiError(res, err, 'Failed to update profile.', 'Update profile error');
    }
  });

  router.post('/users/:id/approve', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;
      const target = await db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const user = (await db.approveUser(id))!;

      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'APPROVE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `Approved membership for ${user.name} (${user.email}).`,
      });

      await db.createNotification({
        userId: user.id,
        title: 'Account Approved!',
        body: 'Your campus break directory access is approved. You can now broadcast breaks!',
        type: 'approval',
      });

      res.json({ success: true, user: sanitizeUserForClient(user), log });
    } catch (err) {
      return handleApiError(res, err, 'Failed to approve user.', 'Approve user error');
    }
  });

  router.post('/users/:id/reject', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { reason } = req.body || {};
      const admin = req.authUser!;
      const target = await db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const rejectedUser = (await db.rejectUser(id))!;

      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'REJECT_USER',
        targetUserId: rejectedUser.id,
        targetUserName: rejectedUser.name,
        details: `Rejected registration for ${rejectedUser.name}. Reason: ${reason || 'Invalid campus credentials'}`,
      });

      res.json({ success: true, rejectedUserId: id, log });
    } catch (err) {
      return handleApiError(res, err, 'Failed to reject user.', 'Reject user error');
    }
  });

  router.post('/users/:id/toggle-status', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;
      const target = await db.getUserById(id);

      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (target.id === 'usr_admin' || target.id === admin.id) {
        return res.status(403).json({ error: 'Administrator account cannot be suspended.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const user = (await db.toggleUserStatus(id))!;

      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: user.status === 'suspended' ? 'SUSPEND_USER' : 'REINSTATE_USER',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `${user.status === 'suspended' ? 'Suspended' : 'Reactivated'} account access for ${user.name}.`,
      });

      res.json({ success: true, user: sanitizeUserForClient(user), log });
    } catch (err) {
      return handleApiError(res, err, 'Failed to update user status.', 'Toggle user status error');
    }
  });

  router.post('/users/:id/role', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { role } = req.body || {};
      const admin = req.authUser!;
      const target = await db.getUserById(id);

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

      const user = (await db.updateUserRole(id, newRole))!;

      const actionText =
        newRole === 'community_admin'
          ? 'Promoted to Campus Admin'
          : 'Revoked Campus Admin rights';
      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'CHANGE_ROLE',
        targetUserId: user.id,
        targetUserName: user.name,
        details: `${actionText} for ${user.name}`,
      });

      res.json({ success: true, user: sanitizeUserForClient(user), log });
    } catch (err) {
      return handleApiError(res, err, 'Failed to update user role.', 'Change role error');
    }
  });

  router.delete('/users/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const admin = req.authUser!;

      if (id === 'usr_admin' || id === 'admin' || id === admin.id) {
        return res.status(403).json({ error: 'Administrator account cannot be deleted.' });
      }

      const target = await db.getUserById(id);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!hasCampusScope(admin, target.campusId)) {
        return res.status(403).json({ error: 'Forbidden: User belongs to another campus.' });
      }

      const deletedUser = (await db.deleteUser(id))!;

      const log = await db.createAuditLog({
        adminId: admin.id,
        adminName: admin.name,
        action: 'DELETE_USER',
        targetUserId: deletedUser.id,
        targetUserName: deletedUser.name,
        details: `Deleted user account for ${deletedUser.name}`,
      });

      res.json({ success: true, deletedUserId: id, log });
    } catch (err) {
      return handleApiError(res, err, 'Failed to delete user.', 'Delete user error');
    }
  });

  // ==========================================
  // 6. CHAT CONVERSATIONS & MESSAGES
  // ==========================================
  router.get('/chat/:conversationId', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      if (actor.status !== 'approved') {
        return res.status(403).json({ error: 'Approved account required to access chat.' });
      }
      const conversationId = String(req.params.conversationId);
      res.json(await db.listMessages(conversationId));
    } catch (err) {
      return handleApiError(res, err, 'Failed to load messages.', 'List messages error');
    }
  });

  router.post('/chat/:conversationId', requireAuth, async (req: AuthedRequest, res: Response) => {
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

      const newMsg = await db.createMessage({
        conversationId,
        senderId: isSystem ? 'system' : actor.id,
        senderName: isSystem ? 'MidDay Buddy' : actor.name,
        text: text.trim(),
        isSystem: Boolean(isSystem),
      });

      res.status(201).json(newMsg);
    } catch (err) {
      return handleApiError(res, err, 'Failed to send message.', 'Send message error');
    }
  });

  // ==========================================
  // 7. NOTIFICATIONS & AUDIT LOGS
  // ==========================================
  router.get('/notifications', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      res.json(await db.listNotifications(actor.id, isAdmin));
    } catch (err) {
      return handleApiError(res, err, 'Failed to load notifications.', 'List notifications error');
    }
  });

  router.post('/notifications/mark-read', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const actor = req.authUser!;
      const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
      await db.markNotificationsRead(actor.id, isAdmin);
      res.json({ success: true });
    } catch (err) {
      return handleApiError(
        res,
        err,
        'Failed to mark notifications read.',
        'Mark notifications read error'
      );
    }
  });

  router.get('/audit-logs', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      res.json(await db.listAuditLogs());
    } catch (err) {
      return handleApiError(res, err, 'Failed to load audit logs.', 'List audit logs error');
    }
  });

  // Explicit 404 handler for unhandled /api/* routes
  router.all('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: `/api${req.path}`,
      timestamp: Date.now(),
    });
  });

  return router;
}
