import type { AppEnv, PagesFunction } from '../../env';
import { extractToken } from '../../auth';
import { hashToken } from '../../crypto';

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
  const token = extractToken(request);

  if (token && env.DB) {
    try {
      const tokenHash = await hashToken(token);
      await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?;`).bind(tokenHash).run();
    } catch {
      // Continue even if session deletion fails
    }
  }

  return new Response(JSON.stringify({ success: true, message: 'Logged out successfully.' }), {
    status: 200,
    headers: CORS_HEADERS,
  });
};
