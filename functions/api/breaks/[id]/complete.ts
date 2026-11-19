import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, getCorsHeaders } from '../../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const breakId = decodeURIComponent(params.id as string);
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    const post = await env.DB.prepare(
      `SELECT * FROM breaks WHERE id = ?;`
    ).bind(breakId).first<any>();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Break not found' }), {
        status: 404,
        headers: cors,
      });
    }

    // Ownership check: only owner or campus/platform admin can complete
    if (post.user_id !== user.id && user.role !== 'community_admin' && user.role !== 'platform_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: You can only complete your own breaks.' }), {
        status: 403,
        headers: cors,
      });
    }

    // Mark completed by expiring now
    await env.DB.prepare(`UPDATE breaks SET expires_at = ? WHERE id = ?;`).bind(Date.now(), breakId).run();

    return new Response(JSON.stringify({ success: true, completedBreakId: breakId }), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to complete break' }), {
      status: 500,
      headers: cors,
    });
  }
};
