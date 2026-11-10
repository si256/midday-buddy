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

    const user = await env.DB.prepare(`SELECT name, email, employee_id, campus_id FROM users WHERE id = ?;`).bind(userId).first<{ name: string; email: string; employee_id: string; campus_id: string }>().catch(() => null);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // Campus admin can only reject users belonging to their campus
    if (adminUser.role === 'community_admin' && user.campus_id && user.campus_id !== adminUser.campusId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You can only reject applicants in your designated campus.' }), {
        status: 403,
        headers: cors,
      });
    }

    // Remove user record completely so employee ID & email lock are released
    await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM reset_requests WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});

    // Create audit log with session-derived admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'REJECT_USER', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      userId,
      user.name,
      `Rejected and cleaned application for ${user.name} (${user.email}, Emp ID: ${user.employee_id || 'N/A'})`,
      nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: `Rejected application for ${user.name}.`,
        log: {
          id: logId,
          adminId: adminUser.id,
          adminName: adminUser.name,
          action: 'REJECT_USER',
          targetUserId: userId,
          targetUserName: user.name,
          details: `Rejected and cleaned application for ${user.name} (${user.email}, Emp ID: ${user.employee_id || 'N/A'})`,
          timestamp: nowISO,
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to reject user.' }), {
      status: 500,
      headers: cors,
    });
  }
};
