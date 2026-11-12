-- ============================================================================
-- TBM PARTNERSHIP INTELLIGENCE ENGINE (PIE) v1 — ADDITIVE UP MIGRATION
-- Target: Replica 3 (adlwwkqgexykuhkdkpfu) ONLY for Dev/Testing.
--         Primary (hsmudwkfwmvinhtggxyd) is NOT touched until the PIE Phase-5 gate.
-- Builds on: 20261111_brain_v1_up.sql (Brand.tier, Brand.categoryKey,
--            Lead.categoryKey/designation and DraftGeneration already exist there).
-- Safety: Non-blocking, metadata-only ADD COLUMN + CREATE TABLE IF NOT EXISTS.
--         Reversible via 20261112_pie_v1_down.sql. Touches no existing row data.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- 1. Additive nullable columns on existing tables
-- ----------------------------------------------------------------------------
ALTER TABLE "Brand"           ADD COLUMN IF NOT EXISTS "dossierId" TEXT;
ALTER TABLE "DraftGeneration" ADD COLUMN IF NOT EXISTS "gapId"     TEXT;
ALTER TABLE "DraftGeneration" ADD COLUMN IF NOT EXISTS "thesisId"  TEXT;

CREATE INDEX IF NOT EXISTS "DraftGeneration_gapId_idx"    ON "DraftGeneration" ("gapId");
CREATE INDEX IF NOT EXISTS "DraftGeneration_thesisId_idx" ON "DraftGeneration" ("thesisId");

-- ----------------------------------------------------------------------------
-- 2. Capability — Layer 1 (the moat): a service TBM sells, mapped to the
--    business problem it solves. GATED: starts inactive until owner approves.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Capability" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL UNIQUE,
  "slug"          TEXT NOT NULL UNIQUE,
  "problemSolved" TEXT NOT NULL,
  "categoryKeys"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "outcomeType"   TEXT,                                   -- ROAS|CPV|SOV|reach|engagement
  "active"        BOOLEAN NOT NULL DEFAULT false,         -- gate: off until owner approves
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. CapabilityProof — the strength contract: named client + numeric metric
--    + categoryKey are REQUIRED (enforced in application code + validator).
--    GATED: approvedToMention starts false.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CapabilityProof" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "capabilityId"      TEXT NOT NULL,
  "clientName"        TEXT NOT NULL,                      -- REQUIRED, named (no "a beauty brand")
  "categoryKey"       TEXT NOT NULL,                      -- REQUIRED, for match gating
  "metricType"        TEXT NOT NULL,                      -- ROAS|CPV|views|SOV|...
  "metricValue"       DOUBLE PRECISION NOT NULL,          -- REQUIRED numeric
  "metricRaw"         TEXT NOT NULL,                      -- "7.58x ROAS"
  "sourceUrl"         TEXT,
  "verifiedBy"        TEXT,
  "verifiedAt"        TIMESTAMPTZ,
  "approvedToMention" BOOLEAN NOT NULL DEFAULT false,     -- gate
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CapabilityProof_capabilityId_fkey"
    FOREIGN KEY ("capabilityId") REFERENCES "Capability" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "CapabilityProof_categoryKey_idx"   ON "CapabilityProof" ("categoryKey");
CREATE INDEX IF NOT EXISTS "CapabilityProof_capabilityId_idx"  ON "CapabilityProof" ("capabilityId");

-- ----------------------------------------------------------------------------
-- 4. CategoryBenchmark — Layer 3: what category leaders do, per dimension.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CategoryBenchmark" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "categoryKey"    TEXT NOT NULL,                         -- narrow, e.g. premium_packaged_s_indian_fnb
  "dimension"      TEXT NOT NULL,                         -- content_format_mix|cadence|channel_mix|funnel
  "leaderPattern"  TEXT NOT NULL,
  "benchmarkValue" JSONB,
  "source"         TEXT NOT NULL,                         -- client:MTR | adlib:competitor-set
  "confidence"     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "approved"       BOOLEAN NOT NULL DEFAULT false,        -- gate
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CategoryBenchmark_cat_dim_uniq" UNIQUE ("categoryKey", "dimension")
);
CREATE INDEX IF NOT EXISTS "CategoryBenchmark_categoryKey_idx" ON "CategoryBenchmark" ("categoryKey");

