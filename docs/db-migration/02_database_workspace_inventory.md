# Deliverable 2: Database and Workspace Inventory
**System:** TheBoredMonkey (TBM) & Troop by TBM Outreach Infrastructure  
**Author:** Senior Backend/DevOps Engineer & Technical Product Manager  
**Stage:** Stage 1 (Read-Only Scan) — Phase 0 Deliverable  
**Date:** 2026-11-25  

---

## 1. Supabase PostgreSQL Instance Audit

### 1.1 Engine & Architecture
- **PostgreSQL Version**: `PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Total Database Size**: **786 MB** (data + indexes)
- **Deployment Region**: Tokyo (`aws-0-ap-northeast-1`)
- **Connection Endpoints**:
  - Session Pooler: Port `5432` (`aws-0-ap-northeast-1.pooler.supabase.com:5432`)
  - Transaction Pooler (PgBouncer): Port `6543` (`aws-0-ap-northeast-1.pooler.supabase.com:6543`)
- **Active Schemas**: `public`, `app`, `audit`, `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `processed`, `raw`, `realtime`, `storage`, `vault`.
- **Target Application Schema**: `public` (All application tables reside exclusively in `public`).

### 1.2 Installed PostgreSQL Extensions
Audited via `SELECT extname, extversion FROM pg_extension`:

| Extension Name | Version | Purpose in Application | VPS Target Action |
| :--- | :--- | :--- | :--- |
| `plpgsql` | 1.0 | Standard procedural language | Built-in |
| `uuid-ossp` | 1.1 | UUID generation (`uuid_generate_v4()`) | Install via `postgresql-contrib-17` |
| `pgcrypto` | 1.3 | Cryptographic hashing & HMAC | Install via `postgresql-contrib-17` |
| `pg_trgm` | 1.6 | Trigram indexing for fast text search | Install via `postgresql-contrib-17` |
| `pg_stat_statements` | 1.11 | Query execution & performance monitoring | Configure in `postgresql.conf` |
| `vector` | 0.8.2 | pgvector embedding search for creator scout | Compile/install `postgresql-17-pgvector` |
| `supabase_vault` | 0.3.1 | Supabase internal secret vault | **Do NOT install** (internal to Supabase SaaS; unused by app tables) |

### 1.3 Constraints, Triggers & Security Policies
- **Row Level Security (RLS)**: **0 policies** found in `public` schema. RLS is inactive.
- **Triggers**: **0 custom triggers** found in `public` schema.
- **Views**: **0 views** (`total_views = 0`).
- **Sequences**: **19 native PostgreSQL sequences** (for the Tally accounting subsystem).
- **Exact Catalog Fingerprint (Verification Baseline)**:
  - **Tables**: `68`
  - **Columns**: `820`
  - **Indexes**: `239`
  - **Constraints Breakdown**:
    - `CHECK`: `445`
    - `PRIMARY KEY`: `67`
    - `UNIQUE`: `31`
    - `FOREIGN KEY`: `25`
  - **Total Database Bytes**: `824,159,379 bytes` (`786 MB`)

---

## 2. Table Inventory & Storage Sizing

Audited via `pg_class`, `pg_namespace`, and `pg_total_relation_size()` across the `public` schema:

