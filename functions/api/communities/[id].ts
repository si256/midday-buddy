import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
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
    // Strict authentication & campus scoping
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['platform_admin', 'community_admin'], communityId);

    const body: any = await request.json().catch(() => ({}));
    const name = body.name?.trim();
    const city = body.city?.trim();
    const description = body.description?.trim() || '';
    const nowISO = new Date().toISOString();

    if (!name || !city) {
      return new Response(JSON.stringify({ error: 'Name and city are required' }), {
        status: 400,
        headers: cors,
      });
    }

    await env.DB.prepare(`
      UPDATE communities SET name = ?, city = ?, description = ? WHERE id = ?;
    `).bind(name, city, description, communityId).run();

    // Identity strictly derived from session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'UPDATE_COMMUNITY', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Updated campus details for ${name}`, nowISO).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        community: { id: communityId, name, city, description },
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to update campus.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const { env, params, request } = context;
  const communityId = decodeURIComponent(params.id as string);
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    // Only platform_admin can delete entire campuses
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['platform_admin']);

    const nowISO = new Date().toISOString();

    // Delete community and cascaded child records
    await env.DB.prepare(`DELETE FROM communities WHERE id = ?;`).bind(communityId).run();
    await env.DB.prepare(`DELETE FROM locations WHERE community_id = ?;`).bind(communityId).run();
    await env.DB.prepare(`DELETE FROM breaks WHERE community_id = ?;`).bind(communityId).run();

    // Record tombstone
    await env.DB.prepare(`INSERT OR REPLACE INTO deleted_communities (id, deleted_at) VALUES (?, ?);`).bind(communityId, nowISO).run().catch(() => {});

    // Identity strictly derived from session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'DELETE_COMMUNITY', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Deleted campus ${communityId}`, nowISO).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        deletedCommunityId: communityId,
      }),
      { status: 200, headers: cors }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete campus.' }), {
      status: 500,
      headers: cors,
    });
  }
};
