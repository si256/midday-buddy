import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, getCorsHeaders } from '../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const conversationId = decodeURIComponent(params.conversationId as string);
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

    // Verify conversation / break existence and campus authorization
    if (conversationId !== 'general') {
      const breakPost = await env.DB.prepare(
        `SELECT user_id, community_id, expires_at FROM breaks WHERE id = ?;`
      ).bind(conversationId).first<any>();

      if (!breakPost) {
        return new Response(JSON.stringify({ error: 'Break conversation not found.' }), {
          status: 404,
          headers: cors,
        });
      }

      // Strict Campus Authorization: Users can only participate in breaks in their own campus
      if (user.role !== 'platform_admin' && user.campusId !== breakPost.community_id) {
        return new Response(JSON.stringify({ error: 'Forbidden: You cannot access break conversations outside your registered campus.' }), {
          status: 403,
          headers: cors,
        });
      }
    }

    const { results } = await env.DB.prepare(`
      SELECT 
        id, 
        conversation_id as conversationId, 
        sender_id as senderId, 
        sender_name as senderName, 
        text, 
        created_at as timestamp 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC 
      LIMIT 100;
    `).bind(conversationId).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch messages.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const conversationId = decodeURIComponent(params.conversationId as string);
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

    if (user.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only verified campus members can send messages.' }), {
        status: 403,
        headers: cors,
      });
    }

    // Verify conversation / break existence and campus authorization
    if (conversationId !== 'general') {
      const breakPost = await env.DB.prepare(
        `SELECT user_id, community_id, expires_at FROM breaks WHERE id = ?;`
      ).bind(conversationId).first<any>();

      if (!breakPost) {
        return new Response(JSON.stringify({ error: 'Break conversation not found.' }), {
          status: 404,
          headers: cors,
        });
      }

      if (user.role !== 'platform_admin' && user.campusId !== breakPost.community_id) {
        return new Response(JSON.stringify({ error: 'Forbidden: You cannot participate in break conversations outside your registered campus.' }), {
          status: 403,
          headers: cors,
        });
      }
    }

    const body: any = await request.json().catch(() => ({}));
    const text = (body.text || '').trim();

    if (!text) {
      return new Response(JSON.stringify({ error: 'Message text cannot be empty.' }), {
        status: 400,
        headers: cors,
      });
    }

    if (text.length > 500) {
      return new Response(JSON.stringify({ error: 'Message cannot exceed 500 characters.' }), {
        status: 400,
        headers: cors,
      });
    }

    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    // Authenticated sender identity from session, NEVER client body!
    await env.DB.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `).bind(id, conversationId, user.id, user.name, text, now).run();

    return new Response(
      JSON.stringify({
        id,
        conversationId,
        senderId: user.id,
        senderName: user.name,
        text,
        timestamp: now,
      }),
      { status: 201, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to send message.' }), {
      status: 500,
      headers: cors,
    });
  }
};
