import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
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
    const currentUser = await requireAuth(request, env.DB);

    const user = await env.DB.prepare(
      `SELECT id, email, name, employee_id as employeeId, campus_id as campusId,
              role_title as roleTitle, status, role, bio, icebreaker, interests,
              dietary, social_battery as socialBattery, avatar_seed as avatarSeed,
              avatar_bg as avatarBgColor, registered_at as registeredAt, approved_at as approvedAt
       FROM users WHERE id = ?;`
    ).bind(userId).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    const isAdmin = currentUser.role === 'community_admin' || currentUser.role === 'platform_admin';
    const isSelf = currentUser.id === userId;

    if (!isAdmin && !isSelf) {
      // Redact private fields for non-admin viewers
      return new Response(
        JSON.stringify({
          id: user.id,
          name: user.name,
          roleTitle: user.roleTitle,
          campusId: user.campusId,
          bio: user.bio,
          icebreaker: user.icebreaker,
          interests: typeof user.interests === 'string' ? JSON.parse(user.interests) : user.interests,
          dietary: user.dietary,
          socialBattery: user.socialBattery,
          avatarSeed: user.avatarSeed,
          avatarBgColor: user.avatarBgColor,
          status: user.status,
          role: user.role,
        }),
        { status: 200, headers: cors }
      );
    }

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch user profile.' }), {
      status: 500,
      headers: cors,
    });
  }
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
    const currentUser = await requireAuth(request, env.DB);

    const isSelf = currentUser.id === userId;
    const isAdmin = currentUser.role === 'community_admin' || currentUser.role === 'platform_admin';

    if (!isSelf && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to modify this profile.' }), {
        status: 403,
        headers: cors,
      });
    }

    const user = await env.DB.prepare(`SELECT * FROM users WHERE id = ?;`).bind(userId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    if (isAdmin && !isSelf && currentUser.role === 'community_admin') {
      requireRole(currentUser, ['community_admin', 'platform_admin'], user.campus_id);
    }

    const body: any = await request.json().catch(() => ({}));

    // Allowlisted profile fields
    const bio = body.bio !== undefined ? body.bio : user.bio;
    const icebreaker = body.icebreaker !== undefined ? body.icebreaker : user.icebreaker;
    const interests = body.interests !== undefined ? JSON.stringify(body.interests) : user.interests;
    const dietary = body.dietary !== undefined ? body.dietary : user.dietary;
    const socialBattery = body.socialBattery !== undefined ? body.socialBattery : user.social_battery;

    // Admin-only editable fields
    const name = (isAdmin && body.name) ? body.name.trim() : user.name;
    const roleTitle = (isAdmin && body.roleTitle) ? body.roleTitle.trim() : user.role_title;

    await env.DB.prepare(`
      UPDATE users 
      SET bio = ?, icebreaker = ?, interests = ?, dietary = ?, social_battery = ?, name = ?, role_title = ?
      WHERE id = ?;
    `).bind(bio, icebreaker, interests, dietary, socialBattery, name, roleTitle, userId).run();

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: user.email,
          name,
          employeeId: user.employee_id,
          campusId: user.campus_id,
          roleTitle,
          status: user.status,
          role: user.role,
          bio,
          icebreaker,
          interests: typeof interests === 'string' ? JSON.parse(interests) : interests,
          dietary,
          socialBattery,
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update user profile.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
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

    const user = await env.DB.prepare(`SELECT name, email, campus_id, role FROM users WHERE id = ?;`).bind(userId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: cors,
      });
    }

    // Protect against self-deletion by platform admins
    if (userId === adminUser.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: You cannot delete your own administrator account.' }), {
        status: 403,
        headers: cors,
      });
    }

    // Campus admin can only delete users in their campus
    if (adminUser.role === 'community_admin') {
      requireRole(adminUser, ['community_admin'], user.campus_id);
    }

    const nowISO = new Date().toISOString();

    // Cascaded delete
    await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM breaks WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM reset_requests WHERE user_id = ?;`).bind(userId).run().catch(() => {});

    // Audit log with session-derived admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'DELETE_USER', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      userId,
      user.name,
      `Deleted member account ${user.name} (${user.email})`,
      nowISO
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted member account for ${user.name}.`,
        log: {
          id: logId,
          adminId: adminUser.id,
          adminName: adminUser.name,
          action: 'DELETE_USER',
          targetUserId: userId,
          targetUserName: user.name,
          details: `Deleted member account ${user.name} (${user.email})`,
          timestamp: nowISO,
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete user.' }), {
      status: 500,
      headers: cors,
    });
  }
};
