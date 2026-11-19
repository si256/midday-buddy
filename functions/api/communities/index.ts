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
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);

    const [commsResult, locsResult, delComms, delLocs] = await Promise.all([
      env.DB.prepare(`SELECT * FROM communities ORDER BY name ASC;`).all<any>(),
      env.DB.prepare(`SELECT * FROM locations ORDER BY name ASC;`).all<any>(),
      env.DB.prepare(`SELECT id FROM deleted_communities;`).all<{ id: string }>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id FROM deleted_locations;`).all<{ id: string }>().catch(() => ({ results: [] })),
    ]);

    const deletedCommIds = new Set((delComms?.results || []).map((r) => r.id));
    const deletedLocIds = new Set((delLocs?.results || []).map((r) => r.id));

    const communities = (commsResult?.results || [])
      .filter((c: any) => !deletedCommIds.has(c.id))
      .map((c: any) => {
        const locations = (locsResult?.results || [])
          .filter((loc: any) => loc.community_id === c.id && !deletedLocIds.has(loc.id))
          .map((loc: any) => ({
            id: loc.id,
            communityId: loc.community_id,
            name: loc.name,
            zone: loc.zone,
            description: loc.description,
            isPopular: Boolean(loc.is_popular),
          }));

        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          city: c.city,
          description: c.description || '',
          memberCount: c.member_count || 0,
          activeBreaksCount: c.active_breaks_count || 0,
          locations,
        };
      });

    return new Response(JSON.stringify(communities), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch communities.' }), {
      status: 500,
      headers: cors,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
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
    // Strict authentication & authorization: Only platform_admin can create new campuses
    const adminUser = await requireAuth(request, env.DB);
    requireRole(adminUser, ['platform_admin']);

    const body: any = await request.json().catch(() => ({}));
    if (!body.name || !body.city) {
      return new Response(JSON.stringify({ error: 'Name and city are required' }), {
        status: 400,
        headers: cors,
      });
    }

    const id = body.id || `comm_${Date.now()}`;
    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nowISO = new Date().toISOString();

    // Remove from deleted_communities if re-creating
    await env.DB.prepare(`DELETE FROM deleted_communities WHERE id = ?;`).bind(id).run().catch(() => {});

    await env.DB.prepare(`
      INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?);
    `).bind(id, slug, body.name.trim(), body.city.trim(), body.description?.trim() || '', Date.now()).run();

    // Identity strictly from authenticated session
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'ADD_COMMUNITY', ?, ?);
    `).bind(logId, adminUser.id, adminUser.name, `Created new campus: ${body.name} (${body.city})`, nowISO).run().catch(() => {});

    const newCommunity = {
      id,
      slug,
      name: body.name.trim(),
      city: body.city.trim(),
      description: body.description?.trim() || '',
      memberCount: 0,
      activeBreaksCount: 0,
      locations: [],
    };

    return new Response(JSON.stringify({ success: true, community: newCommunity }), {
      status: 201,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to create campus.' }), {
      status: 500,
      headers: cors,
    });
  }
};
