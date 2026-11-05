import type { AppEnv, PagesFunction } from '../env';

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
  const conversationId = url.pathname.split('/').pop();

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
    ).bind(conversationId).all();

    return new Response(JSON.stringify(results || []), {
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const conversationId = url.pathname.split('/').pop() || 'general';

  try {
    const body: any = await request.json().catch(() => ({}));
    const id = `msg_${Date.now()}`;
    const now = Date.now();

    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        conversationId,
        body.senderId,
        body.senderName,
        body.text,
        now
      ).run();
    }

    return new Response(
      JSON.stringify({
        id,
        conversationId,
        senderId: body.senderId,
        senderName: body.senderName,
        text: body.text,
        timestamp: now,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
