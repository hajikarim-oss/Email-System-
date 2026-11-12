-- ============================================================================
-- TBM AI OUTREACH BRAIN v1 — ADDITIVE UP MIGRATION
-- Target: Replica 3 (adlwwkqgexykuhkdkpfu) for Dev/Testing, then Primary in Sprint 5
-- Safety: Non-blocking metadata-only ADD COLUMN + IF NOT EXISTS table creation
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- 1. Additive nullable columns on existing "Lead" table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "designationRaw" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "categoryKey" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_categoryKey_designation_idx" ON "Lead" ("categoryKey", "designation");
CREATE INDEX IF NOT EXISTS "Lead_brandId_idx" ON "Lead" ("brandId");

-- 2. Additive nullable columns on existing "Brand" table
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "tier" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "categoryKey" TEXT;

CREATE INDEX IF NOT EXISTS "Brand_categoryKey_tier_idx" ON "Brand" ("categoryKey", "tier");

-- 3. DraftGeneration (with DQ-02 reply attachment columns repliedEventId & replyClassification)
CREATE TABLE IF NOT EXISTS "DraftGeneration" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "leadId"              TEXT NOT NULL,
  "emailMessageId"      TEXT UNIQUE,
  "repliedEventId"      TEXT,
  "replyClassification" TEXT,
  "campaignId"          TEXT,
  "leadEmail"           TEXT,
  "sequenceStep"        INTEGER NOT NULL DEFAULT 1,

  "playbookId"          TEXT,
  "experimentVariant"   TEXT,
  "angleKey"            TEXT,
  "primaryProofId"      TEXT,
  "followupProofIds"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "categoryKey"         TEXT,
  "designation"         TEXT,

  "briefJson"           JSONB,
  "hookSignalId"        TEXT,

  "plannerModel"        TEXT,
  "writerModel"         TEXT,
  "subject"             TEXT NOT NULL,
  "body"                TEXT NOT NULL,
  "followups"           JSONB,
  "finalSubject"        TEXT,
  "finalBody"           TEXT,
  "humanEdited"         BOOLEAN NOT NULL DEFAULT false,
  "editDistance"        DOUBLE PRECISION,

  "hardViolations"      JSONB,
  "softViolations"      JSONB,
  "validatorPass"       BOOLEAN NOT NULL DEFAULT false,
  "riskScore"           INTEGER,
  "riskBand"            TEXT,
  "riskReasons"         JSONB,
  "routing"             TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'DRAFTED',

  "promptVersionIds"    JSONB,
  "tokensIn"            INTEGER,
  "tokensOut"           INTEGER,
  "costUsd"             NUMERIC(10, 6),
  "latencyMs"           INTEGER,

  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "DraftGeneration_leadId_createdAt_idx" ON "DraftGeneration" ("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "DraftGeneration_categoryKey_designation_angleKey_idx" ON "DraftGeneration" ("categoryKey", "designation", "angleKey");
CREATE INDEX IF NOT EXISTS "DraftGeneration_status_routing_idx" ON "DraftGeneration" ("status", "routing");
CREATE INDEX IF NOT EXISTS "DraftGeneration_emailMessageId_idx" ON "DraftGeneration" ("emailMessageId");
CREATE INDEX IF NOT EXISTS "DraftGeneration_leadEmail_campaignId_sequenceStep_idx" ON "DraftGeneration" ("leadEmail", "campaignId", "sequenceStep");
CREATE INDEX IF NOT EXISTS "DraftGeneration_campaignId_idx" ON "DraftGeneration" ("campaignId");

-- 4. ProviderUsage
CREATE TABLE IF NOT EXISTS "ProviderUsage" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "kind"      TEXT NOT NULL,
  "provider"  TEXT NOT NULL,
  "model"     TEXT,
  "tokensIn"  INTEGER,
  "tokensOut" INTEGER,
  "units"     INTEGER,
  "costUsd"   NUMERIC(10, 6),
  "leadId"    TEXT,
  "draftId"   TEXT,
  "at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ProviderUsage_at_idx" ON "ProviderUsage" ("at");
CREATE INDEX IF NOT EXISTS "ProviderUsage_kind_at_idx" ON "ProviderUsage" ("kind", "at");
CREATE INDEX IF NOT EXISTS "ProviderUsage_draftId_idx" ON "ProviderUsage" ("draftId");

-- 5. ProofPoint
CREATE TABLE IF NOT EXISTS "ProofPoint" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "title"             TEXT NOT NULL,
  "summary"           TEXT NOT NULL,
  "clientName"        TEXT,
  "categories"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metrics"           JSONB NOT NULL DEFAULT '{}'::JSONB,
  "approvedToMention" BOOLEAN NOT NULL DEFAULT false,
  "sourceNote"        TEXT,
  "verifiedAt"        TIMESTAMPTZ,
  "expiresAt"         TIMESTAMPTZ,
  "active"            BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS "ProofPoint_categories_idx" ON "ProofPoint" USING GIN ("categories");
CREATE INDEX IF NOT EXISTS "ProofPoint_active_approvedToMention_idx" ON "ProofPoint" ("active", "approvedToMention");

-- 6. Playbook
CREATE TABLE IF NOT EXISTS "Playbook" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "categoryKey" TEXT NOT NULL,
  "designation" TEXT NOT NULL,
  "angleKey"    TEXT NOT NULL,
  "angleName"   TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dos"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "donts"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ctaOptions"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "toneNotes"   TEXT,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "status"      TEXT NOT NULL DEFAULT 'DRAFT',
  "origin"      TEXT NOT NULL DEFAULT 'SYSTEM_PROPOSAL',
  CONSTRAINT "Playbook_categoryKey_designation_angleKey_version_key" UNIQUE ("categoryKey", "designation", "angleKey", "version")
);

