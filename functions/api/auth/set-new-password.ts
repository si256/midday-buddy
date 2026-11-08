import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth } from '../../auth';
import { hashPassword } from '../../crypto';

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
    const newPassword = (body.newPassword || '').trim();

    if (!newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'New password must be at least 6 characters long.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    // Hash the new password using PBKDF2
    const hashedPassword = await hashPassword(newPassword);

    await env.DB.prepare(`
      UPDATE users 
      SET password_hash = ?, password = NULL, must_change_password = 0, password_reset_approved = 0 
      WHERE id = ?;
    `).bind(hashedPassword, user.id).run();

    // Mark any approved reset requests as completed
    await env.DB.prepare(`
      UPDATE reset_requests 
      SET status = 'completed' 
      WHERE user_id = ? AND status = 'approved';
    `).bind(user.id).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update password.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
