import * as crypto from "node:crypto";
import { pgQuery } from "./pg";
import type { QueryFn } from "./types";
import {
    discoverSimilarLookalikeHandles,
    getActiveLookalikeProvider,
    parseCreatorInput,
    scoutAndAutoStoreCreator,
} from "./creator_scout";
import { getMetaTokenPool } from "./instagram_graph";

let queueSchemaReady = false;

/**
 * Ensures "CreatorHarvestQueue" table and 1M-scale GIN trigram + composite indexes on "Creator".
 */
export async function ensureHarvestQueueSchema(query: QueryFn = pgQuery): Promise<void> {
    if (queueSchemaReady) return;
    try {
        await query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).catch(() => {});

        await query(`
            CREATE TABLE IF NOT EXISTS "CreatorHarvestQueue" (
                "id" TEXT PRIMARY KEY,
                "workspaceId" TEXT NOT NULL DEFAULT 'org_troops_outreach',
                "handle" TEXT NOT NULL UNIQUE,
                "seedHandle" TEXT,
                "depth" INTEGER NOT NULL DEFAULT 1,
                "targetCategory" TEXT,
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "followersCount" INTEGER,
                "hasEmail" BOOLEAN DEFAULT false,
                "errorMsg" TEXT,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS "CreatorExpandedSeed" (
                "handle" TEXT PRIMARY KEY,
                "provider" TEXT,
                "lookalikesFound" INTEGER DEFAULT 0,
                "expandedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await Promise.all([
            query(`CREATE INDEX IF NOT EXISTS idx_harvest_queue_status ON "CreatorHarvestQueue" ("status", "depth" ASC, "createdAt" ASC);`).catch(() => {}),
            query(`CREATE INDEX IF NOT EXISTS idx_creator_india_followers ON "Creator" ("workspaceId", "indiaSignal", "followersCount" DESC);`).catch(() => {}),
            query(`CREATE INDEX IF NOT EXISTS idx_creator_category_followers ON "Creator" ("workspaceId", "category", "followersCount" DESC);`).catch(() => {}),
            query(`CREATE INDEX IF NOT EXISTS idx_creator_trgm_search ON "Creator" USING GIN ((COALESCE("handle", '') || ' ' || COALESCE("fullName", '') || ' ' || COALESCE("publicBio", '') || ' ' || COALESCE("category", '') || ' ' || COALESCE("brandAffinity", '') || ' ' || COALESCE("city", '')) gin_trgm_ops);`).catch(() => {}),
        ]);

        queueSchemaReady = true;
    } catch (err: any) {
        console.warn("[HarvestQueue] Schema check warning:", err?.message);
    }
}

/**
 * Takes 1 or more seed URLs / @handles, expands their ~50 lookalikes via our pluggable adapter
 * (HikerAPI / RapidAPI / SocialCrawl), deduplicates against existing DB & queue, and inserts PENDING rows.
 */
export async function enqueueSeedAndLookalikes(
    seedInput: string,
    opts: {
        workspaceId?: string;
        targetCategory?: string;
        depth?: number;
        limit?: number;
        query?: QueryFn;
    } = {}
): Promise<{
    seedHandle: string;
    provider: string;
    totalDiscovered: number;
    newlyQueued: number;
    alreadyInDbOrQueue: number;
}> {
    const query = opts.query || pgQuery;
    const workspaceId = opts.workspaceId || "org_troops_outreach";
    const depth = opts.depth ?? 1;
    await ensureHarvestQueueSchema(query);

    const parsed = parseCreatorInput(seedInput);
    const cleanSeed = (parsed.handle || seedInput.replace(/^@+/, "").trim()).toLowerCase();
    if (!cleanSeed) {
        return { seedHandle: "", provider: "none", totalDiscovered: 0, newlyQueued: 0, alreadyInDbOrQueue: 0 };
    }

    // Ensure the seed itself is queued if not already in Creator DB
    const sim = await discoverSimilarLookalikeHandles(cleanSeed, opts.limit || 55);
    const allHandles = Array.from(
        new Set([
            cleanSeed,
            ...sim.lookalikes.map((l) => l.handle.replace(/^@+/, "").toLowerCase().trim()),
        ])
    ).filter((h) => /^[a-z0-9_.]{2,30}$/.test(h));

    if (allHandles.length === 0) {
        await query(
            `INSERT INTO "CreatorExpandedSeed" ("handle", "provider", "lookalikesFound") VALUES ($1, $2, 0) ON CONFLICT ("handle") DO NOTHING`,
            [cleanSeed, sim.provider]
        ).catch(() => {});
        return { seedHandle: `@${cleanSeed}`, provider: sim.provider, totalDiscovered: 0, newlyQueued: 0, alreadyInDbOrQueue: 0 };
    }

    // Check which handles already exist in "Creator" with recent IG sync or email
    const existingCreators = await query<{ h: string }>(
        `SELECT lower(replace("handle", '@', '')) as h
         FROM "Creator"
         WHERE "workspaceId" = $1
           AND lower(replace("handle", '@', '')) = ANY($2::text[])
           AND ("primaryEmail" IS NOT NULL OR "igLastSyncedAt" IS NOT NULL)`,
        [workspaceId, allHandles]
    ).catch(() => []);
    const existingCreatorSet = new Set(existingCreators.map((r) => r.h));

    let newlyQueued = 0;
    for (const h of allHandles) {
        if (existingCreatorSet.has(h)) continue;
        const id = `hq_${crypto.randomBytes(8).toString("hex")}`;
        const inserted = await query<{ id: string }>(
            `INSERT INTO "CreatorHarvestQueue" ("id", "workspaceId", "handle", "seedHandle", "depth", "targetCategory", "status")
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
             ON CONFLICT ("handle") DO NOTHING
             RETURNING "id"`,
            [id, workspaceId, h, `@${cleanSeed}`, h === cleanSeed ? 0 : depth, opts.targetCategory || null]
        ).catch(() => []);
        if (inserted.length > 0) newlyQueued++;
    }

    await query(
        `INSERT INTO "CreatorExpandedSeed" ("handle", "provider", "lookalikesFound")
         VALUES ($1, $2, $3)
         ON CONFLICT ("handle") DO UPDATE SET "lookalikesFound" = EXCLUDED."lookalikesFound", "expandedAt" = NOW()`,
        [cleanSeed, sim.provider, sim.lookalikes.length]
    ).catch(() => {});

    return {
        seedHandle: `@${cleanSeed}`,
        provider: sim.provider,
        totalDiscovered: sim.lookalikes.length,
        newlyQueued,
        alreadyInDbOrQueue: allHandles.length - newlyQueued,
    };
}

/**
 * Picks the next unexpanded verified Indian seed (50K - 3M followers) from PostgreSQL "Creator"
 * and expands its ~50 lookalikes into "CreatorHarvestQueue".
 */
export async function autoExpandNextSeedInTree(
    opts: { workspaceId?: string; category?: string; query?: QueryFn } = {}
): Promise<{
    expanded: boolean;
    seedHandle?: string;
    newlyQueued?: number;
    provider?: string;
}> {
    const query = opts.query || pgQuery;
    const workspaceId = opts.workspaceId || "org_troops_outreach";
    await ensureHarvestQueueSchema(query);

    const params: any[] = [workspaceId];
    let catClause = "";
    if (opts.category && opts.category !== "all") {
        catClause = `AND "category" = $2`;
        params.push(opts.category);
    }

    const candidates = await query<{ handle: string; category: string; followersCount: number }>(
        `SELECT lower(replace("handle", '@', '')) as handle, "category", "followersCount"
         FROM "Creator"
         WHERE "workspaceId" = $1
           AND "indiaSignal" = true
           AND "followersCount" BETWEEN 50000 AND 3000000
           ${catClause}
           AND NOT EXISTS (
               SELECT 1 FROM "CreatorExpandedSeed" s
               WHERE s."handle" = lower(replace("Creator"."handle", '@', ''))
           )
         ORDER BY ("primaryEmail" IS NOT NULL) DESC, "followersCount" DESC
         LIMIT 1`,
        params
    ).catch(() => []);

    const nextSeed = candidates?.[0];
    if (!nextSeed) return { expanded: false };

    const res = await enqueueSeedAndLookalikes(nextSeed.handle, {
        workspaceId,
        targetCategory: nextSeed.category || opts.category,
        depth: 2,
        query,
    });

    return {
        expanded: true,
        seedHandle: res.seedHandle,
        newlyQueued: res.newlyQueued,
        provider: res.provider,
    };
}

/**
 * Processes a safe micro-batch of PENDING handles from "CreatorHarvestQueue".
 * Uses Meta-First Free IG_ACCESS_TOKEN hydration + 4-Layer Email Waterfall + gpt-4o-mini Caption Classifier.
 * Safe for both Vercel API ticks (batchSize=3..5) and 24/7 VPS Worker loops.
 */
export async function processHarvestQueueBatch(
    opts: {
        batchSize?: number;
        minFollowers?: number;
        maxFollowers?: number;
        workspaceId?: string;
        appOrigin?: string;
        query?: QueryFn;
    } = {}
): Promise<{
    processed: number;
    stored: number;
    withEmail: number;
    skipped: number;
    failed: number;
    creators: any[];
}> {
    const query = opts.query || pgQuery;
    const batchSize = Math.min(Math.max(opts.batchSize || 5, 1), 15);
    const minFollowers = opts.minFollowers ?? 5000;
    const maxFollowers = opts.maxFollowers ?? 50_000_000;
    const workspaceId = opts.workspaceId || "org_troops_outreach";
    await ensureHarvestQueueSchema(query);

    // Atomically claim PENDING rows
    const claimed = await query<{ id: string; handle: string; targetCategory: string | null; seedHandle: string | null }>(
        `UPDATE "CreatorHarvestQueue"
         SET "status" = 'PROCESSING', "updatedAt" = NOW()
         WHERE "id" IN (
             SELECT "id" FROM "CreatorHarvestQueue"
             WHERE "workspaceId" = $1 AND "status" = 'PENDING'
             ORDER BY "depth" ASC, "createdAt" ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
         )
         RETURNING "id", "handle", "targetCategory", "seedHandle"`,
        [workspaceId, batchSize]
    ).catch(() => []);

    if (claimed.length === 0) {
        return { processed: 0, stored: 0, withEmail: 0, skipped: 0, failed: 0, creators: [] };
    }

    let stored = 0;
    let withEmail = 0;
    let skipped = 0;
    let failed = 0;
    const creators: any[] = [];

    const results = await Promise.all(
        claimed.map(async (item) => {
            try {
                const res = await scoutAndAutoStoreCreator(item.handle, {
                    workspaceId,
                    category: item.targetCategory || undefined,
                    forceRefresh: true,
                    appOrigin: opts.appOrigin,
                    query,
                });

                if (!res) {
                    await query(
                        `UPDATE "CreatorHarvestQueue" SET "status" = 'FAILED', "errorMsg" = 'unresolved_handle', "updatedAt" = NOW() WHERE "id" = $1`,
                        [item.id]
                    ).catch(() => {});
                    return { outcome: "failed" as const };
                }

                const ig = res.instagramInsights || {};
                const followers = Number(res.followersCount || 0);
                const isBrandOrForeign = Boolean(ig.isBrandOrStoreAccount || ig.isIndianCreator === false);
                const outOfFollowerRange = followers > 0 && (followers < minFollowers || followers > maxFollowers);

                if (isBrandOrForeign) {
                    await query(
                        `UPDATE "CreatorHarvestQueue" SET "status" = 'SKIPPED_BRAND_OR_FOREIGN', "followersCount" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
                        [item.id, followers]
                    ).catch(() => {});
                    return { outcome: "skipped" as const };
                }

                if (outOfFollowerRange) {
                    await query(
                        `UPDATE "CreatorHarvestQueue" SET "status" = 'SKIPPED_FOLLOWER_GATE', "followersCount" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
                        [item.id, followers]
                    ).catch(() => {});
                    return { outcome: "skipped" as const };
                }

                const hasEmail = Boolean(res.primaryEmail);
                await query(
                    `UPDATE "CreatorHarvestQueue"
                     SET "status" = 'COMPLETED', "followersCount" = $2, "hasEmail" = $3, "updatedAt" = NOW()
                     WHERE "id" = $1`,
                    [item.id, followers, hasEmail]
                ).catch(() => {});

                return { outcome: "stored" as const, creator: res, hasEmail };
            } catch (err: any) {
                await query(
                    `UPDATE "CreatorHarvestQueue" SET "status" = 'FAILED', "errorMsg" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
                    [item.id, String(err?.message || "unknown").slice(0, 200)]
                ).catch(() => {});
                return { outcome: "failed" as const };
            }
        })
    );

    for (const r of results) {
        if (r.outcome === "stored" && r.creator) {
            stored++;
            if (r.hasEmail) withEmail++;
            creators.push(r.creator);
        } else if (r.outcome === "skipped") {
            skipped++;
        } else {
            failed++;
        }
    }

    return {
        processed: claimed.length,
        stored,
        withEmail,
        skipped,
        failed,
        creators,
    };
}

