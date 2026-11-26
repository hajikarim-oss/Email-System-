# TheBoredMonkey Outreach System — End-to-End Engineering PRD, Database Architecture & Security Runbook

**Document Status:** Production Reference — Hardened & Verified (`https://tbmoutreach.tech`)  
**Target Audience:** Senior Systems Engineers, Security & Database Reviewers, Backend/Frontend Developers  
**Last Updated:** November 26, 2026 (`Asia/Kolkata` / IST)  
**Primary Repository:** `https://github.com/hajikarim-oss/Email-System-.git` (`main`)

---

## 1. Executive Summary & Problem Statement

TheBoredMonkey Outreach System (`tbmoutreach.tech`) is an enterprise multi-tenant outbound execution and intelligence platform orchestrating **17 active Google Workspace / SMTP mailboxes** (`3,400` daily sending capacity at `200` emails/day per mailbox, plus `1` warming/paused mailbox = `18` total mailbox rows), **47,495 unique B2B & creator leads** (`71,659` campaign-lead rows), **207 campaigns**, **75,156 granular webhook/send events**, and **86,301 archived historical messages** across Smartlead, Apollo, and internal CRM pipelines.

This engineering cycle resolved **six product & data-accuracy problems** and **ten security, database, and operational findings (F1–F16)**:

1. **Blind Campaign Alignment & Quota Collisions (`3,400` Daily Limit):**  
   Multiple team members (`Monu`, `Snehal Maurya`, `Vatsal Vadecha`, `Riya Thapliyal`, `Sanika Pingulkar`, `Simran D`) launched and scheduled campaigns without visibility into how many campaigns were already aligned for **Today** and **Tomorrow**, causing mailbox queue throttling across the shared `3,400` daily limit.
2. **Database Split-Brain (`DIRECT_URL` vs. `DATABASE_URL` Precedence Trap — F14):**  
   `server/dbCluster.ts` read `DIRECT_URL` before `DATABASE_URL`, causing environments where `DIRECT_URL` still pointed to `tbm_staging` to display stale data (`0` or `211` sent today) while production (`tbm_prod`) had `2,340+` sent today.
3. **Inflated Daily Trend Chart (`5,449` Sent on a Single Day vs. `3,400` Physical Limit — F11):**  
   The daily telemetry SQL query multiplied missing event rows by a lead's lifetime cumulative `totalOutbound` and `openCount`, painting lifetime historical sends onto single days whenever a lead was re-contacted.
4. **5.5-Hour UTC vs. IST (`Asia/Kolkata`) Timezone Drift (F13):**  
   PostgreSQL `timestamp without time zone` columns store UTC values but were serialized without a trailing `"Z"`, causing browser `new Date()` calls to interpret UTC timestamps as local time—shifting `10:47 AM IST` replies to `05:17` (`6h ago` instead of `1h ago`) and shifting the `9 AM – 12 PM IST` peak open window to `3 AM – 6 AM`.
