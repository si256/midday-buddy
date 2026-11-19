import type { D1Database } from './env';
import { hashToken } from './crypto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  employeeId?: string;
  campusId: string;
  roleTitle: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'suspended';
  role: 'user' | 'community_admin' | 'platform_admin';
  avatarBgColor?: string;
  avatarSeed?: string;
  bio?: string;
  icebreaker?: string;
  interests?: string[];
  dietary?: string;
  socialBattery?: string;
  registeredAt?: string;
  approvedAt?: string;
}

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

export async function getSessionUser(request: Request, db?: D1Database): Promise<AuthenticatedUser | null> {
  const token = extractToken(request);
  if (!token || !db) return null;

  try {
    const tokenHash = await hashToken(token);
    const now = Date.now();

    const row = await db.prepare(`
      SELECT 
        u.id, u.email, u.name, u.employee_id as employeeId, u.campus_id as campusId,
        u.role_title as roleTitle, u.status, u.role, u.bio, u.icebreaker, u.interests,
        u.dietary, u.social_battery as socialBattery, u.avatar_seed as avatarSeed,
        u.avatar_bg as avatarBgColor, u.registered_at as registeredAt, u.approved_at as approvedAt
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status != 'suspended'
    `).bind(tokenHash, now).first<any>();

    if (!row) return null;

    let parsedInterests: string[] = [];
    if (row.interests) {
      try {
        parsedInterests = typeof row.interests === 'string' ? JSON.parse(row.interests) : row.interests;
      } catch {
        parsedInterests = row.interests.split(',').map((s: string) => s.trim());
      }
    }

    return {
      ...row,
      interests: Array.isArray(parsedInterests) ? parsedInterests : [],
    };
  } catch (err) {
    console.error('Error fetching session user:', err);
    return null;
  }
}

export async function requireAuth(request: Request, db?: D1Database): Promise<AuthenticatedUser> {
  const user = await getSessionUser(request, db);
  if (!user) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: Authentication required to access this resource.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}

export function requireRole(
  user: AuthenticatedUser,
  allowedRoles: Array<'user' | 'community_admin' | 'platform_admin'>,
  targetCampusId?: string
): void {
  if (!allowedRoles.includes(user.role)) {
    throw new Response(
      JSON.stringify({ error: 'Forbidden: Insufficient privileges for this operation.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Campus Admin scope restriction: Campus admin can only manage their own campus (platform_admin can manage all)
  if (user.role === 'community_admin' && targetCampusId && user.campusId !== targetCampusId) {
    throw new Response(
      JSON.stringify({ error: 'Forbidden: You do not have administrative authority over this campus.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