/**
 * Returns live status of the BFS Harvest Queue + Meta Token Pool capacity.
 */
export async function getHarvestQueueStatus(workspaceId: string = "org_troops_outreach", query: QueryFn = pgQuery) {
    await ensureHarvestQueueSchema(query);

    const [queueStats, seedStats, creatorStats] = await Promise.all([
        query<any>(
            `SELECT
                count(*) FILTER (WHERE "status" = 'PENDING')::int as pending,
                count(*) FILTER (WHERE "status" = 'PROCESSING')::int as processing,
                count(*) FILTER (WHERE "status" = 'COMPLETED')::int as completed,
                count(*) FILTER (WHERE "status" LIKE 'SKIPPED%')::int as skipped,
                count(*) FILTER (WHERE "status" = 'FAILED')::int as failed,
                count(*) FILTER (WHERE "status" = 'COMPLETED' AND "hasEmail" = true)::int as completed_with_email
             FROM "CreatorHarvestQueue"
             WHERE "workspaceId" = $1`,
            [workspaceId]
        ).catch(() => [{}]),
        query<{ expanded_seeds: number }>(
            `SELECT count(*)::int as expanded_seeds FROM "CreatorExpandedSeed"`
        ).catch(() => [{ expanded_seeds: 0 }]),
        query<{ total: number; verified_indian: number; email_ready: number }>(
            `SELECT
                count(*)::int as total,
                count(*) FILTER (WHERE "indiaSignal" = true)::int as verified_indian,
                count(*) FILTER (WHERE "indiaSignal" = true AND "primaryEmail" IS NOT NULL)::int as email_ready
             FROM "Creator"
             WHERE "workspaceId" = $1`,
            [workspaceId]
        ).catch(() => [{ total: 0, verified_indian: 0, email_ready: 0 }]),
    ]);

    const tokenPool = getMetaTokenPool();
    const qs = queueStats?.[0] || {};
    const cs = creatorStats?.[0] || { total: 0, verified_indian: 0, email_ready: 0 };

    return {
        pending: Number(qs.pending || 0),
        processing: Number(qs.processing || 0),
        completed: Number(qs.completed || 0),
        skipped: Number(qs.skipped || 0),
        failed: Number(qs.failed || 0),
        completedWithEmail: Number(qs.completed_with_email || 0),
        expandedSeeds: Number(seedStats?.[0]?.expanded_seeds || 0),
        dbTotalCreators: Number(cs.total || 0),
        dbVerifiedIndian: Number(cs.verified_indian || 0),
        dbEmailReady: Number(cs.email_ready || 0),
        activeMetaTokens: tokenPool.length,
        dailyFreeCapacity: tokenPool.length * 4320,
        lookalikeProvider: getActiveLookalikeProvider(),
    };
}

