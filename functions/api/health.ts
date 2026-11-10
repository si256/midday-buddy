import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { getCorsHeaders } from '../auth';

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const isDbBound = Boolean(env.DB);
  const cors = getCorsHeaders(request);
  let hasAdmin = false;

  if (env.DB) {
    try {
      await ensureD1Schema(env.DB);
      const adminCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM users WHERE role IN ('community_admin', 'platform_admin') AND status = 'approved';`
      ).first<{ count: number }>().catch(() => ({ count: 0 }));
      hasAdmin = Boolean(adminCount && adminCount.count > 0);
    } catch {}
  }

  return new Response(
    JSON.stringify({
      status: 'online',
      message: 'MidDay Buddy Cloudflare Edge Backend is active!',
      databaseBound: isDbBound,
      hasAdmin,
      timestamp: Date.now(),
      environment: env.ENVIRONMENT || 'production',
    }),
    {
      headers: {
        ...cors,
        'Cache-Control': 'no-store',
      },
    }
  );
};
