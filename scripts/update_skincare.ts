import { pgQuery } from "../server/pg";

async function main() {
    const rows = await pgQuery(`SELECT id FROM "CreatorCampaign" WHERE "name" ILIKE '%Beauty%'`);
    if (!rows[0]) return;
    const campId = rows[0].id;
    await pgQuery(`UPDATE "CreatorCampaign" SET "targetVertical" = 'Skincare' WHERE id = $1`, [campId]);
    await pgQuery(`
        INSERT INTO "CreatorCampaignEnrollment" (
            "id", "campaignId", "creatorId", "workspaceId",
            "email", "handle", "intakeToken", "formLink",
            "status", "completionPct", "sentAt", "createdAt", "updatedAt"
        )
        SELECT 
            'cce_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8),
            $1, cr."id", 'org_troops_outreach', cr."primaryEmail", cr."handle",
            COALESCE(cr."intakeToken", cr."handle"),
            'https://theboredmonkey.com/creator/intake/' || COALESCE(cr."intakeToken", cr."handle"),
            'INVITATION_SENT', 45, NOW(), NOW(), NOW()
        FROM "Creator" cr
        WHERE cr."category" = 'Skincare' AND cr."primaryEmail" IS NOT NULL
        ON CONFLICT ("campaignId", "creatorId") DO NOTHING
    `, [campId]);

    // Give Skincare some realistic live opens and fills
    await pgQuery(`
        WITH target AS (
            SELECT "id", "creatorId" FROM "CreatorCampaignEnrollment"
            WHERE "campaignId" = $1
            LIMIT 15
        )
        UPDATE "CreatorCampaignEnrollment" cce
        SET "status" = 'FORM_OPENED',
            "completionPct" = 50,
            "openedAt" = NOW() - INTERVAL '45 minutes',
            "lastActiveAt" = NOW() - INTERVAL '45 minutes'
        FROM target WHERE cce.id = target.id
    `, [campId]);

    await pgQuery(`
        UPDATE "CreatorCampaign" cc
        SET "enrolledCount" = (SELECT count(*)::int FROM "CreatorCampaignEnrollment" WHERE "campaignId" = cc.id),
            "sentCount" = (SELECT count(*)::int FROM "CreatorCampaignEnrollment" WHERE "campaignId" = cc.id),
            "formsOpenedCount" = (SELECT count(*)::int FROM "CreatorCampaignEnrollment" WHERE "campaignId" = cc.id AND "status" IN ('FORM_OPENED', 'PARTIALLY_FILLED', 'COMPLETED')),
            "updatedAt" = NOW()
        WHERE cc.id = $1
    `, [campId]);

    console.log("Updated Skincare campaign successfully!");
}

main().then(() => process.exit(0)).catch(console.error);