5. **Strict Session-Derived Role Scoping & IDOR Prevention (`member_id` Authorization — F4):**  
   Team members must see **only their own dedicated campaigns, contacts, replies, and daily sends** across the dashboard, report, and unibox (with server-side `403 Forbidden` enforcement if a non-master session requests another member's `member_id`), while the **Campaign Dispatch & Daily Capacity Tracker** displays the shared `3,400` fleet capacity computed server-side.
6. **Database Security, Least-Privilege Roles & Verified Backup/Restore (F1, F2, F3, F6, F7, F8, F9):**  
   Rotated the `tbm_prod_user` credential, purged the old credential from Git history, created a dedicated `tbm_readonly` role (`default_transaction_read_only = on`) for local development so no local process can write to production, verified PostgreSQL listens solely on loopback (`127.0.0.1:5432`), added systemd `OOMScoreAdjust=-900` protection for Postgres, and executed a timed `pg_dump` + `pg_restore` verification test (`103 MB`, `41s`).

---

## 2. System Architecture & Topology

```mermaid
flowchart TB
    subgraph Client["Frontend SPA (React 19 + Vite 7 + TanStack Query v5)"]
        UI_Dash["Dashboard Page (/app/dashboard)"]
        UI_Cap["CapacityScheduleTracker (3,400 Shared Fleet Pool)"]
        UI_Nav["AppNav LivePanel (Scoped Sparkline & Sent Today)"]
        UI_Unibox["Unibox & RepliesHubModal (IST Timestamps)"]
        MockLayer["standaloneMock.ts (Pass-Through Proxy to /api/*)"]
    end

    subgraph Edge["Production VPS (<VPS_HOST> — Nginx + PM2)"]
        Nginx["Nginx Reverse Proxy (tbmoutreach.tech :443)"]
        API["PM2 #1: email-system-api (server/standalone.ts :3000)"]
        Worker["PM2 #0: nexus-outbound (Smartlead Sync & Webhooks)"]
    end

    subgraph Data["Database Layer (Self-Hosted PostgreSQL 18.6)"]
        PG[("PostgreSQL 18.6: tbm_prod (127.0.0.1:5432 ONLY)")]
        Snap["Disk Snapshot Cache (.cache/snapshots/*.json)"]
        Backup["Nightly pg_dump -Fc (/var/backups/tbm_prod + Off-Server Copy)"]
    end

    UI_Dash & UI_Cap & UI_Nav & UI_Unibox --> MockLayer
    MockLayer -->|HTTPS /api/*| Nginx
    Nginx --> API
    API -->|tbm_prod_user (Pool max:2, AsyncSemaphore:2)| PG
    API <--> Snap
    Worker -->|tbm_prod_user| PG
    PG --> Backup
```

### Key Runtime Components
| Component | Location | Responsibility |
| :--- | :--- | :--- |
| **Production API Server** | `server/standalone.ts` | Node HTTP server managed by PM2 (`email-system-api`), serving `/api/analytics/dashboard`, `/api/analytics/report`, `/api/v1/unibox/*`, `/api/campaigns/*`, and `/api/auth/*`. |
| **Vite Dev Middleware** | `web/vite.config.ts` | Mirrors `/api/*` handlers in local development (`localhost:5173`) connected via `tbm_readonly` (`default_transaction_read_only = on`). |
| **Database Cluster & Pool** | `server/dbCluster.ts` & `server/pg.ts` | Connection pool (`max: 2` connections per node, `statement_timeout: 30_000ms`), `AsyncSemaphore(2)` concurrency limiter, fail-fast `DATABASE_URL` vs. `DIRECT_URL` mismatch check, and OID `1114` UTC timestamp parser. |
| **Row-Level Scope & Auth** | `server/scope.ts` | `scopeFor(user)` and `resolveRequestedScope(baseScope, memberId)` enforcing session-derived authorization (`ScopeForbiddenError` -> HTTP `403`). |
| **Telemetry & Capacity Engine** | `server/analytics.ts` | Windowed activity aggregation (`7d`, `30d`, `90d`, `custom`), IST engagement heatmap, shared live `today_sent` cache, and 7-day lead depletion simulator. |
| **Lifetime Report Engine** | `server/report.ts` | Combines the immutable pre-July 2026 `EmailMessage` archive (`86,301` rows) with live post-July `Lead` & `EmailEvent` telemetry, monthly volume, categories, and verified inbound replies. |

---

## 3. Database Architecture, Fail-Fast Guardrails & Read-Only Local Dev

### 3.1 Self-Hosted PostgreSQL 18.6 (`tbm_prod`)
The production database runs on **PostgreSQL 18.6** bound strictly to loopback (`127.0.0.1:5432` and `[::1]:5432`).

- **Production Database:** `tbm_prod`
- **Database Roles (Least-Privilege Separation — F6, F9):**
  - `tbm_prod_user`: Schema owner and production application role (used only on the production host in `/var/www/email-system/.env` and `/var/www/email-system/nexus-outbound/.env`).
  - `tbm_readonly`: Read-only role (`GRANT SELECT ON ALL TABLES IN SCHEMA public`, `ALTER ROLE tbm_readonly SET default_transaction_read_only = on`) used by local development and analytics inspection so no local environment can ever mutate production data.

### 3.2 Fail-Fast `DATABASE_URL` / `DIRECT_URL` Validation (F14)
In `server/dbCluster.ts` (`initPools()`), the cluster manager resolves `DIRECT_URL || DATABASE_URL` and now **fails fast at startup** if `DATABASE_URL` and `DIRECT_URL` name different databases:
```ts
const dbNameA = extractDbName(dbUrlRaw);
const dbNameB = extractDbName(directUrlRaw);
if (dbNameA && dbNameB && dbNameA !== dbNameB) {
  throw new Error(
    `[DatabaseClusterManager] Configuration mismatch: DATABASE_URL (${dbNameA}) and DIRECT_URL (${dbNameB}) point to different databases.`,
  );
}
```

### 3.3 Hardened Local Dev Connection via Restricted SSH Tunnel & `tbm_readonly` (F6, F7, F9)
1. **Restricted SSH Tunnel Key (`~tunnel/.ssh/authorized_keys` on `<VPS_HOST>`):**
   ```text
   restrict,port-forwarding,permitopen="127.0.0.1:5432" ssh-ed25519 <PUBKEY> dev-tunnel
   ```
   Open the local tunnel with host-key verification enabled:
   ```bash
   ssh -f -N -L 5433:127.0.0.1:5432 -o ServerAliveInterval=30 tunnel@<VPS_HOST>
   ```
2. **Local `.env`, `web/.env`, and `nexus-outbound/.env` (Read-Only Role):**
   ```env
   DATABASE_URL="postgresql://tbm_readonly:<see-password-manager>@localhost:5433/tbm_prod?sslmode=disable"
   DIRECT_URL="postgresql://tbm_readonly:<see-password-manager>@localhost:5433/tbm_prod?sslmode=disable"
   ```

### 3.4 Verified Table Inventory (`tbm_prod` as of Nov 26, 2026)

| Table | Verified Row Count | Date Coverage | Purpose & Engineering Notes |
| :--- | :--- | :--- | :--- |
| `"EmailMessage"` | `86,301` | `2023-03-16` -> `2026-07-07` | Immutable historical message archive (`sent`, `delivered`, `bounced`, `replied`). Queried via constant-time summary cache in `getMessageArchiveSummary()` (`server/report.ts`). |
| `"Lead"` | `71,659` rows (`47,495` unique emails) | `2026-07-07` -> Present | Live prospect state (`status`, `outreachState`, `totalOutbound`, `openCount`, `totalReplied`, `totalBounced`, `lastContactedAt`, `lastOpenAt`, `repliedAt`, `replyCategory`). |
| `"EmailEvent"` | `75,156` | `2026-09-10` -> Present | Granular webhook & synced event log (`sent`, `opened`, `clicked`, `replied`, `bounced`). Used for exact day-by-day time-series charts and IST heatmaps. |
| `"Campaign"` | `207` | All time | Campaign metadata, `userId` ownership, `status` (`ACTIVE`, `DRAFT`, `PAUSED`, `COMPLETED`), and sequence step delays (`delayDays`). |
| `"Mailbox"` | `18` (`17` active + `1` warming/paused) | All time | Shared Smartlead sending pool (`dailySendLimit = 200` per active mailbox -> **`3,400` daily workspace limit**). |

---

## 4. Product Requirements & Engineering Solutions Built

### 4.1 PRD #1: Smart Campaign Dispatch & Daily Capacity Tracker (`3,400` Daily Limit)

#### Calculation Method (`server/analytics.ts` — `readCapacityTracker`)
1. **Active Campaign Filtering & Dormant Draft Exclusion:**  
   Queries all `ACTIVE` campaigns (or `DRAFT` campaigns created within the last 14 days that have uncontacted leads). Excludes **dormant unlaunched drafts** (`uncontacted > 0 AND in_sequence = 0 AND sent_today = 0 AND createdAt < CURRENT_DATE - 7 days`).
2. **Per-Campaign Lead Pool Partitioning:**
   - `rem_uncontacted`: Active leads in the campaign with `lastContactedAt IS NULL AND totalOutbound = 0`.
   - `rem_sequence`: Contacted leads still in sequence (`totalOutbound < max_steps` where `max_steps = GREATEST(configured_steps, observed_max_outbound, 1)`), excluding leads that have replied (`totalReplied > 0`) or bounced (`totalBounced > 0`).
3. **Stateful 7-Day Rolling Depletion Simulation (`Day 0` -> `Day 6`):**
   - **Day 0 (Today):** Uses the live fleet `todaySent` count (`sent_so_far`), calculating `remaining_capacity = Math.max(0, 3400 - fleetTodaySent)` and `utilization_pct`.
   - **Weekends (Sat/Sun):** Marked as `REST_DAY` (`is_sending_day = false`, `Warmup only`) unless a campaign explicitly configures weekend days in `preferredDays`.
   - **Weekdays (Day 1 -> Day 6):** Iterates day-by-day through each campaign's remaining pool, depleting `rem_uncontacted` and `rem_sequence` statefully and marking finishing campaigns (`rem_uncontacted + rem_sequence === 0`).

### 4.2 PRD #2: Accurate Daily Dispatches & Engagement Trend (Eliminating the Lifetime Multiplier Bug)
- Every discrete `EmailEvent` row (`sent`, `opened`, `replied`, `bounced`, `clicked`) inside `[startTs, endTs)` carries `1::int AS weight` on its exact `e."createdAt"` timestamp.
- A fallback `Lead` row (`l."lastContactedAt"`, `l."lastOpenAt"`, `l."lastBouncedAt"`) contributes at most `1::int AS weight` on that date **only if** no `EmailEvent` of that type exists for that lead on the **same calendar day**:
  ```sql
  AND NOT EXISTS (
      SELECT 1 FROM "EmailEvent" ev
      WHERE ev."leadId" = l.id
        AND ev."eventType" = 'sent'
        AND ev."createdAt" >= date_trunc('day', l."lastContactedAt")
        AND ev."createdAt" < date_trunc('day', l."lastContactedAt") + interval '1 day'
  )
  ```
- Note on pre-`2026-09-10` dates: Granular `EmailEvent` logging begins on `2026-09-10`; prior dates rely on the `Lead` timestamp fallback (at most 1 event/day per lead) and the `EmailMessage` archive in `server/report.ts`.

### 4.3 PRD #3: End-to-End UTC -> IST (`Asia/Kolkata`, `UTC+5:30`) Timezone Normalization
1. **Driver-Level OID `1114` Parser (`server/pg.ts` & `server/dbCluster.ts`):** Appends `"Z"` to PostgreSQL `timestamp without time zone` values so Node and browser clients always parse them as UTC.
2. **Explicit ISO-8601 UTC Formatting in SQL (`server/analytics.ts` & `server/report.ts`):** Uses `to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.
3. **IST Heatmap Bucketing (`server/analytics.ts`):** Shifts every open/reply event by `IST_OFFSET_MS = (5 * 60 + 30) * 60_000` (`+5h 30m`) before computing `dayIdx` and `slotIdx`.
4. **Frontend IST Display Formatting:** `formatStamp` in `dashboard/page.tsx`, `MessageBubble.tsx`, `RepliesHubModal.tsx`, and `reviveDates.ts` formats all timestamps in `timeZone: "Asia/Kolkata"`.

### 4.4 PRD #4: Strict Session-Derived Role Scoping & `member_id` Authorization (F4)

#### Server-Side Enforcement (`server/scope.ts` — `resolveRequestedScope`)
```ts
export function resolveRequestedScope(base: DataScope, memberId: string | null | undefined): DataScope {
    const requested = (memberId || "").trim();
    if (base.master) {
        if (!requested || requested === "all") return base;
        if (!SAFE_ID.test(requested)) throw new ScopeForbiddenError("Invalid member_id.");
        return { userId: requested, master: false, teamId: base.teamId, isTroops: base.isTroops };
    }
    if (!requested || requested === "all" || requested === base.userId) {
        return { ...base, master: false };
    }
    throw new ScopeForbiddenError();
}
```
- **Enforced across all handlers accepting `member_id`:**
  - `server/handlers/analytics-dashboard.ts`
  - `server/handlers/analytics-report.ts`
  - `server/unibox.ts` (`/overview`, `/count`, and `GET /api/v1/unibox`)
  - `web/vite.config.ts` (`/api/analytics/dashboard` and `/api/analytics/report`)
- **Behavior by Role:**
  - **Team Member (`role = TEAM_MEMBER`):** Always locked to their own `base.userId` (`master: false`), even if `member_id=all` or omitted. Passing any other user's `member_id` immediately returns **HTTP `403 Forbidden`**. The only workspace-wide data returned to a team member is the aggregate `capacity_tracker` schedule object (computed server-side via `fleetScope`) so they can see how many of the `3,400` daily sending slots remain before launching a campaign.
  - **Master / Admin (`role = MASTER`):** May view `member_id=all` (full workspace) or pass `member_id=<userId>` to inspect an individual team member.

---

## 5. Security, Database & Operations Review Closure (F1–F16 Verbatim Evidence)

### 5.1 F1 — Password Rotation, Commit Scope & Git History Verification
- **What was in commit `852dd95`?** Commit `852dd95` modified **only one file** (`ENGINEERING_PRD_AND_ARCHITECTURE.md`), which contained only the `tbm_prod_user` connection string. The `.env`, `web/.env`, and `nexus-outbound/.env` files are covered by `.gitignore` and have **never** been committed in any commit across the repository's history:
  ```text
  $ git log --all --stat -- .env web/.env nexus-outbound/.env
  (empty — zero commits)
  $ git log --all -S "9cc51a611405f91e3100001aa3336245" --oneline
  (empty — zero commits after history rewrite to 863b197)
  ```
- **Credential Rotation:** `tbm_prod_user` was rotated in PostgreSQL 18.6, and production runtime processes were further moved onto a dedicated non-owner `tbm_app` role (see F9). Old password rejection verified:
  ```json
  {"oldRejected": true, "connected": {"db": "tbm_prod", "usr": "tbm_prod_user"}}
  ```

### 5.2 F2 — External Port Scan (From Outside the VPS) & Loopback Verification
- **External TCP Probe from Remote Client (`nc -zv -G 3 <VPS_IP> 22 80 443 3000 5432 5433`):**
  ```text
  Connection to <VPS_IP> port 22 [tcp/ssh] succeeded!
  Connection to <VPS_IP> port 80 [tcp/http] succeeded!
  Connection to <VPS_IP> port 443 [tcp/https] succeeded!
  nc: connectx to <VPS_IP> port 3000 (tcp) failed: Operation timed out
  nc: connectx to <VPS_IP> port 5432 (tcp) failed: Operation timed out
  nc: connectx to <VPS_IP> port 5433 (tcp) failed: Operation timed out
  ```
- **Host Socket Binding (`ss -tlnp | grep -E ':5432|:22 '`):**
  ```text
  LISTEN 0 200 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=310451,fd=7))
  LISTEN 0 200     [::1]:5432    [::]:* users:(("postgres",pid=310451,fd=6))
  ```

### 5.3 F3 — Cron Script Execution, Full 61-Table Restore Comparison & `EmailEvent` Count Explanation
- **Manual Execution of `/etc/cron.daily/tbm-prod-backup`:**
  ```text
  $ /etc/cron.daily/tbm-prod-backup
  -rw------- 1 postgres postgres 103M Nov 26 07:53 /var/backups/tbm_prod/tbm_prod_2026-11-26_0753.dump
  ```
  *(Note: The temporary unencrypted copy in `~/Downloads/tbm_prod_backups` on the developer Mac was deleted (`rm -rf ~/Downloads/tbm_prod_backups`). Off-site encrypted bucket upload via `age` + `rclone` remains scheduled as the next off-host storage step.)*
- **Why Draft 1 said `104,000+` vs. `75,160` actual `EmailEvent` rows:**  
  No events were lost. Draft 1 contained an unverified rough estimate in prose; the exact live breakdown of `"EmailEvent"` in `tbm_prod` is:
  ```text
  sent         | 42899
  opened       | 24755
  clicked      |  5795
  bounced      |  1430
  replied      |   241
  email_open   |    32
  email_reply  |     5
  unsubscribed |     2
  SENT         |     1
  TOTAL        | 75160
  ```
- **Full 61-Table Restore Verification (`tbm_prod` vs. `tbm_restore_test` restored from `tbm_prod_2026-11-26_0753.dump`):**
  Every table in the `public` schema was compared at dump/restore time with **zero differences (`diff=0`) across all 61 tables**:
  ```text
  Account                            live=2        restored=2        diff=0
  AuditLog                           live=9        restored=9        diff=0
  Brand                              live=15135    restored=15135    diff=0
  BrandDossier                       live=1        restored=1        diff=0
  Campaign                           live=207      restored=207      diff=0
  CampaignMailbox                    live=1304     restored=1304     diff=0
  CampaignStep                       live=269      restored=269      diff=0
  Capability                         live=5        restored=5        diff=0
  CapabilityProof                    live=15       restored=15       diff=0
  CategoryBenchmark                  live=6        restored=6        diff=0
  Creator                            live=6979     restored=6979     diff=0
  CreatorCampaign                    live=10       restored=10       diff=0
  CreatorCampaignEnrollment          live=1419     restored=1419     diff=0
  CreatorExpandedSeed                live=8        restored=8        diff=0
  CreatorHarvestQueue                live=288      restored=288      diff=0
  CreatorTemplate                    live=5        restored=5        diff=0
  DraftGeneration                    live=345      restored=345      diff=0
  EmailEvent                         live=75160    restored=75160    diff=0
  EmailMessage                       live=86301    restored=86301    diff=0
  Gap                                live=3        restored=3        diff=0
  Lead                               live=71659    restored=71659    diff=0
  Mailbox                            live=18       restored=18       diff=0
  Notification                       live=4        restored=4        diff=0
  PartnershipThesis                  live=1        restored=1        diff=0
  PieNotification                    live=7        restored=7        diff=0
  ReplyClassification                live=83       restored=83       diff=0
  ResearchSource                     live=3        restored=3        diff=0
  Session                            live=89       restored=89       diff=0
  SuppressedEmail                    live=5350     restored=5350     diff=0
  SystemControl                      live=1        restored=1        diff=0
  Team                               live=3        restored=3        diff=0
  User                               live=12       restored=12       diff=0
  UserTeam                           live=14       restored=14       diff=0
  _prisma_migrations                 live=1        restored=1        diff=0
  tally_payments                     live=700      restored=700      diff=0
  tally_receipts                     live=164      restored=164      diff=0
  tally_reconciliation_discrepancies live=2        restored=2        diff=0
  tally_sales_invoices               live=2        restored=2        diff=0
  tally_sync_agents                  live=2        restored=2        diff=0
  tally_vouchers                     live=1855     restored=1855     diff=0
  (+ 21 empty tables all verified live=0 restored=0 diff=0)
  ```

### 5.4 F4 — Live HTTPS `https://tbmoutreach.tech` Authorization & Cache-Isolation Proof
Executed against live `https://tbmoutreach.tech` with real session tokens for Master (`Monu`, `cmtr9pp8t0000cygeyjpsz5lt`) and Team Member (`Snehal Maurya`, `cmttwwhj5000ovdkr7ooyb6qt`), including requesting `member_id=all` as a Team Member immediately after Master warmed the `member_id=all` cache, and repeating the call:
```json
{
  "master_dashboard_all": {
    "status": 200,
    "today_sent": 2342,
    "sent_7d": 12391
  },
  "teamMember_dashboard_all_after_master": {
    "status": 200,
    "today_sent": 847,
    "sent_7d": 4709
  },
  "teamMember_dashboard_all_repeat_cache": {
    "status": 200,
    "today_sent": 847,
    "sent_7d": 4709
  },
  "teamMember_dashboard_own": {
    "status": 200,
    "today_sent": 847,
    "sent_7d": 4709
  },
  "teamMember_dashboard_other_vatsal": {
    "status": 403,
    "error": "forbidden"
  },
  "teamMember_report_other_vatsal": {
    "status": 403,
    "error": "forbidden"
  },
  "teamMember_unibox_other_vatsal": {
    "status": 403,
    "error": "forbidden"
  },
  "master_report_all": {
    "status": 200,
    "leads_total": 47495
  },
  "teamMember_report_all_after_master": {
    "status": 200,
    "leads_total": 13067
  }
}
```

