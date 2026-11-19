import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { getCorsHeaders } from '../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const cors = getCorsHeaders(request);

  try {
    const body: any = await request.json().catch(() => ({}));
    const { email, employeeId } = body;

    if (!email || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Email ID and Employee ID are required to request password reset.' }),
        { status: 400, headers: cors }
      );
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();

    const user = await env.DB.prepare(
      `SELECT id, name, email, employee_id, campus_id, status FROM users WHERE LOWER(email) = ? AND UPPER(employee_id) = ?;`
    ).bind(trimmedEmail, trimmedEmpId).first<any>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'No matching account found with this Email ID and Employee ID combination.' }),
        { status: 404, headers: cors }
      );
    }

    if (user.status === 'suspended') {
      return new Response(
        JSON.stringify({ error: 'Your account has been suspended. Please contact your campus administrator.' }),
        { status: 403, headers: cors }
      );
    }

    const requestId = `reset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowISO = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO reset_requests (id, user_id, user_name, email, employee_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?);
    `).bind(requestId, user.id, user.name, user.email, user.employee_id, nowISO).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset request submitted. Awaiting approval by campus administrator.',
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to submit password reset request.' }), {
      status: 500,
      headers: cors,
    });
  }
};
