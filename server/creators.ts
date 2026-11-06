import type { QueryFn } from "./types";
import { pgQuery } from "./pg";

export interface CreatorSearchParams {
    workspaceId?: string;
    search?: string;
    category?: string;
    tier?: "all" | "nano" | "micro" | "mid" | "macro" | "mega";
    intakeStatus?: "all" | "SCRAPED_BASELINE" | "INVITATION_SENT" | "FORM_OPENED" | "PARTIALLY_FILLED" | "COMPLETED" | "REFERRED";
    channel?: "all" | "email" | "phone" | "dual";
    source?: "all" | "referred" | "new" | "organic" | "scouted";
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
        conditions.push(`(lower("handle") LIKE $${pIdx} OR lower("fullName") LIKE $${pIdx} OR lower("publicBio") LIKE $${pIdx} OR lower("primaryEmail") LIKE $${pIdx} OR lower("discoveryKeyword") LIKE $${pIdx})`);
        values.push(s);
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
            "managementType", "agencyName", "discoveryKeyword",
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
    const [catRows, tierRows, statusRows, countsRow, recentEnrichedRows] = await Promise.all([
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
                count(*) FILTER (WHERE "discoveryKeyword" LIKE 'referral:%' OR "discoveryKeyword" IN ('direct_submission', 'organic_referral'))::int as new_signups_count
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
    ]);

    const total = countsRow?.[0]?.total || 0;
    const emailReady = countsRow?.[0]?.email_ready || 0;
    const whatsappReady = countsRow?.[0]?.whatsapp_ready || 0;
    const enriched = countsRow?.[0]?.enriched || 0;
    const formOpened = countsRow?.[0]?.form_opened || 0;
    const contacted = countsRow?.[0]?.contacted || 0;
    const referredCount = countsRow?.[0]?.referred_count || 0;
    const newSignupsCount = countsRow?.[0]?.new_signups_count || 0;

    return {
        total,
        withEmail: emailReady,
        withPhone: whatsappReady,
        enrichedCount: enriched,
        formOpenedCount: formOpened,
        contactedCount: contacted,
        referredCount,
        newSignupsCount,
        categories: catRows,
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

