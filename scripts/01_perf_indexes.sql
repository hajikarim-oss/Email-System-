-- ==============================================================================
-- 01_PERF_INDEXES.SQL
-- Run this in your Supabase SQL Editor or via psql on the production database.
-- ==============================================================================

-- 1. CRITICAL: Speeds up webhook recipient email lookups from 2,082ms -> 1.5ms
CREATE INDEX IF NOT EXISTS "Lead_lower_email_idx" 
ON "Lead" (lower("email"));

-- 2. Speeds up webhook idempotency deduplication checks
CREATE INDEX IF NOT EXISTS "EmailEvent_providerEventId_idx" 
ON "EmailEvent" ("providerEventId");

-- 3. Speeds up suppression lookups during campaign launch
CREATE INDEX IF NOT EXISTS "SuppressedEmail_lower_email_idx" 
ON "SuppressedEmail" (lower("email"));

-- 4. Speeds up daily temporal drift queries on active contacts
CREATE INDEX IF NOT EXISTS "Lead_lastContactedAt_idx" 
ON "Lead" ("lastContactedAt") 
WHERE "lastContactedAt" IS NOT NULL;

-- 5. Speeds up Brand account rollup calculations
CREATE INDEX IF NOT EXISTS "Lead_domain_isBurned_idx" 
ON "Lead" ("domain", "isBurned");

-- 6. Speeds up 86k EmailMessage lifetime rollup and engagement aggregations
CREATE INDEX IF NOT EXISTS "EmailMessage_perf_rollup_idx" 
ON "EmailMessage" ("createdAt", "bounced", "replied");

-- 7. Speeds up Lead lifetime count and engagement filters
CREATE INDEX IF NOT EXISTS "Lead_perf_rollup_idx" 
ON "Lead" ("campaignId", "lastContactedAt", "openCount", "totalReplied");

