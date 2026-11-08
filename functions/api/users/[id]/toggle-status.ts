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

    const nowISO = new Date().toISOString();

    const user = await env.DB.prepare(`SELECT name, status, email, campus_id FROM users WHERE id = ?;`).bind(userId).first<{ name: string; status: string; email: string; campus_id: string }>().catch(() => null);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    const newStatus = user.status === 'suspended' ? 'approved' : 'suspended';

    await env.DB.prepare(
      `UPDATE users SET status = ? WHERE id = ?;`
    ).bind(newStatus, userId).run();

    // If suspended, revoke all active sessions immediately
    if (newStatus === 'suspended') {
      await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    }

    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'TOGGLE_STATUS', ?, ?, ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, userId, user.name, `Changed status for ${user.name} to ${newStatus}`, nowISO).run().catch(() => {});

    const log = {
      id: logId,
      adminId: adminUser.id,
      adminName: adminUser.name,
      action: 'TOGGLE_STATUS' as const,
      targetUserId: userId,
      targetUserName: user.name,
      details: `Changed status for ${user.name} to ${newStatus}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userId, status: newStatus },
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
