import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth } from '../auth';

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
  const breakType = url.searchParams.get('breakType');
  const now = Date.now();

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
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
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    if (user.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Only verified and approved members can broadcast breaks.' }),
        { status: 403, headers: CORS_HEADERS }
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

    // Broadcast notification in database
    const notifId = `notif_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at, reference_id)
      VALUES (?, 'all', ?, ?, 'ping', 0, ?, ?);
    `).bind(
      notifId,
      `${user.name} stepped out for a ${breakType.toUpperCase()} break!`,
      `Meeting at ${locationName} (${zone}). "${customNote || 'Join me!'}"`,
      new Date().toISOString(),
      id
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
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
        createdAt: now,
        expiresAt,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to create break' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
