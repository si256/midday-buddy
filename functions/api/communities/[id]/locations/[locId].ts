import type { AppEnv, PagesFunction } from '../../../../env';
import { ensureD1Schema } from '../../../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = params.id as string;
  const locId = decodeURIComponent(params.locId as string);
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
    const name = body.name?.trim();
    const zone = body.zone?.trim();
    const description = body.description?.trim() || '';
    const isPopular = body.isPopular !== undefined ? (body.isPopular ? 1 : 0) : undefined;
    const nowISO = new Date().toISOString();

    if (!name || !zone) {
      return new Response(JSON.stringify({ error: 'Name and zone are required' }), {
        status: 400,
        headers: cors,
      });
    }

    await env.DB.prepare(`
      UPDATE locations
      SET name = ?, zone = ?, description = ?, is_popular = COALESCE(?, is_popular)
      WHERE id = ? AND community_id = ?;
    `).bind(name, zone, description, isPopular, locId, communityId).run();

    // Identity strictly derived from session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'UPDATE_LOCATION', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Updated spot "${name}" (${zone}) in campus ${communityId}`, nowISO).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        location: {
          id: locId,
          communityId,
          name,
          zone,
          description,
          isPopular: Boolean(isPopular),
        },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update campus spot.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = decodeURIComponent(params.id as string);
  const locId = decodeURIComponent(params.locId as string);
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

    const nowISO = new Date().toISOString();

    // 1. Delete from locations table
    await env.DB.prepare(`DELETE FROM locations WHERE id = ? AND community_id = ?;`).bind(locId, communityId).run();

    // 2. Insert into permanent deleted_locations tombstone table
    await env.DB.prepare(`INSERT OR REPLACE INTO deleted_locations (id, community_id, deleted_at) VALUES (?, ?, ?);`).bind(locId, communityId, nowISO).run().catch(() => {});

    // In-memory set defense for hot worker instances
    if (!(globalThis as any).__DELETED_LOCATIONS__) {
      (globalThis as any).__DELETED_LOCATIONS__ = new Set<string>();
    }
    (globalThis as any).__DELETED_LOCATIONS__.add(locId);

    // 3. Security audit trail with session identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'DELETE_LOCATION', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Deleted spot ${locId} from campus ${communityId}`, nowISO).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        deletedLocationId: locId,
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete campus spot.' }), {
      status: 500,
      headers: cors,
    });
  }
};
