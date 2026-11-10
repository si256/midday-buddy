import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth, getCorsHeaders } from '../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const communityId = url.searchParams.get('communityId') || 'comm_siruseri';
  const breakType = url.searchParams.get('breakType');
  const now = Date.now();
  const cors = getCorsHeaders(request);

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: cors,
    });
  }

  try {
    await ensureD1Schema(env.DB);
    let query = `
      SELECT b.*, u.name as user_name, u.role_title as user_role, u.avatar_seed, u.avatar_bg
      FROM breaks b
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.community_id = ? AND b.expires_at > ?
    `;
    const params: any[] = [communityId, now];

    if (breakType && breakType !== 'all') {
      query += ` AND b.break_type = ?`;
      params.push(breakType);
    }

    query += ` ORDER BY b.created_at DESC LIMIT 50;`;

    const { results } = await env.DB.prepare(query).bind(...params).all();

    const formatted = (results || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name || 'Campus Colleague',
      userRole: row.user_role || 'Software Engineer',
      communityId: row.community_id,
      breakType: row.break_type,
      zone: row.zone,
      locationName: row.location_name,
      customNote: row.custom_note || '',
      durationMinutes: row.duration_minutes || 15,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      avatarSeed: row.avatar_seed,
      avatarBgColor: row.avatar_bg || 'bg-amber-600',
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: cors,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to fetch active breaks.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    if (user.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only verified and approved members can broadcast breaks.' }),
        { status: 403, headers: cors }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const id = body.id || `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    const duration = Math.min(Math.max(parseInt(body.durationMinutes, 10) || 15, 5), 60);
    const expiresAt = now + duration * 60 * 1000;
    const breakType = ['tea', 'lunch', 'walk', 'sports'].includes(body.breakType) ? body.breakType : 'tea';
    const zone = (body.zone || 'Central Spine').trim();
    const locationName = (body.locationName || 'Central Spine Kiosk').trim();
    const customNote = (body.customNote || '').trim();
    const communityId = body.communityId || user.campusId || 'comm_siruseri';

    // Insert break with session-derived user.id (prevent spoofing)
    await env.DB.prepare(
      `INSERT INTO breaks (id, user_id, community_id, break_type, zone, location_name, custom_note, duration_minutes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      communityId,
      breakType,
      zone,
      locationName,
      customNote,
      duration,
      expiresAt,
      now
    ).run();

    const createdPost = {
      id,
      userId: user.id,
      userName: user.name,
      userRole: user.roleTitle,
      communityId,
      breakType,
      zone,
      locationName,
      customNote,
      durationMinutes: duration,
      expiresAt,
      createdAt: now,
      avatarSeed: user.avatarSeed,
      avatarBgColor: user.avatarBgColor || 'bg-amber-600',
    };

    return new Response(JSON.stringify(createdPost), {
      status: 201,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to create break.' }), {
      status: 500,
      headers: cors,
    });
  }
};
