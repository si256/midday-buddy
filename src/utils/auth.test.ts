import test from 'node:test';
import assert from 'node:assert/strict';
import { UserProfile, UserRole, UserApprovalStatus } from '../types/index.ts';

// Pure logic helpers for testing
export function validateRegistrationInput(input: {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  employeeId?: string;
}): { valid: boolean; error?: string } {
  if (!input.name || !input.name.trim()) {
    return { valid: false, error: 'Name is required' };
  }
  if (!input.email || !input.email.includes('@')) {
    return { valid: false, error: 'Valid Email ID is required' };
  }
  if (!input.employeeId || !input.employeeId.trim()) {
    return { valid: false, error: 'TCS Employee ID is required' };
  }
  if (!input.password || input.password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
    return { valid: false, error: 'Passwords do not match' };
  }
  return { valid: true };
}

export function validateForgotPasswordInput(input: {
  email?: string;
  employeeId?: string;
}): { valid: boolean; error?: string } {
  if (!input.email || !input.email.includes('@')) {
    return { valid: false, error: 'Valid Email ID is required' };
  }
  if (!input.employeeId || !input.employeeId.trim()) {
    return { valid: false, error: 'TCS Employee ID is required' };
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

export function canLoginWithoutPassword(user: { passwordResetApproved?: boolean }): boolean {
  return Boolean(user.passwordResetApproved);
}

export function processAdminResetApproval(user: {
  passwordResetRequested?: boolean;
  passwordResetApproved?: boolean;
  mustChangePassword?: boolean;
}) {
  user.passwordResetRequested = false;
  user.passwordResetApproved = true; // Allows one-time passwordless login
  user.mustChangePassword = true;    // Forces immediate password change
  return user;
}

export function processPasswordChange(
  user: {
    password?: string;
    passwordResetApproved?: boolean;
    mustChangePassword?: boolean;
  },
  newPassword: string
): { success: boolean; error?: string } {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long' };
  }
  user.password = newPassword;
  user.passwordResetApproved = false;
  user.mustChangePassword = false;
  return { success: true };
}

// ==========================================
// TEST SUITE: AUTHENTICATION & ACCESS CONTROL
// ==========================================

test('validateRegistrationInput enforces required fields including TCS Employee ID and password length', () => {
  assert.equal(validateRegistrationInput({}).valid, false);
  assert.equal(validateRegistrationInput({ name: 'Rahul' }).valid, false);
  assert.equal(
    validateRegistrationInput({ name: 'Rahul', email: 'rahul@tcs.com', employeeId: 'TCS-101', password: '123' }).valid,
    false
  );
  assert.equal(
    validateRegistrationInput({ name: 'Rahul', email: 'rahul@tcs.com', password: 'password123', confirmPassword: 'password123' }).valid,
    false // Missing employeeId
  );
  assert.equal(
    validateRegistrationInput({
      name: 'Rahul',
      email: 'rahul@tcs.com',
      employeeId: 'TCS-101',
      password: 'password123',
      confirmPassword: 'different',
    }).valid,
    false
  );
  assert.equal(
    validateRegistrationInput({
      name: 'Rahul',
      email: 'rahul@tcs.com',
      employeeId: 'TCS-101',
      password: 'password123',
      confirmPassword: 'password123',
    }).valid,
    true
  );
});

test('validateForgotPasswordInput enforces Email ID and TCS Employee ID', () => {
  assert.equal(validateForgotPasswordInput({}).valid, false);
  assert.equal(validateForgotPasswordInput({ email: 'user@example.com' }).valid, false);
  assert.equal(validateForgotPasswordInput({ employeeId: 'TCS-999' }).valid, false);
  assert.equal(validateForgotPasswordInput({ email: 'user@example.com', employeeId: 'TCS-999' }).valid, true);
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

test('Forgot password lifecycle: admin approval enables passwordless login, forces password change, and invalidates temporary state', () => {
  const user = {
    email: 'karthik@example.com',
    password: 'OldPassword@123',
    passwordResetRequested: true,
    passwordResetApproved: false,
    mustChangePassword: false,
  };

  // 1. Before approval, user cannot login without password
  assert.equal(canLoginWithoutPassword(user), false);

  // 2. Admin approves reset request
  processAdminResetApproval(user);
  assert.equal(user.passwordResetApproved, true);
  assert.equal(user.mustChangePassword, true);
  assert.equal(canLoginWithoutPassword(user), true);

  // 3. User sets new password
  const failResult = processPasswordChange(user, '123'); // Too short
  assert.equal(failResult.success, false);

  const successResult = processPasswordChange(user, 'NewStrongPassword@2026');
  assert.equal(successResult.success, true);
  assert.equal(user.password, 'NewStrongPassword@2026');
  assert.equal(user.passwordResetApproved, false);
  assert.equal(user.mustChangePassword, false);

  // 4. User cannot do passwordless login anymore
  assert.equal(canLoginWithoutPassword(user), false);
  // 5. Must authenticate with new password
  assert.equal(verifyPassword(user.password, 'NewStrongPassword@2026'), true);
});
