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
  const requestId = decodeURIComponent(params.id as string);

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

    const resetReq = await env.DB.prepare(
      `SELECT user_id, user_name, email FROM reset_requests WHERE id = ?;`
    ).bind(requestId).first<{ user_id: string; user_name: string; email: string }>().catch(() => null);

    if (!resetReq) {
      return new Response(JSON.stringify({ error: 'Reset request not found.' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    // 1. Mark reset request as approved
    await env.DB.prepare(
      `UPDATE reset_requests SET status = 'approved', approved_at = ?, admin_id = ? WHERE id = ?;`
    ).bind(nowISO, adminUser.id, requestId).run();

    // 2. Set user's password_reset_approved = 1 and force password change on next login
    await env.DB.prepare(
      `UPDATE users SET password_reset_approved = 1, must_change_password = 1 WHERE id = ?;`
    ).bind(resetReq.user_id).run();

    // 3. Invalidate any existing active sessions for security
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(resetReq.user_id).run();

    // 4. Audit log entry
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'APPROVE_RESET', ?, ?, ?, ?);
    `).bind(
      logId, adminUser.id, adminUser.name, resetReq.user_id, resetReq.user_name,
      `Approved password reset for ${resetReq.user_name} (${resetReq.email})`, nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset approved. The member can now sign in to set a new password.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Approval failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
