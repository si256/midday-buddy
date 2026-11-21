# Database Operations & Migration Guide (Supabase ↔ Self-Managed PostgreSQL)

MidDay Buddy uses **standard PostgreSQL (`pg`)** with **zero vendor lock-in**. All schema migrations live in a single directory (`supabase/migrations/`) containing pure PostgreSQL 14+ DDL.

---

## 1. Connecting to Supabase (Current Managed Setup)

1. In Supabase Dashboard → **Connect**, copy the **Transaction Pooler** URI (port `6543`):
   ```env
   DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
   ```
2. Add `DATABASE_URL` to your server environment secrets (AI Studio **Settings → Secrets**, Cloud Run env vars, or `.env`). Never commit `DATABASE_URL` to Git.
3. **Schema Sync**:
   - **Automatic via GitHub**: With Supabase GitHub integration working directory set to `.`, pushing new timestamped `.sql` files in `supabase/migrations/` to `main` applies them automatically.
   - **Manual CLI**: Run `npm run db:migrate` from any environment with `DATABASE_URL` configured.
4. **Initial Admin Account**:
   - Open `/admin` to claim the first platform administrator account (one-time setup that locks permanently once created), **or** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in server secrets before startup.

---

## 2. Creating Future Schema Changes (Corporate Workflow)

Never edit an already-applied migration file. Add a new timestamped SQL file using standard PostgreSQL syntax only:

```text
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```

- Test locally or in staging with `npm run db:migrate`.
- Merge to `main` so Supabase (or your self-hosted CI/CD pipeline running `npm run db:migrate`) applies it cleanly in order.

---

## 3. Migrating from Supabase to Self-Managed PostgreSQL

Because the application uses standard PostgreSQL tables, standard `pg` queries, and no Supabase-proprietary runtime SDKs, moving to self-managed PostgreSQL (VPS, Docker, Kubernetes, RDS, or Cloud SQL) requires **zero application code changes**.

### Step A — Provision Target PostgreSQL (PostgreSQL 14+)
Example using the included Docker Compose stack (which mounts `supabase/migrations/` automatically on fresh boot):
```bash
export POSTGRES_PASSWORD="<strong-generated-password>"
docker compose -f docker-compose.prod.yml up -d postgres
```

### Step B — Export Data from Supabase (Use the Direct Connection URI on Port 5432)
```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  "$SUPABASE_DIRECT_DATABASE_URL" \
  -f midday_buddy_backup.dump
```

### Step C — Restore into Self-Managed PostgreSQL
```bash
pg_restore \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --dbname="$SELF_MANAGED_DATABASE_URL" \
  midday_buddy_backup.dump
```

*(For a brand-new empty self-managed database without migrating existing rows, simply run `DATABASE_URL="$SELF_MANAGED_DATABASE_URL" npm run db:migrate`.)*

### Step D — Cut Over Application Traffic
1. Update `DATABASE_URL` in your backend deployment to point to your self-managed PostgreSQL instance.
2. Set `DATABASE_SSL`:
   - `DATABASE_SSL=false` for private internal networks (Docker/VPC localhost).
   - `DATABASE_SSL_CA="<PEM cert>"` for strict TLS verification over public or enterprise networks.
3. Restart the backend and verify `GET /api/health` returns `"status": "online"` and `"provider": "self-managed"`.
