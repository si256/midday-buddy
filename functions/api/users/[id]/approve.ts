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

    let targetUserName = userId;

    if (env.DB) {
      await ensureD1Schema(env.DB);

      const user = await env.DB.prepare(`SELECT name FROM users WHERE id = ?;`).bind(userId).first<{ name: string }>().catch(() => null);
      if (user?.name) {
        targetUserName = user.name;
      }

      await env.DB.prepare(
        `UPDATE users SET status = 'approved', approved_at = ? WHERE id = ?;`
      ).bind(nowISO, userId).run().catch(() => {});

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'APPROVE_USER', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, userId, targetUserName, `Approved membership for ${targetUserName}`, nowISO).run().catch(() => {});
    }

    const log = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'APPROVE_USER' as const,
      targetUserId: userId,
      targetUserName,
      details: `Approved membership for ${targetUserName}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userId, status: 'approved', approvedAt: nowISO },
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
