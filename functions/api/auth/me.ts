import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, getCorsHeaders } from '../../auth';
import { generateCsrfToken } from '../../crypto';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
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
    const user = await requireAuth(request, env.DB);

    const csrfToken = user.rawSessionToken ? await generateCsrfToken(user.rawSessionToken) : null;
    const { rawSessionToken: _, ...safeUser } = user;

    return new Response(
      JSON.stringify({
        user: safeUser,
        csrfToken,
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired session.' }), {
      status: 401,
      headers: cors,
    });
  }
};
