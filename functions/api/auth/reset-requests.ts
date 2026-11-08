import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole } from '../../auth';

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
    requireRole(user, ['community_admin', 'platform_admin']);

    const { results } = await env.DB.prepare(`
      SELECT 
        id, 
        user_id as userId, 
        user_name as userName, 
        email, 
        employee_id as employeeId, 
        status, 
        created_at as createdAt, 
        approved_at as approvedAt 
      FROM reset_requests 
      WHERE status = 'pending' 
      ORDER BY created_at DESC;
    `).all<any>();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch reset requests.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
