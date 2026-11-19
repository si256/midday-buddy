import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { hashPassword } from '../../crypto';
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
    const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } = body;
    const employeeId = (body.employeeId || body.employee_id || '').trim();

    if (!name || !email || !password || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Please provide full name, corporate Email ID, password, and Employee ID.' }),
        { status: 400, headers: cors }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long.' }),
        { status: 400, headers: cors }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);

    // 1. Check existing email
    const existingEmail = await env.DB.prepare(
      `SELECT id, status FROM users WHERE LOWER(email) = ?;`
    ).bind(trimmedEmail).first<{ id: string; status: string }>().catch(() => null);

    if (existingEmail) {
      if (existingEmail.status === 'rejected') {
        // Clean up old rejected application so applicant can re-apply cleanly
        await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(existingEmail.id).run().catch(() => {});
      } else if (existingEmail.status === 'pending_approval') {
        return new Response(
          JSON.stringify({ error: 'An application with this Email ID is already awaiting campus administrator approval.' }),
          { status: 400, headers: cors }
        );
      } else {
        return new Response(
          JSON.stringify({ error: 'This Email ID is already registered. Please sign in or request a password reset.' }),
          { status: 400, headers: cors }
        );
      }
    }

    // 2. Check existing Employee ID
    const existingEmp = await env.DB.prepare(
      `SELECT id, status FROM users WHERE UPPER(employee_id) = ?;`
    ).bind(trimmedEmpId).first<{ id: string; status: string }>().catch(() => null);

    if (existingEmp) {
      if (existingEmp.status === 'rejected') {
        // Clean up old rejected application
        await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(existingEmp.id).run().catch(() => {});
      } else if (existingEmp.status === 'pending_approval') {
        return new Response(
          JSON.stringify({ error: 'An application with this Employee ID is already awaiting campus administrator approval.' }),
          { status: 400, headers: cors }
        );
      } else {
        return new Response(
          JSON.stringify({ error: 'This Employee ID is already registered to an active account. Please sign in.' }),
          { status: 400, headers: cors }
        );
      }
    }

    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowISO = new Date().toISOString();
    const now = Date.now();

    // Secure PBKDF2 hash
    const hashedPassword = await hashPassword(password);
    const interestsJson = JSON.stringify(Array.isArray(interests) ? interests : ['Chai', 'Technology']);

    await env.DB.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, employee_id, campus_id, role_title,
        status, role, password_reset_approved, must_change_password,
        bio, icebreaker, interests, dietary, social_battery,
        registered_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        'pending_approval', 'user', 0, 0,
        ?, ?, ?, ?, 'Balanced Banter',
        ?, ?
      );
    `).bind(
      newUserId,
      trimmedEmail,
      hashedPassword,
      name.trim(),
      trimmedEmpId,
      campusId || 'comm_siruseri',
      roleTitle?.trim() || 'Software Engineer',
      `Colleague at ${campusId || 'Workplace Campus'}.`,
      icebreaker?.trim() || 'Let us grab chai and exchange ideas!',
      interestsJson,
      dietary || 'Any',
      nowISO,
      now
    ).run();

    // Notice: STRICTLY NO session token is returned! Account is pending manual administrator review!
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email: trimmedEmail,
          name: name.trim(),
          employeeId: trimmedEmpId,
          campusId: campusId || 'comm_siruseri',
          roleTitle: roleTitle?.trim() || 'Software Engineer',
          status: 'pending_approval',
          role: 'user',
        },
        message: 'Registration submitted successfully. Your account is pending administrator review and approval.',
      }),
      { status: 201, headers: cors }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Registration failed.' }), {
      status: 500,
      headers: cors,
    });
  }
};
