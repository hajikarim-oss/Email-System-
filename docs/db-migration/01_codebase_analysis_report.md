# Deliverable 1: Codebase Analysis Report
**System:** TheBoredMonkey (TBM) & Troop by TBM Outreach Infrastructure  
**Author:** Senior Backend/DevOps Engineer & Technical Product Manager  
**Stage:** Stage 1 (Read-Only Scan) — Phase A Deliverable  
**Date:** 2026-11-25  

---

## 1. Executive Summary & Monorepo Structure

A complete read-only scan of the `Email-System--main` codebase was conducted. The codebase is organized as a unified monorepo hosting the core outreach execution platform, background synchronization services, and an administrative engine.

```
/Email-System--main
├── web/                       # Core Vite + React 19 SPA (TBM Outreach Dashboard & Unibox)
│   ├── src/                   # React frontend (Dashboard, Campaigns, Contacts, Unibox, Settings)
│   ├── vite.config.ts         # Vite server + embedded local API middleware plugins
│   └── package.json           # Dependencies: @tanstack/react-query, lucide-react, etc.
├── server/                    # Core backend service layer (Node.js / TypeScript)
│   ├── pg.ts                  # Native PostgreSQL pool client (pg.Pool)
│   ├── dbCluster.ts           # Multi-node DB Cluster Manager & failover coordinator
│   ├── db.ts                  # Prisma Client provider
│   ├── scope.ts               # Multi-tenant / Multi-workspace isolation & row scoping
│   ├── auth.ts                # Session management, scrypt password hashing, token validation
│   ├── analytics.ts           # Dashboard analytics & engagement calculations
│   ├── campaigns.ts           # Campaign stats, analytics, and lifecycle handlers
│   ├── contacts.ts            # Deduplicated contacts & lead queries
│   ├── mailboxes.ts           # Mailbox operations & domain isolation
│   ├── smartleadWebhook.ts    # HMAC-SHA256 signature verification & event ingestion
│   ├── smartleadSync.ts       # Campaign/mailbox reconciliation with Smartlead API
│   ├── sentEventsSync.ts      # Self-healing background historical send-event sync
│   ├── tally/                 # Tally ERP XML integration & accounting reconciliation
│   └── snapshotCache.ts       # Disk-backed telemetry snapshot cache
├── api/                       # Standalone Production API Daemon
│   ├── index.ts               # Production HTTP server daemon (port 3001) + background cron loops
│   ├── chat.ts                # AI Assistant integration (OpenAI)
│   └── brain/                 # PIE (Prospect Intelligence Engine) handlers
├── nexus-outbound/            # Next.js 15 Administrative & Backend Engine
│   ├── prisma/schema.prisma   # Canonical PostgreSQL Prisma Schema
│   └── src/                   # Next.js admin app & API routes
├── scripts/                   # Operational, migration, and background worker scripts
│   ├── harvest_tree_worker.ts # 24/7 Resumable BFS tree harvester worker
│   ├── smartlead_autosync.cjs # Self-healing Smartlead campaign reconciliation worker
│   └── ddl_phase1_v3.mjs      # Database schema hardening & counter backfill script
└── docs/db-migration/         # Database migration documentation and stage deliverables
```

---

## 2. Database Layer Analysis

### 2.1 Prisma Schema & Database Configuration
The canonical Prisma schema is located at:
`nexus-outbound/prisma/schema.prisma` (lines 1–774).

- **Datasource**: PostgreSQL
- **Environment variables read**:
  - `DATABASE_URL`: Session or transaction pooler endpoint (defaulting to port 6543 / PgBouncer)
  - `DIRECT_URL`: Direct session endpoint (port 5432) used for schema migrations
- **Models**: 45 registered models, including `User`, `Team`, `UserTeam`, `Mailbox`, `Campaign`, `CampaignMailbox`, `CampaignStep`, `Lead`, `EmailEvent`, `EmailMessage`, `SuppressedEmail`, `Creator`, `CreatorCampaign`, `Account`, `Session`, `VerificationToken`, `AuditLog`, `Notification`, and Tally accounting models (`tally_vouchers`, `tally_payments`, `tally_receipts`, etc.).

