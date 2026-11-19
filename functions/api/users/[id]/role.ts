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
    // Strict requirement: Only platform_admin can change user administrative roles
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['platform_admin']);

    const body: any = await request.json().catch(() => ({}));
    const newRole = body.role === 'community_admin' ? 'community_admin' : 'user';

    const user = await env.DB.prepare(`SELECT name, email, role, campus_id FROM users WHERE id = ?;`).bind(userId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // Protect against self-demotion if caller is the last platform admin
    if (userId === adminUser.id && newRole === 'user') {
      const otherAdmins = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM users WHERE role = 'platform_admin' AND id != ?;`
      ).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 }));

      if (!otherAdmins || otherAdmins.count === 0) {
        return new Response(JSON.stringify({ error: 'Forbidden: Cannot demote the sole platform administrator.' }), {
          status: 403,
          headers: cors,
        });
      }
    }

    const newRoleTitle = newRole === 'community_admin' ? 'Campus Administrator' : 'Software Engineer';
    await env.DB.prepare(
      `UPDATE users SET role = ?, role_title = ? WHERE id = ?;`
    ).bind(newRole, newRoleTitle, userId).run();

    const nowISO = new Date().toISOString();
    const actionText = newRole === 'community_admin' ? 'Promoted to Campus Admin' : 'Revoked Campus Admin rights';

    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'CHANGE_ROLE', ?, ?, ?, ?);
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
        user: { ...user, id: userId, role: newRole, roleTitle: newRoleTitle },
        log: {
          id: logId,
          adminId: adminUser.id,
          adminName: adminUser.name,
          action: 'CHANGE_ROLE',
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to update user role.' }), {
      status: 500,
      headers: cors,
    });
  }
};