/**
 * Returns the full BFS Tree visualization data:
 * - live status & capacity
 * - tree branches grouped by parent seedHandle & depth
 * - all queued/hydrated creators joined with every Creator DB field & intake link
 */
export async function getHarvestTreeView(
    opts: {
        workspaceId?: string;
        seedHandle?: string;
        limit?: number;
        appOrigin?: string;
        query?: QueryFn;
    } = {}
) {
    const query = opts.query || pgQuery;
    const workspaceId = opts.workspaceId || "org_troops_outreach";
    const limit = Math.min(Math.max(opts.limit || 500, 1), 2000);
    const appOrigin = (opts.appOrigin || "https://tbmoutreach.tech").replace(/\/$/, "");
    await ensureHarvestQueueSchema(query);

    const status = await getHarvestQueueStatus(workspaceId, query);

    const [branchesRaw, expandedSeedsRaw, itemsRaw] = await Promise.all([
        query<any>(
            `SELECT
                COALESCE(NULLIF("seedHandle", ''), "handle") as "seedHandle",
                MIN("depth")::int as "minDepth",
                MAX("depth")::int as "maxDepth",
                COUNT(*)::int as "totalQueued",
                COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int as "completed",
                COUNT(*) FILTER (WHERE "status" = 'PENDING')::int as "pending",
                COUNT(*) FILTER (WHERE "status" = 'PROCESSING')::int as "processing",
                COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "hasEmail" = true)::int as "withEmail",
                COUNT(*) FILTER (WHERE "status" LIKE 'SKIPPED%')::int as "skipped",
                COUNT(*) FILTER (WHERE "status" = 'FAILED')::int as "failed",
                MAX("updatedAt") as "lastUpdated"
             FROM "CreatorHarvestQueue"
             WHERE "workspaceId" = $1
             GROUP BY COALESCE(NULLIF("seedHandle", ''), "handle")
             ORDER BY MIN("depth") ASC, COUNT(*) DESC
             LIMIT 60`,
            [workspaceId]
        ).catch(() => []),
        query<any>(
            `SELECT "handle", "provider", "lookalikesFound", "expandedAt"
             FROM "CreatorExpandedSeed"
             ORDER BY "expandedAt" ASC
             LIMIT 60`
        ).catch(() => []),
        query<any>(
            `SELECT
                q."id" as "queueId",
                q."handle" as "queueHandle",
                q."seedHandle" as "seedHandle",
                q."depth" as "depth",
                q."status" as "queueStatus",
                q."errorMsg" as "errorMsg",
                q."followersCount" as "queueFollowers",
                q."hasEmail" as "queueHasEmail",
                q."targetCategory" as "targetCategory",
                q."createdAt" as "queuedAt",
                q."updatedAt" as "queueUpdatedAt",
                c."id" as "creatorId",
                c."fullName" as "fullName",
                c."handle" as "creatorHandle",
                c."avatarUrl" as "avatarUrl",
                c."profileUrl" as "profileUrl",
                c."followersCount" as "followersCount",
                c."followingCount" as "followingCount",
                c."postsCount" as "postsCount",
                c."category" as "category",
                c."subGenres" as "subGenres",
                c."languages" as "languages",
                c."indiaSignal" as "indiaSignal",
                c."city" as "city",
                c."primaryEmail" as "primaryEmail",
                c."whatsappNumber" as "whatsappNumber",
                c."phone" as "phone",
                c."intakeToken" as "intakeToken",
                c."intakeStatus" as "intakeStatus",
                c."publicBio" as "publicBio",
                c."agencyName" as "agencyName",
                c."instagramInsights" as "instagramInsights",
                c."updatedAt" as "creatorUpdatedAt"
             FROM "CreatorHarvestQueue" q
             LEFT JOIN LATERAL (
               SELECT *
               FROM "Creator" c2
               WHERE c2."workspaceId" = q."workspaceId"
                 AND lower(replace(c2."handle", '@', '')) = lower(replace(q."handle", '@', ''))
               ORDER BY c2."updatedAt" DESC NULLS LAST
               LIMIT 1
             ) c ON true
             WHERE q."workspaceId" = $1
               ${opts.seedHandle ? `AND lower(replace(COALESCE(NULLIF(q."seedHandle", ''), q."handle"), '@', '')) = $3` : ""}
             ORDER BY
               CASE q."status"
                 WHEN 'PROCESSING' THEN 0
                 WHEN 'COMPLETED' THEN 1
                 WHEN 'PENDING' THEN 2
                 ELSE 3
               END ASC,
               q."updatedAt" DESC
             LIMIT $2`,
            opts.seedHandle
                ? [workspaceId, limit, opts.seedHandle.replace(/^@/, "").toLowerCase()]
                : [workspaceId, limit]
        ).catch((err) => {
            console.error("[getHarvestTreeView] items query error:", err?.message || err);
            return [];
        }),
    ]);

    const expandedMap = new Map<string, any>();
    for (const s of expandedSeedsRaw || []) {
        expandedMap.set(String(s.handle || "").replace(/^@/, "").toLowerCase(), s);
    }

    const branches = (branchesRaw || []).map((b: any) => {
        const cleanSeed = String(b.seedHandle || "").replace(/^@/, "").toLowerCase();
        const exp = expandedMap.get(cleanSeed);
        return {
            seedHandle: cleanSeed,
            minDepth: Number(b.minDepth || 0),
            maxDepth: Number(b.maxDepth || 0),
            totalQueued: Number(b.totalQueued || 0),
            completed: Number(b.completed || 0),
            pending: Number(b.pending || 0),
            processing: Number(b.processing || 0),
            withEmail: Number(b.withEmail || 0),
            skipped: Number(b.skipped || 0),
            failed: Number(b.failed || 0),
            provider: exp?.provider || status.lookalikeProvider,
            expandedAt: exp?.expandedAt || b.lastUpdated,
        };
    });

    const items = (itemsRaw || []).map((row: any) => {
        const cleanHandle = String(row.queueHandle || "").replace(/^@/, "").toLowerCase();
        const cleanSeed = String(row.seedHandle || cleanHandle).replace(/^@/, "").toLowerCase();
        const intakeToken = row.intakeToken || null;
        const ig = row.instagramInsights && typeof row.instagramInsights === "object" ? row.instagramInsights : {};
        const followersCount = Number(row.followersCount || row.queueFollowers || 0);
        const avgLikes = Number(ig.avgLikes || 0);
        const avgComments = Number(ig.avgComments || 0);
        const computedEr =
            typeof ig.engagementRatePct === "number" && ig.engagementRatePct > 0
                ? Number(ig.engagementRatePct.toFixed(2))
                : followersCount > 0 && (avgLikes > 0 || avgComments > 0)
                  ? Number((((avgLikes + avgComments) / followersCount) * 100).toFixed(2))
                  : 0;
        const recentMedia = Array.isArray(ig.recentMedia) ? ig.recentMedia : [];
        const latestReelUrl = recentMedia.find((m: any) => m?.permalink)?.permalink || null;
        const bioText = String(row.publicBio || ig.biography || "");
        const repMatch = bioText.match(/(?:dm|rep(?:resented)?\s*by|managed\s*by|collab(?:s|orations)?|work|agency|mgmt|management)[^@\n]{0,24}@([a-z0-9._]{2,30})/i);
        const collabHandle = repMatch?.[1] ? `@${repMatch[1]}` : null;
        const computedTier =
            followersCount >= 1_000_000
                ? "mega"
                : followersCount >= 200_000
                  ? "macro"
                  : followersCount >= 50_000
                    ? "mid"
                    : followersCount >= 10_000
                      ? "micro"
                      : followersCount > 0
                        ? "nano"
                        : null;

        return {
            queueId: row.queueId,
            id: row.creatorId || row.queueId,
            creatorId: row.creatorId || null,
            handle: row.creatorHandle || `@${cleanHandle}`,
            cleanHandle,
            seedHandle: cleanSeed,
            depth: Number(row.depth || 0),
            queueStatus: row.queueStatus,
            errorMsg: row.errorMsg || null,
            name: row.fullName || `@${cleanHandle}`,
            fullName: row.fullName || `@${cleanHandle}`,
            avatarUrl: row.avatarUrl || ig.profilePictureUrl || null,
            profileUrl: row.profileUrl || `https://www.instagram.com/${cleanHandle}/`,
            followersCount,
            followingCount: Number(row.followingCount || ig.followingCount || 0),
            postsCount: Number(row.postsCount || ig.postsCount || 0),
            engagementRatePct: computedEr,
            latestReelUrl,
            recentReelsCount: recentMedia.length,
            isVerified: Boolean(ig.isVerified),
            collabHandle,
            tier: ig.tier || computedTier,
            category: row.category || row.targetCategory || "Uncategorized",
            subGenres: Array.isArray(row.subGenres) ? row.subGenres : [],
            languages: Array.isArray(row.languages) ? row.languages : [],
            indiaSignal: row.indiaSignal ?? null,
            city: row.city || null,
            primaryEmail: row.primaryEmail || null,
            secondaryEmails: Array.isArray(ig.secondaryEmails) ? ig.secondaryEmails : [],
            whatsappNumber: row.whatsappNumber || null,
            phoneNumber: row.phone || null,
            intakeToken,
            intakeUrl: intakeToken ? `${appOrigin}/creator/intake/${intakeToken}` : null,
            status: row.intakeStatus || row.queueStatus,
            bio: bioText || null,
            website: ig.website || ig.externalUrl || null,
            avgLikes,
            avgComments,
            agencyName: row.agencyName || ig.agencyName || null,
            fitScore: Number(ig.fitScore || ig.scoutFitScore || 0),
            instagramInsights: row.instagramInsights || null,
            queuedAt: row.queuedAt,
            updatedAt: row.creatorUpdatedAt || row.queueUpdatedAt,
        };
    });

    return {
        status,
        branches,
        items,
    };
}

/**
 * Resets the BFS Harvest Queue for a fresh interactive run without deleting saved creators in "Creator".
 */
export async function resetHarvestQueue(workspaceId: string = "org_troops_outreach", query: QueryFn = pgQuery) {
    await ensureHarvestQueueSchema(query);
    await query(`DELETE FROM "CreatorHarvestQueue" WHERE "workspaceId" = $1`, [workspaceId]);
    await query(`DELETE FROM "CreatorExpandedSeed"`);
    return getHarvestQueueStatus(workspaceId, query);
}
