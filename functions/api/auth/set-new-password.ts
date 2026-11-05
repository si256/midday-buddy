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
      await env.DB.prepare(
        `UPDATE users SET password = ?, must_change_password = 0, password_reset_approved = 0 WHERE id = ?`
      ).bind(newPassword, userId).run();
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
