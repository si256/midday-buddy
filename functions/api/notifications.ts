import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth, getCorsHeaders } from '../auth';

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
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    const { results } = await env.DB.prepare(`
      SELECT 
        id, 
        user_id as userId, 
        title, 
        message, 
        type, 
        read as isRead, 
        created_at as createdAt
      FROM notifications
      WHERE user_id = ? OR user_id = 'all'
      ORDER BY created_at DESC
      LIMIT 40;
    `).bind(user.id).all<any>();

    const mapped = (results || []).map((n) => ({
      ...n,
      isRead: Boolean(n.isRead),
    }));

    return new Response(JSON.stringify(mapped), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch notifications.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
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
    const body: any = await request.json().catch(() => ({}));
    const notificationId = body.id;

    if (notificationId) {
      // Mark as read for this user
      await env.DB.prepare(`
        UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR user_id = 'all');
      `).bind(notificationId, user.id).run();
    } else {
      // Mark all read for this user
      await env.DB.prepare(`
        UPDATE notifications SET read = 1 WHERE user_id = ? OR user_id = 'all';
      `).bind(user.id).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update notifications.' }), {
      status: 500,
      headers: cors,
    });
  }
};
