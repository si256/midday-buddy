import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';

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
    const body: any = await request.json().catch(() => ({}));
    const newRole = body.role === 'community_admin' ? 'community_admin' : 'user';
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    if ((userId === 'usr_admin' || userId === 'admin') && newRole !== 'community_admin') {
      return new Response(JSON.stringify({ error: 'Master Administrator role cannot be revoked.' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    let targetUserName = userId;

    if (env.DB) {
      await ensureD1Schema(env.DB);

      const user = await env.DB.prepare(`SELECT name FROM users WHERE id = ?;`).bind(userId).first<{ name: string }>().catch(() => null);
      if (user?.name) {
        targetUserName = user.name;
      }

      await env.DB.prepare(
        `UPDATE users SET role = ? WHERE id = ?;`
      ).bind(newRole, userId).run().catch(() => {});

      const logId = `log_${Date.now()}`;
      const actionText = newRole === 'community_admin' ? 'Promoted to Campus Admin' : 'Revoked Campus Admin rights';
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'CHANGE_ROLE', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, userId, targetUserName, `${actionText} for ${targetUserName}`, nowISO).run().catch(() => {});
    }

    const log = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'CHANGE_ROLE' as any,
      targetUserId: userId,
      targetUserName,
      details: `Changed role for ${targetUserName} to ${newRole}`,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
