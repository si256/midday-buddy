import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
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

    const user = await env.DB.prepare(`SELECT name, email, status, campus_id FROM users WHERE id = ?;`).bind(userId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // Campus admin can only toggle members belonging to their designated campus
    if (adminUser.role === 'community_admin' && user.campus_id && user.campus_id !== adminUser.campusId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You can only moderate members in your designated campus.' }), {
        status: 403,
        headers: cors,
      });
    }

    const nextStatus = user.status === 'suspended' ? 'approved' : 'suspended';
    await env.DB.prepare(`UPDATE users SET status = ? WHERE id = ?;`).bind(nextStatus, userId).run();

    // If suspended, immediately revoke active sessions
    if (nextStatus === 'suspended') {
      await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    }

    const nowISO = new Date().toISOString();
    const actionText = nextStatus === 'suspended' ? 'Suspended member access' : 'Reactivated member access';

    // Audit log with session-derived admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'TOGGLE_STATUS', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      userId,
      user.name,
      `${actionText} for ${user.name} (${user.email})`,
      nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        user: { ...user, status: nextStatus },
        log: {
          id: logId,
          adminId: adminUser.id,
          adminName: adminUser.name,
          action: 'TOGGLE_STATUS',
          targetUserId: userId,
          targetUserName: user.name,
          details: `${actionText} for ${user.name} (${user.email})`,
          timestamp: nowISO,
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update user status.' }), {
      status: 500,
      headers: cors,
    });
  }
};
