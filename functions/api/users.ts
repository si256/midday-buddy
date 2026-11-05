import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';

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
    await ensureD1Schema(env.DB);
    const { results } = await env.DB.prepare(
      `SELECT id, name, email, campus_id as campusId, role_title as roleTitle, status, role, employee_id as employeeId, registered_at as registeredAt FROM users ORDER BY created_at DESC`
    ).all().catch(async () => {
      return await env.DB!.prepare(`SELECT * FROM users;`).all();
    });

    return new Response(JSON.stringify(results && results.length > 0 ? results : DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  } catch {
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
      await ensureD1Schema(env.DB);

      const tableInfo = await env.DB.prepare(`PRAGMA table_info(users);`).all<{ name: string }>().catch(() => ({ results: [] }));
      const cols = new Set((tableInfo?.results || []).map((c) => c.name.toLowerCase()));

      const insertCols: string[] = ['id', 'email', 'name'];
      const insertVals: any[] = [id, body.email, body.name];

      if (cols.has('employee_id')) {
        insertCols.push('employee_id');
        insertVals.push(body.employeeId || 'EMP-000');
      }
      if (cols.has('campus_id')) {
        insertCols.push('campus_id');
        insertVals.push(body.campusId || 'comm_siruseri');
      }
      if (cols.has('role_title')) {
        insertCols.push('role_title');
        insertVals.push(body.roleTitle || 'Software Engineer');
      }
      if (cols.has('status')) {
        insertCols.push('status');
        insertVals.push('pending_approval');
      }
      if (cols.has('role')) {
        insertCols.push('role');
        insertVals.push('user');
      }
      if (cols.has('registered_at')) {
        insertCols.push('registered_at');
        insertVals.push(nowISO);
      }
      if (cols.has('created_at')) {
        insertCols.push('created_at');
        insertVals.push(Date.now());
      }

      const placeholders = insertCols.map(() => '?').join(', ');
      await env.DB.prepare(
        `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders})`
      ).bind(...insertVals).run();
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