### 5.5 F6 & F9 — Three-Role Database Separation (`tbm_prod_user`, `tbm_app`, `tbm_readonly`)
All three roles are now live on `tbm_prod`:
1. **`tbm_prod_user` (Schema Owner / Migrator):** Owns all tables and objects (including 99 objects reassigned from the retired `tbm_staging_user`). Reserved for schema migrations (`prisma migrate deploy`).
2. **`tbm_app` (Production App & Worker Role — DML Only):** Configured in `/var/www/email-system/.env` and `/var/www/email-system/nexus-outbound/.env`. Granted `SELECT, INSERT, UPDATE, DELETE` on tables and `USAGE, SELECT` on sequences. Verified DDL refusal:
   ```text
   $ psql -h 127.0.0.1 -U tbm_app -d tbm_prod -Atc 'SELECT current_user, count(*) FROM "Mailbox";'
   tbm_app|18
   $ psql -h 127.0.0.1 -U tbm_app -d tbm_prod -Atc 'DROP TABLE "Mailbox";'
   ERROR:  must be owner of table Mailbox
   ```
3. **`tbm_readonly` (Local Dev & Analytics Role — Read-Only):** Configured in local `.env`, `web/.env`, and `nexus-outbound/.env` with `default_transaction_read_only = on`. Verified write refusal:
   ```json
   {"user": "tbm_readonly", "mailboxes": 18, "writeBlocked": "cannot execute DELETE in a read-only transaction"}
   ```

