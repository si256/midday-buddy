# Cloudflare D1 Database Migrations

This directory contains versioned, sequential, and idempotent SQL migrations for MidDay Buddy's Cloudflare D1 database.

## Migration Files
- `0001_initial_schema.sql`: Initial enterprise schema definition with foreign keys, PBKDF2 password hashes, session table, tombstone tables, and corporate campus seeds.

## Applying Migrations

### Local Development / Preview
```bash
npx wrangler d1 migrations apply midday-buddy-db --local
```

### Production Execution
```bash
npx wrangler d1 migrations apply midday-buddy-db --remote
```

### Direct SQL Execution Alternative
```bash
# Local D1
npx wrangler d1 execute midday-buddy-db --local --file=migration.sql

# Remote Production D1
npx wrangler d1 execute midday-buddy-db --remote --file=migration.sql
```

## Security Guidelines
1. **Never commit hardcoded administrator credentials into migrations**.
2. First-boot admin initialization is completed via the audited endpoint `POST /api/auth/setup-admin`.
3. Passwords must always be stored as salted PBKDF2 hashes (`pbkdf2$100000$<saltHex>$<hashHex>`).
