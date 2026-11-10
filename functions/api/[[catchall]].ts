import type { AppEnv, PagesFunction } from '../env';
import { getCorsHeaders } from '../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const { request } = context;
  const cors = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors,
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
      headers: cors,
    }
  );
};