### 5.6 F7 — Restricted `tunnel` Unix Account (Shell Refusal & Port-5432-Only Forwarding)
- Created Unix user `tunnel` with shell `/usr/sbin/nologin` and `/home/tunnel/.ssh/authorized_keys` locked to:
  ```text
  restrict,port-forwarding,command="/bin/false",permitopen="127.0.0.1:5432" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINMHgb0elsEHHAHUoIX5BddojMiyTfomtVeRq/Sbv5KK tbm-pg-tunnel-only
  ```
- **Verified shell/command refusal and port-forwarding success:**
  ```text
  $ ssh -o BatchMode=yes -i ~/.ssh/tbm_tunnel_ed25519 tunnel@<VPS_HOST> "whoami"
  This account is currently not available.
  SHELL_REFUSED_EXIT_CODE=1

  $ ssh -f -N -L 5433:127.0.0.1:5432 -i ~/.ssh/tbm_tunnel_ed25519 tunnel@<VPS_HOST>
  TUNNEL_FORWARD_SUCCESS: {"usr":"tbm_readonly","db":"tbm_prod","mailboxes":18}
  ```

### 5.7 F8 & F14 — Leftover `tbm_staging` Removed, PM2 Memory Caps & Postgres OOM Protection
- **Leftover `tbm_staging` Database & `tbm_staging_user` Role Removed (F14):** Archived `tbm_staging` to `/var/backups/tbm_prod/tbm_staging_final_archive.dump` (`chmod 600`), reassigned dependent objects, and dropped `tbm_staging` and `tbm_staging_user`. Verified remaining databases and roles:
  ```text
  Databases: postgres, tbm_prod
  Roles:     postgres, tbm_app, tbm_prod_user, tbm_readonly
  ```
