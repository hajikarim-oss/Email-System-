import { pgQuery } from "../server/pg";

async function runMigration() {
    console.log("[Migration] Creating CreatorCampaign & CreatorCampaignEnrollment tables...");

    // 1. CreatorCampaign Table
    await pgQuery(`
        CREATE TABLE IF NOT EXISTS "CreatorCampaign" (
            "id" TEXT PRIMARY KEY,
            "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
            "name" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
            "targetVertical" TEXT,                  -- 'Tech', 'Skincare', 'Lifestyle', etc.
            "targetTiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
            "targetFollowersMin" BIGINT DEFAULT 0,
            "targetFollowersMax" BIGINT,
            
            "templateId" TEXT,
            "subject" TEXT NOT NULL DEFAULT 'Creator Collaboration Proposal',
            "bodyHtml" TEXT NOT NULL DEFAULT '',
            "formLinkPattern" TEXT DEFAULT '{{form_link}}',
            
            -- Live Funnel Telemetry Counters
            "enrolledCount" INTEGER NOT NULL DEFAULT 0,
            "sentCount" INTEGER NOT NULL DEFAULT 0,
            "formsOpenedCount" INTEGER NOT NULL DEFAULT 0,
            "partiallyFilledCount" INTEGER NOT NULL DEFAULT 0,
            "completedCount" INTEGER NOT NULL DEFAULT 0,
            
            -- Integration Bridge
            "smartleadCampaignId" INTEGER,
            "smartleadStatus" TEXT,
            
            "metadata" JSONB DEFAULT '{}'::jsonb,
            "startedAt" TIMESTAMP WITH TIME ZONE,
            "finishedAt" TIMESTAMP WITH TIME ZONE,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);

    // 2. CreatorCampaignEnrollment Table (Real-time Creator-level Telemetry)
    await pgQuery(`
        CREATE TABLE IF NOT EXISTS "CreatorCampaignEnrollment" (
            "id" TEXT PRIMARY KEY,
            "campaignId" TEXT NOT NULL REFERENCES "CreatorCampaign"("id") ON DELETE CASCADE,
            "creatorId" TEXT NOT NULL REFERENCES "Creator"("id") ON DELETE CASCADE,
            "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
            
            "email" TEXT,
            "handle" TEXT,
            "intakeToken" TEXT,
            "formLink" TEXT,
            
            "status" TEXT NOT NULL DEFAULT 'ENROLLED', -- 'ENROLLED' | 'INVITATION_SENT' | 'FORM_OPENED' | 'PARTIALLY_FILLED' | 'COMPLETED'
            "completionPct" INTEGER NOT NULL DEFAULT 30,
            "stepCompleted" INTEGER NOT NULL DEFAULT 0,
            
            "sentAt" TIMESTAMP WITH TIME ZONE,
            "openedAt" TIMESTAMP WITH TIME ZONE,
            "firstFilledAt" TIMESTAMP WITH TIME ZONE,
            "completedAt" TIMESTAMP WITH TIME ZONE,
            "lastActiveAt" TIMESTAMP WITH TIME ZONE,
            
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            
            CONSTRAINT unique_campaign_creator UNIQUE ("campaignId", "creatorId")
        );
    `);

    // 3. Create Indexes
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_campaign_ws ON "CreatorCampaign"("workspaceId");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_campaign_status ON "CreatorCampaign"("status");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_camp_enr_camp ON "CreatorCampaignEnrollment"("campaignId");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_camp_enr_creator ON "CreatorCampaignEnrollment"("creatorId");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_camp_enr_token ON "CreatorCampaignEnrollment"("intakeToken");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_camp_enr_status ON "CreatorCampaignEnrollment"("status");`);

    // 4. Ensure Creator table has activeCampaignId & lastIntakeStepCompleted
    await pgQuery(`
        ALTER TABLE "Creator" 
        ADD COLUMN IF NOT EXISTS "activeCampaignId" TEXT,
        ADD COLUMN IF NOT EXISTS "lastIntakeStepCompleted" INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "lastIntakeActivityAt" TIMESTAMP WITH TIME ZONE;
    `);

    console.log("[Migration] ✓ CreatorCampaign & CreatorCampaignEnrollment created successfully.");
}

runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[Migration] Error:", err);
        process.exit(1);
    });

