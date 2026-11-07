import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';

const DEFAULT_COMMUNITIES = [
  {
    id: 'comm_siruseri',
    slug: 'siruseri-campus',
    name: 'TCS Siruseri Campus',
    city: 'Chennai',
    description: 'The iconic 70-acre butterfly campus with the 400m Central Spine and vibrant cafeterias.',
    memberCount: 342,
    activeBreaksCount: 14,
    locations: [
      {
        id: 'loc_spine_chai_core',
        communityId: 'comm_siruseri',
        name: 'Spine Chai Point (Near Core)',
        zone: 'Central Spine',
        description: 'The most popular ginger chai and filter coffee kiosk by the central tower.',
        isPopular: true,
      },
      {
        id: 'loc_spine_ccd',
        communityId: 'comm_siruseri',
        name: 'Café Coffee Day (Spine East)',
        zone: 'Central Spine',
        description: 'Quiet coffee seating with air conditioning and espresso.',
        isPopular: false,
      },
      {
        id: 'loc_fc1',
        communityId: 'comm_siruseri',
        name: 'Food Court 1 (South Indian & Thalis)',
        zone: 'Food Court 1',
        description: 'Ground floor main cafeteria featuring hot dosas, Kerala meals, and thalis.',
        isPopular: true,
      },
    ],
  },
  {
    id: 'comm_tidel',
    slug: 'tidel-park',
    name: 'Tidel Park Campus',
    city: 'Chennai',
    description: 'Premier IT landmark on OMR with multi-floor food courts and garden patio.',
    memberCount: 185,
    activeBreaksCount: 6,
    locations: [],
  },
  {
    id: 'comm_manyata',
    slug: 'manyata-tech-park',
    name: 'Manyata Tech Park',
    city: 'Bengaluru',
    description: 'Dynamic campus hub in North Bengaluru with rooftop cafes and sports courts.',
    memberCount: 220,
    activeBreaksCount: 9,
    locations: [],
  },
];

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

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify(DEFAULT_COMMUNITIES), {
      headers: CORS_HEADERS,
    });
  }

  try {
    await ensureD1Schema(env.DB);
    const commsResult = await env.DB.prepare(`SELECT * FROM communities ORDER BY name ASC;`).all<any>().catch(() => ({ results: [] }));
    const locsResult = await env.DB.prepare(`SELECT * FROM locations ORDER BY name ASC;`).all<any>().catch(() => ({ results: [] }));
    const deletedResult = await env.DB.prepare(`SELECT id FROM deleted_communities;`).all<{ id: string }>().catch(() => ({ results: [] }));

    const deletedIds = new Set((deletedResult.results || []).map((r) => r.id));
    let comms = (commsResult.results || []).filter((c) => !deletedIds.has(c.id));
    const locs = locsResult.results || [];

    // Attach mapped locations to each community
    const enriched = comms.map((c) => ({
      id: c.id,
      slug: c.slug || c.id,
      name: c.name,
      city: c.city || 'Chennai',
      description: c.description || '',
      memberCount: c.member_count || 0,
      activeBreaksCount: c.active_breaks_count || 0,
      locations: locs
        .filter((l) => l.community_id === c.id)
        .map((l) => ({
          id: l.id,
          communityId: l.community_id,
          name: l.name,
          zone: l.zone,
          description: l.description || '',
          isPopular: Boolean(l.is_popular),
        })),
    }));

    return new Response(JSON.stringify(enriched), {
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify([]), {
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    if (!body.name || !body.city) {
      return new Response(JSON.stringify({ error: 'Name and city are required' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const id = body.id || `comm_${Date.now()}`;
    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nowISO = new Date().toISOString();
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';

    if (env.DB) {
      await ensureD1Schema(env.DB);
      // Remove from deleted_communities if re-creating
      await env.DB.prepare(`DELETE FROM deleted_communities WHERE id = ?;`).bind(id).run().catch(() => {});

      await env.DB.prepare(`
        INSERT INTO communities (id, slug, name, city, description, member_count, active_breaks_count, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?);
      `).bind(id, slug, body.name.trim(), body.city.trim(), body.description?.trim() || '', Date.now()).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
        VALUES (?, ?, ?, 'ADD_COMMUNITY', ?, ?);
      `).bind(logId, adminId, adminName, `Created new campus: ${body.name} (${body.city})`, nowISO).run().catch(() => {});
    }

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
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