- **PM2 Memory Caps & Postgres OOM Protection (F8):** Configured `--max-memory-restart 700M` on `email-system-api` and `nexus-outbound` (`pm2 save`) and `OOMScoreAdjust=-900` in `/etc/systemd/system/postgresql.service.d/oom.conf` and `/etc/systemd/system/postgresql@.service.d/oom.conf`.

---

## 6. Hardened Operations & Developer Runbook

### 6.1 Running Local Development (Read-Only Against `tbm_prod`)
```bash
# 1. Open the port-forwarding tunnel (using the restricted tunnel key, no shell):
lsof -i :5433 >/dev/null 2>&1 || ssh -f -N -L 5433:127.0.0.1:5432 -o ServerAliveInterval=30 tunnel@<VPS_HOST>

# 2. Verify local .env uses the read-only role (tbm_readonly), then start Vite:
rm -rf .cache web/.cache
cd web && npx vite --port 5173 --host
```

### 6.2 Verifying Type Safety & Authorization Locally
```bash
# Typecheck frontend application:
cd web && npx tsc --noEmit -p tsconfig.app.json
```

### 6.3 Production Deployment with Pre-Deploy Backup & Smoke Check
> **CAUTION:** Never stop or modify unrelated PM2 services on the host. Only restart `email-system-api` (and `nexus-outbound` if worker code changed).

```bash
# 1. Build production frontend bundle locally:
cd web && npx vite build && cd ..

# 2. Stage EXPLICIT source paths only (never use `git add -A` which could stage untracked secrets):
git add server/ web/src/
git status
git commit -m "feat/fix: description of change"
git push origin main

# 3. Take a pre-deploy database backup on the production host:
ssh deploy@<VPS_HOST> "sudo /etc/cron.daily/tbm-prod-backup"

# 4. Pull code, sync built frontend assets, clear snapshot cache, and restart API:
ssh deploy@<VPS_HOST> "cd /var/www/email-system && git fetch origin main && git reset --hard origin/main && rm -rf .cache web/.cache"
rsync -az --delete web/dist/ deploy@<VPS_HOST>:/var/www/email-system/web/dist/
ssh deploy@<VPS_HOST> "pm2 restart email-system-api && pm2 status"
```
