import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';

const DEFAULT_USERS = [
  {
    id: 'usr_admin',
    email: 'admin@middaybuddy.com',
    name: 'System Administrator',
    employeeId: 'ADM-001',
    roleTitle: 'Platform Administrator',
    campusId: 'comm_siruseri',
    avatarBgColor: 'bg-indigo-600',
    bio: 'Platform administration and member verification for MidDay Buddy.',
    icebreaker: 'Welcome to MidDay Buddy backed by CoreReacher Enterprises!',
    interests: ['Workplace Well-being', 'Technology', 'Community'],
    dietary: 'Any',
    socialBattery: 'Balanced Banter',
    role: 'community_admin',
    status: 'approved',
    registeredAt: '2026-11-01T00:00:00Z',
    approvedAt: '2026-11-01T00:00:00Z',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  if (!env.DB) {
    return new Response(JSON.stringify(DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  }

  try {
    await ensureD1Schema(env.DB);
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');

    let query = `SELECT id, name, email, campus_id as campusId, role_title as roleTitle, status, role, employee_id as employeeId, registered_at as registeredAt, approved_at as approvedAt FROM users`;
    const params: string[] = [];

    if (statusParam) {
      query += ` WHERE status = ?`;
      params.push(statusParam);
    }

    query += ` ORDER BY created_at DESC;`;

    let results: any[] = [];
    try {
      const stmt = env.DB.prepare(query);
      const res = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
      results = res.results || [];
    } catch {
      // Fallback if created_at column is missing
      const fallbackQuery = statusParam 
        ? `SELECT id, name, email, campus_id as campusId, role_title as roleTitle, status, role, employee_id as employeeId, registered_at as registeredAt, approved_at as approvedAt FROM users WHERE status = ?;`
        : `SELECT id, name, email, campus_id as campusId, role_title as roleTitle, status, role, employee_id as employeeId, registered_at as registeredAt, approved_at as approvedAt FROM users;`;
      const fallbackStmt = env.DB.prepare(fallbackQuery);
      const res = statusParam ? await fallbackStmt.bind(statusParam).all() : await fallbackStmt.all();
      results = res.results || [];
    }

    // Always ensure Master Admin is included if the database returned 0 users
    if (results.length === 0) {
      results = DEFAULT_USERS;
    }

    return new Response(JSON.stringify(results), {
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify(DEFAULT_USERS), {
      headers: CORS_HEADERS,
    });
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    const id = body.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowISO = new Date().toISOString();
    const email = (body.email || '').trim().toLowerCase();
    const employeeId = (body.employeeId || body.employee_id || '').trim().toUpperCase();
    const name = (body.name || '').trim();
    const role = body.role || 'user';
    const roleTitle = body.roleTitle?.trim() || (role === 'community_admin' ? 'Campus Administrator' : 'Software Engineer');
    const campusId = body.campusId || 'comm_siruseri';
    const status = body.status || 'approved';
    const password = body.password || 'Buddy@12345';
    const adminId = body.adminId || 'admin';
    const adminName = body.adminName || 'Campus Admin';

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Name and Email ID are required.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (env.DB) {
      await ensureD1Schema(env.DB);

      // Check if user with this email or employee ID already exists
      let existingUser: any = null;
      if (employeeId) {
        existingUser = await env.DB.prepare(
          `SELECT id, email, employee_id, status FROM users WHERE LOWER(email) = ? OR UPPER(employee_id) = ?;`
        ).bind(email, employeeId).first().catch(() => null);
      } else {
        existingUser = await env.DB.prepare(
          `SELECT id, email, employee_id, status FROM users WHERE LOWER(email) = ?;`
        ).bind(email).first().catch(() => null);
      }

      if (existingUser) {
        // Safe update: Admin provisioning updates the existing record and sets status to approved
        await env.DB.prepare(`
          UPDATE users 
          SET name = ?, email = ?, employee_id = ?, role = ?, role_title = ?, campus_id = ?, status = 'approved', password = ?, password_hash = ?, approved_at = ?
          WHERE id = ?;
        `).bind(name, email, employeeId || null, role, roleTitle, campusId, password, password, nowISO, existingUser.id).run();

        const logId = `log_${Date.now()}`;
        await env.DB.prepare(`
          INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
          VALUES (?, ?, ?, 'ADD_MEMBER', ?, ?, ?, ?);
        `).bind(logId, adminId, adminName, existingUser.id, name, `Admin updated and verified member account for ${name} (Emp ID: ${employeeId})`, nowISO).run().catch(() => {});

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: existingUser.id,
              name,
              email,
              employeeId,
              role,
              roleTitle,
              campusId,
              status: 'approved',
              registeredAt: nowISO,
              approvedAt: nowISO,
            },
            log: {
              id: logId,
              adminId,
              adminName,
              action: 'ADD_MEMBER',
              targetUserId: existingUser.id,
              targetUserName: name,
              details: `Admin verified and configured member account for ${name}`,
              timestamp: nowISO,
            },
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // If does not exist, insert cleanly
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, password, password_hash, name, employee_id, campus_id, role_title,
          status, role, password_reset_approved, must_change_password, registered_at, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 0, 0, ?, ?, ?);
      `).bind(
        id, email, password, password, name, employeeId || null, campusId, roleTitle,
        role, nowISO, nowISO, Date.now()
      ).run();

      const logId = `log_${Date.now()}`;
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
        VALUES (?, ?, ?, 'ADD_MEMBER', ?, ?, ?, ?);
      `).bind(logId, adminId, adminName, id, name, `Admin created verified member account for ${name} (Emp ID: ${employeeId})`, nowISO).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id,
          name,
          email,
          employeeId,
          role,
          roleTitle,
          campusId,
          status: 'approved',
          registeredAt: nowISO,
          approvedAt: nowISO,
        },
        log: {
          id: `log_${Date.now()}`,
          adminId,
          adminName,
          action: 'ADD_MEMBER',
          targetUserId: id,
          targetUserName: name,
          details: `Admin created verified member account for ${name}`,
          timestamp: nowISO,
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
