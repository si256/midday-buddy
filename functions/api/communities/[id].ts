import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;

  try {
    const body: any = await request.json().catch(() => ({}));
    const name = body.name?.trim();
    const city = body.city?.trim();
    const description = body.description?.trim() || '';
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    if (!name || !city) {
      return new Response(JSON.stringify({ error: 'Name and city are required' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (env.DB) {
      await ensureD1Schema(env.DB);
      await env.DB.prepare(`
        UPDATE communities SET name = ?, city = ?, description = ? WHERE id = ?;
      `).bind(name, city, description, communityId).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'UPDATE_COMMUNITY', ?, ?);
      `).bind(logId, adminId, adminName, `Updated campus details for ${name}`, nowISO).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        community: { id: communityId, name, city, description },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;

  try {
    const body: any = await request.json().catch(() => ({}));
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    if (env.DB) {
      await ensureD1Schema(env.DB);
      // Delete community
      await env.DB.prepare(`DELETE FROM communities WHERE id = ?;`).bind(communityId).run();
      // Delete associated locations
      await env.DB.prepare(`DELETE FROM locations WHERE community_id = ?;`).bind(communityId).run();
      // Delete breaks
      await env.DB.prepare(`DELETE FROM breaks WHERE community_id = ?;`).bind(communityId).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'DELETE_COMMUNITY', ?, ?);
      `).bind(logId, adminId, adminName, `Deleted campus ${communityId}`, nowISO).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedCommunityId: communityId,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
