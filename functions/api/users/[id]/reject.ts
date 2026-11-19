import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, requireRole } from '../../../auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const userId = params.id as string;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['community_admin', 'platform_admin']);

    const body: any = await request.json().catch(() => ({}));
    const reason = (body.reason || 'Registration rejected by administrator.').trim();
    const nowISO = new Date().toISOString();

    const user = await env.DB.prepare(`SELECT name, email, campus_id FROM users WHERE id = ?;`).bind(userId).first<{ name: string; email: string; campus_id: string }>().catch(() => null);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    if (adminUser.role === 'community_admin' && user.campus_id && user.campus_id !== adminUser.campusId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You can only reject applicants in your designated campus.' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    // Mark as rejected in D1 and release any active sessions
    await env.DB.prepare(`UPDATE users SET status = 'rejected' WHERE id = ?;`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});

    // Genuine audit attribution from authenticated session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'REJECT_USER', ?, ?, ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, userId, user.name, `Rejected registration for ${user.name}. Reason: ${reason}`, nowISO).run().catch(() => {});

    const log = {
      id: logId,
      adminId: adminUser.id,
      adminName: adminUser.name,
      action: 'REJECT_USER' as const,
      targetUserId: userId,
      targetUserName: user.name,
      details: `Rejected registration for ${user.name}. Reason: ${reason}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        rejectedUserId: userId,
        log,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
