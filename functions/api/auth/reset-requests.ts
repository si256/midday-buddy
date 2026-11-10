import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../auth';

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
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['community_admin', 'platform_admin']);

    let query = `
      SELECT 
        r.id, 
        r.user_id as userId, 
        r.user_name as userName, 
        r.email, 
        r.employee_id as employeeId, 
        r.status, 
        r.created_at as createdAt, 
        r.approved_at as approvedAt,
        u.campus_id as campusId
      FROM reset_requests r
      LEFT JOIN users u ON r.user_id = u.id
    `;
    const params: any[] = [];

    // Campus admin can only see reset requests within their assigned campus
    if (adminUser.role === 'community_admin') {
      query += ` WHERE u.campus_id = ?`;
      params.push(adminUser.campusId);
    }

    query += ` ORDER BY r.created_at DESC;`;

    const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch password reset requests.' }), {
      status: 500,
      headers: cors,
    });
  }
};
