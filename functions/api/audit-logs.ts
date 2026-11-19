import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth, requireRole } from '../auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  await ensureD1Schema(env.DB);

  try {
    const user = await requireAuth(request, env.DB);
    requireRole(user, ['community_admin', 'platform_admin']);

    const query = await env.DB.prepare(`
      SELECT 
        id, 
        admin_id as adminId, 
        admin_name as adminName, 
        action, 
        target_user_id as targetUserId, 
        target_user_name as targetUserName, 
        details, 
        timestamp
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT 200
    `).all();

    const logs = query.results || [];
    return new Response(JSON.stringify(logs), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, {
        status: err.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    console.error('Failed to fetch audit logs:', err);
    return new Response(JSON.stringify({ error: 'Failed to retrieve audit logs' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
