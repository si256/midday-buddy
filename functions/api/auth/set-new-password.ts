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
    const { userId, newPassword } = body;

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'User ID and new password are required.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters long.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (env.DB) {
      await ensureD1Schema(env.DB);
      const tableInfo = await env.DB.prepare(`PRAGMA table_info(users);`).all<{ name: string }>().catch(() => ({ results: [] }));
      const cols = new Set((tableInfo?.results || []).map((c) => c.name.toLowerCase()));

      const setClauses: string[] = [];
      const setVals: any[] = [];

      if (cols.has('password')) {
        setClauses.push('password = ?');
        setVals.push(newPassword);
      }
      if (cols.has('password_hash')) {
        setClauses.push('password_hash = ?');
        setVals.push(newPassword);
      }
      if (cols.has('must_change_password')) {
        setClauses.push('must_change_password = 0');
      }
      if (cols.has('password_reset_approved')) {
        setClauses.push('password_reset_approved = 0');
      }

      if (setClauses.length > 0) {
        setVals.push(userId);
        await env.DB.prepare(
          `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`
        ).bind(...setVals).run().catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully. Please sign in with your new password.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to update password.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
