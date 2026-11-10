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
  const userId = params.id as string;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['community_admin', 'platform_admin']);

    const nowISO = new Date().toISOString();

    const user = await env.DB.prepare(`SELECT name, email, campus_id FROM users WHERE id = ?;`).bind(userId).first<{ name: string; email: string; campus_id: string }>().catch(() => null);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // Campus admin can only approve users belonging to their campus
    if (adminUser.role === 'community_admin' && user.campus_id && user.campus_id !== adminUser.campusId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You can only approve applicants in your designated campus.' }), {
        status: 403,
        headers: cors,
      });
    }

    await env.DB.prepare(
      `UPDATE users SET status = 'approved', approved_at = ? WHERE id = ?;`
    ).bind(nowISO, userId).run();

    // Create notification for the user
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, read, created_at)
      VALUES (?, ?, 'approval', 'Account Approved!', 'Your account has been verified. You can now access the break directory.', 0, ?);
    `).bind(`notif_${Date.now()}`, userId, Date.now()).run().catch(() => {});

    // Create audit log with session-derived admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'APPROVE_USER', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      userId,
      user.name,
      `Approved membership application for ${user.name} (${user.email})`,
      nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: `Approved ${user.name}.`,
        log: {
          id: logId,
          adminId: adminUser.id,
          adminName: adminUser.name,
          action: 'APPROVE_USER',
          targetUserId: userId,
          targetUserName: user.name,
          details: `Approved membership application for ${user.name} (${user.email})`,
          timestamp: nowISO,
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to approve user.' }), {
      status: 500,
      headers: cors,
    });
  }
};
