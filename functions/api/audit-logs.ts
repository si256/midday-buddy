import type { AppEnv, PagesFunction } from '../env';
import { ensureD1Schema } from '../db';
import { requireAuth, requireRole, getCorsHeaders } from '../auth';

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
    // Strict authentication: Only administrators can view security audit logs
    const user = await requireAuth(request, env.DB);
    requireRole(user, ['community_admin', 'platform_admin']);

    let query = `
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
    `;
    const params: any[] = [];

    if (user.role === 'community_admin') {
      // Scoped audit trail for campus admin
      query += ` WHERE details LIKE ? OR admin_id = ?`;
      params.push(`%${user.campusId}%`, user.id);
    }

    query += ` ORDER BY timestamp DESC LIMIT 200;`;

    const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
    const { results } = await stmt.all<any>();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch audit logs.' }), {
      status: 500,
      headers: cors,
    });
  }
};
