import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const userId = decodeURIComponent(params.id as string);

  if (userId === 'usr_admin' || userId === 'admin') {
    return new Response(JSON.stringify({ error: 'Master Administrator account cannot be deleted.' }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body: any = await request.json().catch(() => ({}));
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    let targetUserName = userId;

    if (env.DB) {
      await ensureD1Schema(env.DB);

      const user = await env.DB.prepare(`SELECT name FROM users WHERE id = ?;`).bind(userId).first<{ name: string }>().catch(() => null);
      if (user?.name) {
        targetUserName = user.name;
      }

      // Delete user from users table
      await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(userId).run().catch(() => {});
      // Also delete any breaks posted by user
      await env.DB.prepare(`DELETE FROM breaks WHERE user_id = ?;`).bind(userId).run().catch(() => {});
      // Also delete any reset requests
      await env.DB.prepare(`DELETE FROM reset_requests WHERE user_id = ?;`).bind(userId).run().catch(() => {});
      // Also delete any chat messages sent by user
      await env.DB.prepare(`DELETE FROM messages WHERE sender_id = ?;`).bind(userId).run().catch(() => {});

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'DELETE_USER', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, userId, targetUserName, `Deleted user account for ${targetUserName}`, nowISO).run().catch(() => {});
    }

    const log = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'DELETE_USER' as any,
      targetUserId: userId,
      targetUserName,
      details: `Deleted user account for ${targetUserName}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        deletedUserId: userId,
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
