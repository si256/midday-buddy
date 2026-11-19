import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { getSessionUser } from '../../auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  if (env.DB) {
    await ensureD1Schema(env.DB);
  }

  const user = await getSessionUser(request, env.DB);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Session is invalid or has expired.' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  return new Response(
    JSON.stringify({
      user,
    }),
    { status: 200, headers: CORS_HEADERS }
  );
};
