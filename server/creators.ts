import type { QueryFn } from "./types";
import { pgQuery } from "./pg";
import { ensureInstagramColumns } from "./instagram_graph";
import { scoutAndAutoStoreCreator, evaluateIndiaAndCreatorAuthenticity } from "./creator_scout";

export interface CreatorSearchParams {
    workspaceId?: string;
    search?: string;
    category?: string;
    subGenre?: string;
    city?: string;
    agency?: string;
    brand?: string;
    language?: string;
    tier?: "all" | "nano" | "micro" | "mid" | "macro" | "mega";
    intakeStatus?: "all" | "SCRAPED_BASELINE" | "INVITATION_SENT" | "FORM_OPENED" | "PARTIALLY_FILLED" | "COMPLETED" | "REFERRED";
    channel?: "all" | "email" | "phone" | "dual";
    source?: "all" | "referred" | "new" | "organic" | "scouted";
    sortBy?: "followersCount" | "fullName" | "createdAt" | "intakeCompletionPct" | "handle";
    reverse?: boolean;
    limit?: number;
    offset?: number;
    autoScoutIfEmpty?: boolean;
    verifiedIndianOnly?: boolean;
}

export async function searchCreators(query: QueryFn = pgQuery, params: CreatorSearchParams) {
    await ensureInstagramColumns(query);
    const workspaceId = params.workspaceId || "org_troops_outreach";
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    const conditions: string[] = [`"workspaceId" = $1`];
    const values: any[] = [workspaceId];
    let pIdx = 2;

    let isDirectUrlOrHandleSearch = false;
    if (params.search && params.search.trim()) {
        const rawSearch = params.search.trim();
        // If user pasted an Instagram URL (e.g. https://www.instagram.com/anshuffle/?hl=en) or @handle, extract clean handle cleanly
        const handleFromUrl = rawSearch.match(/instagram\.com\/(?:reel\/|reels\/|p\/)?([A-Za-z0-9_.]+)/i)?.[1];
        const isUrlMatch = Boolean(handleFromUrl && !["reel", "reels", "p", "explore", "stories"].includes(handleFromUrl.toLowerCase()));
        const isAtHandle = rawSearch.startsWith("@") && /^@[A-Za-z0-9_.]{2,35}$/.test(rawSearch);
        isDirectUrlOrHandleSearch = isUrlMatch || isAtHandle;

        const cleanTerm = (
            isUrlMatch
                ? handleFromUrl!
                : rawSearch.replace(/^@+/, "")
        ).toLowerCase();

        if (isDirectUrlOrHandleSearch) {
            // Fast path: match directly on handle (supports both "@handle" and "handle") or fullName
            const s = `%${cleanTerm}%`;
            conditions.push(`(
                lower(replace("handle", '@', '')) = $${pIdx}
                OR lower("handle") LIKE $${pIdx + 1}
                OR lower("fullName") LIKE $${pIdx + 1}
            )`);
            values.push(cleanTerm, s);
            pIdx += 2;
        } else {
            const s = `%${cleanTerm}%`;
            conditions.push(`(
                lower("handle") LIKE $${pIdx}
                OR lower("fullName") LIKE $${pIdx}
                OR lower(COALESCE("primaryEmail", '')) LIKE $${pIdx}
                OR lower(COALESCE("publicBio", '')) LIKE $${pIdx}
                OR lower(COALESCE("brandAffinity", '')) LIKE $${pIdx}
                OR lower(COALESCE("category", '')) LIKE $${pIdx}
                OR lower(COALESCE("city", '')) LIKE $${pIdx}
                OR lower(COALESCE("agencyName", '')) LIKE $${pIdx}
            )`);
            values.push(s);
            pIdx++;
        }
    }

    if (params.brand && params.brand !== "all" && params.brand.trim() !== "") {
        const b = `%${params.brand.trim().toLowerCase()}%`;
        conditions.push(`(lower(COALESCE("brandAffinity", '')) LIKE $${pIdx} OR lower(COALESCE("discoveryKeyword", '')) LIKE $${pIdx} OR lower(COALESCE("publicBio", '')) LIKE $${pIdx})`);
        values.push(b);
        pIdx++;
    }

    if (params.source && params.source !== "all") {
        if (params.source === "referred") {
            conditions.push(`"discoveryKeyword" LIKE 'referral:%'`);
        } else if (params.source === "new" || params.source === "organic") {
            conditions.push(`("discoveryKeyword" LIKE 'referral:%' OR "discoveryKeyword" IN ('direct_submission', 'organic_referral'))`);
        } else if (params.source === "scouted") {
            conditions.push(`("discoveryKeyword" IS NULL OR ("discoveryKeyword" NOT LIKE 'referral:%' AND "discoveryKeyword" NOT IN ('direct_submission', 'organic_referral')))`);
        }
    }

    if (params.category && params.category !== "all" && params.category !== "") {
        conditions.push(`("category" = $${pIdx} OR $${pIdx} = ANY("subGenres"))`);
        values.push(params.category);
        pIdx++;
    }

    if (params.subGenre && params.subGenre !== "all" && params.subGenre.trim() !== "") {
        const sg = params.subGenre.trim();
        const sgLike = `%${sg.toLowerCase()}%`;
        conditions.push(`(
            $${pIdx} = ANY("subGenres")
            OR lower(array_to_string("subGenres", ' ')) LIKE $${pIdx + 1}
            OR lower(COALESCE("publicBio", '')) LIKE $${pIdx + 1}
        )`);
        values.push(sg, sgLike);
        pIdx += 2;
    }

    if (params.city && params.city !== "all" && params.city.trim() !== "") {
        const cLike = `%${params.city.trim().toLowerCase()}%`;
        conditions.push(`(lower(COALESCE("city", '')) LIKE $${pIdx} OR lower(COALESCE("state", '')) LIKE $${pIdx})`);
        values.push(cLike);
        pIdx++;
    }

    if (params.agency && params.agency !== "all" && params.agency.trim() !== "") {
        const aLike = `%${params.agency.trim().toLowerCase()}%`;
        conditions.push(`lower(COALESCE("agencyName", '')) LIKE $${pIdx}`);
        values.push(aLike);
        pIdx++;
    }

    if (params.language && params.language !== "all" && params.language.trim() !== "") {
        const lang = params.language.trim();
        const langLike = `%${lang.toLowerCase()}%`;
        conditions.push(`(
            $${pIdx} = ANY("languages")
            OR lower(array_to_string("languages", ' ')) LIKE $${pIdx + 1}
            OR lower(COALESCE("publicBio", '')) LIKE $${pIdx + 1}
            OR lower(COALESCE("city", '')) LIKE $${pIdx + 1}
            OR lower(COALESCE("state", '')) LIKE $${pIdx + 1}
        )`);
        values.push(lang, langLike);
        pIdx += 2;
    }

    if (params.tier && params.tier !== "all") {
        if (params.tier === "nano") {
            conditions.push(`"followersCount" < 10000`);
        } else if (params.tier === "micro") {
            conditions.push(`"followersCount" >= 10000 AND "followersCount" < 50000`);
        } else if (params.tier === "mid") {
            conditions.push(`"followersCount" >= 50000 AND "followersCount" < 200000`);
        } else if (params.tier === "macro") {
            conditions.push(`"followersCount" >= 200000 AND "followersCount" < 1000000`);
        } else if (params.tier === "mega") {
            conditions.push(`"followersCount" >= 1000000`);
        }
    }

    if (params.intakeStatus && params.intakeStatus !== "all") {
        if (params.intakeStatus === "REFERRED") {
            conditions.push(`"discoveryKeyword" LIKE 'referral:%'`);
        } else {
            conditions.push(`"intakeStatus" = $${pIdx}`);
            values.push(params.intakeStatus);
            pIdx++;
        }
    }

    if (params.channel && params.channel !== "all") {
        if (params.channel === "dual") {
            conditions.push(`"primaryEmail" IS NOT NULL AND "phone" IS NOT NULL`);
        } else if (params.channel === "email") {
            conditions.push(`"primaryEmail" IS NOT NULL`);
        } else if (params.channel === "phone") {
            conditions.push(`"phone" IS NOT NULL`);
        }
    }

    if (params.verifiedIndianOnly && !isDirectUrlOrHandleSearch) {
        // Dynamic structural SQL filter (zero hardcoded brand lists):
        // 1. India signal true (re-verified across all 6,445 creators)
        // 2. Creator handle does not start with or equal the brandAffinity handle (@brand, @brandbrands, @letsbrand, @mybrand)
        // 3. Primary email is not a customer-support store address (care@, support@, customercare@)
        conditions.push(`COALESCE("indiaSignal", true) = true`);
        conditions.push(`(
            "brandAffinity" IS NULL
            OR length(regexp_replace(lower("brandAffinity"), '[^a-z0-9]', '', 'g')) < 3
            OR (
                strpos(regexp_replace(lower("handle"), '[^a-z0-9]', '', 'g'), regexp_replace(lower("brandAffinity"), '[^a-z0-9]', '', 'g')) <> 1
                AND strpos(regexp_replace(lower("handle"), '[^a-z0-9]', '', 'g'), 'lets' || regexp_replace(lower("brandAffinity"), '[^a-z0-9]', '', 'g')) <> 1
                AND strpos(regexp_replace(lower("handle"), '[^a-z0-9]', '', 'g'), 'my' || regexp_replace(lower("brandAffinity"), '[^a-z0-9]', '', 'g')) <> 1
                AND regexp_replace(lower(COALESCE("fullName", '')), '[^a-z0-9]', '', 'g') <> regexp_replace(lower("brandAffinity"), '[^a-z0-9]', '', 'g')
            )
        )`);
        conditions.push(`("primaryEmail" IS NULL OR lower("primaryEmail") !~ '^(care|customercare|support|help|orders|shop)@')`);
    }

    const whereClause = conditions.join(" AND ");

    // Sorting
    const sortDir = params.reverse ? "ASC" : "DESC";
    const orderClause = params.sortBy === "fullName" ? `"fullName" ${sortDir}`
        : params.sortBy === "createdAt" ? `"createdAt" ${sortDir}`
        : params.sortBy === "handle" ? `"handle" ${sortDir}`
        : params.sortBy === "followersCount" ? `"followersCount" ${sortDir}`
        : `"intakeCompletionPct" DESC, "followersCount" DESC`;

    const countSql = `SELECT count(*)::int as total FROM "Creator" WHERE ${whereClause}`;
    // Smart Outreach-Ready Projection: omits multi-hundred-KB raw base64 avatar blobs from list responses
    // and replaces them with the fast cached avatar endpoint URL.
    const dataSql = `
        SELECT 
            "id", "workspaceId", "externalCreatorId", "handle", "platform",
            "fullName", "profileUrl",
            CASE
                WHEN "avatarUrl" LIKE 'data:image/%' THEN ('/api/creator/intake/' || COALESCE("intakeToken", "id") || '/avatar')
                ELSE "avatarUrl"
            END AS "avatarUrl",
            "primaryEmail", "phone",
            "followersRaw", "followersCount", "followingCount", "postsCount",
            "publicBio", "category", "subGenres", "languages", "brandAffinity",
            "sampleReelUrl", "matchedKeywords", "isVerified", "indiaSignal",
            "intakeStatus", "intakeToken", "intakeCompletionPct", "lastIntakeActivityAt",
            "whatsappNumber", "pincode", "city", "state", "shippingAddress",
            "contentDescription", "collabType", "commercialRates", "mediaKitUrl",
            "managementType", "agencyName", "discoveryKeyword",
            "upiId", "panNumber", "activeCampaignId", "lastContactedAt",
            "instagramInsights", "igConnected", "igLastSyncedAt",
            "createdAt", "updatedAt"
        FROM "Creator"
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const [countRows, dataRows] = await Promise.all([
        query<{ total: number }>(countSql, values),
        query<any>(dataSql, [...values, limit, offset]),
    ]);

    let total = countRows?.[0]?.total || 0;
    let rows = dataRows || [];

    // Auto-Scout on Search: if the user searched an Instagram URL, Reel link, or @handle not yet in DB,
    // automatically scout it live, store it in PostgreSQL, and return it!
    if (total === 0 && offset === 0 && params.autoScoutIfEmpty !== false && params.search && params.search.trim()) {
        const raw = params.search.trim();
        const looksLikeUrlOrHandle =
            raw.includes("instagram.com/") ||
            raw.startsWith("@") ||
            (/^[a-zA-Z0-9_.]{3,30}$/.test(raw) && (raw.includes("_") || raw.includes(".")));
        if (looksLikeUrlOrHandle) {
            const scouted = await scoutAndAutoStoreCreator(raw, {
                workspaceId,
                category: params.category && params.category !== "all" ? params.category : undefined,
                brand: params.brand && params.brand !== "all" ? params.brand : undefined,
                query,
            }).catch(() => null);
            if (scouted && (scouted.followersCount > 0 || scouted.primaryEmail || scouted.publicBio)) {
                rows = [scouted];
                total = 1;
            }
        }
    }

    const appOrigin = (process.env.APP_URL || "https://tbmoutreach.tech").replace(/\/$/, "");
    let enrichedCreators = rows.map((r: any) => {
        const ig = (r.instagramInsights && typeof r.instagramInsights === "object") ? r.instagramInsights : {};
        const tok = r.intakeToken || r.id;
        const evalRes = evaluateIndiaAndCreatorAuthenticity({
            handle: r.handle,
            fullName: r.fullName,
            bio: r.publicBio,
            primaryEmail: r.primaryEmail,
            agencyEmail: r.agencyEmail ?? ig.agencyEmail,
            phone: r.whatsappNumber || r.phone,
            externalUrl: r.externalUrl ?? ig.externalUrl ?? ig.website,
            city: r.city,
            state: r.state,
            brand: r.brandAffinity,
            followersCount: Number(r.followersCount || 0),
            isIgVerified: Boolean(r.isVerified),
        });
        return {
            ...r,
            formLink: `${appOrigin}/creator/intake/${encodeURIComponent(tok)}`,
            engagementRatePct: r.engagementRatePct ?? ig.engagementRatePct ?? null,
            avgLikes: r.avgLikes ?? ig.avgLikes ?? null,
            avgComments: r.avgComments ?? ig.avgComments ?? null,
            avgReelViews: r.avgReelViews ?? ig.avgReelViews ?? null,
            scoutFitScore: r.scoutFitScore ?? ig.scoutFitScore ?? (r.primaryEmail ? 75 : 40),
            externalUrl: r.externalUrl ?? ig.externalUrl ?? ig.website ?? null,
            agencyEmail: r.agencyEmail ?? ig.agencyEmail ?? null,
            indiaConfidenceScore: evalRes.indiaConfidenceScore,
            indiaSignals: evalRes.indiaSignals,
            isIndianCreator: evalRes.isIndianCreator,
            isVerifiedHumanCreator: evalRes.isVerifiedHumanCreator,
            isBrandOrStoreAccount: evalRes.isBrandOrStoreAccount,
            authenticityScore: evalRes.authenticityScore,
            authenticitySignals: evalRes.authenticitySignals,
        };
    });

    if (params.verifiedIndianOnly && !isDirectUrlOrHandleSearch) {
        const staleNonIndianIds: string[] = [];
        enrichedCreators = enrichedCreators.filter((c: any) => {
            const valid = Boolean(c.isIndianCreator && !c.isBrandOrStoreAccount && c.indiaConfidenceScore >= 30);
            if (!valid && c.id) staleNonIndianIds.push(c.id);
            return valid;
        });
        if (staleNonIndianIds.length > 0) {
            query(`UPDATE "Creator" SET "indiaSignal" = false WHERE id = ANY($1::text[])`, [staleNonIndianIds]).catch(() => {});
        }
    }

    return {
        creators: enrichedCreators,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

const facetsCache = new Map<string, { data: any; expiresAt: number }>();

export async function getCreatorFacets(query: QueryFn = pgQuery, workspaceId = "org_troops_outreach") {
    const cached = facetsCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    const [catRows, tierRows, statusRows, countsRow, recentEnrichedRows, brandRows, subGenreRows, languageRows, cityRows, agencyRows] = await Promise.all([
        query<{
            category: string;
            count: number;
            emailReady: number;
            whatsappReady: number;
            enriched: number;
            contacted: number;
        }>(`
            SELECT 
                "category",
                count(*)::int as count,
                count(*) FILTER (WHERE "primaryEmail" IS NOT NULL)::int as "emailReady",
                count(*) FILTER (WHERE "phone" IS NOT NULL OR "whatsappNumber" IS NOT NULL)::int as "whatsappReady",
                count(*) FILTER (WHERE "intakeStatus" = 'COMPLETED' OR "intakeCompletionPct" >= 80)::int as "enriched",
                count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL OR "activeCampaignId" IS NOT NULL OR "intakeStatus" IN ('INVITATION_SENT', 'SENT', 'FORM_OPENED', 'VIEWED', 'PARTIALLY_FILLED', 'COMPLETED'))::int as "contacted"
            FROM "Creator"
            WHERE "workspaceId" = $1
            GROUP BY 1
            ORDER BY count DESC
        `, [workspaceId]),

        query<{ tier: string; count: number }>(`
            SELECT 
                CASE 
                    WHEN "followersCount" < 10000 THEN 'nano'
                    WHEN "followersCount" < 50000 THEN 'micro'
                    WHEN "followersCount" < 200000 THEN 'mid'
                    WHEN "followersCount" < 1000000 THEN 'macro'
                    ELSE 'mega'
                END as tier,
                count(*)::int as count
            FROM "Creator"
            WHERE "workspaceId" = $1
            GROUP BY 1
        `, [workspaceId]),

        query<{ status: string; count: number }>(`
            SELECT "intakeStatus" as status, count(*)::int as count
            FROM "Creator"
            WHERE "workspaceId" = $1
            GROUP BY 1
        `, [workspaceId]),

        query<any>(`
            SELECT 
                count(*)::int as total,
                count(*) FILTER (WHERE "primaryEmail" IS NOT NULL)::int as email_ready,
                count(*) FILTER (WHERE "phone" IS NOT NULL OR "whatsappNumber" IS NOT NULL)::int as whatsapp_ready,
                count(*) FILTER (WHERE "intakeStatus" = 'COMPLETED' OR "intakeCompletionPct" >= 80)::int as enriched,
                count(*) FILTER (WHERE "intakeStatus" IN ('FORM_OPENED', 'VIEWED', 'PARTIALLY_FILLED', 'COMPLETED'))::int as form_opened,
                count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL OR "activeCampaignId" IS NOT NULL OR "intakeStatus" IN ('INVITATION_SENT', 'SENT', 'FORM_OPENED', 'VIEWED', 'PARTIALLY_FILLED', 'COMPLETED'))::int as contacted,
                count(*) FILTER (WHERE "discoveryKeyword" LIKE 'referral:%')::int as referred_count,
                count(*) FILTER (WHERE "discoveryKeyword" LIKE 'referral:%' OR "discoveryKeyword" IN ('direct_submission', 'organic_referral'))::int as new_signups_count,
                count(*) FILTER (WHERE "igConnected" = true OR ("instagramInsights" IS NOT NULL AND "instagramInsights" <> '{}'::jsonb))::int as insights_ready_count
            FROM "Creator"
            WHERE "workspaceId" = $1
        `, [workspaceId]),

        query<any>(`
            SELECT "id", "handle", "fullName", "category", "followersRaw", "city", "state",
                   "primaryEmail", "whatsappNumber", "phone", "intakeStatus", "intakeCompletionPct",
                   "intakeToken", "discoveryKeyword", "lastIntakeActivityAt", "updatedAt"
            FROM "Creator"
            WHERE "workspaceId" = $1
              AND ("intakeStatus" = 'COMPLETED' OR "intakeCompletionPct" >= 80 OR "intakeStatus" IN ('FORM_OPENED', 'PARTIALLY_FILLED') OR "discoveryKeyword" LIKE 'referral:%')
            ORDER BY COALESCE("lastIntakeActivityAt", "updatedAt") DESC
            LIMIT 25
        `, [workspaceId]),

        query<{ brand: string; count: number }>(`
            SELECT "brandAffinity" as brand, count(*)::int as count
            FROM "Creator"
            WHERE "workspaceId" = $1 AND "brandAffinity" IS NOT NULL AND "brandAffinity" <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 30
        `, [workspaceId]).catch(() => []),

        query<{ subGenre: string; count: number }>(`
            SELECT sg as "subGenre", count(*)::int as count
            FROM "Creator", unnest(COALESCE("subGenres", ARRAY[]::text[])) as sg
            WHERE "workspaceId" = $1 AND sg IS NOT NULL AND trim(sg) <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 80
        `, [workspaceId]).catch(() => []),

        query<{ language: string; count: number }>(`
            SELECT lg as "language", count(*)::int as count
            FROM "Creator", unnest(COALESCE("languages", ARRAY[]::text[])) as lg
            WHERE "workspaceId" = $1 AND lg IS NOT NULL AND trim(lg) <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 30
        `, [workspaceId]).catch(() => []),

        query<{ city: string; count: number }>(`
            SELECT "city", count(*)::int as count
            FROM "Creator"
            WHERE "workspaceId" = $1 AND "city" IS NOT NULL AND trim("city") <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 40
        `, [workspaceId]).catch(() => []),

        query<{ agency: string; count: number }>(`
            SELECT "agencyName" as agency, count(*)::int as count
            FROM "Creator"
            WHERE "workspaceId" = $1 AND "agencyName" IS NOT NULL AND trim("agencyName") <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 30
        `, [workspaceId]).catch(() => []),
    ]);

    const total = countsRow?.[0]?.total || 0;
    const emailReady = countsRow?.[0]?.email_ready || 0;
    const whatsappReady = countsRow?.[0]?.whatsapp_ready || 0;
    const enriched = countsRow?.[0]?.enriched || 0;
    const formOpened = countsRow?.[0]?.form_opened || 0;
    const contacted = countsRow?.[0]?.contacted || 0;
    const referredCount = countsRow?.[0]?.referred_count || 0;
    const newSignupsCount = countsRow?.[0]?.new_signups_count || 0;
    const insightsReadyCount = countsRow?.[0]?.insights_ready_count || 0;

    const result = {
        total,
        withEmail: emailReady,
        withPhone: whatsappReady,
        enrichedCount: enriched,
        formOpenedCount: formOpened,
        contactedCount: contacted,
        referredCount,
        newSignupsCount,
        insightsReadyCount,
        categories: catRows,
        subGenres: subGenreRows || [],
        languages: languageRows || [],
        cities: cityRows || [],
        agencies: agencyRows || [],
        brands: brandRows || [],
        tiers: tierRows,
        statuses: statusRows,
        recentEnriched: recentEnrichedRows || [],
        overview: {
            total,
            emailReady,
            whatsappReady,
            enriched,
            formOpened,
            contacted,
            referredCount,
            newSignupsCount,
            insightsReadyCount,
        },
    };
    facetsCache.set(workspaceId, { data: result, expiresAt: Date.now() + 60_000 });
    return result;
}

export async function getCreatorById(query: QueryFn = pgQuery, id: string) {
    const rows = await query<any>(`SELECT * FROM "Creator" WHERE "id" = $1 LIMIT 1`, [id]);
    return rows?.[0] || null;
}

export async function getCreatorByIntakeToken(query: QueryFn = pgQuery, token: string) {
    const rows = await query<any>(`
        SELECT * FROM "Creator" 
        WHERE "intakeToken" = $1 OR "id" = $1 OR "externalCreatorId" = $1 OR lower("handle") = lower($1)
        LIMIT 1
    `, [token]);

    let creator = rows?.[0] || null;
    if (!creator) {
        // Fallback: check Lead table for CSV/manual creator leads enrolled in a campaign
        const leadRows = await query<any>(`
            SELECT id, email, "firstName", "lastName", "customData"
            FROM "Lead"
            WHERE id = $1
               OR ("customData"->>'intake_token') = $1
               OR ("customData"->>'intakeToken') = $1
               OR lower(replace(COALESCE("customData"->>'handle', "customData"->>'company', ''), '@', '')) = lower(replace($1, '@', ''))
            LIMIT 1
        `, [token]).catch(() => []);
        const lead = leadRows?.[0];
        if (lead) {
            const custom = (typeof lead.customData === "object" && lead.customData) ? lead.customData : {};
            const rawHandle = String(custom.handle || (String(custom.company || "").startsWith("@") ? custom.company : "") || token).replace(/^@/, "").trim();
            const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || rawHandle;
            creator = {
                id: lead.id,
                handle: rawHandle,
                platform: "instagram",
                fullName,
                primaryEmail: lead.email,
                category: custom.category || "Creator",
                followersRaw: custom.followers || "",
                profileUrl: custom.profile_url || `https://www.instagram.com/${rawHandle}/`,
                intakeToken: token,
                intakeStatus: "FORM_OPENED",
                intakeCompletionPct: 50,
            };
        }
    }
    if (creator) {
        // Real-time link open telemetry: mark as FORM_OPENED if not yet filled
        const needsOpenedUpdate = creator.intakeStatus === "SCRAPED_BASELINE" || creator.intakeStatus === "INVITATION_SENT";
        if (needsOpenedUpdate) {
            await query(`
                UPDATE "Creator"
                SET "intakeStatus" = 'FORM_OPENED',
                    "intakeCompletionPct" = GREATEST(COALESCE("intakeCompletionPct", 30), 50),
                    "lastIntakeActivityAt" = NOW(),
                    "outreachOpenedCount" = COALESCE("outreachOpenedCount", 0) + 1,
                    "updatedAt" = NOW()
                WHERE "id" = $1
            `, [creator.id]);
            creator.intakeStatus = "FORM_OPENED";
            creator.intakeCompletionPct = Math.max(creator.intakeCompletionPct || 0, 50);
        }

        // Live Campaign Enrollment Telemetry Bridge
        await query(`
            UPDATE "CreatorCampaignEnrollment"
            SET "status" = CASE WHEN "status" IN ('ENROLLED', 'INVITATION_SENT') THEN 'FORM_OPENED' ELSE "status" END,
                "openedAt" = COALESCE("openedAt", NOW()),
                "lastActiveAt" = NOW(),
                "updatedAt" = NOW()
            WHERE "creatorId" = $1
        `, [creator.id]).catch(() => {});

        // Recalculate campaign counter live
        await query(`
            UPDATE "CreatorCampaign" cc
            SET "formsOpenedCount" = (
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce
                WHERE cce."campaignId" = cc."id"
                  AND cce."status" IN ('FORM_OPENED', 'PARTIALLY_FILLED', 'COMPLETED')
            ),
            "updatedAt" = NOW()
            WHERE EXISTS (
                SELECT 1 FROM "CreatorCampaignEnrollment" cce
                WHERE cce."campaignId" = cc."id" AND cce."creatorId" = $1
            )
        `, [creator.id]).catch(() => {});
    }
    return creator;
}

