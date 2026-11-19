import type { AppEnv, PagesFunction } from '../../../env';
import { ensureD1Schema } from '../../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const [locsResult, delLocs] = await Promise.all([
      env.DB.prepare(`SELECT * FROM locations WHERE community_id = ? ORDER BY name ASC;`).bind(communityId).all<any>(),
      env.DB.prepare(`SELECT id FROM deleted_locations;`).all<{ id: string }>().catch(() => ({ results: [] })),
    ]);

    const deletedLocIds = new Set((delLocs?.results || []).map((r) => r.id));
    const locations = (locsResult?.results || [])
      .filter((l: any) => !deletedLocIds.has(l.id))
      .map((l: any) => ({
        id: l.id,
        communityId: l.community_id,
        name: l.name,
        zone: l.zone,
        description: l.description,
        isPopular: Boolean(l.is_popular),
      }));

    return new Response(JSON.stringify(locations), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch campus spots.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    // Strict authentication and campus authority check
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['platform_admin', 'community_admin'], communityId);

    const body: any = await request.json().catch(() => ({}));
    if (!body.name || !body.zone) {
      return new Response(JSON.stringify({ error: 'Name and zone are required' }), {
        status: 400,
        headers: cors,
      });
    }

    const id = body.id || `loc_${Date.now()}`;
    const name = body.name.trim();
    const zone = body.zone.trim();
    const description = body.description?.trim() || '';
    const isPopular = body.isPopular ? 1 : 0;
    const nowISO = new Date().toISOString();

    // Clear deleted tombstone if previously tombstoned
    await env.DB.prepare(`DELETE FROM deleted_locations WHERE id = ?;`).bind(id).run().catch(() => {});

    await env.DB.prepare(`
      INSERT INTO locations (id, community_id, name, zone, description, is_popular, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `).bind(id, communityId, name, zone, description, isPopular, Date.now()).run();

    // Identity strictly derived from session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'ADD_LOCATION', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Added spot "${name}" (${zone}) in campus ${communityId}`, nowISO).run().catch(() => {});

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
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to add campus spot.' }), {
      status: 500,
      headers: cors,
    });
  }
};
