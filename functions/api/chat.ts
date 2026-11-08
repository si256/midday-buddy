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
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId') || url.pathname.split('/').pop() || 'general';

  try {
    if (!env.DB) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    await ensureD1Schema(env.DB);
    await requireAuth(request, env.DB);

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
    `).bind(conversationId).all<any>();

    return new Response(JSON.stringify(results || []), {
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

    if (user.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only verified campus members can send messages.' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    const body: any = await request.json().catch(() => ({}));
    const conversationId = (body.conversationId || 'general').trim();
    const text = (body.text || '').trim();

    if (!text) {
      return new Response(JSON.stringify({ error: 'Message text cannot be empty.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

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
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to send message.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
