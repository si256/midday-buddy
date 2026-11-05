import type { AppEnv, PagesFunction } from '../env';

const DEFAULT_USERS = [
  {
    id: 'usr_admin',
    email: 'admin@middaybuddy.com',
    password: 'Admin@12345',
    name: 'System Administrator',
    employeeId: 'ADM-001',
    roleTitle: 'Platform Administrator',
    campusId: 'comm_siruseri',
    avatarBgColor: 'bg-indigo-600',
    bio: 'Platform administration and member verification for MidDay Buddy.',
    icebreaker: 'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
    interests: ['Workplace Well-being', 'Technology', 'Community'],
    dietary: 'Any',
    socialBattery: 'Balanced Banter',
    role: 'community_admin',
    status: 'approved',
    registeredAt: '2026-11-01T00:00:00Z',
    approvedAt: '2026-11-01T00:00:00Z',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify(DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, email, campus_id as campusId, role_title as roleTitle, status, role, employee_id as employeeId, registered_at as registeredAt FROM users ORDER BY registered_at DESC`
    ).all();

    return new Response(JSON.stringify(results && results.length > 0 ? results : DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify(DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    const id = body.id || `usr_${Date.now()}`;
    const nowISO = new Date().toISOString();

    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO users (id, name, email, campus_id, role_title, status, role, employee_id, registered_at)
         VALUES (?, ?, ?, ?, ?, 'pending_approval', 'user', ?, ?)`
      ).bind(
        id,
        body.name,
        body.email,
        body.campusId || 'comm_siruseri',
        body.roleTitle || 'Software Engineer',
        body.employeeId || 'EMP-000',
        nowISO
      ).run();
    }

    return new Response(
      JSON.stringify({
        id,
        name: body.name,
        email: body.email,
        campusId: body.campusId,
        roleTitle: body.roleTitle,
        status: 'pending_approval',
        role: 'user',
        registeredAt: nowISO,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
