import type { AppEnv, PagesFunction } from '../../env';

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
  const { request } = context;
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  return new Response(
    JSON.stringify({
      user: {
        id: 'usr_admin',
        email: 'admin@middaybuddy.com',
        name: 'System Administrator',
        role: 'community_admin',
        status: 'approved',
      },
    }),
    { status: 200, headers: CORS_HEADERS }
  );
};
