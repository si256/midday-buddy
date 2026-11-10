import type { D1Database } from './env';
import { hashToken, generateCsrfToken } from './crypto';

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
  rawSessionToken?: string;
}

/**
 * Enterprise Origin Policy: Explicit allowed origins (No wildcard '*' with credentials)
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed =
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.run.app') ||
    origin.includes('localhost:') ||
    origin.includes('127.0.0.1:');

  const allowedOrigin = isAllowed ? origin : 'https://midday-buddy.pages.dev';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Content-Type': 'application/json',
  };
}

/**
 * Creates HttpOnly, Secure, SameSite session cookie
 */
export function createSessionCookie(token: string): string {
  // Max-Age 30 days = 2592000 seconds
  return `session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
}

/**
 * Clears session cookie on logout or session revocation
 */
export function clearSessionCookie(): string {
  return `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Extracts session token from Authorization: Bearer or HttpOnly session cookie
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

/**
 * Enforces CSRF Token validation for state-modifying requests (POST, PUT, DELETE)
 */
export async function validateCsrf(request: Request, sessionToken: string): Promise<boolean> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const clientCsrfToken = request.headers.get('X-CSRF-Token');
  if (!clientCsrfToken) {
    return false;
  }

  const expectedCsrfToken = await generateCsrfToken(sessionToken);
  return clientCsrfToken === expectedCsrfToken;
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
      rawSessionToken: token,
      interests: Array.isArray(parsedInterests) ? parsedInterests : [],
    };
  } catch (err) {
    console.error('Error fetching session user:', err);
    return null;
  }
}

export async function requireAuth(request: Request, db?: D1Database): Promise<AuthenticatedUser> {
  const cors = getCorsHeaders(request);
  const user = await getSessionUser(request, db);

  if (!user) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: Authentication required to access this resource.' }),
      { status: 401, headers: cors }
    );
  }

  // Validate CSRF token on state-modifying calls
  if (user.rawSessionToken) {
    const isCsrfValid = await validateCsrf(request, user.rawSessionToken);
    if (!isCsrfValid) {
      throw new Response(
        JSON.stringify({ error: 'Forbidden: Invalid or missing CSRF token.' }),
        { status: 403, headers: cors }
      );
    }
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
      JSON.stringify({ error: 'Forbidden: Insufficient administrator privileges.' }),
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
