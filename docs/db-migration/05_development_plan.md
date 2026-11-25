# Deliverable 5: Engineering Development & Execution Plan
**System:** TheBoredMonkey (TBM) & Troop by TBM Outreach Infrastructure  
**Author:** Senior Backend/DevOps Engineer & Technical Product Manager  
**Stage:** Stage 1 Deliverable — Ready for Review & Written Approval  
**Date:** 2026-11-25  

---

## 1. Plan Overview & Governance

This engineering plan details the ordered, task-by-task procedure to migrate the PostgreSQL database from Supabase to Hostinger VPS while preserving 100% data integrity for both **TheBoredMonkey** and **Troop by TBM** workspaces.

**Mandatory Rule**: Work in Stage 2 (Phase 1 onwards) will begin **only** after receiving written approval ("approved") from the project owner. Production on Supabase remains untouched throughout Phases 1–5.

---

## 2. Ordered Implementation Tasks (Stage 2)

### Task 1: Install & Secure PostgreSQL 17 on Hostinger VPS
- **Time Estimate**: 45 minutes
- **Environment**: Hostinger KVM 2 VPS (`201.18.217.65`)
- **Commands**:
  ```bash
  # 1. Add official PostgreSQL PGDG repository
  sudo apt-get install -y curl ca-certificates gnupg lsb-release
  sudo install -d /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
  sudo apt-get update

  # 2. Install PostgreSQL 17, contrib, and pgvector
  sudo apt-get install -y postgresql-17 postgresql-contrib-17 postgresql-17-pgvector

  # 3. Configure memory and WAL parameters in /etc/postgresql/17/main/postgresql.conf
  sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /etc/postgresql/17/main/postgresql.conf
  sudo tee -a /etc/postgresql/17/main/conf.d/tbm_performance.conf << 'EOF'
  shared_buffers = 2GB
  effective_cache_size = 4GB
  maintenance_work_mem = 256MB
  work_mem = 16MB
  min_wal_size = 1GB
  max_wal_size = 4GB
  checkpoint_completion_target = 0.9
  checkpoint_timeout = 15min
  wal_buffers = 16MB
  default_statistics_target = 100
  random_page_cost = 1.1
  effective_io_concurrency = 200
  max_connections = 100
  password_encryption = scram-sha-256
  wal_level = replica
  archive_mode = on
  archive_command = '/bin/true' # Temporary until pgBackRest configured
  archive_timeout = 60s
  EOF

  # 4. Restrict pg_hba.conf to scram-sha-256 on localhost only
  sudo tee /etc/postgresql/17/main/pg_hba.conf << 'EOF'
  local   all             postgres                                peer
  local   all             all                                     scram-sha-256
  host    all             all             127.0.0.1/32            scram-sha-256
  host    all             all             ::1/128                 scram-sha-256
  EOF

  # 5. Restart service and verify
  sudo systemctl restart postgresql
  sudo systemctl status postgresql --no-pager
  ```
- **Evidence Required**:
  - `psql -c "SELECT version();"` returns `PostgreSQL 17.x`
  - External port scan (`nmap -p 5432 201.18.217.65`) shows port 5432 **filtered / closed**.
- **Gate 1 Exit Criteria**: PostgreSQL 17 is running, hardened, and accessible strictly locally.

---

### Task 2: Create Staging & Production Roles and Databases
- **Time Estimate**: 15 minutes
- **Commands**:
  ```bash
  # Generate secure random passwords (stored in password manager, never in repo)
  sudo -u postgres psql << 'EOF'
  CREATE ROLE tbm_staging_user WITH LOGIN PASSWORD '***REDACTED_STAGING_PASSWORD***';
  CREATE ROLE tbm_prod_user WITH LOGIN PASSWORD '***REDACTED_PROD_PASSWORD***';

  CREATE DATABASE tbm_staging OWNER tbm_staging_user;
  CREATE DATABASE tbm_prod OWNER tbm_prod_user;

  \c tbm_staging
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
  CREATE EXTENSION IF NOT EXISTS "vector";
  CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

  \c tbm_prod
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
  CREATE EXTENSION IF NOT EXISTS "vector";
  CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
  EOF
  ```
- **Evidence Required**: `\l` shows both databases created; `\dx` on both databases lists all 5 required extensions.

---

