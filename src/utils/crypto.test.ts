import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, hashToken, generateSecureToken } from './crypto.ts';

test('hashPassword produces formatted PBKDF2 string with salt and hash', async () => {
  const password = 'SuperSecretPassword@2026';
  const hashed = await hashPassword(password);

  assert.ok(hashed.startsWith('pbkdf2$100000$'), 'Hash should start with pbkdf2$100000$');
  const parts = hashed.split('$');
  assert.equal(parts.length, 4, 'PBKDF2 hash should contain 4 $-delimited parts');
  assert.equal(parts[2].length, 32, 'Salt should be 16 bytes = 32 hex characters');
  assert.equal(parts[3].length, 64, 'Hash should be 32 bytes = 64 hex characters');
});

test('verifyPassword validates matching PBKDF2 password and rejects invalid password', async () => {
  const correct = 'CorrectPass#789';
  const wrong = 'WrongPass#789';

  const hashed = await hashPassword(correct);

  const isMatch = await verifyPassword(correct, hashed);
  assert.equal(isMatch, true, 'Matching password should verify as true');

  const isWrongMatch = await verifyPassword(wrong, hashed);
  assert.equal(isWrongMatch, false, 'Mismatched password should verify as false');
});

test('verifyPassword handles null, empty, and undefined gracefully without throwing', async () => {
  assert.equal(await verifyPassword('', 'pbkdf2$100000$abcd$1234'), false);
  assert.equal(await verifyPassword('something', null), false);
  assert.equal(await verifyPassword('something', undefined), false);
  assert.equal(await verifyPassword('something', ''), false);
});

test('verifyPassword supports legacy plain-text during database transition', async () => {
  const plain = 'LegacyPassword123';
  assert.equal(await verifyPassword(plain, plain), true);
  assert.equal(await verifyPassword('DifferentPassword', plain), false);
});

test('hashToken produces deterministic SHA-256 hex digest', async () => {
  const token = 'tok_secure_test_12345';
  const hash1 = await hashToken(token);
  const hash2 = await hashToken(token);

  assert.equal(hash1, hash2, 'Hash must be deterministic');
  assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');
  assert.notEqual(hash1, token, 'Token hash must differ from token string');
});

test('generateSecureToken generates unpredictable prefixed tokens of high entropy', () => {
  const tok1 = generateSecureToken('sess');
  const tok2 = generateSecureToken('sess');

  assert.ok(tok1.startsWith('sess_'), 'Token should have sess_ prefix');
  assert.ok(tok2.startsWith('sess_'), 'Token should have sess_ prefix');
  assert.notEqual(tok1, tok2, 'Generated tokens must be distinct');
  assert.ok(tok1.length >= 50, 'Token should contain sufficient entropy length');
});
