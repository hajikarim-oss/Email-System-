import { pgQuery } from "../server/pg";
import { createCreatorCampaign } from "../server/creator_campaigns";

async function seed() {
    console.log("[Seed] Cleaning and seeding CreatorCampaigns...");
    await pgQuery(`DELETE FROM "CreatorCampaign"`);

    console.log("[Seed] Creating 3 realistic Creator Campaigns linked to real Indian creators...");

    // 1. Tech & Reviewers Campaign
    const techCampaign = await createCreatorCampaign(pgQuery, {
        name: "Top Tech & Gadget Creators Q4 Collab",
        targetVertical: "Tech",
        subject: "Brand Collaboration Proposal: Tech Showcase with The Bored Monkey",
        bodyHtml: `<p>Hi {{firstName}},</p><p>We love your tech reviews and gadget breakdowns on @{{handle}}!</p><p>We are coordinating sponsored product integrations and dedicated reels for India's leading consumer tech brands. We'd love to partner with you for upcoming launches.</p><p>Please verify your profile and collaboration details here: <a href="{{form_link}}">{{form_link}}</a></p><p>Looking forward to working together!</p><p>Best,<br/>Monu Kumar<br/>The Bored Monkey</p>`,
    });
    console.log("[Seed] Created Tech Campaign:", techCampaign?.id, "Enrolled:", techCampaign?.enrolledCount);

    // 2. Skincare & Beauty Creators Campaign
    const beautyCampaign = await createCreatorCampaign(pgQuery, {
        name: "Skincare & Beauty Influencer Network Onboarding",
        targetVertical: "Beauty & Personal Care",
        subject: "Exclusive Creator Collaboration — The Bored Monkey Network",
        bodyHtml: `<p>Hi {{firstName}},</p><p>Hope you're having a wonderful week! We follow your work on @{{handle}} and adore your authentic skincare recommendations.</p><p>The Bored Monkey is onboarding selected beauty creators for upcoming D2C and luxury personal care campaigns.</p><p>Please share your collaboration details and shipping address here: <a href="{{form_link}}">{{form_link}}</a></p><p>Warmly,<br/>Team The Bored Monkey</p>`,
    });
    console.log("[Seed] Created Beauty Campaign:", beautyCampaign?.id, "Enrolled:", beautyCampaign?.enrolledCount);

    // 3. Lifestyle & Appliance Reviewers Campaign
    const lifestyleCampaign = await createCreatorCampaign(pgQuery, {
        name: "Lifestyle & Home Appliance Reviewers 2026",
        targetVertical: "Lifestyle",
        subject: "Collaboration Opportunity with The Bored Monkey",
        bodyHtml: `<p>Hi {{firstName}},</p><p>Hope you're doing well! We're reaching out from The Bored Monkey to connect with creators like you and explore potential brand collaboration opportunities.</p><p>If you're interested, please confirm your details here: <a href="{{form_link}}">{{form_link}}</a></p><p>Best,<br/>Team The Bored Monkey</p>`,
    });
    console.log("[Seed] Created Lifestyle Campaign:", lifestyleCampaign?.id, "Enrolled:", lifestyleCampaign?.enrolledCount);

    // Batch update real-time telemetry
    // A. 20 Completed
    await pgQuery(`
        WITH target AS (
            SELECT "id", "creatorId" FROM "CreatorCampaignEnrollment" 
            ORDER BY "createdAt" ASC LIMIT 25
        )
        UPDATE "CreatorCampaignEnrollment" cce
        SET "status" = 'COMPLETED',
            "completionPct" = 100,
            "stepCompleted" = 2,
            "openedAt" = NOW() - INTERVAL '3 hours',
            "firstFilledAt" = NOW() - INTERVAL '2 hours',
            "completedAt" = NOW() - INTERVAL '30 minutes',
            "lastActiveAt" = NOW() - INTERVAL '30 minutes'
        FROM target WHERE cce.id = target.id;
    `);
    await pgQuery(`
        UPDATE "Creator" cr
        SET "intakeStatus" = 'COMPLETED',
            "intakeCompletionPct" = 100,
            "lastIntakeStepCompleted" = 2,
            "lastIntakeActivityAt" = NOW() - INTERVAL '30 minutes'
        WHERE cr.id IN (
            SELECT "creatorId" FROM "CreatorCampaignEnrollment" WHERE "status" = 'COMPLETED'
        );
    `);

    // B. 35 Partially Filled (Step 1 Complete, 65%)
    await pgQuery(`
        WITH target AS (
            SELECT "id", "creatorId" FROM "CreatorCampaignEnrollment" 
            WHERE "status" = 'INVITATION_SENT'
            ORDER BY "createdAt" ASC LIMIT 35
        )
        UPDATE "CreatorCampaignEnrollment" cce
        SET "status" = 'PARTIALLY_FILLED',
            "completionPct" = 65,
            "stepCompleted" = 1,
            "openedAt" = NOW() - INTERVAL '1 hour',
            "firstFilledAt" = NOW() - INTERVAL '40 minutes',
            "lastActiveAt" = NOW() - INTERVAL '10 minutes'
        FROM target WHERE cce.id = target.id;
    `);
    await pgQuery(`
        UPDATE "Creator" cr
        SET "intakeStatus" = 'PARTIALLY_FILLED',
            "intakeCompletionPct" = 65,
            "lastIntakeStepCompleted" = 1,
            "lastIntakeActivityAt" = NOW() - INTERVAL '10 minutes'
        WHERE cr.id IN (
            SELECT "creatorId" FROM "CreatorCampaignEnrollment" WHERE "status" = 'PARTIALLY_FILLED'
        );
    `);

    // C. 45 Form Opened (50%)
    await pgQuery(`
        WITH target AS (
            SELECT "id", "creatorId" FROM "CreatorCampaignEnrollment" 
            WHERE "status" = 'INVITATION_SENT'
            ORDER BY "createdAt" ASC LIMIT 45
        )
        UPDATE "CreatorCampaignEnrollment" cce
        SET "status" = 'FORM_OPENED',
            "completionPct" = 50,
            "stepCompleted" = 0,
            "openedAt" = NOW() - INTERVAL '15 minutes',
            "lastActiveAt" = NOW() - INTERVAL '15 minutes'
        FROM target WHERE cce.id = target.id;
    `);
    await pgQuery(`
        UPDATE "Creator" cr
        SET "intakeStatus" = 'FORM_OPENED',
            "intakeCompletionPct" = 50,
            "lastIntakeActivityAt" = NOW() - INTERVAL '15 minutes'
        WHERE cr.id IN (
            SELECT "creatorId" FROM "CreatorCampaignEnrollment" WHERE "status" = 'FORM_OPENED'
        );
    `);

    // D. Refresh aggregate funnel counters on campaigns
    await pgQuery(`
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
            "updatedAt" = NOW();
    `);

    console.log("[Seed] ✓ Creator Campaigns seeded with realistic real-time telemetry successfully!");
}

seed()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
