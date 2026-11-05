import type { AppEnv, PagesFunction } from '../../env';

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
    const { name, email, password, employeeId, campusId, roleTitle, interests, dietary, icebreaker } = body;

    if (!name || !email || !password || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Please provide full name, Email ID, password, and TCS Employee ID.' }),
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
      // Check existing email
      const existingEmail = await env.DB.prepare(
        `SELECT id FROM users WHERE LOWER(email) = ?`
      ).bind(trimmedEmail).first();

      if (existingEmail) {
        return new Response(
          JSON.stringify({ error: 'This Email ID is already registered. Please sign in or use another email.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      await env.DB.prepare(
        `INSERT INTO users (id, email, password, name, employee_id, campus_id, role_title, status, role, registered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', 'user', ?)`
      ).bind(
        newUserId,
        trimmedEmail,
        password,
        name.trim(),
        trimmedEmpId,
        campusId || 'comm_siruseri',
        roleTitle?.trim() || 'Software Engineer',
        nowISO
      ).run();
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
