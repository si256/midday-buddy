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
    const { name, email, password, campusId, roleTitle, interests, dietary, icebreaker } = body;
    const employeeId = (body.employeeId || body.employee_id || '').trim();

    if (!name || !email || !password || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Please provide full name, Email ID, password, and Employee ID.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters long.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();
    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowISO = new Date().toISOString();

    const newUser = {
      id: newUserId,
      email: trimmedEmail,
      name: name.trim(),
      employeeId: trimmedEmpId,
      campusId: campusId || 'comm_siruseri',
      roleTitle: roleTitle?.trim() || 'Software Engineer',
      avatarBgColor: 'bg-emerald-600',
      avatarSeed: name.trim(),
      bio: `Colleague at ${campusId || 'Workplace Campus'}.`,
      icebreaker: icebreaker?.trim() || 'Let us grab chai and exchange ideas!',
      interests: Array.isArray(interests) ? interests : ['Chai', 'Technology'],
      dietary: dietary || 'Any',
      socialBattery: 'Balanced Banter',
      status: 'pending_approval',
      role: 'user',
      registeredAt: nowISO,
      password,
    };

    if (env.DB) {
      // 1. Ensure schema and self-heal any missing columns
      await ensureD1Schema(env.DB);

      // 2. Check existing email
      const existingEmail = await env.DB.prepare(
        `SELECT id, status FROM users WHERE LOWER(email) = ?;`
      ).bind(trimmedEmail).first<{ id: string; status: string }>().catch(() => null);

      if (existingEmail) {
        if (existingEmail.status === 'rejected') {
          // Clean up old rejected application so user can re-apply cleanly
          await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(existingEmail.id).run().catch(() => {});
        } else if (existingEmail.status === 'pending_approval') {
          return new Response(
            JSON.stringify({ error: 'An application with this Email ID is already awaiting campus administrator approval.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({ error: 'This Email ID is already registered. Please sign in or use Forgot Password.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }

      // Check existing Employee ID
      const existingEmp = await env.DB.prepare(
        `SELECT id, status FROM users WHERE UPPER(employee_id) = ?;`
      ).bind(trimmedEmpId).first<{ id: string; status: string }>().catch(() => null);

      if (existingEmp) {
        if (existingEmp.status === 'rejected') {
          // Clean up old rejected application so user can re-apply cleanly
          await env.DB.prepare(`DELETE FROM users WHERE id = ?;`).bind(existingEmp.id).run().catch(() => {});
        } else if (existingEmp.status === 'pending_approval') {
          return new Response(
            JSON.stringify({ error: 'An application with this Employee ID is already awaiting administrator approval.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({ error: 'This Employee ID is already registered to another active account. Please sign in.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }

      // 3. Dynamically inspect table columns to guarantee error-free INSERT
      const tableInfo = await env.DB.prepare(`PRAGMA table_info(users);`).all<{ name: string }>().catch(() => ({ results: [] }));
      const cols = new Set((tableInfo?.results || []).map((c) => c.name.toLowerCase()));

      const insertCols: string[] = ['id', 'email'];
      const insertVals: any[] = [newUserId, trimmedEmail];

      if (cols.has('password')) {
        insertCols.push('password');
        insertVals.push(password);
      }
      if (cols.has('password_hash')) {
        insertCols.push('password_hash');
        insertVals.push(password);
      }
      if (cols.has('name')) {
        insertCols.push('name');
        insertVals.push(name.trim());
      }
      if (cols.has('employee_id')) {
        insertCols.push('employee_id');
        insertVals.push(trimmedEmpId);
      }
      if (cols.has('campus_id')) {
        insertCols.push('campus_id');
        insertVals.push(campusId || 'comm_siruseri');
      }
      if (cols.has('role_title')) {
        insertCols.push('role_title');
        insertVals.push(roleTitle?.trim() || 'Software Engineer');
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

    const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const { password: _, ...safeUser } = newUser;

    return new Response(
      JSON.stringify({
        token,
        user: safeUser,
        message: 'Account created. Waiting approval by admin.',
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Registration failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