### 2.2 Database Clients and Connection Pooling
Three distinct database connection strategies exist across the codebase:

1. **Native PostgreSQL Pool (`server/pg.ts`)**:
   - Uses `pg.Pool` with `max: 2` connections (recently tuned from 15 to stay within Supabase connection limits).
   - `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 30000`.
   - Used for high-throughput queries, raw SQL, and analytical aggregations.

2. **Cluster Manager Pool (`server/dbCluster.ts`)**:
   - Manages connection topologies across nodes (Primary: Tokyo, Replica2: Seoul, Replica3: Singapore).
   - Features queue-based query execution (`startQueueWorker`), circuit breakers, and semaphore concurrency limits (`maxConcurrent = 2`).
   - Query timeout configured to 30,000ms.

3. **Prisma Client (`server/db.ts`)**:
   - Standard `@prisma/client` instance configured with `DIRECT_URL || DATABASE_URL`.
   - Used by administrative CRUD routes and Next.js `nexus-outbound` workflows.

### 2.3 Comprehensive Inventory of Database Consumers Reading Connection Variables
Evidence from codebase scan:

| Consumer File | Variable Read | Line Reference | Purpose |
| :--- | :--- | :--- | :--- |
| `web/.env` | `DATABASE_URL`, `DIRECT_URL` | L7–8 | Local Vite development server database endpoint |
| `.env` (root) | `DATABASE_URL`, `DIRECT_URL` | Root config | Monorepo and daemon environment configuration |
| `nexus-outbound/prisma/schema.prisma` | `DATABASE_URL`, `DIRECT_URL` | L11–12 | Prisma ORM engine schema definition |
| `server/pg.ts` | `DATABASE_URL` | L15, L24 | Direct PostgreSQL pool initialization |
| `server/dbCluster.ts` | `DIRECT_URL`, `DATABASE_URL` | L229 | Multi-replica cluster manager connection string resolver |
| `server/db.ts` | `DIRECT_URL`, `DATABASE_URL` | L48–49 | PrismaClient singleton factory |
| `web/vite.config.ts` | `DATABASE_URL` | L1055 | Vite local API middleware database client fallback |
| `api/index.ts` | `DATABASE_URL` (via `server/pg.ts`) | L1–50 | Production API daemon and background sync workers |
| `scripts/harvest_tree_worker.ts` | `DATABASE_URL` | L34 | 24/7 VPS harvester worker |
| `scripts/smartlead_autosync.cjs` | `DATABASE_URL` | L18 | Self-healing Smartlead sync worker |
| `scripts/ddl_phase1_v3.mjs` | `DATABASE_URL` | L9 | Schema backfill and index deployment script |

---

## 3. Authentication & Authorization System

### 3.1 Authentication Architecture
Analysis of `server/auth.ts` (lines 1–100) and `server/handlers/auth.ts` reveals:
- **No Supabase Auth (GoTrue)**: Supabase Auth is **NOT used**. There is zero dependency on `@supabase/auth-helpers`, Supabase JWT verification, or GoTrue microservices.
- **Password Hashing**: Implemented using Node.js native `crypto.scrypt` with parameters `N=16384, r=8, p=1, keylen=64` (`server/auth.ts` lines 16–38). Hash format: `scrypt$16384$8$1$salt$derived`.
- **Session & Token Management**:
  - Web and API requests use bearer session tokens stored in the PostgreSQL `"Session"` table (`id, sessionToken, userId, expires`).
  - `createSession(userId)` creates 30-day tokens and purges expired sessions (`server/auth.ts` line 63).
  - Development bypass: Deterministic tokens like `token_usr_master_01` resolve to hardcoded master user credentials for local dev (`server/auth.ts`).
