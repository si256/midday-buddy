import type { AppEnv, PagesFunction } from '../env';

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const isDbBound = Boolean(context.env.DB);
  
  return new Response(
    JSON.stringify({
      status: 'online',
      message: 'MidDay Buddy Cloudflare Edge Backend is active!',
      databaseBound: isDbBound,
      timestamp: Date.now(),
      environment: context.env.ENVIRONMENT || 'production',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
