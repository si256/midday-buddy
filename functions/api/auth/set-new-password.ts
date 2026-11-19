import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { hashPassword } from '../../crypto';
import { requireAuth, getCorsHeaders, clearSessionCookie } from '../../auth';

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
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const currentUser = await requireAuth(request, env.DB);

    const body: any = await request.json().catch(() => ({}));
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'New password must be at least 8 characters long.' }),
        { status: 400, headers: cors }
      );
    }

    // Hash new password using PBKDF2
    const hashedPassword = await hashPassword(newPassword);

    await env.DB.prepare(`
      UPDATE users 
      SET password_hash = ?, must_change_password = 0, password_reset_approved = 0 
      WHERE id = ?;
    `).bind(hashedPassword, currentUser.id).run();

    // Invalidate existing sessions so user logs in cleanly with new credentials
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?;`).bind(currentUser.id).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully. Please sign in with your new password.',
      }),
      {
        status: 200,
        headers: {
          ...cors,
          'Set-Cookie': clearSessionCookie(),
        },
      }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update password.' }), {
      status: 500,
      headers: cors,
    });
  }
};
