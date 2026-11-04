import type { AppEnv, PagesFunction } from '../env';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM communities ORDER BY name ASC`
    ).all();

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
