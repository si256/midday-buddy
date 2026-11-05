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
    const reason = body.reason || 'Registration rejected by administrator.';
    const nowISO = new Date().toISOString();

    let targetUserName = userId;

    if (env.DB) {
      await ensureD1Schema(env.DB);

      // Find user name before rejecting
      const user = await env.DB.prepare(`SELECT name FROM users WHERE id = ?;`).bind(userId).first<{ name: string }>().catch(() => null);
      if (user?.name) {
        targetUserName = user.name;
      }

      // Mark as rejected in D1 so it never appears in pending approvals
      await env.DB.prepare(`UPDATE users SET status = 'rejected' WHERE id = ?;`).bind(userId).run().catch(() => {});

      // Record in audit logs
      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'REJECT_USER', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, userId, targetUserName, `Rejected registration for ${targetUserName}. Reason: ${reason}`, nowISO).run().catch(() => {});
    }

    const log = {
      id: `log_${Date.now()}`,
      adminId,
      adminName,
      action: 'REJECT_USER' as const,
      targetUserId: userId,
      targetUserName,
      details: `Rejected registration for ${targetUserName}. Reason: ${reason}`,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
