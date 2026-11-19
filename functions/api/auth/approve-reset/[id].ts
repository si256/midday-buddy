import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const requestId = decodeURIComponent(params.id as string);
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['community_admin', 'platform_admin']);

    // 1. Fetch reset request record
    const resetReq = await env.DB.prepare(
      `SELECT r.*, u.campus_id as campusId FROM reset_requests r JOIN users u ON r.user_id = u.id WHERE r.id = ?;`
    ).bind(requestId).first<any>();

    if (!resetReq) {
      return new Response(JSON.stringify({ error: 'Password reset request not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // 2. Strict Campus Isolation check
    requireRole(adminUser, ['community_admin', 'platform_admin'], resetReq.campusId);

    const nowISO = new Date().toISOString();

    // 3. Mark request approved with authenticated admin identity
    await env.DB.prepare(`
      UPDATE reset_requests 
      SET status = 'approved', approved_at = ?, admin_id = ?
      WHERE id = ?;
    `).bind(nowISO, adminUser.id, requestId).run();

    // 4. Update target user state: allow passwordless temporary access to change password
    await env.DB.prepare(`
      UPDATE users 
      SET password_reset_approved = 1, must_change_password = 1 
      WHERE id = ?;
    `).bind(resetReq.user_id).run();

    // 5. Revoke all active sessions for security
    await env.DB.prepare(`
      DELETE FROM sessions WHERE user_id = ?;
    `).bind(resetReq.user_id).run();

    // 6. Security audit trail with authenticated admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'APPROVE_PASSWORD_RESET', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      resetReq.user_id,
      resetReq.user_name,
      `Approved password reset for ${resetReq.user_name} (${resetReq.email})`,
      nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset request approved. Target user can now sign in and set a new password.',
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to approve password reset request.' }), {
      status: 500,
      headers: cors,
    });
  }
};
