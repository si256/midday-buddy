import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole } from '../../auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const userId = decodeURIComponent(params.id as string);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    await requireAuth(request, env.DB);

    const user = await env.DB.prepare(`
      SELECT 
        id, name, email, campus_id as campusId, role_title as roleTitle,
        status, role, bio, icebreaker, interests, dietary,
        social_battery as socialBattery, avatar_seed as avatarSeed,
        avatar_bg as avatarBgColor, registered_at as registeredAt, approved_at as approvedAt
      FROM users WHERE id = ?;
    `).bind(userId).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    let parsedInterests: string[] = [];
    if (user.interests) {
      try {
        parsedInterests = typeof user.interests === 'string' ? JSON.parse(user.interests) : user.interests;
      } catch {
        parsedInterests = user.interests.split(',').map((s: string) => s.trim());
      }
    }

    return new Response(
      JSON.stringify({
        ...user,
        interests: parsedInterests,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const userId = decodeURIComponent(params.id as string);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const currentUser = await requireAuth(request, env.DB);

    // Permission check: only the account owner or campus/platform admin can update
    const isOwner = currentUser.id === userId;
    const isAdmin = currentUser.role === 'community_admin' || currentUser.role === 'platform_admin';

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to edit this profile.' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    const body: any = await request.json().catch(() => ({}));
    const updates: any = {};

    if (body.name) updates.name = body.name.trim();
    if (body.roleTitle) updates.role_title = body.roleTitle.trim();
    if (body.bio !== undefined) updates.bio = body.bio.trim();
    if (body.icebreaker !== undefined) updates.icebreaker = body.icebreaker.trim();
    if (body.dietary !== undefined) updates.dietary = body.dietary;
    if (body.socialBattery !== undefined) updates.social_battery = body.socialBattery;
    if (body.avatarBgColor !== undefined) updates.avatar_bg = body.avatarBgColor;
    if (body.avatarSeed !== undefined) updates.avatar_seed = body.avatarSeed;
    if (body.interests !== undefined) {
      updates.interests = Array.isArray(body.interests) ? JSON.stringify(body.interests) : body.interests;
    }

    // Only platform/campus admins can update campusId or role
    if (isAdmin && body.campusId) {
      updates.campus_id = body.campusId;
    }

    const setClauses: string[] = [];
    const setVals: any[] = [];
    for (const [key, val] of Object.entries(updates)) {
      setClauses.push(`${key} = ?`);
      setVals.push(val);
    }

    if (setClauses.length > 0) {
      setVals.push(userId);
      await env.DB.prepare(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?;`
      ).bind(...setVals).run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: { ...currentUser, ...body, id: userId },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const userId = decodeURIComponent(params.id as string);

  if (userId === 'usr_admin' || userId === 'admin') {
    return new Response(JSON.stringify({ error: 'Master Administrator account cannot be deleted.' }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }

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
    let targetUserName = userId;

    const user = await env.DB.prepare(`SELECT name FROM users WHERE id = ?;`).bind(userId).first<{ name: string }>().catch(() => null);
    if (user?.name) {
      targetUserName = user.name;
    }

    // Cascading deletions
    await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM breaks WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM reset_requests WHERE user_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM messages WHERE sender_id = ?;`).bind(userId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(userId).run().catch(() => {});

    // Genuine audit attribution from authenticated session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'DELETE_USER', ?, ?, ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, userId, targetUserName, `Deleted user account for ${targetUserName}`, nowISO).run().catch(() => {});

    const log = {
      id: logId,
      adminId: adminUser.id,
      adminName: adminUser.name,
      action: 'DELETE_USER' as any,
      targetUserId: userId,
      targetUserName,
      details: `Deleted user account for ${targetUserName}`,
      timestamp: nowISO,
    };

    return new Response(
      JSON.stringify({
        success: true,
        deletedUserId: userId,
        log,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
