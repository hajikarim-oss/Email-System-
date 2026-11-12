# Primary & Replica Live Rollback Runbook (`ROLLBACK_RUNBOOK.md`)

**Date Tested**: 2026-11-11  
**Rehearsed On**: Replica 3 (`adlwwkqgexykuhkdkpfu` — Singapore)  
**Migration Files**:
- Up: [`migrations/20261111_brain_v1_up.sql`](../../migrations/20261111_brain_v1_up.sql)
- Down: [`migrations/20261111_brain_v1_down.sql`](../../migrations/20261111_brain_v1_down.sql)

---

## 1. Rehearsal Timings & Verification (Replica 3)

| Step | Action | Measured Latency | Table Count | `Lead` Row Count | Status |
| :--- | :--- | ---: | ---: | ---: | :--- |
| **Pass 1 (`up.sql`)** | Create 10 Brain tables + 5 nullable columns + indexes | `4,692 ms` | `46 → 56` | `51,522` | PASS |
| **Pass 2 (`down.sql`)** | Drop 10 Brain tables + drop 5 additive columns | `451 ms` | `56 → 46` | `51,522` | PASS (Zero data loss) |
| **Pass 3 (`up.sql`)** | Re-apply additive migration | `422 ms` | `46 → 56` | `51,522` | PASS |
| **Primary Isolation Check** | Verify Primary (`hsmudwkfwmvinhtggxyd`) untouched | — | `46` | `51,522` | PASS (0 changes on Primary) |

---

## 2. Why This Migration Is Non-Blocking on Live Production

1. **Metadata-Only `ADD COLUMN`**:
   - In PostgreSQL 11+, `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "designation" TEXT;` (nullable, no volatile default) is a pure catalog metadata update that executes in `<10 ms` without rewriting table pages.
2. **Strict Lock & Statement Timeouts**:
   - Both `up.sql` and `down.sql` begin with:
     ```sql
     SET lock_timeout = '3s';
     SET statement_timeout = '30s';
     ```
   - If a long-running query holds a conflicting lock on `"Lead"` or `"Brand"` for more than 3 seconds, the migration aborts cleanly rather than queuing behind the lock and blocking incoming webhook/API traffic.

---

## 3. Live Rollback Procedure (If Primary Encounters Any Issue in Sprint 5)

### Tier 1 — Application & Sending Halt (< 15 Seconds, Zero DB DDL)
If the Brain pipeline misbehaves after enabling on Primary:
1. Flip environment variable `BRAIN_PIPELINE_ENABLED=false` and `BRAIN_AUTOSEND_ENABLED=false`.
2. Trip the global kill switch:
   ```bash
   curl -X POST http://localhost:3000/api/admin/kill-switch \
     -H "Content-Type: application/json" \
     -d '{"on": true, "reason": "Emergency rollback"}'
   ```
   This sets `SystemControl.killSwitch = true` and pauses active Smartlead campaigns in `<60s`.

### Tier 2 — Schema Rollback on Primary (< 1 Second)
If the additive schema itself must be removed while Primary is live:
1. Run `down.sql` directly against `DIRECT_URL` (port `5432`, bypassing PgBouncer transaction pooler):
   ```bash
   node -e '
   const fs = require("fs"), { Pool } = require("pg");
   const u = new URL(process.env.DIRECT_URL); u.searchParams.delete("sslmode");
   const p = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
   p.query(fs.readFileSync("migrations/20261111_brain_v1_down.sql", "utf8"))
     .then(() => { console.log("Rollback complete"); p.end(); });
   '
   ```
2. Verify table count returns to `46` and existing `Lead`, `Brand`, `Campaign`, `EmailEvent`, `EmailMessage`, `Creator*`, and `tally_*` tables remain 100% intact.

