import { Community, CampusLocation, UserProfile, BreakPost, AuditLog } from '../types';

export const INITIAL_COMMUNITIES: Community[] = [
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
        id: 'loc_spine_juice',
        communityId: 'comm_siruseri',
        name: 'Fresh Juice & Fruit Counter',
        zone: 'Central Spine',
        description: 'Cold-pressed seasonal juices, tender coconut, and fresh fruit bowls.',
        isPopular: true,
      },
      {
        id: 'loc_fc1',
        communityId: 'comm_siruseri',
        name: 'Food Court 1 (South Indian & Thalis)',
        zone: 'Food Court 1',
        description: 'Ground floor main cafeteria featuring hot dosas, Kerala meals, and thalis.',
        isPopular: true,
      },
      {
        id: 'loc_fc2',
        communityId: 'comm_siruseri',
        name: 'Food Court 2 (Multi-Cuisine & Biryani)',
        zone: 'Food Court 2',
        description: 'Executive cafeteria with North Indian gravies, rolls, and Hyderabad biryani.',
        isPopular: true,
      },
      {
        id: 'loc_gazebo',
        communityId: 'comm_siruseri',
        name: 'Central Lawn Gazebo',
        zone: 'Outdoor Greens',
        description: 'Shaded open-air seating for breezy midday discussions and walks.',
        isPopular: false,
      },
      {
        id: 'loc_subway_kiosk',
        communityId: 'comm_siruseri',
        name: 'Subway & Wrap Kiosk',
        zone: 'Spine West',
        description: 'Quick subs and salads for on-the-go quick lunches.',
        isPopular: false,
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
    locations: [
      {
        id: 'loc_tidel_central_cafe',
        communityId: 'comm_tidel',
        name: 'Central Atrium Café',
        zone: 'Ground Floor',
        description: 'Meeting point near the main lobby fountains.',
        isPopular: true,
      },
      {
        id: 'loc_tidel_fc3',
        communityId: 'comm_tidel',
        name: 'Food Court Level 3',
        zone: '3rd Floor',
        description: 'Wide variety of south and north Indian options.',
        isPopular: true,
      },
    ],
  },
  {
    id: 'comm_manyata',
    slug: 'manyata-tech-park',
    name: 'Manyata Tech Park',
    city: 'Bengaluru',
    description: 'Dynamic campus hub in North Bengaluru with rooftop cafes and sports courts.',
    memberCount: 220,
    activeBreaksCount: 9,
    locations: [
      {
        id: 'loc_manyata_hub',
        communityId: 'comm_manyata',
        name: 'The Bay Food Court',
        zone: 'Central Plaza',
        description: 'Sprawling outdoor dining plaza.',
        isPopular: true,
      },
    ],
  },
];

export const INITIAL_USERS: UserProfile[] = [];

export const INITIAL_BREAK_POSTS: BreakPost[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

