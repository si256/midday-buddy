import type { AppEnv, PagesFunction } from '../env';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const communityId = url.searchParams.get('communityId') || 'tcs-siruseri-chennai';
  const now = Date.now();

  // If D1 is not bound yet, return a helpful notice with empty array
  if (!env.DB) {
    return new Response(
      JSON.stringify({
        status: 'fallback',
        message: 'D1 database binding not detected yet. Add DB binding in Cloudflare Dashboard.',
        breaks: [],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
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

    return new Response(
      JSON.stringify({
        status: 'success',
        breaks: results || [],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Database query error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: 'D1 binding missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: any = await request.json();
    const id = body.id || `post_${Date.now()}`;
    const now = Date.now();
    const duration = body.durationMinutes || 15;
    const expiresAt = now + duration * 60 * 1000;

    await env.DB.prepare(
      `INSERT INTO breaks (id, user_id, community_id, break_type, zone, location_name, custom_note, duration_minutes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.userId,
      body.communityId || 'tcs-siruseri-chennai',
      body.breakType || 'tea',
      body.zone || 'Central Spine',
      body.locationName || 'Central Spine Kiosk',
      body.customNote || '',
      duration,
      expiresAt,
      now
    ).run();

    return new Response(
      JSON.stringify({ success: true, id, expiresAt }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to create break' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
