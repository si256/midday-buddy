import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth } from '../auth';

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

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);

    const { results } = await env.DB.prepare(`
      SELECT 
        id, 
        user_id as userId, 
        title, 
        body, 
        type, 
        is_read as isRead, 
        created_at as createdAt, 
        reference_id as referenceId
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
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is unavailable.' }), {
        status: 503,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    const user = await requireAuth(request, env.DB);
    const body: any = await request.json().catch(() => ({}));

    if (body.action === 'mark_all_read') {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ?;`
      ).bind(user.id).run();
      return new Response(JSON.stringify({ success: true, message: 'All notifications marked as read.' }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    if (body.notificationId) {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id = 'all');`
      ).bind(body.notificationId, user.id).run();
      return new Response(JSON.stringify({ success: true, markedId: body.notificationId }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Operation failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
