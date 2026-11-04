import type { AppEnv, PagesFunction } from '../env';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM users ORDER BY created_at DESC`
    ).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: any = await request.json();
    const id = body.id || `usr_${Date.now()}`;
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO users (id, name, email, campus_id, role_title, status, role, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending_approval', 'user', ?)`
    ).bind(
      id,
      body.name,
      body.email,
      body.campusId || 'TCS-P-PENDING',
      body.roleTitle || 'Software Engineer',
      now
    ).run();

    return new Response(
      JSON.stringify({
        id,
        name: body.name,
        email: body.email,
        campusId: body.campusId,
        roleTitle: body.roleTitle,
        status: 'pending_approval',
        role: 'user',
        created_at: now,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
