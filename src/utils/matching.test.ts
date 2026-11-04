import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessBreakDirectory, filterBreaks, getRemainingMinutes } from './matching';
import { BreakPost } from '../types';

const samplePosts: BreakPost[] = [
  {
    id: 'p1',
    userId: 'u1',
    userName: 'Aravind',
    userRole: 'Dev',
    userAvatarSeed: 'A',
    userAvatarBg: 'bg-amber-600',
    communityId: 'comm_siruseri',
    breakType: 'tea',
    status: 'free_now',
    timeLabel: 'Free Right Now',
    durationMinutes: 15,
    locationName: 'Spine Chai Point',
    zone: 'Central Spine',
    customNote: 'Ginger tea',
    interests: ['AI', 'Chai'],
    icebreaker: 'Ask me',
    expiresAt: Date.now() + 15 * 60 * 1000,
    createdAt: Date.now(),
  },
  {
    id: 'p2',
    userId: 'u2',
    userName: 'Karthik',
    userRole: 'Dev',
    userAvatarSeed: 'K',
    userAvatarBg: 'bg-orange-600',
    communityId: 'comm_siruseri',
    breakType: 'lunch',
    status: 'in_10m',
    timeLabel: 'In 10m',
    durationMinutes: 30,
    locationName: 'Food Court 1',
    zone: 'Food Court 1',
    customNote: 'Meals',
    interests: ['Chess'],
    icebreaker: 'Ask me',
    expiresAt: Date.now() + 30 * 60 * 1000,
    createdAt: Date.now(),
  },
  {
    id: 'p3',
    userId: 'u3',
    userName: 'Rohan',
    userRole: 'Dev',
    userAvatarSeed: 'R',
    userAvatarBg: 'bg-blue-600',
    communityId: 'comm_tidel',
    breakType: 'tea',
    status: 'free_now',
    timeLabel: 'Free Right Now',
    durationMinutes: 15,
    locationName: 'Atrium',
    zone: 'Lobby',
    customNote: 'Tea',
    interests: ['Cricket'],
    icebreaker: 'Ask me',
    expiresAt: Date.now() + 10 * 60 * 1000,
    createdAt: Date.now(),
  },
];

test('canAccessBreakDirectory enforces manual approval', () => {
  assert.equal(canAccessBreakDirectory('approved'), true);
  assert.equal(canAccessBreakDirectory('pending_approval'), false);
  assert.equal(canAccessBreakDirectory('rejected'), false);
  assert.equal(canAccessBreakDirectory('suspended'), false);
});

test('filterBreaks filters by community', () => {
  const siruseri = filterBreaks(samplePosts, {
    communityId: 'comm_siruseri',
    breakType: 'all',
    onlyFreeNow: false,
    zone: 'all',
  });
  assert.equal(siruseri.length, 2);
  assert.equal(siruseri.every((p) => p.communityId === 'comm_siruseri'), true);
});

test('filterBreaks filters by breakType and freeNow', () => {
  const teaFreeNow = filterBreaks(samplePosts, {
    communityId: 'comm_siruseri',
    breakType: 'tea',
    onlyFreeNow: true,
    zone: 'all',
  });
  assert.equal(teaFreeNow.length, 1);
  assert.equal(teaFreeNow[0].id, 'p1');
});

test('getRemainingMinutes calculates positive countdown', () => {
  const now = 1000000;
  const expiresAt = now + 12 * 60 * 1000;
  assert.equal(getRemainingMinutes(expiresAt, now), 12);
  assert.equal(getRemainingMinutes(now - 1000, now), 0);
});