### Task 3: Rehearse Migration to Staging (`tbm_staging`)
- **Time Estimate**: 30 minutes
- **Commands**:
  ```bash
  # 1. Take snapshot dump of Supabase public schema
  pg_dump "$SUPABASE_DIRECT_URL" -Fc --no-owner --no-privileges --schema=public -f /tmp/supabase_staging_snapshot.dump

  # 2. Restore into staging database
  pg_restore -d "postgresql://tbm_staging_user:***@localhost:5432/tbm_staging" \
    --no-owner --no-privileges --exit-on-error -j 2 /tmp/supabase_staging_snapshot.dump

  # 3. Analyze tables for fresh optimizer statistics
  sudo -u postgres psql -d tbm_staging -c "VACUUM ANALYZE;"
  ```
- **Evidence Required**: `pg_restore` completes with exit code 0.

---

### Task 4: Execute Automated Verification Suite
- **Time Estimate**: 30 minutes
- **Actions**:
  1. **Schema Diff**: Compare public schema DDL between Supabase and `tbm_staging`.
  2. **Row Count Audit**: Verify counts on all 45 tables against Phase 0 baseline.
  3. **Content Hash Check**:
     ```sql
     SELECT 'Lead' AS tbl, count(*), md5(string_agg(id || email || coalesce(status::text,''), '' ORDER BY id)) FROM "Lead";
     ```
  4. **Workspace Segregation Check**:
     - Verify 189 TBM campaigns + 10 Troop campaigns = 199 campaigns.
     - Verify 46,701 deduplicated unique contacts.
     - Verify 14 TBM mailboxes + 4 Troop mailboxes = 18 mailboxes.
     - Verify 0 orphan leads, 0 orphan events.
  5. **Prisma Drift Check**: Run `prisma migrate status` against `tbm_staging`.
- **Evidence Required**: Automated verification script prints `GATE_2_VERIFICATION_PASSED: 100% MATCH`.
- **Gate 2 Exit Criteria**: Zero schema diff, zero row count discrepancies, zero content hash discrepancies.

---

### Task 5: Connect Local Dev via SSH Tunnel & Run App Regression
- **Time Estimate**: 60 minutes
- **Commands**:
  ```bash
  # 1. Establish background SSH tunnel forwarding local port 5433 to VPS port 5432
  ssh -N -f -L 5433:localhost:5432 root@201.18.217.65

  # 2. In local web/.env, point to staging database
  DATABASE_URL="postgresql://tbm_staging_user:***@localhost:5433/tbm_staging?sslmode=disable"
  DIRECT_URL="postgresql://tbm_staging_user:***@localhost:5433/tbm_staging?sslmode=disable"
  ```
- **Test Checklist**:
  - `POST /api/auth/login`: Login with master and team member credentials.
  - Session verification: Cookie set, session row written in `"Session"`.
  - Workspace scoping test: Login as TBM user -> verify Troop data is hidden. Login as Troop user -> verify TBM data is hidden.
  - Smartlead webhook replay: Send sample `EMAIL_OPEN` and `EMAIL_REPLY` payloads -> verify event recorded.
  - Contacts view: Confirm 46,701 contacts render accurately.
- **Evidence Required**: All tests passing in local browser and terminal test suites.

---

### Task 6: Query Tuning & Analytics Speed Validation
- **Time Estimate**: 45 minutes
- **Actions**:
  - Measure baseline `GET /api/analytics/dashboard?period=7d` and `30d`.
  - Deploy verified composite and expression indexes:
    ```sql
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "Lead_lower_trim_email_idx" ON "Lead" (lower(trim(email)));
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "Lead_lastContactedAt_all_idx" ON "Lead" ("lastContactedAt");
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "EmailEvent_leadId_eventType_idx" ON "EmailEvent" ("leadId", "eventType");
    ```
  - Verify query execution plan with `EXPLAIN (ANALYZE, BUFFERS)`.
- **Target SLA**: Analytical dashboard response time **< 1.5s** (down from 25–30s on Supabase Tokyo).
- **Gate 3 Exit Criteria**: Application regression 100% pass, query speed < 1.5s, no data leakage between workspaces.

---