- **Role-Based Access Control**:
  - Roles defined in Prisma: `MASTER` and `TEAM_MEMBER` (`Role` enum).
  - `MASTER`: Full administrative access to workspace resources, campaign management, and cross-team metrics.
  - `TEAM_MEMBER`: Restricted to self-created campaigns and leads.

### 3.2 Row Level Security (RLS) Audit
Direct query audit of the Supabase PostgreSQL database:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual FROM pg_policies;
```
**Result:** **0 policies found** (`[]`).  
**Finding:** PostgreSQL Row Level Security (RLS) is disabled across all tables in the `public` schema. Data isolation is enforced strictly at the application layer via SQL predicates.

---

## 4. Workspace Modeling & Multi-Tenancy

Data isolation between the two business entities—**TheBoredMonkey (TBM)** and **Troop by TBM**—is governed by `server/scope.ts`.

### 4.1 Entity Identification
1. **TheBoredMonkey (Main Workspace)**:
   - Team identifier: `team_tbm_main` (or default scope)
   - Scope: B2B outreach, agency sales, client acquisition.
   - Mailbox domain filter: `lower(senderEmail) NOT LIKE '%@tbmtroop%'`.
2. **Troop by TBM (Creator Vertical)**:
   - Team identifier: `team_troops_outreach`
   - Scope: Influencer marketing, creator onboarding, reviewer seeding.
   - User ID prefix: `usr_troops_*` (e.g., `usr_troops_0c4c79fd`, `usr_troops_87e6f943`, `usr_troops_4d72a76b`).
   - Mailbox domain filter: `lower(senderEmail) LIKE '%@tbmtroop%'`.
   - Campaign naming convention: campaigns matching `%creator%`, `%influencer%`, `%reviewer%`, `%troops%`.

### 4.2 Application Scoping Rules (`server/scope.ts`)
Ownership and tenant boundaries propagate through relational joins:
- **Campaigns**: Scoped via `ownerOwned()` (L71–85) on `userId` or matching campaign naming patterns.
- **Mailboxes**: Scoped via `mailboxOwned()` (L130–142) on `senderEmail` domain and `userId`.
- **Leads**: Scoped via `leadOwned()` (L88–100) through `Lead.campaignId -> Campaign.userId`.
- **Email Events**: Scoped via `eventOwned()` (L103–115) through `EmailEvent.leadId -> Lead -> Campaign`.
- **Email Messages**: Scoped via `messageOwned()` (L118–127) through `EmailMessage.senderEmail -> Mailbox.senderEmail`.

---

## 5. Background Processes, Workers & Integrations

### 5.1 Standalone Daemons & Workers
1. **Production API Daemon (`api/index.ts`)**:
   - Runs on port 3001 under PM2 (`email-system-api`).
   - Periodic Mailbox Sync: `setInterval` every 10 minutes (L316).
   - Periodic Send History Sync: `setInterval` every 30 minutes (L331) rebuilding missed `EMAIL_SENT` events.
2. **Resumable Harvester Worker (`scripts/harvest_tree_worker.ts`)**:
   - 24/7 background worker processing BFS creator graphs from `CreatorHarvestQueue`.
3. **Smartlead Auto-Sync (`scripts/smartlead_autosync.cjs`)**:
   - Reconciles campaign statuses, lead counts, and sending schedules.

### 5.2 Smartlead Webhook Ingestion
- **Webhook Endpoint**: `POST /api/webhooks/smartlead` (`server/smartleadWebhook.ts`).
- **Signature Security**: HMAC-SHA256 signature verified against `SMARTLEAD_WEBHOOK_SECRET` via headers `x-webhook-signature` or `x-smartlead-signature`.
- **Event Types Handled**:
  - `EMAIL_SENT` -> Records `EmailEvent`, updates `Lead.totalOutbound`, `lastContactedAt`.
  - `EMAIL_OPEN` -> Records `EmailEvent`, updates `Lead.openCount`, `lastOpenAt`.
  - `EMAIL_REPLY` -> Records `EmailEvent`, updates `Lead.totalReplied`, `repliedAt`, sentiment classification.
  - `EMAIL_BOUNCE` -> Records `EmailEvent`, updates `Lead.status = 'BOUNCED'`, `lastBouncedAt`.
  - `EMAIL_LINK_CLICK` -> Records `EmailEvent` (`CLICK`).
  - `LEAD_UNSUBSCRIBED` -> Updates `Lead.status = 'UNSUBSCRIBED'`.

### 5.3 External Integrations
- **Smartlead API**: REST integration using API keys (`server/smartleadKeys.ts`).
- **Apollo Search & Enrichment API**: Lead search service (`server/apolloService.ts`).
- **Tally ERP**: Bidirectional accounting sync via XML HTTP requests (`server/tally/agent.ts`).
- **OpenAI API**: AI draft generation and reply sentiment classification.
- **Sentry**: Frontend error reporting (`@sentry/vite-plugin`).

---

## 6. Verification & Test Suite Inventory

### 6.1 Existing Automated Tests
- **Frontend / Integration Tests (`web/src/`)**:
  - `web/src/app/app/campaigns/campaignTabs.test.tsx`
  - `web/src/app/app/campaigns/appNavRoles.test.tsx`
  - `web/src/components/app/contacts/selection.test.ts`
  - `web/src/components/app/campaigns/__tests__/campaignMasterDeleteAndLeads.test.ts`
  - `web/src/lib/email/body.test.ts`
- **Tally Integration Tests (`tests/tally/`)**:
  - `phase1.test.ts`, `phase2.test.ts`, `phase3_4.test.ts` (XML payload & reconciliation tests).
- **Python Intelligence Suite (`tests/test_intelligence.py`)**:
  - Contact deduplication and hygiene checks.

### 6.2 Test Gaps for Migration Verification
Prior to live migration cutover, the following automated test suites must be developed:
1. **Schema & Object Hash Validator**: Automated comparison of table schemas, column data types, default constraints, and foreign keys between Supabase and VPS.
2. **Row Count & MD5 Checksum Suite**: Chunked MD5 content hash comparison script for all 45 tables.
3. **Workspace Segregation Shadow Suite**: Automated execution of identical read queries on both databases verifying that TBM and Troop row counts match 100%.
4. **Auth Flow Regression Suite**: Verification of password hash resolution, session creation, token validation, and logout on the new PostgreSQL instance.

---

## 7. Supabase Dependency Assessment & Gate A Sign-off

| Supabase Feature | In Use? | Migration Impact & Strategy |
| :--- | :--- | :--- |
| **Supabase Managed Postgres** | **YES** | Primary data store; will be completely replaced by self-hosted PostgreSQL 17 on Hostinger VPS. |
| **Supabase Auth / GoTrue** | **NO** | Zero impact. Application uses custom `scrypt` hashing and `"Session"` table in PostgreSQL. |
| **Supabase RLS (Row Level Security)** | **NO** | Zero impact. 0 policies exist in `public` schema. Scoping is in application logic (`server/scope.ts`). |
| **Supabase Storage** | **NO** | No bucket dependencies found; static assets served via local disk or external CDN. |
| **Supabase Realtime** | **NO** | Polling and React Query used for live updates; no Supabase Realtime subscriptions in use. |
| **Supabase Vault (`supabase_vault`)** | **YES (Extension)** | Installed on Supabase by default, but no application tables reference `vault.secrets`. Excluded from dump (`--schema=public`). |
| **pgvector (`vector`)** | **YES (Extension)** | Version 0.8.2 installed. Must be installed from PGDG repository on Hostinger VPS. |
| **pg_trgm & pgcrypto** | **YES (Extensions)** | Standard PostgreSQL contrib extensions; installed via `postgresql-contrib-17`. |

**Gate A Status:** **PASSED**  
Every database consumer, client, environment dependency, background process, and workspace boundary has been scanned, audited, and evidenced.
