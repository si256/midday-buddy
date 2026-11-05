import type { AppEnv, PagesFunction } from '../../env';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// In-memory fallback users for when D1 is not yet bound
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
    mustChangePassword: false,
    passwordResetApproved: false,
  },
];

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
    const { email, password } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email ID is required.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. If D1 is bound, query D1 database
    if (env.DB) {
      const user = await env.DB.prepare(
        `SELECT * FROM users WHERE LOWER(email) = ?`
      ).bind(trimmedEmail).first<any>();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
          status: 401,
          headers: CORS_HEADERS,
        });
      }

      if (user.password_reset_approved === 1 || user.password_reset_approved === true) {
        const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        await env.DB.prepare(
          `UPDATE users SET password_reset_approved = 0, must_change_password = 1 WHERE id = ?`
        ).bind(user.id).run();

        const { password: _, ...safeUser } = user;
        return new Response(
          JSON.stringify({
            token,
            user: { ...safeUser, mustChangePassword: true },
            mustChangePassword: true,
            message: 'Password reset was approved by admin. Please choose a new password now.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      if (!password) {
        return new Response(JSON.stringify({ error: 'Password is required.' }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }

      if (user.password && user.password !== password) {
        return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
          status: 401,
          headers: CORS_HEADERS,
        });
      }

      const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const { password: _, ...safeUser } = user;
      return new Response(
        JSON.stringify({
          token,
          user: safeUser,
          mustChangePassword: !!user.must_change_password,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. If D1 is not yet bound, fallback to initial in-memory user
    const user = DEFAULT_USERS.find((u) => u.email.toLowerCase() === trimmedEmail);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password is required.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (user.password !== password) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const { password: _, ...safeUser } = user;
    return new Response(
      JSON.stringify({
        token,
        user: safeUser,
        mustChangePassword: false,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Login failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
