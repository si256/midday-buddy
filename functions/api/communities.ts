import type { AppEnv, PagesFunction } from '../env';

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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    const { results } = await env.DB.prepare(
      `SELECT * FROM communities ORDER BY name ASC`
    ).all();

    return new Response(JSON.stringify(results && results.length > 0 ? results : DEFAULT_COMMUNITIES), {
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify(DEFAULT_COMMUNITIES), {
      headers: CORS_HEADERS,
    });
  }
};
