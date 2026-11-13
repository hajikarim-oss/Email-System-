-- ============================================================================
-- TBM PIE Layer 7 — PIE NOTIFICATION / ESCALATION STORE — ADDITIVE UP
-- Target: Replica 3 ONLY. Primary / the app Notification table are NOT touched.
-- The conversation agent writes here when it hands a thread to a human (meeting
-- request, pricing/legal, low confidence, hostile, max auto-replies). A one-line
-- bridge (INSERT into the app's "Notification" table) surfaces these in the UI bell
-- at go-live; kept isolated on Replica 3 for build/test.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "PieNotification" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT,
  "leadId"         TEXT,
  "leadEmail"      TEXT,
  "campaignId"     TEXT,
  "category"       TEXT NOT NULL,              -- MEETING_REQUEST | HUMAN_HANDOFF | PRICING | LEGAL | HOSTILE | UNSUBSCRIBE | LOW_CONFIDENCE
  "priority"       TEXT NOT NULL DEFAULT 'NORMAL', -- HIGH | NORMAL
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "reason"         TEXT,
  "conversationId" TEXT,
  "turnNumber"     INTEGER,
  "status"         TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | ACK | RESOLVED
  "read"           BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PieNotification_status_idx"  ON "PieNotification" ("status");
CREATE INDEX IF NOT EXISTS "PieNotification_lead_idx"    ON "PieNotification" ("leadId");
CREATE INDEX IF NOT EXISTS "PieNotification_created_idx" ON "PieNotification" ("createdAt");