export async function saveCreatorIntake(query: QueryFn = pgQuery, token: string, data: any) {
    let creator = await query<any>(`
        SELECT id, "intakeCompletionPct", "intakeStatus" FROM "Creator" 
        WHERE "intakeToken" = $1 OR "id" = $1 OR "externalCreatorId" = $1 OR lower("handle") = lower($1)
        LIMIT 1
    `, [token]);

    if (!creator?.[0]) {
        const cleanHandle = String(data.handle || token || "creator").replace(/^@/, "").trim().toLowerCase();
        const cleanName = String(data.fullName || cleanHandle).trim();
        const cleanEmail = (data.primaryEmail || data.email) ? String(data.primaryEmail || data.email).trim().toLowerCase() : null;
        const genToken = token && token !== "public" && token !== "new" ? token : `tok_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const newId = `cr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const primaryCat = Array.isArray(data.subGenres) && data.subGenres[0] ? data.subGenres[0] : (data.category || "General");

        const inserted = await query<any>(`
            INSERT INTO "Creator" (
                "id", "workspaceId", "handle", "platform", "fullName", "profileUrl", 
                "primaryEmail", "category", "intakeToken", "intakeStatus", "intakeCompletionPct", "createdAt", "updatedAt"
            ) VALUES (
                $1, 'org_troops_outreach', $2, 'instagram', $3, $4, 
                $5, $6, $7, 'COMPLETED', 100, NOW(), NOW()
            )
            ON CONFLICT ("handle", "workspaceId") DO UPDATE SET "updatedAt" = NOW()
            RETURNING id, "intakeCompletionPct", "intakeStatus"
        `, [
            newId,
            cleanHandle,
            cleanName,
            data.profileUrl || `https://www.instagram.com/${cleanHandle}/`,
            cleanEmail,
            primaryCat,
            genToken
        ]).catch(() => null);

        if (inserted?.[0]) {
            creator = inserted;
        } else {
            return null;
        }
    }

    const cId = creator[0].id;
    const currentStatus = creator[0].intakeStatus;

    // Build smart update
    const sets: string[] = [];
    const values: any[] = [cId];
    let pIdx = 2;

    if (data.fullName !== undefined) {
        sets.push(`"fullName" = $${pIdx++}`);
        values.push(String(data.fullName).trim());
    }
    if (data.handle !== undefined) {
        sets.push(`"handle" = $${pIdx++}`);
        values.push(String(data.handle).trim());
    }
    if (data.primaryEmail !== undefined || data.email !== undefined) {
        const em = String(data.primaryEmail || data.email || "").trim().toLowerCase();
        if (em) {
            sets.push(`"primaryEmail" = $${pIdx++}`);
            values.push(em);
        }
    }
    if (data.whatsappNumber !== undefined) {
        sets.push(`"whatsappNumber" = $${pIdx++}`);
        values.push(String(data.whatsappNumber).trim());
    }
    if (data.pincode !== undefined) {
        sets.push(`"pincode" = $${pIdx++}`);
        values.push(String(data.pincode).trim());
    }
    if (data.city !== undefined) {
        sets.push(`"city" = $${pIdx++}`);
        values.push(String(data.city).trim());
    }
    if (data.state !== undefined) {
        sets.push(`"state" = $${pIdx++}`);
        values.push(String(data.state).trim());
    }
    if (data.shippingAddress !== undefined) {
        sets.push(`"shippingAddress" = $${pIdx++}`);
        values.push(String(data.shippingAddress).trim());
    }
    if (data.contentDescription !== undefined) {
        sets.push(`"contentDescription" = $${pIdx++}`);
        values.push(String(data.contentDescription).trim());
    }
    if (data.category !== undefined) {
        sets.push(`"category" = $${pIdx++}`);
        values.push(String(data.category).trim());
    }
    if (Array.isArray(data.subGenres)) {
        sets.push(`"subGenres" = $${pIdx++}`);
        values.push(data.subGenres);
    }
    if (Array.isArray(data.languages)) {
        sets.push(`"languages" = $${pIdx++}`);
        values.push(data.languages);
    }
    if (data.collabType !== undefined) {
        sets.push(`"collabType" = $${pIdx++}`);
        values.push(data.collabType);
    }
    if (data.commercialRates !== undefined) {
        sets.push(`"commercialRates" = $${pIdx++}::jsonb`);
        values.push(JSON.stringify(data.commercialRates));
    }
    if (data.upiId !== undefined) {
        sets.push(`"upiId" = $${pIdx++}`);
        values.push(String(data.upiId).trim());
    }
    if (data.managementType !== undefined) {
        sets.push(`"managementType" = $${pIdx++}`);
        values.push(String(data.managementType).trim());
    }
    if (data.agencyName !== undefined || data.managerName !== undefined) {
        const agName = String(data.agencyName || data.managerName || "").trim();
        if (agName) {
            sets.push(`"agencyName" = $${pIdx++}`);
            values.push(agName);
        }
    }
    if (data.referredBy) {
        sets.push(`"discoveryKeyword" = COALESCE("discoveryKeyword", $${pIdx++})`);
        values.push(`referral:${String(data.referredBy).trim()}`);
    }
    if (data.instagramInsights && typeof data.instagramInsights === "object") {
        sets.push(`"instagramInsights" = $${pIdx++}::jsonb`);
        values.push(JSON.stringify(data.instagramInsights));
    }
    if (data.igConnected === true) {
        sets.push(`"igConnected" = true`);
        sets.push(`"igLastSyncedAt" = NOW()`);
    }

    // Determine step completed & granular real-time progress
    let step = Number(data.step || data.currentStep || 0);
    let completion = 50; // Baseline: link opened
    if (data.whatsappNumber) completion += 15; // 65%
    if (data.pincode || data.city) {
        completion += 10; // 75% (Step 1 complete)
        step = Math.max(step, 1);
    }
    if ((Array.isArray(data.languages) && data.languages.length > 0) || (Array.isArray(data.subGenres) && data.subGenres.length > 0)) {
        completion += 10; // 85% (Step 2 in progress)
        step = Math.max(step, 2);
    }
    if (data.contentDescription || data.commercialRates) {
        completion += 10; // 95%
    }
    if (data.isFinal === true || data.finalSubmit === true) {
        completion = 100;
        step = 2;
    }
    completion = Math.min(completion, 100);

    const isFinal = data.isFinal === true || data.finalSubmit === true || currentStatus === "COMPLETED";
    const newStatus = isFinal ? "COMPLETED" : "PARTIALLY_FILLED";

    sets.push(`"intakeCompletionPct" = GREATEST("intakeCompletionPct", $${pIdx++})`);
    values.push(completion);

    sets.push(`"intakeStatus" = $${pIdx++}`);
    values.push(newStatus);

    sets.push(`"lastIntakeStepCompleted" = GREATEST(COALESCE("lastIntakeStepCompleted", 0), $${pIdx++})`);
    values.push(step);

    sets.push(`"lastIntakeActivityAt" = NOW()`);
    sets.push(`"updatedAt" = NOW()`);

    const updateSql = `
        UPDATE "Creator"
        SET ${sets.join(", ")}
        WHERE "id" = $1
        RETURNING *
    `;

    const updated = await query<any>(updateSql, values);
    const updatedCreator = updated?.[0] || null;

    // Real-Time CreatorCampaignEnrollment Telemetry Bridge
    await query(`
        UPDATE "CreatorCampaignEnrollment"
        SET "status" = CASE WHEN $2::boolean THEN 'COMPLETED' ELSE 'PARTIALLY_FILLED' END,
            "completionPct" = GREATEST("completionPct", $3::int),
            "stepCompleted" = GREATEST(COALESCE("stepCompleted", 0), $4::int),
            "firstFilledAt" = COALESCE("firstFilledAt", NOW()),
            "completedAt" = CASE WHEN $2::boolean THEN NOW() ELSE "completedAt" END,
            "lastActiveAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "creatorId" = $1
    `, [cId, isFinal, completion, step]).catch(() => {});

    // Live update campaign-level funnel counters
    await query(`
        UPDATE "CreatorCampaign" cc
        SET "formsOpenedCount" = (
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce
                WHERE cce."campaignId" = cc.id AND cce."status" IN ('FORM_OPENED', 'PARTIALLY_FILLED', 'COMPLETED')
            ),
            "partiallyFilledCount" = (
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce
                WHERE cce."campaignId" = cc.id AND cce."status" IN ('PARTIALLY_FILLED', 'COMPLETED')
            ),
            "completedCount" = (
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce
                WHERE cce."campaignId" = cc.id AND cce."status" = 'COMPLETED'
            ),
            "updatedAt" = NOW()
        WHERE EXISTS (
            SELECT 1 FROM "CreatorCampaignEnrollment" cce
            WHERE cce."campaignId" = cc.id AND cce."creatorId" = $1
        )
    `, [cId]).catch(() => {});

    return updatedCreator;
}

