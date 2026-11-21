import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabase, MidDayDatabase } from './src/server/database.ts';
import { createApiRouter } from './src/server/apiRouter.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Creates the Express application with clean Frontend/Backend separation:
 *  - Backend REST API mounted strictly under /api (PostgreSQL-backed via createApiRouter)
 *  - Frontend React SPA served separately via Vite middleware (dev) or dist/ static bundle (prod)
 */
export function createApp(db: MidDayDatabase) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Production security & CORS headers (iframe-compatible for embedded previews)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Mount Backend API exclusively under /api
  app.use('/api', createApiRouter(db));

  return app;
}

async function startServer() {
  const db = createDatabase();
  const app = createApp(db);
  const httpServer = http.createServer(app);
  let viteServer: { close: () => Promise<void> } | null = null;

  // Mount Frontend React SPA
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `MidDay Buddy server listening on http://0.0.0.0:${PORT} (DB: ${db.getConnectionSummary()})`
    );
  });

  const shutdown = () => {
    server.close(async () => {
      if (viteServer) {
        await viteServer.close().catch(() => {});
      }
      await db.close().catch(() => {});
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
