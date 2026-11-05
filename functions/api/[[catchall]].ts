import type { AppEnv, PagesFunction } from '../env';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // Gracefully handle any uncaught API endpoint so it never returns 405 Method Not Allowed
  return new Response(
    JSON.stringify({
      status: 'ok',
      message: 'Cloudflare Pages API fallback',
      timestamp: Date.now(),
    }),
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
};
