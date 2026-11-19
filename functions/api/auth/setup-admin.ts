import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { hashPassword, hashToken, generateSecureToken, generateCsrfToken } from '../../crypto';
import { getCorsHeaders, createSessionCookie } from '../../auth';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database service is currently unavailable.' }), {
        status: 503,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);

    // 1. Strict guard: verify if ANY administrator already exists
    const adminCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM users WHERE role IN ('community_admin', 'platform_admin') AND status = 'approved';`
    ).first<{ count: number }>().catch(() => ({ count: 0 }));

    if (adminCount && adminCount.count > 0) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Administrator already provisioned. Initial setup is permanently locked.' }),
        { status: 403, headers: cors }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { name, email, password, employeeId, campusId } = body;

    if (!name || !email || !password || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Name, email, employee ID, and password are required for administrator provisioning.' }),
        { status: 400, headers: cors }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Administrator password must be at least 8 characters long.' }),
        { status: 400, headers: cors }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();
    const adminId = `usr_admin_${Date.now()}`;
    const nowISO = new Date().toISOString();
    const now = Date.now();

    // Securely hash password using PBKDF2 (100k iterations, 16-byte random salt, SHA-256)
    const hashedPassword = await hashPassword(password);

    await env.DB.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, employee_id, campus_id, role_title,
        status, role, password_reset_approved, must_change_password,
        bio, icebreaker, registered_at, approved_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 'Platform Administrator',
        'approved', 'platform_admin', 0, 0,
        'Initial system administrator', 'System provisioned', ?, ?, ?
      );
    `).bind(
      adminId,
      trimmedEmail,
      hashedPassword,
      name.trim(),
      trimmedEmpId,
      campusId || 'comm_siruseri',
      nowISO,
      nowISO,
      now
    ).run();

    // Create session token & CSRF token
    const rawToken = generateSecureToken('sess');
    const tokenHash = await hashToken(rawToken);
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

    await env.DB.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?);
    `).bind(tokenHash, adminId, expiresAt, now).run();

    const csrfToken = await generateCsrfToken(rawToken);

    // Audit log entry for security audit trail
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, details, timestamp)
      VALUES (?, ?, ?, 'PROVISION_FIRST_ADMIN', ?, ?);
    `).bind(logId, adminId, name.trim(), `Initial platform administrator provisioned: ${trimmedEmail} (${trimmedEmpId})`, nowISO).run().catch(() => {});

    const safeUser = {
      id: adminId,
      email: trimmedEmail,
      name: name.trim(),
      employeeId: trimmedEmpId,
      campusId: campusId || 'comm_siruseri',
      roleTitle: 'Platform Administrator',
      status: 'approved',
      role: 'platform_admin',
    };

    return new Response(
      JSON.stringify({
        success: true,
        token: rawToken,
        csrfToken,
        user: safeUser,
        message: 'Platform administrator provisioned successfully.',
      }),
      {
        status: 201,
        headers: {
          ...cors,
          'Set-Cookie': createSessionCookie(rawToken),
        },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Administrator provisioning failed.' }), {
      status: 500,
      headers: cors,
    });
  }
};
