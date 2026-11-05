import { pgQuery } from "./pg";
import crypto from "crypto";

type QueryFn = typeof pgQuery;

export interface CreatorCampaignItem {
    id: string;
    workspaceId: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";
    targetVertical?: string;
    targetTiers?: string[];
    targetFollowersMin?: number;
    targetFollowersMax?: number;
    templateId?: string;
    subject: string;
    bodyHtml: string;
    formLinkPattern: string;
    enrolledCount: number;
    sentCount: number;
    formsOpenedCount: number;
    partiallyFilledCount: number;
    completedCount: number;
    smartleadCampaignId?: number;
    smartleadStatus?: string;
    metadata?: any;
    startedAt?: string;
    finishedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export async function listCreatorCampaigns(query: QueryFn = pgQuery, workspaceId = "org_troops_outreach") {
    const rows = await query<any>(`
        SELECT 
            cc.*,
            COALESCE((
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce 
                WHERE cce."campaignId" = cc.id
            ), cc."enrolledCount") AS "enrolledCount",
            COALESCE((
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce 
                WHERE cce."campaignId" = cc.id 
                  AND cce."status" IN ('INVITATION_SENT', 'FORM_OPENED', 'PARTIALLY_FILLED', 'COMPLETED')
            ), cc."sentCount") AS "sentCount",
            COALESCE((
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce 
                WHERE cce."campaignId" = cc.id 
                  AND cce."status" IN ('FORM_OPENED', 'PARTIALLY_FILLED', 'COMPLETED')
            ), cc."formsOpenedCount") AS "formsOpenedCount",
            COALESCE((
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce 
                WHERE cce."campaignId" = cc.id 
                  AND cce."status" IN ('PARTIALLY_FILLED', 'COMPLETED')
            ), cc."partiallyFilledCount") AS "partiallyFilledCount",
            COALESCE((
                SELECT count(*)::int FROM "CreatorCampaignEnrollment" cce 
                WHERE cce."campaignId" = cc.id 
                  AND cce."status" = 'COMPLETED'
            ), cc."completedCount") AS "completedCount"
        FROM "CreatorCampaign" cc
        WHERE cc."workspaceId" = $1
        ORDER BY cc."createdAt" DESC
    `, [workspaceId]);

    return rows.map((r: any) => ({
        ...r,
        openRate: r.sentCount > 0 ? Number(((r.formsOpenedCount / r.sentCount) * 100).toFixed(1)) : 0,
        fillRate: r.formsOpenedCount > 0 ? Number(((r.partiallyFilledCount / r.formsOpenedCount) * 100).toFixed(1)) : 0,
        completeRate: r.sentCount > 0 ? Number(((r.completedCount / r.sentCount) * 100).toFixed(1)) : 0,
    }));
}

export async function getCreatorCampaignById(query: QueryFn = pgQuery, campaignId: string) {
    const rows = await query<any>(`
        SELECT * FROM "CreatorCampaign" WHERE "id" = $1 LIMIT 1
    `, [campaignId]);

    if (!rows?.[0]) return null;
    const campaign = rows[0];

    // Fetch enrollments with creator profile details
    const enrollments = await query<any>(`
        SELECT 
            cce.*,
            cr."fullName",
            cr."avatarUrl",
            cr."category",
            cr."followersCount",
            cr."followersRaw",
            cr."phone",
            cr."whatsappNumber",
            cr."city"
        FROM "CreatorCampaignEnrollment" cce
        JOIN "Creator" cr ON cr."id" = cce."creatorId"
        WHERE cce."campaignId" = $1
        ORDER BY cce."updatedAt" DESC
        LIMIT 200
    `, [campaignId]);

    return {
        ...campaign,
        enrollments,
    };
}

export async function createCreatorCampaign(query: QueryFn = pgQuery, data: {
    workspaceId?: string;
    name: string;
    targetVertical?: string;
    targetTiers?: string[];
    templateId?: string;
    subject?: string;
    bodyHtml?: string;
    creatorIds?: string[];
}) {
    const id = `cc_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const ws = data.workspaceId || "org_troops_outreach";
    const name = data.name.trim();
    const subject = data.subject || "Collaboration with The Bored Monkey";
    const bodyHtml = data.bodyHtml || "Hi {{firstName}}, we would love to collaborate! Fill in your profile here: {{form_link}}";
    const targetVertical = data.targetVertical || null;
    const targetTiers = data.targetTiers || [];

    await query(`
        INSERT INTO "CreatorCampaign" (
            "id", "workspaceId", "name", "status", "targetVertical", "targetTiers",
            "templateId", "subject", "bodyHtml", "startedAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
    `, [id, ws, name, targetVertical, targetTiers, data.templateId || null, subject, bodyHtml]);

    // Batch enroll creators directly in SQL for instant sub-second execution
    if (Array.isArray(data.creatorIds) && data.creatorIds.length > 0) {
        await query(`
            INSERT INTO "CreatorCampaignEnrollment" (
                "id", "campaignId", "creatorId", "workspaceId",
                "email", "handle", "intakeToken", "formLink",
                "status", "completionPct", "sentAt", "createdAt", "updatedAt"
            )
            SELECT 
                'cce_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8),
                $1,
                cr."id",
                $2,
                cr."primaryEmail",
                cr."handle",
                COALESCE(cr."intakeToken", cr."handle"),
                'https://theboredmonkey.com/creator/intake/' || COALESCE(cr."intakeToken", cr."handle"),
                'INVITATION_SENT',
                45,
                NOW(),
                NOW(),
                NOW()
            FROM "Creator" cr
            WHERE cr."id" = ANY($3::text[])
            ON CONFLICT ("campaignId", "creatorId") DO NOTHING
        `, [id, ws, data.creatorIds]);

        await query(`
            UPDATE "Creator"
            SET "activeCampaignId" = $1,
                "lastContactedAt" = NOW(),
                "intakeStatus" = CASE WHEN "intakeStatus" = 'SCRAPED_BASELINE' THEN 'INVITATION_SENT' ELSE "intakeStatus" END,
                "intakeCompletionPct" = GREATEST(COALESCE("intakeCompletionPct", 30), 45),
                "outreachSentCount" = COALESCE("outreachSentCount", 0) + 1,
                "updatedAt" = NOW()
            WHERE "id" = ANY($2::text[])
        `, [id, data.creatorIds]);
    } else if (targetVertical) {
        await query(`
            INSERT INTO "CreatorCampaignEnrollment" (
                "id", "campaignId", "creatorId", "workspaceId",
                "email", "handle", "intakeToken", "formLink",
                "status", "completionPct", "sentAt", "createdAt", "updatedAt"
            )
            SELECT 
                'cce_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8),
                $1,
                cr."id",
                $2,
                cr."primaryEmail",
                cr."handle",
                COALESCE(cr."intakeToken", cr."handle"),
                'https://theboredmonkey.com/creator/intake/' || COALESCE(cr."intakeToken", cr."handle"),
                'INVITATION_SENT',
                45,
                NOW(),
                NOW(),
                NOW()
            FROM "Creator" cr
            WHERE cr."workspaceId" = $2 AND cr."category" = $3 AND cr."primaryEmail" IS NOT NULL
            LIMIT 500
            ON CONFLICT ("campaignId", "creatorId") DO NOTHING
        `, [id, ws, targetVertical]);

        await query(`
            UPDATE "Creator"
            SET "activeCampaignId" = $1,
                "lastContactedAt" = NOW(),
                "intakeStatus" = CASE WHEN "intakeStatus" = 'SCRAPED_BASELINE' THEN 'INVITATION_SENT' ELSE "intakeStatus" END,
                "intakeCompletionPct" = GREATEST(COALESCE("intakeCompletionPct", 30), 45),
                "outreachSentCount" = COALESCE("outreachSentCount", 0) + 1,
                "updatedAt" = NOW()
            WHERE "id" IN (
                SELECT "creatorId" FROM "CreatorCampaignEnrollment" WHERE "campaignId" = $1
            )
        `, [id]);
    }

    // Refresh enrolled & sent count
    await query(`
        UPDATE "CreatorCampaign" cc
        SET "enrolledCount" = (SELECT count(*)::int FROM "CreatorCampaignEnrollment" WHERE "campaignId" = cc.id),
            "sentCount" = (SELECT count(*)::int FROM "CreatorCampaignEnrollment" WHERE "campaignId" = cc.id),
            "updatedAt" = NOW()
        WHERE cc.id = $1
    `, [id]);

    return await getCreatorCampaignById(query, id);
}

export async function updateCreatorCampaign(query: QueryFn = pgQuery, campaignId: string, updates: Partial<CreatorCampaignItem>) {
    const sets: string[] = [];
    const vals: any[] = [campaignId];
    let idx = 2;

    if (updates.name !== undefined) {
        sets.push(`"name" = $${idx++}`);
        vals.push(updates.name);
    }
    if (updates.status !== undefined) {
        sets.push(`"status" = $${idx++}`);
        vals.push(updates.status);
    }
    if (updates.subject !== undefined) {
        sets.push(`"subject" = $${idx++}`);
        vals.push(updates.subject);
    }
    if (updates.bodyHtml !== undefined) {
        sets.push(`"bodyHtml" = $${idx++}`);
        vals.push(updates.bodyHtml);
    }

    if (sets.length === 0) return null;
    sets.push(`"updatedAt" = NOW()`);

    await query(`
        UPDATE "CreatorCampaign"
        SET ${sets.join(", ")}
        WHERE "id" = $1
    `, vals);

    return await getCreatorCampaignById(query, campaignId);
}

export async function deleteCreatorCampaign(query: QueryFn = pgQuery, campaignId: string) {
    await query(`DELETE FROM "CreatorCampaignEnrollment" WHERE "campaignId" = $1`, [campaignId]);
    await query(`DELETE FROM "CreatorCampaign" WHERE "id" = $1`, [campaignId]);
    return true;
}
