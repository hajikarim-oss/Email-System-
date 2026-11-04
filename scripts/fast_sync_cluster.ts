import { clusterManager } from "../server/dbCluster";

async function fastSyncCluster() {
    console.log("[FastSync] Fetching all creators from primary...");
    const primaryPool = clusterManager.getPool("primary");
    const { rows: creators } = await primaryPool.query('SELECT * FROM "Creator"');
    console.log(`[FastSync] Found ${creators.length} creators on primary.`);

    const targets = ["replica2", "replica3"] as const;

    for (const targetId of targets) {
        console.log(`[FastSync] Preparing ${targetId}...`);
        const pool = clusterManager.getPool(targetId);

        // Ensure tables exist
        await pool.query(`
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
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS "idx_creator_workspace_cat" ON "Creator" ("workspaceId", "category");
            CREATE INDEX IF NOT EXISTS "idx_creator_followers" ON "Creator" ("followersCount" DESC);
            CREATE INDEX IF NOT EXISTS "idx_creator_token" ON "Creator" ("intakeToken");
        `);

        // Insert in batches of 40 using concurrency of 5
        const BATCH_SIZE = 40;
        const batches: any[][] = [];
        for (let i = 0; i < creators.length; i += BATCH_SIZE) {
            batches.push(creators.slice(i, i + BATCH_SIZE));
        }

        console.log(`[FastSync] Uploading ${batches.length} batches to ${targetId}...`);

        for (let i = 0; i < batches.length; i += 5) {
            const parallelBatches = batches.slice(i, i + 5);
            await Promise.all(
                parallelBatches.map(async (batch) => {
                    const valuePlaceholders: string[] = [];
                    const params: any[] = [];
                    let idx = 1;

                    for (const c of batch) {
                        const rowParams: string[] = [];
                        for (let col = 0; col < 53; col++) {
                            rowParams.push(`$${idx++}`);
                        }
                        valuePlaceholders.push(`(${rowParams.join(", ")})`);

                        params.push(
                            c.id, c.workspaceId, c.externalCreatorId, c.handle, c.platform,
                            c.fullName, c.profileUrl, c.avatarUrl, c.primaryEmail, c.phone,
                            c.followersRaw, c.followersCount, c.followingCount, c.postsCount,
                            c.publicBio, c.category, c.subGenres, c.languages, c.brandAffinity,
                            c.sampleReelUrl, c.matchedKeywords, c.discoveryKeyword, c.discoveryEngine,
                            c.isVerified, c.indiaSignal, c.scrapedAt, c.intakeStatus, c.intakeToken,
                            c.intakeCompletionPct, c.lastIntakeStepCompleted, c.lastIntakeActivityAt,
                            c.whatsappNumber, c.isWhatsappVerified, c.pincode, c.city, c.state,
                            c.shippingAddress, c.contentDescription, c.collabType, JSON.stringify(c.commercialRates || {}),
                            c.mediaKitUrl, c.upiId, c.panNumber, c.activeCampaignId, c.lastContactedAt,
                            c.outreachSentCount, c.outreachOpenedCount, c.outreachClickedCount,
                            c.outreachRepliedCount, c.isSuppressed, c.suppressedReason, c.createdAt, c.updatedAt
                        );
                    }

                    const sql = `
                        INSERT INTO "Creator" (
                            "id", "workspaceId", "externalCreatorId", "handle", "platform",
                            "fullName", "profileUrl", "avatarUrl", "primaryEmail", "phone",
                            "followersRaw", "followersCount", "followingCount", "postsCount",
                            "publicBio", "category", "subGenres", "languages", "brandAffinity",
                            "sampleReelUrl", "matchedKeywords", "discoveryKeyword", "discoveryEngine",
                            "isVerified", "indiaSignal", "scrapedAt", "intakeStatus", "intakeToken",
                            "intakeCompletionPct", "lastIntakeStepCompleted", "lastIntakeActivityAt",
                            "whatsappNumber", "isWhatsappVerified", "pincode", "city", "state",
                            "shippingAddress", "contentDescription", "collabType", "commercialRates",
                            "mediaKitUrl", "upiId", "panNumber", "activeCampaignId", "lastContactedAt",
                            "outreachSentCount", "outreachOpenedCount", "outreachClickedCount",
                            "outreachRepliedCount", "isSuppressed", "suppressedReason", "createdAt", "updatedAt"
                        ) VALUES ${valuePlaceholders.join(", ")}
                        ON CONFLICT (id) DO UPDATE SET
                            "intakeStatus" = EXCLUDED."intakeStatus",
                            "intakeCompletionPct" = EXCLUDED."intakeCompletionPct",
                            "whatsappNumber" = EXCLUDED."whatsappNumber",
                            "pincode" = EXCLUDED."pincode",
                            "city" = EXCLUDED."city",
                            "state" = EXCLUDED."state",
                            "shippingAddress" = EXCLUDED."shippingAddress",
                            "contentDescription" = EXCLUDED."contentDescription",
                            "commercialRates" = EXCLUDED."commercialRates",
                            "upiId" = EXCLUDED."upiId",
                            "updatedAt" = EXCLUDED."updatedAt";
                    `;

                    await pool.query(sql, params);
                })
            );
        }

        const verify = await pool.query('SELECT count(*) FROM "Creator"');
        console.log(`[FastSync] ✓ ${targetId} now has ${verify.rows[0].count} creators!`);
    }

    // Sync CreatorTemplate
    const { rows: templates } = await primaryPool.query('SELECT * FROM "CreatorTemplate"');
    for (const targetId of targets) {
        const pool = clusterManager.getPool(targetId);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "CreatorTemplate" (
                "id" TEXT PRIMARY KEY,
                "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
                "name" TEXT NOT NULL,
                "subject" TEXT NOT NULL,
                "bodyHtml" TEXT NOT NULL,
                "category" TEXT,
                "orderIndex" INTEGER DEFAULT 0,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
        for (const t of templates) {
            await pool.query(`
                INSERT INTO "CreatorTemplate" ("id", "workspaceId", "name", "subject", "bodyHtml", "category", "orderIndex", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING;
            `, [t.id, t.workspaceId, t.name, t.subject, t.bodyHtml, t.category, t.orderIndex, t.createdAt, t.updatedAt]);
        }
        console.log(`[FastSync] ✓ Templates synced to ${targetId}`);
    }

    console.log("[FastSync] Cluster fully replicated!");
    process.exit(0);
}

fastSyncCluster().catch((e) => {
    console.error(e);
    process.exit(1);
});
