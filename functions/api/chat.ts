import type { AppEnv, PagesFunction } from '../env';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const conversationId = url.pathname.split('/').pop();

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
    ).bind(conversationId).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const conversationId = url.pathname.split('/').pop() || 'general';

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: any = await request.json();
    const id = `msg_${Date.now()}`;
    const now = Date.now();

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

    return new Response(
      JSON.stringify({
        id,
        conversationId,
        senderId: body.senderId,
        senderName: body.senderName,
        text: body.text,
        timestamp: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
