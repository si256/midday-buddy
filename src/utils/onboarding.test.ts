import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmailDomain,
  normalizeDomainList,
  evaluateOnboardingApproval,
  sanitizeUserForClient,
  sanitizeCommunityForClient,
} from './onboarding';
import { Community, UserProfile } from '../types/index';

test('extractEmailDomain parses lowercase domain safely', () => {
  assert.equal(extractEmailDomain('Arjun.Kumar@TCS.COM '), 'tcs.com');
  assert.equal(extractEmailDomain('invalid-email'), '');
  assert.equal(extractEmailDomain('@tcs.com'), '');
});

test('normalizeDomainList deduplicates and strips @ prefixes', () => {
  assert.deepEqual(
    normalizeDomainList(' @TCS.com, middaybuddy.com , tcs.com , invalid '),
    ['tcs.com', 'middaybuddy.com']
  );
});

test('evaluateOnboardingApproval auto-approves verified domains and matching invite codes', () => {
  const campus: Pick<Community, 'verifiedDomains' | 'inviteCode'> = {
    verifiedDomains: ['tcs.com'],
    inviteCode: 'SIRUSERI-2026',
  };

  assert.deepEqual(
    evaluateOnboardingApproval({ email: 'priya@tcs.com', community: campus }),
    { autoApprove: true, reason: 'verified_domain' }
  );

  assert.deepEqual(
    evaluateOnboardingApproval({
      email: 'contractor@gmail.com',
      inviteCode: 'siruseri-2026',
      community: campus,
    }),
    { autoApprove: true, reason: 'invite_code' }
  );

  assert.deepEqual(
    evaluateOnboardingApproval({
      email: 'visitor@gmail.com',
      inviteCode: 'WRONG-CODE',
      community: campus,
    }),
    { autoApprove: false, reason: 'manual_review' }
  );
});

test('sanitizeUserForClient removes password fields', () => {
  const user: UserProfile = {
    id: 'u1',
    email: 'a@tcs.com',
    password: 'pbkdf2$100000$salt$hash',
    name: 'Asha',
    roleTitle: 'Engineer',
    campusId: 'comm_siruseri',
    avatarSeed: 'Asha',
    avatarBgColor: 'bg-indigo-600',
    bio: '',
    icebreaker: '',
    interests: [],
    dietary: 'Any',
    socialBattery: 'Balanced Banter',
    role: 'user',
    status: 'approved',
    registeredAt: '2026-11-01T00:00:00Z',
  };

  const sanitized = sanitizeUserForClient(user) as any;
  assert.equal(sanitized.password, undefined);
  assert.equal(sanitized.email, 'a@tcs.com');
});

test('sanitizeCommunityForClient strips webhookUrl and inviteCode for non-admins', () => {
  const comm: Community = {
    id: 'comm_siruseri',
    slug: 'siruseri',
    name: 'Siruseri',
    city: 'Chennai',
    description: 'Hub',
    memberCount: 10,
    activeBreaksCount: 2,
    locations: [],
    verifiedDomains: ['tcs.com'],
    inviteCode: 'SECRET-1',
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
  };

  const publicView = sanitizeCommunityForClient(comm, false);
  assert.equal(publicView.webhookUrl, undefined);
  assert.equal(publicView.inviteCode, undefined);
  assert.equal(publicView.hasWebhook, true);
  assert.equal(publicView.hasInviteCode, true);
  assert.deepEqual(publicView.verifiedDomains, ['tcs.com']);

  const adminView = sanitizeCommunityForClient(comm, true);
  assert.equal(adminView.webhookUrl, comm.webhookUrl);
  assert.equal(adminView.inviteCode, comm.inviteCode);
});
