import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';

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

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const employeeId = (body.employeeId || body.employee_id || '').trim().toUpperCase();

    if (!email || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Email ID and Employee ID are required.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (env.DB) {
      await ensureD1Schema(env.DB);

      // Verify that user exists with this email and employee ID
      const user = await env.DB.prepare(
        `SELECT id, name, email, employee_id FROM users WHERE LOWER(email) = ? AND UPPER(employee_id) = ?;`
      ).bind(email, employeeId).first<{ id: string; name: string; email: string; employee_id: string }>().catch(() => null);

      if (user) {
        const requestId = `reset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const nowISO = new Date().toISOString();

        // Check if pending reset request already exists
        const existing = await env.DB.prepare(
          `SELECT id FROM reset_requests WHERE user_id = ? AND status = 'pending';`
        ).bind(user.id).first().catch(() => null);

        if (!existing) {
          await env.DB.prepare(`
            INSERT INTO reset_requests (id, user_id, user_name, email, employee_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?);
          `).bind(requestId, user.id, user.name, user.email, user.employee_id, nowISO).run();
        }
      }
    }

    // Generic response preventing account enumeration while genuine requests are saved
    return new Response(
      JSON.stringify({
        success: true,
        message: 'If an account matches those verified credentials, a password reset request has been queued for campus admin approval.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Request failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
