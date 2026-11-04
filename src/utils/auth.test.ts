import test from 'node:test';
import assert from 'node:assert/strict';
import { UserProfile, UserRole, UserApprovalStatus } from '../types/index.ts';

// Pure logic helpers for testing
export function validateRegistrationInput(input: {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}): { valid: boolean; error?: string } {
  if (!input.name || !input.name.trim()) {
    return { valid: false, error: 'Name is required' };
  }
  if (!input.email || !input.email.includes('@')) {
    return { valid: false, error: 'Valid email is required' };
  }
  if (!input.password || input.password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
    return { valid: false, error: 'Passwords do not match' };
  }
  return { valid: true };
}

export function canBroadcastBreak(user: { status: UserApprovalStatus; role: UserRole }): boolean {
  return user.status === 'approved';
}

export function canAccessAdminPortal(user: { role: UserRole; status: UserApprovalStatus }): boolean {
  return (user.role === 'community_admin' || user.role === 'platform_admin') && user.status === 'approved';
}

export function verifyPassword(actualPassword?: string, attemptedPassword?: string): boolean {
  if (!actualPassword || !attemptedPassword) return false;
  return actualPassword === attemptedPassword;
}

// ==========================================
// TEST SUITE: AUTHENTICATION & ACCESS CONTROL
// ==========================================

test('validateRegistrationInput enforces required fields and password length', () => {
  assert.equal(validateRegistrationInput({}).valid, false);
  assert.equal(validateRegistrationInput({ name: 'Rahul' }).valid, false);
  assert.equal(validateRegistrationInput({ name: 'Rahul', email: 'rahul@tcs.com', password: '123' }).valid, false);
  assert.equal(
    validateRegistrationInput({ name: 'Rahul', email: 'rahul@tcs.com', password: 'password123', confirmPassword: 'different' }).valid,
    false
  );
  assert.equal(
    validateRegistrationInput({ name: 'Rahul', email: 'rahul@tcs.com', password: 'password123', confirmPassword: 'password123' }).valid,
    true
  );
});

test('verifyPassword validates matching credentials and rejects incorrect ones', () => {
  const userPass = 'Admin@12345';
  assert.equal(verifyPassword(userPass, 'Admin@12345'), true);
  assert.equal(verifyPassword(userPass, 'WrongPassword'), false);
  assert.equal(verifyPassword(userPass, ''), false);
  assert.equal(verifyPassword(undefined, 'Admin@12345'), false);
});

test('canBroadcastBreak strictly gates unapproved and suspended members', () => {
  const approvedUser = { status: 'approved' as UserApprovalStatus, role: 'user' as UserRole };
  const pendingUser = { status: 'pending_approval' as UserApprovalStatus, role: 'user' as UserRole };
  const suspendedUser = { status: 'suspended' as UserApprovalStatus, role: 'user' as UserRole };

  assert.equal(canBroadcastBreak(approvedUser), true);
  assert.equal(canBroadcastBreak(pendingUser), false);
  assert.equal(canBroadcastBreak(suspendedUser), false);
});

test('canAccessAdminPortal permits verified admins and blocks standard users', () => {
  const admin = { role: 'community_admin' as UserRole, status: 'approved' as UserApprovalStatus };
  const regularUser = { role: 'user' as UserRole, status: 'approved' as UserApprovalStatus };
  const suspendedAdmin = { role: 'community_admin' as UserRole, status: 'suspended' as UserApprovalStatus };

  assert.equal(canAccessAdminPortal(admin), true);
  assert.equal(canAccessAdminPortal(regularUser), false);
  assert.equal(canAccessAdminPortal(suspendedAdmin), false);
});
