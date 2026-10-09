const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const SMARTLEAD_KEY = 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
const CAMPAIGN_SL_ID = '4103333';

async function main() {
    const parsed = new URL(DATABASE_URL);
    parsed.searchParams.delete('sslmode');
    const client = new Client({ connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } });
    await client.connect();

    console.log('--- 1. FETCHING CAMPAIGN DETAILS & ANALYTICS FROM SMARTLEAD ---');
    const campAnalyticsRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${CAMPAIGN_SL_ID}/analytics?api_key=${SMARTLEAD_KEY}`);
    const analytics = await campAnalyticsRes.json();
    console.log('Analytics summary:', {
        sent: analytics.sent_count,
        opened: analytics.open_count,
        clicked: analytics.click_count,
        bounced: analytics.bounce_count,
        total: analytics.total_count,
        status: analytics.status
    });

    // Find DB Campaign ID
    const campRow = await client.query('SELECT id, "userId" FROM "Campaign" WHERE "providerCampaignId" = $1', [CAMPAIGN_SL_ID]);
    if (!campRow.rows.length) {
        console.error('Campaign 4103333 not found in DB!');
        await client.end();
        return;
    }
    const dbCampId = campRow.rows[0].id;
    const userId = campRow.rows[0].userId;
    console.log(`Matched DB Campaign ID: ${dbCampId}, User ID: ${userId}`);

    // Update Campaign status to ACTIVE
    await client.query('UPDATE "Campaign" SET status = $1, "updatedAt" = NOW() WHERE id = $2', ['ACTIVE', dbCampId]);

    console.log('--- 2. FETCHING PER-LEAD DETAILED STATISTICS FROM SMARTLEAD ---');
    let offset = 0;
    const limit = 500;
    let allStats = [];

    while (true) {
        console.log(`Fetching statistics at offset ${offset}...`);
        const statsRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${CAMPAIGN_SL_ID}/statistics?limit=${limit}&offset=${offset}&api_key=${SMARTLEAD_KEY}`);
        const data = await statsRes.json();
        const batch = Array.isArray(data) ? data : (data.data || []);
        if (batch.length === 0) break;
        allStats = allStats.concat(batch);
        offset += limit;
        if (batch.length < limit) break;
    }

    console.log(`Fetched ${allStats.length} lead activity records from Smartlead.`);

    // Map existing leads in DB by lowercased email
    const existingLeadsRes = await client.query('SELECT id, email FROM "Lead" WHERE "campaignId" = $1', [dbCampId]);
    const leadMapByEmail = new Map();
    existingLeadsRes.rows.forEach(r => leadMapByEmail.set(r.email.toLowerCase().trim(), r.id));
    console.log(`Found ${leadMapByEmail.size} leads in DB for this campaign.`);

    let leadsUpdated = 0;
    let eventsCreated = 0;

    for (const item of allStats) {
        const email = (item.lead_email || '').toLowerCase().trim();
        if (!email) continue;

        let leadId = leadMapByEmail.get(email);

        const sentTime = item.sent_time ? new Date(item.sent_time) : null;
        const openTime = item.open_time ? new Date(item.open_time) : null;
        const clickTime = item.click_time ? new Date(item.click_time) : null;
        const replyTime = item.reply_time ? new Date(item.reply_time) : null;
        const openCount = Number(item.open_count || (openTime ? 1 : 0));
        const clickCount = Number(item.click_count || (clickTime ? 1 : 0));
        const isBounced = Boolean(item.is_bounced || item.sender_bounce);

        let status = 'ACTIVE';
        if (isBounced) status = 'BOUNCED';
        else if (item.is_unsubscribed) status = 'UNSUBSCRIBED';
        else if (replyTime) status = 'REPLIED';

        if (!leadId) {
            // Create lead if missing
            const nameParts = (item.lead_name || '').trim().split(/\s+/);
            const first = nameParts[0] || '';
            const last = nameParts.slice(1).join(' ') || '';
            const insRes = await client.query(`
                INSERT INTO "Lead" (
                    id, "campaignId", email, "firstName", "lastName", status,
                    "lastContactedAt", "firstContactedAt", "firstOpenAt", "lastOpenAt", "openCount",
                    "clickCount", "bounceCount", "lastBouncedAt", "repliedAt", "lastRepliedAt",
                    "totalMessages", "totalOutbound", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid()::text, $1, $2, $3, $4, $5,
                    $6, $6, $7, $7, $8,
                    $9, $10, $11, $12, $12,
                    $13, $13, NOW(), NOW()
                ) RETURNING id
            `, [
                dbCampId, email, first, last, status,
                sentTime, openTime, openCount,
                clickCount, isBounced ? 1 : 0, isBounced ? (sentTime || new Date()) : null, replyTime,
                sentTime ? 1 : 0
            ]);
            leadId = insRes.rows[0].id;
            leadMapByEmail.set(email, leadId);
        } else {
            // Update existing lead with telemetry
            await client.query(`
                UPDATE "Lead" SET
                    status = $1,
                    "lastContactedAt" = COALESCE($2, "lastContactedAt"),
                    "firstContactedAt" = COALESCE("firstContactedAt", $2),
                    "firstOpenAt" = COALESCE("firstOpenAt", $3),
                    "lastOpenAt" = COALESCE($3, "lastOpenAt"),
                    "openCount" = GREATEST("openCount", $4),
                    "clickCount" = GREATEST("clickCount", $5),
                    "bounceCount" = GREATEST("bounceCount", $6),
                    "lastBouncedAt" = COALESCE($7, "lastBouncedAt"),
                    "repliedAt" = COALESCE($8, "repliedAt"),
                    "lastRepliedAt" = COALESCE($8, "lastRepliedAt"),
                    "totalMessages" = GREATEST("totalMessages", $9),
                    "totalOutbound" = GREATEST("totalOutbound", $9),
                    "updatedAt" = NOW()
                WHERE id = $10
            `, [
                status,
                sentTime,
                openTime,
                openCount,
                clickCount,
                isBounced ? 1 : 0,
                isBounced ? (sentTime || new Date()) : null,
                replyTime,
                sentTime ? 1 : 0,
                leadId
            ]);
            leadsUpdated++;
        }

        // Insert EmailEvent rows for granular timeline analytics
        const statsId = item.stats_id || `${leadId}_${item.sequence_number || 1}`;
        if (sentTime) {
            const evCheck = await client.query('SELECT id FROM "EmailEvent" WHERE "leadId" = $1 AND "eventType" = $2 LIMIT 1', [leadId, 'sent']);
            if (!evCheck.rows.length) {
                await client.query(`
                    INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                `, [leadId, 'sent', `${statsId}_sent`, sentTime]);
                eventsCreated++;
            }
        }

        if (openTime) {
            const evCheck = await client.query('SELECT id FROM "EmailEvent" WHERE "leadId" = $1 AND "eventType" IN ($2, $3) LIMIT 1', [leadId, 'opened', 'email_open']);
            if (!evCheck.rows.length) {
                await client.query(`
                    INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                `, [leadId, 'opened', `${statsId}_open`, openTime]);
                eventsCreated++;
            }
        }

        if (clickTime) {
            const evCheck = await client.query('SELECT id FROM "EmailEvent" WHERE "leadId" = $1 AND "eventType" IN ($2, $3) LIMIT 1', [leadId, 'clicked', 'email_click']);
            if (!evCheck.rows.length) {
                await client.query(`
                    INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                `, [leadId, 'clicked', `${statsId}_click`, clickTime]);
                eventsCreated++;
            }
        }

        if (isBounced && sentTime) {
            const evCheck = await client.query('SELECT id FROM "EmailEvent" WHERE "leadId" = $1 AND "eventType" IN ($2, $3) LIMIT 1', [leadId, 'bounced', 'email_bounce']);
            if (!evCheck.rows.length) {
                await client.query(`
                    INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                `, [leadId, 'bounced', `${statsId}_bounce`, sentTime]);
                eventsCreated++;
            }
        }

        if (replyTime) {
            const evCheck = await client.query('SELECT id FROM "EmailEvent" WHERE "leadId" = $1 AND "eventType" IN ($2, $3) LIMIT 1', [leadId, 'replied', 'email_reply']);
            if (!evCheck.rows.length) {
                await client.query(`
                    INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                `, [leadId, 'replied', `${statsId}_reply`, replyTime]);
                eventsCreated++;
            }
        }
    }

    console.log(`--- SYNC COMPLETED ---`);
    console.log(`Leads updated with live analytics: ${leadsUpdated}`);
    console.log(`New EmailEvents recorded: ${eventsCreated}`);

    // Verify aggregate counts in DB
    const contactedCount = await client.query('SELECT count(*) FROM "Lead" WHERE "campaignId" = $1 AND "lastContactedAt" IS NOT NULL', [dbCampId]);
    const openedCount = await client.query('SELECT count(*) FROM "Lead" WHERE "campaignId" = $1 AND "openCount" > 0', [dbCampId]);
    const bouncedCount = await client.query('SELECT count(*) FROM "Lead" WHERE "campaignId" = $1 AND status = \'BOUNCED\'', [dbCampId]);
    const eventCount = await client.query('SELECT "eventType", count(*) FROM "EmailEvent" e JOIN "Lead" l ON l.id = e."leadId" WHERE l."campaignId" = $1 GROUP BY "eventType"', [dbCampId]);

    console.log('Database verification:', {
        totalLeadsInDb: leadMapByEmail.size,
        leadsContacted: contactedCount.rows[0].count,
        leadsOpened: openedCount.rows[0].count,
        leadsBounced: bouncedCount.rows[0].count,
        eventBreakdown: eventCount.rows
    });

    await client.end();
}

main().catch(console.error);
