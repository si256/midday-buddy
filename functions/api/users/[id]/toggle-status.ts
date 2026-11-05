import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';

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
    const body: any = await request.json().catch(() => ({}));
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    let newStatus = 'suspended';
    let targetUserName = userId;

    if (env.DB) {
      await ensureD1Schema(env.DB);

      const user = await env.DB.prepare(`SELECT name, status FROM users WHERE id = ?;`).bind(userId).first<{ name: string; status: string }>().catch(() => null);
      if (user) {
        targetUserName = user.name || userId;
        newStatus = user.status === 'suspended' ? 'approved' : 'suspended';
      }

      await env.DB.prepare(
        `UPDATE users SET status = ? WHERE id = ?;`
      ).bind(newStatus, userId).run().catch(() => {});

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'TOGGLE_STATUS', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, userId, targetUserName, `Changed status for ${targetUserName} to ${newStatus}`, nowISO).run().catch(() => {});
    }

    const log = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'TOGGLE_STATUS' as const,
      targetUserId: userId,
      targetUserName,
      details: `Changed status for ${targetUserName} to ${newStatus}`,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
