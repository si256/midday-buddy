import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';

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

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;

  try {
    const body: any = await request.json().catch(() => ({}));
    if (!body.name || !body.zone) {
      return new Response(JSON.stringify({ error: 'Name and zone are required' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const id = body.id || `loc_${Date.now()}`;
    const name = body.name.trim();
    const zone = body.zone.trim();
    const description = body.description?.trim() || '';
    const isPopular = body.isPopular ? 1 : 0;
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    if (env.DB) {
      await ensureD1Schema(env.DB);
      await env.DB.prepare(`
        INSERT INTO locations (id, community_id, name, zone, description, is_popular, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `).bind(id, communityId, name, zone, description, isPopular, Date.now()).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'ADD_LOCATION', ?, ?);
      `).bind(logId, adminId, adminName, `Added spot "${name}" (${zone})`, nowISO).run().catch(() => {});
    }

    const location = {
      id,
      communityId,
      name,
      zone,
      description,
      isPopular: Boolean(isPopular),
    };

    return new Response(JSON.stringify({ success: true, location }), {
      status: 201,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