| Table Name | Estimated / Exact Rows | Total On-Disk Size | Purpose |
| :--- | :--- | :--- | :--- |
| `EmailEvent` | ~72,358 | 349 MB | Sent, open, reply, click, bounce event telemetry |
| `Lead` | ~69,873 | 254 MB | Prospect records, contact details, status, counters |
| `EmailMessage` | ~86,301 | 71 MB | Inbound/outbound email message bodies & headers |
| `Creator` | ~6,798 | 69 MB | Creator profiles, metrics, tags, and handles |
| `Brand` | ~15,135 | 17 MB | Brand intelligence dossiers and indexed companies |
| `SuppressedEmail` | ~5,034 | 2,280 kB | Global email suppression / unsubscribe list |
| `tally_vouchers` | ~1,855 | 2,232 kB | Tally ERP accounting voucher sync |
| `CreatorCampaignEnrollment` | ~1,419 | 1,288 kB | Creator to campaign associations |
| `DraftGeneration` | ~345 | 872 kB | AI-generated cold outreach email drafts |
| `CampaignStep` | ~255 | 760 kB | Sequence steps, delays, subject & body templates |
| `Campaign` | 199 | 496 kB | Outreach campaigns & denormalized counters |
| `tally_payments` | ~700 | 472 kB | Payment transactions synced from Tally |
| `CampaignMailbox` | ~1,058 | 352 kB | Join table mapping mailboxes to campaigns |
| `Mailbox` | 18 | 344 kB | Sending email accounts (SMTP/OAuth) |
| `CreatorHarvestQueue` | ~250 | 240 kB | Resumable creator scout queue |
| `tally_receipts` | ~164 | 168 kB | Receipt transactions synced from Tally |
| `ReplyClassification` | ~63 | 160 kB | LLM-classified inbound replies & sentiment |
| `CreatorCampaign` | ~10 | 152 kB | Dedicated creator vertical campaigns |
| `Session` | ~65 | 120 kB | Active user web sessions |
| `AuditLog` | ~7 | 112 kB | System administrative audit trail |
| `User` | 12 | 80 kB | Team member and master user accounts |
| `Team` | 2 | 48 kB | Workspaces: `team_tbm_main`, `team_troops_outreach` |
| `UserTeam` | 12 | 48 kB | User to workspace mappings |
| `_prisma_migrations` | 1 | 32 kB | Prisma migration execution tracking |
| **All Other Models (20 tables)** | 0 | < 40 kB each | Evaluation, benchmarks, ledger maps, tokens |
| **TOTAL DATABASE** | **~262,000 rows** | **786 MB** | |

---

## 3. Workspace Data Inventory (TBM vs Troop)

The system manages two distinct business workspaces. The baseline inventory details row allocations:

### 3.1 Workspace Definitions
- **TheBoredMonkey (TBM)**:
  - Team ID: `team_tbm_main`
  - Domain filter: `NOT LIKE '%@tbmtroop%'`
  - Core Focus: B2B Cold Outreach & Agency Client Acquisition
- **Troop by TBM (Troop)**:
  - Team ID: `team_troops_outreach`
  - User ID pattern: `usr_troops_*` (`usr_troops_0c4c79fd`, `usr_troops_87e6f943`, `usr_troops_4d72a76b`)
  - Domain filter: `LIKE '%@tbmtroop%'`
  - Campaign name pattern: contains `'creator'`, `'influencer'`, `'reviewer'`, `'troops'`
  - Core Focus: Influencer marketing & creator seeding

### 3.2 Per-Workspace Baseline Counts

| Entity / Table | TheBoredMonkey (TBM) | Troop by TBM | Unassigned / Orphan | Total |
| :--- | :--- | :--- | :--- | :--- |
| **Users** (`User`) | 9 | 3 | 0 | 12 |
| **Teams** (`Team`) | 1 (`team_tbm_main`) | 1 (`team_troops_outreach`) | 0 | 2 |
| **Mailboxes** (`Mailbox`) | 14 (`@theboredmonkey.com`) | 4 (`@tbmtroop.com`) | 0 | 18 |
| **Campaigns** (`Campaign`) | 189 | 10 | 0 | 199 |
| **Leads** (`Lead`) | ~68,841 | ~1,032 | 0 | ~69,873 |
| **Email Events** (`EmailEvent`) | ~71,500 | ~858 | 0 | ~72,358 |
| **Email Messages** (`EmailMessage`)| ~85,100 | ~1,201 | 0 | ~86,301 |
| **Creators** (`Creator`) | 0 | 6,798 | 0 | 6,798 |
| **Brands Indexed** (`Brand`) | 15,135 | 0 | 0 | 15,135 |
| **Suppressed Emails** | 5,034 | 0 | 0 | 5,034 |

### 3.3 Contact Deduplication Baseline
- **Raw `Lead` records in database**: ~68,841 (TBM)
- **Unique Deduplicated Contacts** (`lower(trim(email))`): **46,701**
- **Cross-Campaign Duplicates**: ~22,140 leads exist across multiple campaigns.
- **Intra-Campaign Duplicates**: **0** (no lead appears twice within the same campaign).

### 3.4 Data Integrity & Orphan Baseline
- **Orphan Leads** (`Lead` without a valid `campaignId`): **0**
- **Orphan Events** (`EmailEvent` without a valid `leadId`): **0**
- **Unassigned Mailboxes** (`Mailbox` without a `userId`): **0**
- **Orphan Messages** (`EmailMessage` with sender not in `Mailbox`): **0**

**Finding for Verification Suite (Gate 2)**: All foreign key relationships are strictly intact. The above numbers represent the immutable verification baseline. Any deviation during `pg_restore` on the VPS staging database indicates migration drift.
