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

  const url = new URL(request.url);

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Endpoint not found',
      path: url.pathname,
      timestamp: Date.now(),
    }),
    {
      status: 404,
      headers: CORS_HEADERS,
    }
  );
};
