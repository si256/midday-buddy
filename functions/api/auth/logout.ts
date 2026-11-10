import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { extractToken, getCorsHeaders, clearSessionCookie } from '../../auth';
import { hashToken } from '../../crypto';

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
    const token = extractToken(request);
    if (token && env.DB) {
      await ensureD1Schema(env.DB);
      const tokenHash = await hashToken(token);
      await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?;`).bind(tokenHash).run().catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, message: 'Logged out successfully.' }), {
      status: 200,
      headers: {
        ...cors,
        'Set-Cookie': clearSessionCookie(),
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        ...cors,
        'Set-Cookie': clearSessionCookie(),
      },
    });
  }
};
