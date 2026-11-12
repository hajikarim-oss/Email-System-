-- ============================================================================
-- TBM AI OUTREACH BRAIN v1 — REVERSIBLE DOWN MIGRATION
-- Safety: Drops ONLY the 10 new Brain tables and the 5 additive columns on Lead/Brand.
-- Never touches existing Lead/Brand/Campaign/EmailEvent/EmailMessage/Creator/Tally data.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

DROP TABLE IF EXISTS "PromptVersion";
DROP TABLE IF EXISTS "ChangeProposal";
DROP TABLE IF EXISTS "EvalCase";
DROP TABLE IF EXISTS "SystemControl";
DROP TABLE IF EXISTS "BrandResearch";
DROP TABLE IF EXISTS "KnowledgeChunk";
DROP TABLE IF EXISTS "Playbook";
DROP TABLE IF EXISTS "ProofPoint";
DROP TABLE IF EXISTS "ProviderUsage";
DROP TABLE IF EXISTS "DraftGeneration";

DROP INDEX IF EXISTS "Brand_categoryKey_tier_idx";
ALTER TABLE "Brand" DROP COLUMN IF EXISTS "categoryKey";
ALTER TABLE "Brand" DROP COLUMN IF EXISTS "tier";

DROP INDEX IF EXISTS "Lead_categoryKey_designation_idx";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "categoryKey";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "designationRaw";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "designation";

