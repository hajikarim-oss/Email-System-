-- ============================================================================
-- TBM PARTNERSHIP INTELLIGENCE ENGINE (PIE) v1 — REVERSIBLE DOWN MIGRATION
-- Drops ONLY the 8 new PIE tables and the 3 additive columns (Brand.dossierId,
-- DraftGeneration.gapId/thesisId). Never touches existing Lead/Brand/Campaign/
-- EmailEvent/EmailMessage/Creator/Tally/Brain data.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- Drop tables in reverse dependency order (children before parents)
DROP TABLE IF EXISTS "EvalCaseV2";
DROP TABLE IF EXISTS "ResearchSource";
DROP TABLE IF EXISTS "PartnershipThesis";
DROP TABLE IF EXISTS "Gap";
DROP TABLE IF EXISTS "BrandDossier";
DROP TABLE IF EXISTS "CategoryBenchmark";
DROP TABLE IF EXISTS "CapabilityProof";
DROP TABLE IF EXISTS "Capability";

-- Drop additive columns + their indexes
DROP INDEX IF EXISTS "DraftGeneration_thesisId_idx";
DROP INDEX IF EXISTS "DraftGeneration_gapId_idx";
ALTER TABLE "DraftGeneration" DROP COLUMN IF EXISTS "thesisId";
ALTER TABLE "DraftGeneration" DROP COLUMN IF EXISTS "gapId";
ALTER TABLE "Brand"           DROP COLUMN IF EXISTS "dossierId";

-- ============================================================================
-- END PIE v1 DOWN. Database returns to the post-brain_v1 state exactly.
-- ============================================================================
