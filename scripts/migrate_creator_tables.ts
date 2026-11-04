import { pgQuery } from "../server/pg";

async function runMigration() {
    console.log("[Migration] Starting Creator and CreatorTemplate table migration...");

    await pgQuery(`
        CREATE TABLE IF NOT EXISTS "Creator" (
            "id" TEXT PRIMARY KEY,
            "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
            "externalCreatorId" TEXT,
            "handle" TEXT NOT NULL,
            "platform" TEXT NOT NULL DEFAULT 'instagram',
            "fullName" TEXT NOT NULL,
            "profileUrl" TEXT NOT NULL,
            "avatarUrl" TEXT,
            "primaryEmail" TEXT,
            "phone" TEXT,
            "followersRaw" TEXT,
            "followersCount" BIGINT NOT NULL DEFAULT 0,
            "followingCount" INTEGER DEFAULT 0,
            "postsCount" INTEGER DEFAULT 0,
            "publicBio" TEXT,
            "category" TEXT NOT NULL,
            "subGenres" TEXT[] DEFAULT ARRAY[]::TEXT[],
            "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
            "brandAffinity" TEXT,
            "sampleReelUrl" TEXT,
            "matchedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
            "discoveryKeyword" TEXT,
            "discoveryEngine" TEXT,
            "isVerified" BOOLEAN DEFAULT FALSE,
            "indiaSignal" BOOLEAN DEFAULT TRUE,
            "scrapedAt" TIMESTAMP WITH TIME ZONE,
            
            "intakeStatus" TEXT NOT NULL DEFAULT 'SCRAPED_BASELINE',
            "intakeToken" TEXT UNIQUE NOT NULL,
            "intakeCompletionPct" INTEGER NOT NULL DEFAULT 30,
            "lastIntakeStepCompleted" INTEGER DEFAULT 0,
            "lastIntakeActivityAt" TIMESTAMP WITH TIME ZONE,
            
            "whatsappNumber" TEXT,
            "isWhatsappVerified" BOOLEAN DEFAULT FALSE,
            "pincode" VARCHAR(10),
            "city" TEXT,
            "state" TEXT,
            "shippingAddress" TEXT,
            "contentDescription" TEXT,
            "collabType" TEXT DEFAULT 'both',
            "commercialRates" JSONB DEFAULT '{}'::jsonb,
            "mediaKitUrl" TEXT,
            "upiId" TEXT,
            "panNumber" TEXT,
            
            "activeCampaignId" TEXT,
            "lastContactedAt" TIMESTAMP WITH TIME ZONE,
            "outreachSentCount" INTEGER DEFAULT 0,
            "outreachOpenedCount" INTEGER DEFAULT 0,
            "outreachClickedCount" INTEGER DEFAULT 0,
            "outreachRepliedCount" INTEGER DEFAULT 0,
            "isSuppressed" BOOLEAN DEFAULT FALSE,
            "suppressedReason" TEXT,
            
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

            CONSTRAINT unique_creator_handle_workspace UNIQUE ("workspaceId", "handle")
        );
    `);

    // Create Indexes
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_workspace ON "Creator"("workspaceId");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_handle ON "Creator"("handle");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_email ON "Creator"("primaryEmail");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_category ON "Creator"("category");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_followers ON "Creator"("followersCount");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_intake_token ON "Creator"("intakeToken");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_intake_status ON "Creator"("intakeStatus");`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_pincode ON "Creator"("pincode");`);

    // Create CreatorTemplate Table
    await pgQuery(`
        CREATE TABLE IF NOT EXISTS "CreatorTemplate" (
            "id" TEXT PRIMARY KEY,
            "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
            "name" TEXT NOT NULL,
            "subject" TEXT NOT NULL,
            "bodyHtml" TEXT NOT NULL,
            "category" TEXT DEFAULT 'COLLABORATION',
            "orderIndex" INTEGER DEFAULT 0,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);

    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_creator_tpl_workspace ON "CreatorTemplate"("workspaceId");`);

    console.log("[Migration] ✓ Creator and CreatorTemplate tables created successfully.");
}

runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[Migration] ❌ Error running migration:", err);
        process.exit(1);
    });