export async function getCreatorTemplates(query: QueryFn = pgQuery, workspaceId = "org_troops_outreach") {
    const defaultBody = `<p>Hi {{firstName}},</p><p>Hope you're doing well!</p><p>We're reaching out from <strong>The Bored Monkey</strong> to connect with creators like you and explore potential brand collaboration opportunities.</p><p>We'd love to have your details in our creator network so we can reach out whenever a campaign matches your content and audience. We believe in keeping communication meaningful, so you won't receive unnecessary or irrelevant messages from us.</p><p>No spam, no random promotions just genuine collaboration opportunities that are relevant to you.</p><p>If you're interested, please share your details here: <a href="{{form_link}}" target="_blank" style="color: #ea580c; font-weight: 700; text-decoration: underline;">Link</a></p><p>Looking forward to connecting!</p><p>Best,<br/>Team The Bored Monkey</p>`;
    try {
        await query(`
            INSERT INTO "CreatorTemplate" ("id", "workspaceId", "name", "subject", "bodyHtml", "category", "orderIndex")
            VALUES ($1, $2, $3, $4, $5, 'COLLABORATION', -1)
            ON CONFLICT ("id") DO UPDATE SET
                "subject" = EXCLUDED."subject",
                "bodyHtml" = EXCLUDED."bodyHtml"
        `, [
            "tpl_crt_network_invite",
            workspaceId,
            "The Bored Monkey — Creator Network Invitation",
            "Collaboration Opportunity with The Bored Monkey x {{firstName}}",
            defaultBody,
        ]);
    } catch {}

    const rows = await query<any>(`
        SELECT * FROM "CreatorTemplate"
        WHERE "workspaceId" = $1
        ORDER BY "orderIndex" ASC, "createdAt" ASC
    `, [workspaceId]);

    return (rows || []).map((r: any) => ({
        ...r,
        subject: String(r.subject || "")
            .replace(/\{\{\.?CreatorName\}\}/gi, "{{firstName}}")
            .replace(/\{\{\.?Handle\}\}/gi, "{{handle}}"),
        bodyHtml: String(r.bodyHtml || "")
            .replace(/\{\{\.?CreatorName\}\}/gi, "{{firstName}}")
            .replace(/\{\{\.?Handle\}\}/gi, "{{handle}}")
            .replace(/\{\{\.?Category\}\}/gi, "{{category}}")
            .replace(/\{\{\.?Followers\}\}/gi, "{{followers}}")
            .replace(/\{\{\s*(\.?IntakeFormUrl|intake_link)\s*\}\}/gi, "{{form_link}}"),
    }));
}

export async function saveCreatorTemplate(query: QueryFn = pgQuery, data: any) {
    const id = data.id || `tpl_crt_${Date.now()}`;
    const workspaceId = data.workspaceId || "org_troops_outreach";

    const rows = await query<any>(`
        INSERT INTO "CreatorTemplate" ("id", "workspaceId", "name", "subject", "bodyHtml", "category", "orderIndex")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "subject" = EXCLUDED."subject",
            "bodyHtml" = EXCLUDED."bodyHtml",
            "category" = EXCLUDED."category",
            "orderIndex" = EXCLUDED."orderIndex",
            "updatedAt" = NOW()
        RETURNING *
    `, [id, workspaceId, data.name, data.subject, data.bodyHtml, data.category || "COLLABORATION", data.orderIndex || 0]);

    return rows?.[0] || null;
}

export async function deleteCreatorTemplate(query: QueryFn = pgQuery, id: string) {
    await query(`DELETE FROM "CreatorTemplate" WHERE "id" = $1`, [id]);
    return { success: true };
}