CREATE INDEX IF NOT EXISTS "Playbook_categoryKey_designation_status_idx" ON "Playbook" ("categoryKey", "designation", "status");

-- 7. KnowledgeChunk
CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
  "id"     TEXT NOT NULL PRIMARY KEY,
  "kind"   TEXT NOT NULL,
  "text"   TEXT NOT NULL,
  "tags"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_kind_active_idx" ON "KnowledgeChunk" ("kind", "active");
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_fts_idx" ON "KnowledgeChunk" USING GIN (to_tsvector('english', "text"));

-- 8. BrandResearch
CREATE TABLE IF NOT EXISTS "BrandResearch" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "brandId"     TEXT NOT NULL UNIQUE,
  "categoryKey" TEXT,
  "signals"     JSONB NOT NULL DEFAULT '[]'::JSONB,
  "summary"     TEXT,
  "status"      TEXT NOT NULL DEFAULT 'OK',
  "expiresAt"   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "BrandResearch_status_expiresAt_idx" ON "BrandResearch" ("status", "expiresAt");

-- 9. SystemControl
CREATE TABLE IF NOT EXISTS "SystemControl" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "killSwitch"       BOOLEAN NOT NULL DEFAULT false,
  "pausedMailboxIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reason"           TEXT,
  "setBy"            TEXT,
  "at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "SystemControl" ("id", "killSwitch", "pausedMailboxIds", "reason", "setBy")
VALUES ('singleton', false, ARRAY[]::TEXT[], 'Initial setup', 'system')
ON CONFLICT ("id") DO NOTHING;

-- 10. EvalCase
CREATE TABLE IF NOT EXISTS "EvalCase" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "leadSnapshot"  JSONB NOT NULL,
  "approvedEmail" JSONB NOT NULL,
  "tags"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. ChangeProposal
CREATE TABLE IF NOT EXISTS "ChangeProposal" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "kind"       TEXT NOT NULL,
  "diffJson"   JSONB NOT NULL,
  "rationale"  TEXT NOT NULL,
  "evidence"   JSONB NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "rolloutPct" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. PromptVersion
CREATE TABLE IF NOT EXISTS "PromptVersion" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "role"      TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "hash"      TEXT NOT NULL UNIQUE,
  "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

