import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { getCorsHeaders } from '../../auth';

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
      return new Response(JSON.stringify({ hasAdmin: false }), {
        status: 200,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const result = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM users WHERE role IN ('community_admin', 'platform_admin') AND status = 'approved';`
    ).first<{ count: number }>().catch(() => ({ count: 0 }));

    return new Response(
      JSON.stringify({
        hasAdmin: (result?.count || 0) > 0,
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to check administrator status.' }), {
      status: 500,
      headers: cors,
    });
  }
};
