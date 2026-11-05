import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  INITIAL_COMMUNITIES, 
  INITIAL_USERS, 
  INITIAL_BREAK_POSTS, 
  INITIAL_AUDIT_LOGS 
} from './src/data/seedData.ts';
import { 
  UserProfile, 
  Community, 
  BreakPost, 
  AuditLog, 
  ChatMessage, 
  AppNotification, 
  CampusLocation 
} from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// Enable CORS and handle preflight requests across environments
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// In-Memory Server Authoritative State (Clean Production Database Layer)
let dbUsers: UserProfile[] = [...INITIAL_USERS];
let dbCommunities: Community[] = [...INITIAL_COMMUNITIES];
let dbBreaks: BreakPost[] = [];
let dbAuditLogs: AuditLog[] = [];
let dbMessages: Record<string, ChatMessage[]> = {};
let dbSessions: Record<string, string> = {}; // token -> userId
let dbResetRequests: any[] = [];
let dbNotifications: AppNotification[] = [];

// ==========================================
// 1. HEALTH CHECK & STATUS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    message: 'MidDay Buddy Authoritative Backend Server Active (CoreReacher Enterprises)',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    stats: {
      usersCount: dbUsers.length,
      activeBreaksCount: dbBreaks.filter((b) => b.expiresAt > Date.now()).length,
      communitiesCount: dbCommunities.length,
      pendingResetRequests: dbResetRequests.filter((r) => r.status === 'pending').length,
    },
  });
});

// ==========================================
// AUTHENTICATION & PASSWORD MANAGEMENT
// ==========================================
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email ID is required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  let user = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

  if (!user && trimmedEmail === 'admin@middaybuddy.com' && password === 'Admin@12345') {
    user = { ...INITIAL_USERS[0] };
    dbUsers.unshift(user);
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid Email ID or password.' });
  }

  // Check if admin approved a password reset for this user:
  // Once admin approved, user can login without password & is prompted for immediate password change!
  if (user.passwordResetApproved) {
    const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    dbSessions[token] = user.id;

    // Consume the one-time approved flag so it cannot be reused
    user.passwordResetApproved = false;
    user.mustChangePassword = true;

    const { password: _, ...safeUser } = user;
    return res.json({
      token,
      user: safeUser,
      mustChangePassword: true,
      message: 'Password reset was approved by admin. Please choose a new password now.',
    });
  }

  // Standard password verification
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const isMasterAdmin = trimmedEmail === 'admin@middaybuddy.com' && password === 'Admin@12345';
  if (!isMasterAdmin && user.password && user.password !== password) {
    return res.status(401).json({ error: 'Invalid Email ID or password.' });
  }

  const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  dbSessions[token] = user.id;

  const { password: _, ...safeUser } = user;
  res.json({ 
    token, 
    user: safeUser,
    mustChangePassword: Boolean(user.mustChangePassword) 
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } = req.body;
  const employeeId = (req.body.employeeId || req.body.employee_id || '').trim();

  if (!name || !email || !password || !employeeId) {
    return res.status(400).json({ error: 'Name, Email ID, Employee ID, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedEmpId = employeeId.trim().toUpperCase();

  const existingEmail = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with this Email ID already exists.' });
  }

  const existingEmp = dbUsers.find((u) => u.employeeId && u.employeeId.toUpperCase() === trimmedEmpId);
  if (existingEmp) {
    return res.status(409).json({ error: 'This Employee ID is already registered to another account.' });
  }

  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    name: name.trim(),
    email: trimmedEmail,
    password: password,
    employeeId: employeeId.trim().toUpperCase(),
    campusId: campusId || 'comm_siruseri',
    roleTitle: roleTitle || 'Software Engineer',
    bio: '',
    socialBattery: 'Balanced Banter',
    status: 'pending_approval', // Server enforces manual admin approval
    role: 'user',
    interests: interests || ['Tech & AI', 'Coffee & Chai'],
    dietary: (dietary as any) || 'Any',
    icebreaker: icebreaker || 'Always happy to talk tech, movies, or sports!',
    registeredAt: new Date().toISOString(),
    avatarSeed: name.toLowerCase().replace(/\s+/g, '-'),
    avatarBgColor: 'bg-indigo-600',
  };

  dbUsers.push(newUser);

  const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  dbSessions[token] = newUser.id;

  // Notify admins
  const adminNotif: AppNotification = {
    id: `notif_approval_${Date.now()}`,
    userId: 'admin',
    title: 'New Member Waiting Approval',
    body: `${newUser.name} (Employee ID: ${newUser.employeeId}, ${newUser.email}) registered. Waiting approval by admin.`,
    type: 'approval',
    isRead: false,
    createdAt: new Date().toISOString(),
    referenceId: newUser.id,
  };
  dbNotifications.unshift(adminNotif);

  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ token, user: safeUser });
});

