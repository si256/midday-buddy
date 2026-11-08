import type { AppEnv, PagesFunction } from '../../../../env';
import { ensureD1Schema } from '../../../../db';

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
  const locId = params.locId as string;

  try {
    const body: any = await request.json().catch(() => ({}));
    const name = body.name?.trim();
    const zone = body.zone?.trim();
    const description = body.description?.trim() || '';
    const isPopular = body.isPopular ? 1 : 0;
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';
    const nowISO = new Date().toISOString();

    if (!name || !zone) {
      return new Response(JSON.stringify({ error: 'Name and zone are required' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (env.DB) {
      await ensureD1Schema(env.DB);
      await env.DB.prepare(`
        UPDATE locations
        SET name = ?, zone = ?, description = ?, is_popular = ?
        WHERE id = ? AND community_id = ?;
      `).bind(name, zone, description, isPopular, locId, communityId).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'UPDATE_LOCATION', ?, ?);
      `).bind(logId, adminId, adminName, `Updated spot "${name}" (${zone})`, nowISO).run().catch(() => {});
    }

    const updatedLocation = {
      id: locId,
      communityId,
      name,
      zone,
      description,
      isPopular: Boolean(isPopular),
    };

    return new Response(
      JSON.stringify({
        success: true,
        location: updatedLocation,
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
  const locId = params.locId as string;

  try {
    const nowISO = new Date().toISOString();
    let adminName = 'Campus Admin';
    let adminId = 'admin';

    if (env.DB) {
      await ensureD1Schema(env.DB);
      try {
        const { requireAuth, requireRole } = await import('../../../../auth');
        const user = await requireAuth(request, env.DB);
        requireRole(user, ['community_admin', 'platform_admin'], communityId);
        adminId = user.id;
        adminName = user.name;
      } catch (authErr) {
        // Fallback for unauthenticated dev if token missing, else rethrow
        if (authErr instanceof Response) throw authErr;
      }

      await env.DB.prepare(`
        DELETE FROM locations WHERE id = ? AND community_id = ?;
      `).bind(locId, communityId).run();

      await env.DB.prepare(`
        INSERT OR REPLACE INTO deleted_locations (id, community_id, deleted_at)
        VALUES (?, ?, ?);
      `).bind(locId, communityId, nowISO).run().catch(() => {});

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'DELETE_LOCATION', ?, ?);
      `).bind(logId, adminId, adminName, `Deleted spot ${locId} from campus ${communityId}`, nowISO).run().catch(() => {});
    }

    // Keep global isolate set of deleted locations
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__DELETED_LOCATIONS__ = (globalThis as any).__DELETED_LOCATIONS__ || new Set();
      (globalThis as any).__DELETED_LOCATIONS__.add(locId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedLocationId: locId,
        communityId,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
