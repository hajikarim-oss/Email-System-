-- ============================================================================
-- TBM PIE Layer 7 — REPLY CLASSIFICATION (learning-loop store) — ADDITIVE UP
-- Target: Replica 3 (adlwwkqgexykuhkdkpfu) ONLY. Primary is NOT touched.
-- Builds on: 20261112_pie_v1_up.sql (DraftGeneration.gapId/thesisId exist there).
-- Safety: additive CREATE TABLE IF NOT EXISTS only. Touches no existing rows.
--         Reversible via 20261113_reply_llm_down.sql.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- Durable record of every classified inbound reply. Feeds the L7 learning loop:
-- join leadId -> DraftGeneration (gapId/thesisId/subject) to learn which gaps and
-- subject lines earn which outcomes per category. Evidence, not a gated claim.
CREATE TABLE IF NOT EXISTS "ReplyClassification" (
  "id"               TEXT PRIMARY KEY,
  "leadId"           TEXT,
  "leadEmail"        TEXT,
  "campaignId"       TEXT,
  "sequenceStep"     INTEGER,
  "subject"          TEXT,
  "replyText"        TEXT,                       -- trimmed latest reply segment
  "auditLabel"       TEXT NOT NULL,              -- positive|neutral|negative|OOO|auto_reply|unsubscribe|hostile|other
  "dbClassification" TEXT NOT NULL,              -- INTERESTED|NOT_NOW|WRONG_PERSON|OOO|AUTO_RESPONDER|UNSUBSCRIBE|NONE
  "objectionType"    TEXT,                       -- PRICE|TIMING|AUTHORITY|FIT|TRUST|NONE
  "method"           TEXT NOT NULL DEFAULT 'DETERMINISTIC', -- DETERMINISTIC|LLM
  "confidence"       DOUBLE PRECISION,           -- 0..1
  "llmModel"         TEXT,
  "reason"           TEXT,
  "rawModelOutput"   JSONB,
  "repliedEventId"   TEXT,
  "reviewed"         BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ReplyClassification_leadId_idx"   ON "ReplyClassification" ("leadId");
CREATE INDEX IF NOT EXISTS "ReplyClassification_dbClass_idx"  ON "ReplyClassification" ("dbClassification");
CREATE INDEX IF NOT EXISTS "ReplyClassification_created_idx"  ON "ReplyClassification" ("createdAt");
CREATE INDEX IF NOT EXISTS "ReplyClassification_campaign_idx" ON "ReplyClassification" ("campaignId");
