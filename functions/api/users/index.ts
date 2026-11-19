import type { AppEnv, PagesFunction } from '../../env';
import { ensureD1Schema } from '../../db';
import { requireAuth, requireRole, getCorsHeaders } from '../../auth';
import { hashPassword } from '../../crypto';

export const onRequestOptions: PagesFunction<AppEnv> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const cors = getCorsHeaders(request);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: cors,
      });
    }

    await ensureD1Schema(env.DB);
    const currentUser = await requireAuth(request, env.DB);

    const isAdmin = currentUser.role === 'community_admin' || currentUser.role === 'platform_admin';

    let query = `
      SELECT 
        id, email, name, employee_id as employeeId, campus_id as campusId,
        role_title as roleTitle, status, role, bio, icebreaker, interests,
        dietary, social_battery as socialBattery, avatar_seed as avatarSeed,
        avatar_bg as avatarBgColor, registered_at as registeredAt, approved_at as approvedAt
      FROM users
    `;
    const params: any[] = [];

    if (!isAdmin) {
      // Standard users only see approved members from their own campus
      query += ` WHERE status = 'approved' AND campus_id = ?`;
      params.push(currentUser.campusId);
    } else if (currentUser.role === 'community_admin') {
      // Campus admin sees all members and applicants within their own campus
      query += ` WHERE campus_id = ?`;
      params.push(currentUser.campusId);
    }

    query += ` ORDER BY created_at DESC;`;

    const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
    const { results } = await stmt.all<any>();

    const users = (results || []).map((u: any) => {
      let parsedInterests: string[] = [];
      if (u.interests) {
        try {
          parsedInterests = typeof u.interests === 'string' ? JSON.parse(u.interests) : u.interests;
        } catch {
          parsedInterests = u.interests.split(',').map((s: string) => s.trim());
        }
      }

      if (!isAdmin) {
        // Redact email and employeeId for non-admin viewers
        return {
          id: u.id,
          name: u.name,
          roleTitle: u.roleTitle,
          campusId: u.campusId,
          bio: u.bio,
          icebreaker: u.icebreaker,
          interests: Array.isArray(parsedInterests) ? parsedInterests : [],
          dietary: u.dietary,
          socialBattery: u.socialBattery,
          avatarSeed: u.avatarSeed,
          avatarBgColor: u.avatarBgColor,
          status: 'approved',
          role: u.role,
        };
      }

      return {
        ...u,
        interests: Array.isArray(parsedInterests) ? parsedInterests : [],
      };
    });

    return new Response(JSON.stringify(users), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch users.' }), {
      status: 500,
      headers: cors,
    });
  }
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
    // Strict authentication and campus authority check
    const adminUser = await requireAuth(request, env.DB);
    const body: any = await request.json().catch(() => ({}));
    const campusId = body.campusId || adminUser.campusId || 'comm_siruseri';
    requireRole(adminUser, ['platform_admin', 'community_admin'], campusId);

    const { name, email, employeeId, role, roleTitle, password } = body;

    if (!name || !email || !employeeId || !password) {
      return new Response(
        JSON.stringify({ error: 'Name, email, employee ID, and password are required.' }),
        { status: 400, headers: cors }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long.' }),
        { status: 400, headers: cors }
      );
    }

    // Only platform_admin can provision administrators
    const assignedRole = (role === 'community_admin' && adminUser.role === 'platform_admin') ? 'community_admin' : 'user';

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim().toUpperCase();
    const id = body.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowISO = new Date().toISOString();
    const now = Date.now();

    const hashedPassword = await hashPassword(password);

    await env.DB.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, employee_id, campus_id, role_title,
        status, role, password_reset_approved, must_change_password,
        registered_at, approved_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        'approved', ?, 0, 0,
        ?, ?, ?
      );
    `).bind(
      id,
      trimmedEmail,
      hashedPassword,
      name.trim(),
      trimmedEmpId,
      campusId,
      roleTitle?.trim() || (assignedRole === 'community_admin' ? 'Campus Administrator' : 'Software Engineer'),
      assignedRole,
      nowISO,
      nowISO,
      now
    ).run();

    // Audit log with session-derived admin identity
    const logId = `log_${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_user_name, details, timestamp)
      VALUES (?, ?, ?, 'PROVISION_USER', ?, ?, ?, ?);
    `).bind(
      logId,
      adminUser.id,
      adminUser.name,
      id,
      name.trim(),
      `Directly provisioned verified member ${name.trim()} (${trimmedEmpId}) in campus ${campusId}`,
      nowISO
    ).run().catch(() => {});

    const newUser = {
      id,
      email: trimmedEmail,
      name: name.trim(),
      employeeId: trimmedEmpId,
      campusId,
      roleTitle: roleTitle?.trim() || (assignedRole === 'community_admin' ? 'Campus Administrator' : 'Software Engineer'),
      status: 'approved',
      role: assignedRole,
      registeredAt: nowISO,
      approvedAt: nowISO,
    };

    return new Response(JSON.stringify({ success: true, user: newUser }), {
      status: 201,
      headers: cors,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message || 'Failed to create user.' }), {
      status: 500,
      headers: cors,
    });
  }
};
