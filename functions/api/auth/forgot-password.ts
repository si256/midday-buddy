import type { AppEnv, PagesFunction } from '../../env';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { request } = context;

  try {
    const body: any = await request.json().catch(() => ({}));
    const { email, employeeId } = body;

    if (!email || !employeeId) {
      return new Response(
        JSON.stringify({ error: 'Email ID and Employee ID are required.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset request submitted. Waiting approval by admin.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Request failed.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
