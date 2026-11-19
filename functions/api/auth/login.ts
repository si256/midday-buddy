import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { verifyPassword, generateSecureToken, hashToken, generateCsrfToken } from '../../crypto';
import { getCorsHeaders, createSessionCookie } from '../../auth';

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
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email ID and password are required.' }), {
        status: 400,
        headers: cors,
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);

    const user = await env.DB.prepare(
      `SELECT * FROM users WHERE LOWER(email) = ?`
    ).bind(trimmedEmail).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: cors,
      });
    }

    if (user.status === 'suspended') {
      return new Response(JSON.stringify({ error: 'Your account has been suspended by campus administration.' }), {
        status: 403,
        headers: cors,
      });
    }

    if (user.status === 'pending_approval') {
      return new Response(JSON.stringify({ error: 'Your account is pending administrator review and approval. You will be able to sign in once verified.' }), {
        status: 403,
        headers: cors,
      });
    }

    // Check if admin approved a password reset for this user
    if (user.password_reset_approved === 1 || user.password_reset_approved === true) {
      const rawToken = generateSecureToken('sess');
      const tokenHash = await hashToken(rawToken);
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      await env.DB.prepare(
        `UPDATE users SET password_reset_approved = 0, must_change_password = 1 WHERE id = ?`
      ).bind(user.id).run().catch(() => {});

      await env.DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
      ).bind(tokenHash, user.id, expiresAt, now).run().catch(() => {});

      const csrfToken = await generateCsrfToken(rawToken);
      const { password: _, password_hash: __, ...safeUser } = user;

      return new Response(
        JSON.stringify({
          token: rawToken,
          csrfToken,
          user: { ...safeUser, mustChangePassword: true },
          mustChangePassword: true,
          message: 'Password reset was approved by admin. Please choose a new password now.',
        }),
        {
          status: 200,
          headers: {
            ...cors,
            'Set-Cookie': createSessionCookie(rawToken),
          },
        }
      );
    }

    // Strict PBKDF2 hash verification ONLY
    const storedHash = user.password_hash;
    const isPasswordValid = await verifyPassword(password, storedHash);

    if (!isPasswordValid) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: cors,
      });
    }

    // Generate cryptographically secure session token and store hash in database
    const rawToken = generateSecureToken('sess');
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

    await env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
    ).bind(tokenHash, user.id, expiresAt, now).run();

    const csrfToken = await generateCsrfToken(rawToken);
    const { password: _, password_hash: __, ...safeUser } = user;

    return new Response(
      JSON.stringify({
        token: rawToken,
        csrfToken,
        user: safeUser,
        mustChangePassword: Boolean(user.must_change_password),
      }),
      {
        status: 200,
        headers: {
          ...cors,
          'Set-Cookie': createSessionCookie(rawToken),
        },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Login failed.' }), {
      status: 500,
      headers: cors,
    });
  }
};
