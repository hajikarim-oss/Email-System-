import type { QueryFn } from "./types";
import { pgQuery } from "./pg";

export interface CreatorSearchParams {
    workspaceId?: string;
    search?: string;
    category?: string;
    tier?: "all" | "nano" | "micro" | "mid" | "macro" | "mega";
    intakeStatus?: "all" | "SCRAPED_BASELINE" | "INVITATION_SENT" | "FORM_OPENED" | "PARTIALLY_FILLED" | "COMPLETED";
    channel?: "all" | "email" | "phone" | "dual";
    sortBy?: "followersCount" | "fullName" | "createdAt" | "intakeCompletionPct" | "handle";
    reverse?: boolean;
    limit?: number;
    offset?: number;
}

export async function searchCreators(query: QueryFn = pgQuery, params: CreatorSearchParams) {
    const workspaceId = params.workspaceId || "org_troops_outreach";
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    const conditions: string[] = [`"workspaceId" = $1`];
    const values: any[] = [workspaceId];
    let pIdx = 2;

    if (params.search && params.search.trim()) {
        const s = `%${params.search.trim().toLowerCase()}%`;
        conditions.push(`(lower("handle") LIKE $${pIdx} OR lower("fullName") LIKE $${pIdx} OR lower("publicBio") LIKE $${pIdx} OR lower("primaryEmail") LIKE $${pIdx})`);
        values.push(s);
        pIdx++;
    }

    if (params.category && params.category !== "all" && params.category !== "") {
        conditions.push(`("category" = $${pIdx} OR $${pIdx} = ANY("subGenres"))`);
        values.push(params.category);
        pIdx++;
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
        conditions.push(`"intakeStatus" = $${pIdx}`);
        values.push(params.intakeStatus);
        pIdx++;
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

    const whereClause = conditions.join(" AND ");

    // Sorting
    const sortDir = params.reverse ? "ASC" : "DESC";
    const orderClause = params.sortBy === "fullName" ? `"fullName" ${sortDir}`
        : params.sortBy === "createdAt" ? `"createdAt" ${sortDir}`
        : params.sortBy === "handle" ? `"handle" ${sortDir}`
        : params.sortBy === "followersCount" ? `"followersCount" ${sortDir}`
        : `"intakeCompletionPct" DESC, "followersCount" DESC`;

    const countSql = `SELECT count(*)::int as total FROM "Creator" WHERE ${whereClause}`;
    const dataSql = `
        SELECT 
            "id", "workspaceId", "externalCreatorId", "handle", "platform",
            "fullName", "profileUrl", "avatarUrl", "primaryEmail", "phone",
            "followersRaw", "followersCount", "followingCount", "postsCount",
            "publicBio", "category", "subGenres", "languages", "brandAffinity",
            "sampleReelUrl", "matchedKeywords", "isVerified", "indiaSignal",
            "intakeStatus", "intakeToken", "intakeCompletionPct", "lastIntakeActivityAt",
            "whatsappNumber", "pincode", "city", "state", "shippingAddress",
            "contentDescription", "collabType", "commercialRates", "mediaKitUrl",
            "managementType", "agencyName",
            "upiId", "panNumber", "activeCampaignId", "lastContactedAt", "createdAt", "updatedAt"
        FROM "Creator"
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const [countRows, dataRows] = await Promise.all([
        query<{ total: number }>(countSql, values),
        query<any>(dataSql, [...values, limit, offset]),
    ]);

    const total = countRows?.[0]?.total || 0;

    return {
        creators: dataRows,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getCreatorFacets(query: QueryFn = pgQuery, workspaceId = "org_troops_outreach") {
    const [catRows, tierRows, statusRows, countsRow] = await Promise.all([
        query<{ category: string; count: number }>(`
            SELECT "category", count(*)::int as count
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
                count(*) FILTER (WHERE "intakeStatus" = 'COMPLETED' OR "intakeCompletionPct" >= 80)::int as enriched
            FROM "Creator"
            WHERE "workspaceId" = $1
        `, [workspaceId]),
    ]);

    return {
        categories: catRows,
        tiers: tierRows,
        statuses: statusRows,
        overview: {
            total: countsRow?.[0]?.total || 0,
            emailReady: countsRow?.[0]?.email_ready || 0,
            whatsappReady: countsRow?.[0]?.whatsapp_ready || 0,
            enriched: countsRow?.[0]?.enriched || 0,
        },
    };
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

    const creator = rows?.[0] || null;
    if (creator) {
        // Mark as FORM_OPENED if baseline or invited
        if (creator.intakeStatus === "SCRAPED_BASELINE" || creator.intakeStatus === "INVITATION_SENT") {
            await query(`
                UPDATE "Creator"
                SET "intakeStatus" = 'FORM_OPENED',
                    "lastIntakeActivityAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE "id" = $1
            `, [creator.id]);
            creator.intakeStatus = "FORM_OPENED";
        }
    }
    return creator;
}

export async function saveCreatorIntake(query: QueryFn = pgQuery, token: string, data: any) {
    const creator = await query<any>(`
        SELECT id, "intakeCompletionPct", "intakeStatus" FROM "Creator" 
        WHERE "intakeToken" = $1 OR "id" = $1 OR "externalCreatorId" = $1 OR lower("handle") = lower($1)
        LIMIT 1
    `, [token]);

    if (!creator?.[0]) return null;
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
    if (data.agencyName !== undefined) {
        sets.push(`"agencyName" = $${pIdx++}`);
        values.push(String(data.agencyName).trim());
    }

    // Determine completion percentage
    let completion = 35; // 35% baseline (verified handle + profile)
    if (data.whatsappNumber) completion += 20;
    if (data.pincode) completion += 15;
    if (data.city || data.shippingAddress) completion += 10;
    if (Array.isArray(data.languages) && data.languages.length > 0) completion += 5;
    if ((Array.isArray(data.subGenres) && data.subGenres.length > 0) || data.category) completion += 5;
    if (data.contentDescription) completion += 10;
    if (data.isFinal === true) completion = 100;
    completion = Math.min(completion, 100);

    const isFinal = data.isFinal === true || currentStatus === "COMPLETED";
    const newStatus = isFinal ? "COMPLETED" : "PARTIALLY_FILLED";

    sets.push(`"intakeCompletionPct" = GREATEST("intakeCompletionPct", $${pIdx++})`);
    values.push(completion);

    sets.push(`"intakeStatus" = $${pIdx++}`);
    values.push(newStatus);

    sets.push(`"lastIntakeActivityAt" = NOW()`);
    sets.push(`"updatedAt" = NOW()`);

    const updateSql = `
        UPDATE "Creator"
        SET ${sets.join(", ")}
        WHERE "id" = $1
        RETURNING *
    `;

    const updated = await query<any>(updateSql, values);
    return updated?.[0] || null;
}

export async function getCreatorTemplates(query: QueryFn = pgQuery, workspaceId = "org_troops_outreach") {
    return query<any>(`
        SELECT * FROM "CreatorTemplate"
        WHERE "workspaceId" = $1
        ORDER BY "orderIndex" ASC, "createdAt" ASC
    `, [workspaceId]);
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

