import type { AppEnv, PagesFunction } from '../env';

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

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const communityId = url.searchParams.get('communityId') || 'comm_siruseri';
  const now = Date.now();

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT b.*, u.name as user_name, u.role_title as user_role, u.avatar_seed, u.avatar_bg
       FROM breaks b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.community_id = ? AND b.expires_at > ?
       ORDER BY b.created_at DESC
       LIMIT 50`
    ).bind(communityId, now).all();

    return new Response(JSON.stringify(results || []), {
      headers: CORS_HEADERS,
    });
  } catch (error: any) {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    const id = body.id || `post_${Date.now()}`;
    const now = Date.now();
    const duration = body.durationMinutes || 15;
    const expiresAt = now + duration * 60 * 1000;

    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO breaks (id, user_id, community_id, break_type, zone, location_name, custom_note, duration_minutes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        body.userId,
        body.communityId || 'comm_siruseri',
        body.breakType || 'tea',
        body.zone || 'Central Spine',
        body.locationName || 'Central Spine Kiosk',
        body.customNote || '',
        duration,
        expiresAt,
        now
      ).run();
    }

    return new Response(
      JSON.stringify({
        id,
        userId: body.userId,
        communityId: body.communityId || 'comm_siruseri',
        breakType: body.breakType || 'tea',
        zone: body.zone || 'Central Spine',
        locationName: body.locationName || 'Central Spine Kiosk',
        customNote: body.customNote || '',
        durationMinutes: duration,
        createdAt: now,
        expiresAt,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to create break' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
