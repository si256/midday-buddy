import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { verifyPassword, generateSecureToken, hashToken, hashPassword } from '../../crypto';

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
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email ID and password are required.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);

    const user = await env.DB.prepare(
      `SELECT * FROM users WHERE LOWER(email) = ?`
    ).bind(trimmedEmail).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    if (user.status === 'suspended') {
      return new Response(JSON.stringify({ error: 'Your account has been suspended by campus administration.' }), {
        status: 403,
        headers: CORS_HEADERS,
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

      const { password: _, password_hash: __, ...safeUser } = user;
      return new Response(
        JSON.stringify({
          token: rawToken,
          user: { ...safeUser, mustChangePassword: true },
          mustChangePassword: true,
          message: 'Password reset was approved by admin. Please choose a new password now.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Verify password with secure WebCrypto PBKDF2 (with backwards compatibility for legacy hashes)
    const storedHash = user.password_hash || user.password;
    const isPasswordValid = await verifyPassword(password, storedHash);

    if (!isPasswordValid) {
      return new Response(JSON.stringify({ error: 'Invalid Email ID or password.' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    // Re-hash password to modern PBKDF2 if it was stored as legacy plain text or weak hash
    if (!storedHash?.startsWith('pbkdf2$')) {
      const upgradedHash = await hashPassword(password);
      await env.DB.prepare(
        `UPDATE users SET password_hash = ?, password = NULL WHERE id = ?`
      ).bind(upgradedHash, user.id).run().catch(() => {});
    }

    // Generate cryptographically secure session token and store hash in database
    const rawToken = generateSecureToken('sess');
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

    await env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
    ).bind(tokenHash, user.id, expiresAt, now).run();

    const { password: _, password_hash: __, ...safeUser } = user;

    return new Response(
      JSON.stringify({
        token: rawToken,
        user: safeUser,
        mustChangePassword: Boolean(user.must_change_password),
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
