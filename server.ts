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

// In-Memory Server Authoritative State (Database Layer)
let dbUsers: UserProfile[] = [...INITIAL_USERS];
let dbCommunities: Community[] = [...INITIAL_COMMUNITIES];
let dbBreaks: BreakPost[] = INITIAL_BREAK_POSTS.map((b) => ({
  ...b,
  durationMinutes: b.breakType === 'tea' ? 15 : b.breakType === 'lunch' ? 30 : 20,
}));
let dbAuditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];
let dbMessages: Record<string, ChatMessage[]> = {};
let dbSessions: Record<string, string> = {}; // token -> userId

let dbNotifications: AppNotification[] = [
  {
    id: 'notif_welcome',
    userId: 'usr_dinesh',
    title: 'Welcome to Siruseri Break Network!',
    body: 'Your account was verified by Campus Culture Lead Kavitha Sundaram.',
    type: 'approval',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

// ==========================================
// 1. HEALTH CHECK & STATUS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    message: 'MidDay Buddy Authoritative Backend Server Active',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    stats: {
      usersCount: dbUsers.length,
      activeBreaksCount: dbBreaks.filter((b) => b.expiresAt > Date.now()).length,
      communitiesCount: dbCommunities.length,
    },
  });
});

// ==========================================
// AUTHENTICATION & PASSWORD MANAGEMENT
// ==========================================
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Corporate email and password are required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const user = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

  if (!user) {
    return res.status(401).json({ error: 'Invalid corporate email or password.' });
  }

  // Real password validation check
  if (user.password && user.password !== password) {
    return res.status(401).json({ error: 'Invalid corporate email or password.' });
  }

  const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  dbSessions[token] = user.id;

  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, corporate email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const existing = dbUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this corporate email already exists.' });
  }

  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    name: name.trim(),
    email: trimmedEmail,
    password: password,
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
    title: 'New Member Approval Required',
    body: `${newUser.name} (${newUser.email}) registered and needs admin verification.`,
    type: 'approval',
    isRead: false,
    createdAt: new Date().toISOString(),
    referenceId: newUser.id,
  };
  dbNotifications.unshift(adminNotif);

  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ token, user: safeUser });
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
