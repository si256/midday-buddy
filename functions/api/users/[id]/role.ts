import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, requireRole } from '../../../auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
    const newRole = body.role === 'community_admin' ? 'community_admin' : 'user';
    const nowISO = new Date().toISOString();

    if ((userId === 'usr_admin' || userId === 'admin') && newRole !== 'community_admin') {
      return new Response(JSON.stringify({ error: 'Master Administrator role cannot be revoked.' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    const user = await env.DB.prepare(`SELECT name, email, campus_id FROM users WHERE id = ?;`).bind(userId).first<{ name: string; email: string; campus_id: string }>().catch(() => null);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    await env.DB.prepare(
      `UPDATE users SET role = ? WHERE id = ?;`
    ).bind(newRole, userId).run();

    const logId = `log_${Date.now()}`;
    const actionText = newRole === 'community_admin' ? 'Promoted to Campus Admin' : 'Revoked Campus Admin rights';
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'CHANGE_ROLE', ?, ?, ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, userId, user.name, `${actionText} for ${user.name}`, nowISO).run().catch(() => {});

    const log = {
      id: logId,
      adminId: adminUser.id,
      adminName: adminUser.name,
      action: 'CHANGE_ROLE' as const,
      targetUserId: userId,
      targetUserName: user.name,
      details: `${actionText} for ${user.name}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userId, role: newRole },
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
