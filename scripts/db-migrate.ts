import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { PgPoolLike, resolvePostgresConfig } from '../src/server/database.ts';

dotenv.config();

export interface MigrationSummary {
  applied: string[];
  skipped: string[];
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Provider-agnostic PostgreSQL migration runner.
 * Executes sorted SQL files from supabase/migrations/ atomically against ANY PostgreSQL server
 * (Supabase or self-managed PostgreSQL), tracking applied files & SHA-256 checksums in schema_migrations.
 */
export async function runMigrations(
  pool: PgPoolLike,
  migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations')
): Promise<MigrationSummary> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const appliedRes = await pool.query(`SELECT filename, checksum FROM schema_migrations`);
  const appliedMap = new Map<string, string>(
    appliedRes.rows.map((row: any) => [String(row.filename), String(row.checksum)])
  );

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of sqlFiles) {
    const filePath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(filePath, 'utf8');
    const checksum = sha256(sql);

    const existingChecksum = appliedMap.get(filename);
    if (existingChecksum) {
      if (existingChecksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for "${filename}". Never edit an already-applied migration; create a new timestamped migration file instead.`
        );
      }
      skipped.push(filename);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
        [filename, checksum]
      );
      await client.query('COMMIT');
      applied.push(filename);
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure if socket disconnected
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}

async function main() {
  const resolved = resolvePostgresConfig(process.env);
  if (!resolved) {
    console.error(
      'ERROR: PostgreSQL connection is not configured. Set DATABASE_URL (or PGHOST/PGDATABASE/PGUSER/PGPASSWORD) before running migrations.'
    );
    process.exit(1);
  }

  const pool = new Pool(resolved.poolConfig);
  try {
    console.log(
      `Running PostgreSQL migrations (${resolved.provider}, TLS: ${resolved.sslEnabled ? 'on' : 'off'})...`
    );
    const summary = await runMigrations(pool);
    console.log(
      `Migrations complete. Applied: ${summary.applied.length} (${summary.applied.join(', ') || 'none'}), Skipped: ${summary.skipped.length}.`
    );
  } finally {
    await pool.end();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
