# MidDay Buddy — Production Deployment & Disaster Recovery Runbook

**Target Architecture:** Cloudflare Pages with Functions + Cloudflare D1 Serverless Database  
**Zero-Budget Tier:** ₹0/month on Cloudflare Free Tier (Workers, Pages, D1)

---

## 1. Prerequisites & Environment Setup

### 1.1 Cloudflare CLI Authentication
Ensure Wrangler is authenticated:
```bash
npx wrangler login
npx wrangler whoami
```

### 1.2 D1 Database Provisioning
Create isolated D1 databases for staging and production:
```bash
# Staging database
npx wrangler d1 create midday-buddy-staging-db

# Production database
npx wrangler d1 create midday-buddy-prod-db
```
*Note down the returned `database_id` values for `wrangler.jsonc` or `wrangler.toml`.*

---

## 2. Database Migration

Run the unified `migration.sql` script to establish tables, constraints, and indexes:

### 2.1 Staging Migration:
```bash
npx wrangler d1 execute midday-buddy-staging-db --file=migration.sql
```

### 2.2 Production Migration:
```bash
npx wrangler d1 execute midday-buddy-prod-db --file=migration.sql
```

### 2.3 Verification of Database Schema:
```bash
npx wrangler d1 execute midday-buddy-prod-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```
Expected tables:
- `communities`
- `users`
- `sessions`
- `locations`
- `breaks`
- `messages`
- `notifications`
- `reset_requests`
- `audit_logs`
- `system_metadata`
- `deleted_communities`

---

## 3. Building & Deploying the Application

### 3.1 Pre-Deployment Quality Gate Check
Run the automated quality suite locally:
```bash
# 1. Type check
npx tsc --noEmit

# 2. Automated test suite
npx tsx --test src/utils/*.test.ts

# 3. Production asset bundle build
npm run build
```

### 3.2 Deploy to Cloudflare Pages:
```bash
# Deploy to Staging Preview
npx wrangler pages deploy dist --project-name=midday-buddy --branch=staging

# Deploy to Production
npx wrangler pages deploy dist --project-name=midday-buddy --branch=main
```

### 3.3 Binding D1 Database to Cloudflare Pages Project
In your Cloudflare Dashboard:
1. Navigate to **Workers & Pages** > **midday-buddy** > **Settings** > **Functions**.
2. Under **D1 database bindings**, add:
   - **Variable name:** `DB`
   - **D1 database:** Select `midday-buddy-prod-db` for production and `midday-buddy-staging-db` for preview.

---

## 4. Initial Platform Administrator Provisioning

To securely bootstrap the first administrator without baking credentials into source code:
```bash
# Generate PBKDF2 hash using the provided secure helper or CLI
npx tsx -e "
const { hashPassword } = require('./src/utils/crypto.ts');
hashPassword('YourStrongMasterPassword@2026').then(hash => {
  console.log('SQL Statement:');
  console.log(\`INSERT OR REPLACE INTO users (id, email, password_hash, name, employee_id, campus_id, role_title, status, role, registered_at, approved_at, created_at)
VALUES ('usr_admin', 'admin@company.com', '\${hash}', 'System Administrator', 'ADM-001', 'comm_siruseri', 'Platform Administrator', 'approved', 'community_admin', '\${new Date().toISOString()}', '\${new Date().toISOString()}', \${Date.now()});\`);
});
"
```
Execute the resulting SQL statement against your production D1 instance:
```bash
npx wrangler d1 execute midday-buddy-prod-db --command="<PASTE_STATEMENT>"
```

---

## 5. Rollback Procedure

If a deployed version introduces an unexpected regression:

### 5.1 Instant Deployment Rollback (Cloudflare Pages Dashboard)
1. Navigate to **Workers & Pages** > **midday-buddy** > **Deployments**.
2. Locate the previous healthy deployment.
3. Click the three dots `...` next to that deployment and select **Rollback to this deployment**.
4. The previous static bundle and function routes become active instantly (~5 seconds).

### 5.2 Database Rollback (Point-in-Time Restore)
If data corruption occurred:
```bash
# List available automated Cloudflare D1 backups
npx wrangler d1 time-travel info midday-buddy-prod-db

# Restore to a specific timestamp (e.g. 1 hour ago)
npx wrangler d1 time-travel restore midday-buddy-prod-db --timestamp=1731070000
```

---

## 6. Backup & Disaster Recovery

### 6.1 Periodic D1 SQL Snapshot Backup:
```bash
# Export production database dump
npx wrangler d1 export midday-buddy-prod-db --output=./backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### 6.2 Restore Dump to New Staging or Disaster Recovery Instance:
```bash
npx wrangler d1 create midday-buddy-dr-db
npx wrangler d1 execute midday-buddy-dr-db --file=./backups/backup_20261108.sql
```
