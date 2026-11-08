import test from 'node:test';
import assert from 'node:assert/strict';

interface CampusLocation {
  id: string;
  name: string;
  zone: string;
  communityId: string;
}

interface Community {
  id: string;
  name: string;
  locations: CampusLocation[];
}

function filterActiveLocations(
  communities: Community[],
  deletedCommunityIds: Set<string>,
  deletedLocationIds: Set<string>
): Community[] {
  return communities
    .filter((c) => !deletedCommunityIds.has(c.id))
    .map((c) => ({
      ...c,
      locations: (c.locations || []).filter((loc) => !deletedLocationIds.has(loc.id)),
    }));
}

test('filterActiveLocations removes deleted spots immediately and keeps active spots', () => {
  const sampleCommunities: Community[] = [
    {
      id: 'comm_siruseri',
      name: 'TCS Siruseri Campus',
      locations: [
        { id: 'loc_canteen', name: 'Bay 6 Cafeteria', zone: 'Zone A', communityId: 'comm_siruseri' },
        { id: 'loc_lawn', name: 'Central Garden Lawn', zone: 'Zone C', communityId: 'comm_siruseri' },
        { id: 'loc_foodcourt', name: 'Main Food Court', zone: 'Zone B', communityId: 'comm_siruseri' },
      ],
    },
    {
      id: 'comm_bangalore',
      name: 'TCS Whitefield Campus',
      locations: [
        { id: 'loc_bl_canteen', name: 'Tower B Cafe', zone: 'Zone 1', communityId: 'comm_bangalore' },
      ],
    },
  ];

  const deletedCommunityIds = new Set<string>();
  const deletedLocationIds = new Set<string>(['loc_lawn']);

  const filtered = filterActiveLocations(sampleCommunities, deletedCommunityIds, deletedLocationIds);

  const siruseri = filtered.find((c) => c.id === 'comm_siruseri');
  assert.ok(siruseri, 'Campus should exist');
  assert.equal(siruseri.locations.length, 2, 'Should only have 2 locations left');
  assert.equal(siruseri.locations.some((l) => l.id === 'loc_lawn'), false, 'Deleted spot loc_lawn must not be present');
  assert.equal(siruseri.locations[0].id, 'loc_canteen');
  assert.equal(siruseri.locations[1].id, 'loc_foodcourt');

  // Whitefield should remain untouched
  const whitefield = filtered.find((c) => c.id === 'comm_bangalore');
  assert.ok(whitefield);
  assert.equal(whitefield.locations.length, 1);
  assert.equal(whitefield.locations[0].id, 'loc_bl_canteen');
});

test('filterActiveLocations prevents re-injection when backend returns stale locations', () => {
  const staleBackendPayload: Community[] = [
    {
      id: 'comm_siruseri',
      name: 'TCS Siruseri Campus',
      locations: [
        { id: 'loc_canteen', name: 'Bay 6 Cafeteria', zone: 'Zone A', communityId: 'comm_siruseri' },
        { id: 'loc_lawn', name: 'Central Garden Lawn', zone: 'Zone C', communityId: 'comm_siruseri' },
      ],
    },
  ];

  const tombstones = new Set(['loc_lawn', 'loc_old_spot']);
  const result = filterActiveLocations(staleBackendPayload, new Set(), tombstones);

  assert.equal(result[0].locations.length, 1);
  assert.equal(result[0].locations[0].id, 'loc_canteen');
});