### Task 7: Build Backup Layer 1 — Hot Standby (Streaming Replication)
- **Time Estimate**: 60 minutes
- **Actions**:
  - Provision secondary VPS or failover node.
  - Configure `replication` role on primary VPS with TLS.
  - Create replication slot: `SELECT pg_create_physical_replication_slot('standby_slot');`.
  - Initialize standby via `pg_basebackup -h 201.18.217.65 -D /var/lib/postgresql/17/main -U replicator -Fp -Xs -R`.
  - Verify replication status via `SELECT * FROM pg_stat_replication;` (Lag < 2 seconds).

---

### Task 8: Build Backup Layer 2 — Continuous WAL Archiving & PITR (pgBackRest)
- **Time Estimate**: 45 minutes
- **Actions**:
  - Install pgBackRest on primary VPS.
  - Configure encrypted repository pointing to Cloudflare R2 / Backblaze B2 bucket (`tbm-postgres-backups`).
  - Configure `archive_timeout = 60s` in PostgreSQL.
  - Run initial full base backup: `pgbackrest --stanza=tbm backup --type=full`.
  - Verify WAL push to object storage.

---

### Task 9: Build Backup Layer 3 — Nightly Logical Dumps
- **Time Estimate**: 30 minutes
- **Actions**:
  - Deploy automated cron job at `/etc/cron.daily/tbm_db_dump`:
    ```bash
    pg_dump -Fc -d tbm_prod | openssl enc -aes-256-cbc -salt -out /backups/tbm_prod_$(date +%F).dump.enc
    rclone copy /backups/tbm_prod_$(date +%F).dump.enc remote:tbm-nightly-dumps/
    find /backups -name "*.dump.enc" -mtime +30 -delete
    ```
- **Gate 4 Exit Criteria**: Hot standby streaming with < 5s lag; pgBackRest full backup verified in object storage; nightly dump job active.

---

### Task 10: Disaster Recovery & Failure Drills
- **Time Estimate**: 60 minutes
- **Drill 1 (Failover)**: Stop primary PostgreSQL -> promote hot standby (`pg_ctl promote`) -> connect app -> measure RTO (< 15 mins).
- **Drill 2 (PITR)**: Simulate table truncation -> restore to timestamp `NOW() - INTERVAL '5 minutes'` via pgBackRest -> verify data restored.
- **Drill 3 (Logical Restore)**: Restore nightly dump into clean test server -> run verification suite.
- **Gate 5 Exit Criteria**: All 3 recovery mechanisms rehearsed and verified with recorded timings.

---

### Task 11: Final Production Cutover (Maintenance Window)
- **Time Estimate**: 30 minutes
- **Schedule**: Low-traffic window (e.g., 2:00 AM IST).
- **Execution Checklist**:
  1. Announce maintenance window.
  2. Pause writers on VPS:
     ```bash
     pm2 stop email-system-api
     ```
  3. Re-create clean production database:
     ```bash
     sudo -u postgres psql -c "DROP DATABASE IF EXISTS tbm_prod;" -c "CREATE DATABASE tbm_prod OWNER tbm_prod_user;"
     ```
  4. Take final export from Supabase and restore to `tbm_prod`:
     ```bash
     pg_dump "$SUPABASE_DIRECT_URL" -Fc --no-owner --no-privileges --schema=public -f /tmp/final_production.dump
     pg_restore -d "postgresql://tbm_prod_user:***@localhost:5432/tbm_prod" --no-owner --exit-on-error -j 2 /tmp/final_production.dump
     ```
  5. Run Automated Verification Suite on `tbm_prod` (100% match required).
  6. Switch connection string in production `.env` files:
     `DATABASE_URL="postgresql://tbm_prod_user:***@localhost:5432/tbm_prod"`
  7. Start services:
     ```bash
     pm2 restart all
     ```
  8. Perform live smoke test (view dashboard, confirm 46,701 contacts, trigger test webhook).
- **Gate 6 Exit Criteria**: Production live on VPS; zero errors in logs; query speed < 1.5s; backup pipelines active.

---

## 3. Rollback Procedure (< 15 Minutes Guaranteed)

If any gate fails during Phase 6 or unexpected anomalies occur post-cutover:
1. Stop API daemon: `pm2 stop email-system-api`.
2. Revert `.env` files back to the saved Supabase connection strings:
   `DATABASE_URL="postgresql://postgres.hsmudwkfwmvinhtggxyd:***@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"`
3. Restart PM2 processes: `pm2 restart all`.
4. Supabase is completely untouched and immediately resumes handling traffic.
5. Post-mortem review before rescheduling.