-- ----------------------------------------------------------------------------
-- 5. BrandDossier — Layer 2: one structured, cited record per brand.
--    Every field is grounded via "fieldCitations" (field -> sourceUrl).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BrandDossier" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "brandId"           TEXT NOT NULL UNIQUE,
  "categoryKey"       TEXT,
  "lifecycleStage"    TEXT,                               -- seed|growth|scale|mature
  "positioning"       TEXT,
  "channelMix"        JSONB,
  "contentFormats"    JSONB,
  "hiringSignals"     JSONB,
  "recentLaunches"    JSONB,
  "competitorSet"     JSONB,
  "visibleWeaknesses" JSONB,
  "adLibrarySnapshot" JSONB,                              -- active creatives, counts, durations
  "fieldCitations"    JSONB NOT NULL DEFAULT '{}'::jsonb, -- grounding ledger: field -> sourceUrl
  "completeness"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "researchedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "refreshDueAt"      TIMESTAMPTZ,                         -- 30-day cache
  CONSTRAINT "BrandDossier_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "BrandDossier_categoryKey_idx" ON "BrandDossier" ("categoryKey");

-- ----------------------------------------------------------------------------
-- 6. Gap — Layer 4: the grounded chain. isValid is set ONLY by the grounding
--    validator; an invalid chain is withheld (never emitted to a thesis).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Gap" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "brandId"           TEXT NOT NULL,
  "dossierId"         TEXT NOT NULL,
  "observation"       TEXT NOT NULL,
  "observationSource" TEXT NOT NULL,                      -- REQUIRED citation url
  "benchmarkDim"      TEXT NOT NULL,
  "benchmarkValue"    TEXT NOT NULL,
  "impliedProblem"    TEXT NOT NULL,                      -- INTERPRETATION (model inference)
  "businessImpact"    TEXT NOT NULL,                      -- INTERPRETATION (model inference)
  "capabilityId"      TEXT NOT NULL,
  "proofId"           TEXT NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "severity"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isValid"           BOOLEAN NOT NULL DEFAULT false,
  "rankInThesis"      INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Gap_dossierId_fkey"
    FOREIGN KEY ("dossierId") REFERENCES "BrandDossier" ("id") ON DELETE CASCADE,
  CONSTRAINT "Gap_capabilityId_fkey"
    FOREIGN KEY ("capabilityId") REFERENCES "Capability" ("id"),
  CONSTRAINT "Gap_proofId_fkey"
    FOREIGN KEY ("proofId") REFERENCES "CapabilityProof" ("id")
);
CREATE INDEX IF NOT EXISTS "Gap_brandId_idx" ON "Gap" ("brandId");
CREATE INDEX IF NOT EXISTS "Gap_isValid_idx" ON "Gap" ("isValid");

-- ----------------------------------------------------------------------------
-- 7. PartnershipThesis — Layer 5/7: the ranked, owner-reviewed unit.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PartnershipThesis" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "brandId"           TEXT NOT NULL UNIQUE,
  "headlineGapId"     TEXT,
  "rankedGapIds"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "fitScore"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tier"              TEXT NOT NULL DEFAULT 'LOW',         -- HIGH|MEDIUM|LOW
  "recommendedMotion" TEXT NOT NULL DEFAULT 'skip',        -- custom_pitch|templated|skip
  "ownerApproved"     BOOLEAN NOT NULL DEFAULT false,      -- gate
  "approvedBy"        TEXT,
  "approvedAt"        TIMESTAMPTZ,
  "sharpnessRating"   INTEGER,                             -- owner 1..5 (Phase-3 gate metric)
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "PartnershipThesis_tier_idx"          ON "PartnershipThesis" ("tier");
CREATE INDEX IF NOT EXISTS "PartnershipThesis_ownerApproved_idx" ON "PartnershipThesis" ("ownerApproved");

-- ----------------------------------------------------------------------------
-- 8. ResearchSource — provenance ledger for every dossier field.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ResearchSource" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "brandId"       TEXT NOT NULL,
  "sourceType"    TEXT NOT NULL,                           -- ad_library|website|careers|blog|social
  "url"           TEXT NOT NULL,
  "fetchedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "usedForFields" JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS "ResearchSource_brandId_idx" ON "ResearchSource" ("brandId");

-- ----------------------------------------------------------------------------
-- 9. EvalCaseV2 — INDEPENDENT, human-authored eval set (fixes the Brain's
--    pipeline-frozen contamination). authoredBy MUST be a human.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "EvalCaseV2" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "brandId"       TEXT,
  "categoryKey"   TEXT NOT NULL,
  "input"         JSONB NOT NULL,                          -- dossier snapshot + benchmark
  "goldThesis"    JSONB NOT NULL,                          -- owner-authored expected gaps
  "authoredBy"    TEXT NOT NULL,                           -- human reviewer id
  "isAdversarial" BOOLEAN NOT NULL DEFAULT false,          -- must-withhold cases
  "frozenAt"      TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EvalCaseV2_categoryKey_idx" ON "EvalCaseV2" ("categoryKey");

-- ============================================================================
-- END PIE v1 UP. 8 new tables, 3 additive columns, all gated OFF by default.
-- ============================================================================