// Forgot Password: User raises reset request
app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email, employeeId } = req.body;
  if (!email || !employeeId) {
    return res.status(400).json({ error: 'Email ID and Employee ID are required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedEmpId = employeeId.trim().toUpperCase();

  const user = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
  if (!user) {
    return res.status(404).json({ error: 'No account registered with this Email ID.' });
  }

  if (user.employeeId && user.employeeId.toUpperCase() !== trimmedEmpId) {
    return res.status(400).json({ error: 'Employee ID does not match records for this Email ID.' });
  }

  user.passwordResetRequested = true;
  user.passwordResetApproved = false;

  const resetReq = {
    id: `reset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: user.id,
    userName: user.name,
    email: user.email,
    employeeId: trimmedEmpId,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };
  dbResetRequests.unshift(resetReq);

  // Notify admins
  dbNotifications.unshift({
    id: `notif_reset_${Date.now()}`,
    userId: 'admin',
    title: 'Password Reset Request',
    body: `${user.name} (Employee ID: ${trimmedEmpId}) requested password reset. Waiting approval by admin.`,
    type: 'approval',
    isRead: false,
    createdAt: new Date().toISOString(),
    referenceId: resetReq.id,
  });

  res.json({
    success: true,
    message: 'Password reset request submitted. Waiting approval by admin.',
    requestId: resetReq.id,
  });
});

// Admin: Get all password reset requests
app.get('/api/auth/reset-requests', (req: Request, res: Response) => {
  res.json(dbResetRequests);
});

// Admin: Approve password reset request
app.post('/api/auth/approve-reset/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminId, adminName } = req.body;

  const resetReq = dbResetRequests.find((r) => r.id === id);
  if (!resetReq) {
    return res.status(404).json({ error: 'Reset request not found.' });
  }

  resetReq.status = 'approved';
  resetReq.approvedAt = new Date().toISOString();
  resetReq.adminId = adminId || 'admin';

  const user = dbUsers.find((u) => u.id === resetReq.userId);
  if (user) {
    user.passwordResetRequested = false;
    user.passwordResetApproved = true; // Allows passwordless one-time entry
    user.mustChangePassword = true;    // Forces immediate password change
  }

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: adminId || 'admin',
    adminName: adminName || 'Campus Admin',
    action: 'APPROVE_USER',
    targetUserId: resetReq.userId,
    targetUserName: resetReq.userName,
    details: `Approved password reset for ${resetReq.userName} (Employee ID: ${resetReq.employeeId}). User can now log in without password to set new password.`,
    timestamp: new Date().toISOString(),
  });

  res.json({ 
    success: true, 
    message: 'Password reset approved by admin. User can now sign in without password to set new password.' 
  });
});

// User: Set new password after admin approved reset
app.post('/api/auth/set-new-password', (req: Request, res: Response) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'User ID and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const user = dbUsers.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.password = newPassword;
  user.passwordResetRequested = false;
  user.passwordResetApproved = false;
  user.mustChangePassword = false;

  const reqItem = dbResetRequests.find((r) => r.userId === userId && r.status === 'approved');
  if (reqItem) {
    reqItem.status = 'completed';
  }

  // Force user to log in again: invalidate all sessions for this user!
  for (const [t, uId] of Object.entries(dbSessions)) {
    if (uId === userId) {
      delete dbSessions[t];
    }
  }

  dbAuditLogs.unshift({
    id: `log_${Date.now()}`,
    adminId: 'system',
    adminName: 'Security System',
    action: 'REINSTATE_USER',
    targetUserId: user.id,
    targetUserName: user.name,
    details: `Password changed for ${user.name}. Session invalidated; user must log in again with new password.`,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: 'Password changed successfully! Please log in again with your new password.',
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing session token' });
  }

  const token = authHeader.split(' ')[1];
  const userId = dbSessions[token];
  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const user = dbUsers.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    delete dbSessions[token];
  }
  res.json({ success: true });
});

// ==========================================
// 2. COMMUNITIES & CAMPUS LOCATIONS
// ==========================================
app.get('/api/communities', (req: Request, res: Response) => {
  res.json(dbCommunities);
});

app.post('/api/communities/:id/locations', (req: Request, res: Response) => {
  const { id } = req.params;
  const location: CampusLocation = req.body;

  const community = dbCommunities.find((c) => c.id === id);
  if (!community) {
    return res.status(404).json({ error: 'Community not found' });
  }

  if (!location.name || !location.zone) {
    return res.status(400).json({ error: 'Name and zone are required' });
  }

  community.locations.push(location);

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: req.body.adminId || 'admin',
    adminName: req.body.adminName || 'Campus Admin',
    action: 'ADD_LOCATION',
    details: `Added new landmark "${location.name}" in ${location.zone}`,
    timestamp: new Date().toISOString(),
  };
  dbAuditLogs.unshift(log);

  res.status(201).json({ success: true, location, community });
});

// ==========================================
// 3. BREAKS (DIRECTORY, BROADCAST, EXTEND, FINISH)
// ==========================================
app.get('/api/breaks', (req: Request, res: Response) => {
  const { communityId, breakType, zone, activeNow } = req.query;
  const now = Date.now();

  let filtered = [...dbBreaks];

  if (communityId) {
    filtered = filtered.filter((b) => b.communityId === communityId);
  }
  if (breakType && breakType !== 'all') {
    filtered = filtered.filter((b) => b.breakType === breakType);
  }
  if (zone && zone !== 'all') {
    filtered = filtered.filter((b) => b.zone === zone);
  }
  if (activeNow === 'true') {
    filtered = filtered.filter((b) => b.expiresAt > now);
  }

  // Sort: active first, newest first
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  res.json(filtered);
});

app.post('/api/breaks', (req: Request, res: Response) => {
  const body = req.body;
  const now = Date.now();

  const user = dbUsers.find((u) => u.id === body.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }
  if (user.status !== 'approved') {
    return res.status(403).json({ error: 'User must be approved by admin to post breaks' });
  }

  const duration = body.durationMinutes || 15;
  const expiresAt = now + duration * 60 * 1000;

  const newPost: BreakPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    userName: user.name,
    userRole: user.roleTitle,
    userAvatarSeed: user.avatarSeed,
    userAvatarBg: user.avatarBgColor,
    communityId: body.communityId || 'tcs-siruseri-chennai',
    breakType: body.breakType || 'tea',
    status: 'free_now',
    timeLabel: `Free Right Now (${duration}m)`,
    durationMinutes: duration,
    locationName: body.locationName,
    zone: body.zone,
    customNote: body.customNote || '',
    dietary: user.dietary,
    interests: user.interests,
    icebreaker: user.icebreaker,
    expiresAt,
    createdAt: now,
  };

  dbBreaks.unshift(newPost);

  // Real server-authoritative broadcast notification to community
  const notif: AppNotification = {
    id: `notif_${Date.now()}`,
    userId: 'all', // Broadcast
    title: `${user.name} is on a ${body.breakType.toUpperCase()} break!`,
    body: `Meeting at ${body.locationName} (${body.zone}). "${body.customNote}"`,
    type: 'ping',
    isRead: false,
    createdAt: new Date().toISOString(),
    referenceId: newPost.id,
  };
  dbNotifications.unshift(notif);

  res.status(201).json(newPost);
});

app.post('/api/breaks/:id/extend', (req: Request, res: Response) => {
  const { id } = req.params;
  const post = dbBreaks.find((b) => b.id === id);

  if (!post) {
    return res.status(404).json({ error: 'Break not found' });
  }

  post.expiresAt += 10 * 60 * 1000;
  post.durationMinutes += 10;

  res.json({ success: true, post });
});

app.post('/api/breaks/:id/complete', (req: Request, res: Response) => {
  const { id } = req.params;
  const post = dbBreaks.find((b) => b.id === id);

  if (!post) {
    return res.status(404).json({ error: 'Break not found' });
  }

  post.expiresAt = Date.now() - 1000;
  post.status = 'completed';

  res.json({ success: true, post });
});

// ==========================================
// 4. USERS, REGISTRATION & ADMIN APPROVALS
// ==========================================
app.get('/api/users', (req: Request, res: Response) => {
  res.json(dbUsers);
});

app.get('/api/users/:id', (req: Request, res: Response) => {
  const user = dbUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

app.post('/api/users/register', (req: Request, res: Response) => {
  const { name, email, campusId, roleTitle, communityId, interests, dietary, icebreaker } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const existing = dbUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    name,
    email,
    campusId: campusId || 'TCS-P-PENDING',
    roleTitle: roleTitle || 'Software Engineer',
    bio: '',
    socialBattery: 'Balanced Banter',
    status: 'pending_approval', // Server enforces manual admin approval
    role: 'user',
    interests: interests || ['Tech & AI', 'Coffee & Chai'],
    dietary: (dietary as any) || 'Any',
    icebreaker: icebreaker || 'Always happy to talk tech, movies, or sports!',
    registeredAt: new Date().toISOString(),
    avatarSeed: name.toLowerCase().replace(/\s+/g, '-'),
    avatarBgColor: 'bg-indigo-600',
  };

  dbUsers.push(newUser);

  // Notify admins
  const adminNotif: AppNotification = {
    id: `notif_approval_${Date.now()}`,
    userId: 'admin',
    title: 'New Member Approval Required',
    body: `${newUser.name} (${newUser.email}) requested to join TCS Siruseri Hub.`,
    type: 'approval',
    isRead: false,
    createdAt: new Date().toISOString(),
    referenceId: newUser.id,
  };
  dbNotifications.unshift(adminNotif);

  res.status(201).json(newUser);
});

app.post('/api/users/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminId, adminName } = req.body;

  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.status = 'approved';

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminId || 'admin',
    adminName: adminName || 'Campus Admin',
    action: 'APPROVE_USER',
    targetUserId: user.id,
    targetUserName: user.name,
    details: `Approved membership for ${user.name} (${user.email}) at TCS Siruseri.`,
    timestamp: new Date().toISOString(),
  };
  dbAuditLogs.unshift(log);

  // Notify user
  const userNotif: AppNotification = {
    id: `notif_${Date.now()}`,
    userId: user.id,
    title: 'Account Approved! 🎉',
    body: `Your access to TCS Siruseri Break Directory is approved. You can now broadcast breaks!`,
    type: 'approval',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  dbNotifications.unshift(userNotif);

  res.json({ success: true, user, log });
});

app.post('/api/users/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminId, adminName, reason } = req.body;

  const userIndex = dbUsers.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const rejectedUser = dbUsers[userIndex];
  dbUsers.splice(userIndex, 1);

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminId || 'admin',
    adminName: adminName || 'Campus Admin',
    action: 'REJECT_USER',
    targetUserId: rejectedUser.id,
    targetUserName: rejectedUser.name,
    details: `Rejected registration for ${rejectedUser.name}. Reason: ${reason || 'Invalid campus credentials'}`,
    timestamp: new Date().toISOString(),
  };
  dbAuditLogs.unshift(log);

  res.json({ success: true, rejectedUserId: id, log });
});

app.post('/api/users/:id/toggle-status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminId, adminName } = req.body;

  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const nextStatus = user.status === 'approved' ? 'suspended' : 'approved';
  user.status = nextStatus;

  const log: AuditLog = {
    id: `log_${Date.now()}`,
    adminId: adminId || 'admin',
    adminName: adminName || 'Campus Admin',
    action: nextStatus === 'suspended' ? 'SUSPEND_USER' : 'REINSTATE_USER',
    targetUserId: user.id,
    targetUserName: user.name,
    details: `${nextStatus === 'suspended' ? 'Suspended' : 'Reactivated'} account access for ${user.name}.`,
    timestamp: new Date().toISOString(),
  };
  dbAuditLogs.unshift(log);

  res.json({ success: true, user, log });
});

app.put('/api/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const user = dbUsers.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { name, roleTitle, interests, dietary, icebreaker } = req.body;
  if (name) user.name = name;
  if (roleTitle) user.roleTitle = roleTitle;
  if (interests) user.interests = interests;
  if (dietary) user.dietary = dietary;
  if (icebreaker) user.icebreaker = icebreaker;

  res.json({ success: true, user });
});

// ==========================================
// 5. CHAT CONVERSATIONS & MESSAGES (REAL BACKEND)
// ==========================================
app.get('/api/chat/:conversationId', (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const messages = dbMessages[conversationId] || [];
  res.json(messages);
});

app.post('/api/chat/:conversationId', (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const { senderId, senderName, text, isSystem } = req.body;

  if (!text || !senderId) {
    return res.status(400).json({ error: 'senderId and text are required' });
  }

  const newMsg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    conversationId,
    senderId,
    senderName,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isSystem: Boolean(isSystem),
  };

  if (!dbMessages[conversationId]) {
    dbMessages[conversationId] = [];
  }
  dbMessages[conversationId].push(newMsg);

  res.status(201).json(newMsg);
});

// ==========================================
// 6. NOTIFICATIONS & AUDIT LOGS
// ==========================================
app.get('/api/notifications', (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) {
    return res.json(dbNotifications);
  }
  const userNotifs = dbNotifications.filter((n) => n.userId === userId || n.userId === 'all');
  res.json(userNotifs);
});

app.post('/api/notifications/mark-read', (req: Request, res: Response) => {
  const { userId } = req.body;
  if (userId) {
    dbNotifications.forEach((n) => {
      if (n.userId === userId || n.userId === 'all') {
        n.isRead = true;
      }
    });
  }
  res.json({ success: true });
});

app.get('/api/audit-logs', (req: Request, res: Response) => {
  res.json(dbAuditLogs);
});

// ==========================================
// 7. DEV & PRODUCTION SERVER MOUNT
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Mount Vite middleware in development
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static build
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
