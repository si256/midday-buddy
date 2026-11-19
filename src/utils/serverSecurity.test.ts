import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SlidingWindowRateLimiter,
  isValidWebhookUrl,
  parsePagination,
} from './serverSecurity';

test('SlidingWindowRateLimiter enforces request limits within window and resets after expiry', () => {
  const limiter = new SlidingWindowRateLimiter();
  const base = 1_700_000_000_000;

  assert.equal(limiter.check('1.2.3.4:/login', 2, 60_000, base).allowed, true);
  assert.equal(limiter.check('1.2.3.4:/login', 2, 60_000, base + 100).allowed, true);

  const blocked = limiter.check('1.2.3.4:/login', 2, 60_000, base + 200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs >= 59_000);

  // After window passes, requests succeed again
  assert.equal(limiter.check('1.2.3.4:/login', 2, 60_000, base + 61_000).allowed, true);
});

test('isValidWebhookUrl permits public HTTPS webhooks and rejects SSRF internal addresses', () => {
  assert.equal(isValidWebhookUrl('https://hooks.slack.com/services/T1/B1/S1'), true);
  assert.equal(isValidWebhookUrl('https://outlook.office.com/webhook/abc'), true);
  assert.equal(isValidWebhookUrl('http://hooks.slack.com/services/insecure'), false);
  assert.equal(isValidWebhookUrl('https://localhost:3000/hook'), false);
  assert.equal(isValidWebhookUrl('https://127.0.0.1/hook'), false);
  assert.equal(isValidWebhookUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isValidWebhookUrl('https://10.0.0.5/hook'), false);
  assert.equal(isValidWebhookUrl('https://192.168.1.10/hook'), false);
});

test('parsePagination bounds limits and computes offset safely', () => {
  assert.deepEqual(parsePagination({ page: '2', limit: '25' }), { page: 2, limit: 25, offset: 25 });
  assert.deepEqual(parsePagination({ page: '-3', limit: '9999' }, 50, 100), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(parsePagination({}), { page: 1, limit: 50, offset: 0 });
});
