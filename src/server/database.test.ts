import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from './database.ts';

function makeTempDbPath(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mdb-${label}-`));
  return path.join(dir, 'test.sqlite');
}

function cleanupDb(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.rmSync(dir, { recursive: true, force: true });
}

test('SQLite database initializes in WAL mode, seeds once, and persists across close/reopen', async () => {
  const dbPath = makeTempDbPath('persist');
  try {
    // 1. First boot
    const db1 = createDatabase(dbPath);
    await db1.bootstrapInitialData();

    const health = db1.getHealthStats();
    assert.equal(health.engine, 'sqlite-persistent-wal');
    assert.equal(health.journalMode.toLowerCase(), 'wal');
    assert.ok(health.communitiesCount >= 3, 'Initial campuses should be seeded');

    // Verify master admin password is stored as PBKDF2 hash, never plaintext
    const admin = db1.getUserByEmailWithAuth('admin@middaybuddy.com');
    assert.ok(admin, 'Master admin should exist');
    assert.ok(admin.passwordHash.startsWith('pbkdf2$100000$'), 'Password must be PBKDF2 hashed');
    assert.notEqual(admin.passwordHash, 'Admin@12345');

    const validLogin = await db1.verifyUserCredentials('admin@middaybuddy.com', 'Admin@12345');
    assert.ok(validLogin, 'Admin credentials should verify');
    const badLogin = await db1.verifyUserCredentials('admin@middaybuddy.com', 'WrongPass');
    assert.equal(badLogin, null, 'Wrong password must fail');

    // Create a custom campus & delete a seeded spot
    const customComm = db1.createCommunity({
      name: 'Hyderabad Tech Hub',
      city: 'Hyderabad',
      description: 'HITEC City campus',
    });
    db1.deleteLocation('comm_siruseri', 'loc_gazebo');

    // Close DB completely (simulating full server restart)
    db1.close();

    // 2. Reopen same DB file and re-run bootstrap
    const db2 = createDatabase(dbPath);
    await db2.bootstrapInitialData();

    const commsAfterRestart = db2.listCommunities();
    assert.ok(
      commsAfterRestart.some((c) => c.id === customComm.id && c.name === 'Hyderabad Tech Hub'),
      'Custom campus must survive restart'
    );

    const siruseri = commsAfterRestart.find((c) => c.id === 'comm_siruseri');
    assert.ok(siruseri);
    assert.equal(
      siruseri.locations.some((l) => l.id === 'loc_gazebo'),
      false,
      'Deleted location must NOT reappear after restart'
    );

    db2.close();
  } finally {
    cleanupDb(dbPath);
  }
});

test('User registration, duplicate checks, rejection release, sessions, and password reset persist cleanly', async () => {
  const dbPath = makeTempDbPath('auth-flow');
  try {
    const db = createDatabase(dbPath);
    await db.bootstrapInitialData();

    // Register new user
    const user = await db.registerUser({
      name: 'Priya Menon',
      email: 'priya@company.com',
      password: 'Password@123',
      employeeId: 'EMP-2042',
      campusId: 'comm_siruseri',
      roleTitle: 'Senior Engineer',
    });
    assert.equal(user.status, 'pending_approval');
    assert.equal(user.role, 'user');
    assert.equal((user as any).password, undefined, 'Public user object must never expose password');

    // Duplicate email rejected
    await assert.rejects(
      () =>
        db.registerUser({
          name: 'Priya Clone',
          email: 'priya@company.com',
          password: 'Password@123',
          employeeId: 'EMP-9999',
        }),
      /awaiting admin approval/
    );

    // Approve user and create persistent session
    const approved = db.approveUser(user.id)!;
    assert.equal(approved.status, 'approved');

    const token = await db.createSession(user.id);
    const sessionUser = await db.getSessionUser(token);
    assert.equal(sessionUser?.id, user.id);

    // Password reset request -> admin approval revokes existing sessions
    const resetReq = db.createResetRequest(approved, 'EMP-2042');
    assert.equal(resetReq.status, 'pending');

    const approvedReset = db.approveResetRequest(resetReq.id, 'usr_admin');
    assert.equal(approvedReset?.status, 'approved');

    const revokedSession = await db.getSessionUser(token);
    assert.equal(revokedSession, null, 'Existing session must be revoked on password reset approval');

    // Set new password
    await db.setUserPassword(user.id, 'BrandNewPass@2026');
    const oldCreds = await db.verifyUserCredentials('priya@company.com', 'Password@123');
    assert.equal(oldCreds, null, 'Old password must no longer work');
    const newCreds = await db.verifyUserCredentials('priya@company.com', 'BrandNewPass@2026');
    assert.ok(newCreds, 'New password must work');

    // Rejection releases Employee ID for re-registration
    const pending2 = await db.registerUser({
      name: 'Arjun Dev',
      email: 'arjun@company.com',
      password: 'Password@123',
      employeeId: 'EMP-7777',
    });
    db.rejectUser(pending2.id);
    const reregistered = await db.registerUser({
      name: 'Arjun Dev',
      email: 'arjun@company.com',
      password: 'Password@123',
      employeeId: 'EMP-7777',
    });
    assert.equal(reregistered.employeeId, 'EMP-7777');

    db.close();
  } finally {
    cleanupDb(dbPath);
  }
});

test('Breaks, extensions, completions, chat messages, and notifications persist across DB restart', async () => {
  const dbPath = makeTempDbPath('breaks-chat');
  try {
    const db1 = createDatabase(dbPath);
    await db1.bootstrapInitialData();

    const post = db1.createBreak({
      userId: 'usr_admin',
      communityId: 'comm_siruseri',
      breakType: 'tea',
      durationMinutes: 15,
      locationName: 'Spine Chai Point (Near Core)',
      zone: 'Central Spine',
      customNote: 'Ginger chai in 5 mins',
    });
    assert.equal(post.breakType, 'tea');
    assert.equal(post.durationMinutes, 15);

    const extended = db1.extendBreak(post.id, 10)!;
    assert.equal(extended.durationMinutes, 25);

    const convId = `conv_${post.userId}_peer1`;
    const msg = db1.createMessage({
      conversationId: convId,
      senderId: 'usr_admin',
      senderName: 'System Administrator',
      text: 'See you near the central tower!',
    });
    assert.equal(msg.text, 'See you near the central tower!');

    db1.createNotification({
      userId: 'usr_admin',
      title: 'Test Notif',
      body: 'Persistent notification body',
      type: 'ping',
    });

    db1.close();

    // Reopen and verify everything survived
    const db2 = createDatabase(dbPath);
    const breaks = db2.listBreaks({ communityId: 'comm_siruseri' });
    assert.equal(breaks.length, 1);
    assert.equal(breaks[0].id, post.id);
    assert.equal(breaks[0].durationMinutes, 25);

    const messages = db2.listMessages(convId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, 'See you near the central tower!');

    const notifs = db2.listNotifications('usr_admin', true);
    assert.ok(notifs.some((n) => n.title === 'Test Notif' && !n.isRead));

    db2.markNotificationsRead('usr_admin', true);
    const readNotifs = db2.listNotifications('usr_admin', true);
    assert.ok(readNotifs.every((n) => n.isRead));

    const completed = db2.completeBreak(post.id)!;
    assert.equal(completed.status, 'completed');

    db2.close();
  } finally {
    cleanupDb(dbPath);
  }
});
