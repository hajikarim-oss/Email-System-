import { pgQuery } from "./pg";
import { smartleadPrimary, smartleadSecondary } from "./smartleadKeys";

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

export async function reconcileCampaign(
    providerCampaignId: string | number,
    customApiKey?: string
): Promise<{
    success: boolean;
    status: string;
    stats?: {
        total_leads: number;
        sent: number;
        opens: number;
        clicks: number;
        replies: number;
        bounces: number;
    };
    error?: string;
}> {
    const slId = String(providerCampaignId);
    const keys = [
        customApiKey,
        smartleadPrimary(),
        smartleadSecondary(),
        process.env.SMARTLEAD_API_KEY,
    ].filter(Boolean) as string[];

    let apiKey = "";
    let campData: any = null;

    // Try keys to find the working one
    for (const key of keys) {
        try {
            const res = await fetch(`${SMARTLEAD_BASE}/campaigns/${slId}?api_key=${key}`);
            if (res.ok) {
                campData = await res.json();
                apiKey = key;
                break;
            }
        } catch {
            // continue
        }
    }

    if (!campData || !apiKey) {
        return { success: false, status: "unknown", error: "Failed to fetch campaign from Smartlead" };
    }

    // Map status
    const slStatus = (campData.status || "").toUpperCase();
    let mappedStatus = "ACTIVE";
    if (slStatus === "COMPLETED" || slStatus === "STOPPED" || slStatus === "DONE") {
        mappedStatus = "COMPLETED";
    } else if (slStatus === "PAUSED") {
        mappedStatus = "PAUSED";
    } else if (slStatus === "DRAFT") {
        mappedStatus = "DRAFT";
    }

    // Find DB campaign
    const campRows = await pgQuery(
        `SELECT id FROM "Campaign" WHERE "providerCampaignId" = $1 OR id = $1`,
        [slId]
    );
    if (!campRows.length) {
        return { success: false, status: mappedStatus, error: "Campaign not found in DB" };
    }
    const dbCampId = campRows[0].id;

    // Update campaign status
    await pgQuery(
        `UPDATE "Campaign" SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
        [mappedStatus, dbCampId]
    );

    // Fetch statistics
    let offset = 0;
    const limit = 500;
    let allStats: any[] = [];

    while (true) {
        try {
            const res = await fetch(
                `${SMARTLEAD_BASE}/campaigns/${slId}/statistics?limit=${limit}&offset=${offset}&api_key=${apiKey}`
            );
            if (!res.ok) break;
            const data = await res.json();
            const batch = Array.isArray(data) ? data : (data.data || []);
            if (batch.length === 0) break;
            allStats = allStats.concat(batch);
            offset += limit;
            if (batch.length < limit) break;
        } catch {
            break;
        }
    }

    // If no statistics found, return status update
    if (allStats.length === 0) {
        return { success: true, status: mappedStatus };
    }

    // Load existing leads in DB
    const existingLeads = await pgQuery(
        `SELECT id, lower(trim(email)) as email, status, "openCount", "bounceCount", "totalReplied"
         FROM "Lead" WHERE "campaignId" = $1`,
        [dbCampId]
    );
    const leadMap = new Map<string, any>();
    existingLeads.forEach((l: any) => leadMap.set(l.email, l));

    // Load existing EmailEvents
    const existingEvents = await pgQuery(
        `SELECT e."leadId", e."eventType", e."providerEventId"
         FROM "EmailEvent" e
         JOIN "Lead" l ON l.id = e."leadId"
         WHERE l."campaignId" = $1`,
        [dbCampId]
    );
    const eventSet = new Set<string>();
    existingEvents.forEach((e: any) => {
        eventSet.add(`${e.leadId}_${e.eventType}`);
        if (e.providerEventId) eventSet.add(e.providerEventId);
    });

    let totalSent = 0;
    let totalOpens = 0;
    let totalClicks = 0;
    let totalReplies = 0;
    let totalBounces = 0;

    for (const item of allStats) {
        const email = (item.lead_email || "").toLowerCase().trim();
        if (!email) continue;

        const sentTime = item.sent_time ? new Date(item.sent_time) : null;
        const openTime = item.open_time ? new Date(item.open_time) : null;
        const clickTime = item.click_time ? new Date(item.click_time) : null;
        const replyTime = item.reply_time ? new Date(item.reply_time) : null;
        const openCount = Number(item.open_count || (openTime ? 1 : 0));
        const clickCount = Number(item.click_count || (clickTime ? 1 : 0));
        const isBounced = Boolean(item.is_bounced || item.sender_bounce);

        if (sentTime) totalSent++;
        if (openTime || openCount > 0) totalOpens++;
        if (clickTime || clickCount > 0) totalClicks++;
        if (replyTime) totalReplies++;
        if (isBounced) totalBounces++;

        let lead = leadMap.get(email);
        let leadId: string;

        let leadStatus = "ACTIVE";
        if (isBounced) leadStatus = "BOUNCED";
        else if (item.is_unsubscribed) leadStatus = "UNSUBSCRIBED";
        else if (replyTime) leadStatus = "REPLIED";

        if (!lead) {
            const nameParts = (item.lead_name || "").trim().split(/\s+/);
            const first = nameParts[0] || email.split("@")[0];
            const last = nameParts.slice(1).join(" ") || "";
            const insRes = await pgQuery(
                `INSERT INTO "Lead" (
                    id, "campaignId", email, "firstName", "lastName", status,
                    "lastContactedAt", "firstContactedAt", "firstOpenAt", "lastOpenAt", "openCount",
                    "clickCount", "bounceCount", "lastBouncedAt", "totalBounced", "repliedAt", "lastRepliedAt", "totalReplied",
                    "totalMessages", "totalOutbound", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid()::text, $1, $2, $3, $4, $5,
                    $6, $6, $7, $7, $8,
                    $9, $10, $11, $12, $13, $13, $14,
                    $15, $15, NOW(), NOW()
                ) RETURNING id`,
                [
                    dbCampId, email, first, last, leadStatus,
                    sentTime, openTime, openCount,
                    clickCount, isBounced ? 1 : 0, isBounced ? (sentTime || new Date()) : null, isBounced ? 1 : 0,
                    replyTime, replyTime ? 1 : 0,
                    sentTime ? 1 : 0,
                ]
            );
            leadId = insRes[0].id;
            lead = { id: leadId, email, status: leadStatus };
            leadMap.set(email, lead);
        } else {
            leadId = lead.id;
            await pgQuery(
                `UPDATE "Lead" SET
                    status = CASE WHEN $1 = 'BOUNCED' THEN 'BOUNCED' WHEN $1 = 'REPLIED' THEN 'REPLIED' ELSE status END,
                    "lastContactedAt" = COALESCE($2, "lastContactedAt"),
                    "firstContactedAt" = COALESCE("firstContactedAt", $2),
                    "firstOpenAt" = COALESCE("firstOpenAt", $3),
                    "lastOpenAt" = COALESCE($3, "lastOpenAt"),
                    "openCount" = GREATEST("openCount", $4),
                    "clickCount" = GREATEST("clickCount", $5),
                    "bounceCount" = GREATEST("bounceCount", $6),
                    "totalBounced" = GREATEST("totalBounced", $6),
                    "lastBouncedAt" = COALESCE($7, "lastBouncedAt"),
                    "repliedAt" = COALESCE($8, "repliedAt"),
                    "lastRepliedAt" = COALESCE($8, "lastRepliedAt"),
                    "totalReplied" = GREATEST("totalReplied", $9),
                    "totalMessages" = GREATEST("totalMessages", $10),
                    "totalOutbound" = GREATEST("totalOutbound", $10),
                    "updatedAt" = NOW()
                 WHERE id = $11`,
                [
                    leadStatus,
                    sentTime,
                    openTime,
                    openCount,
                    clickCount,
                    isBounced ? 1 : 0,
                    isBounced ? (sentTime || new Date()) : null,
                    replyTime,
                    replyTime ? 1 : 0,
                    sentTime ? 1 : 0,
                    leadId,
                ]
            );
        }

        // EmailEvents upsert
        const statsId = item.stats_id || `${leadId}_${item.sequence_number || 1}`;

        if (sentTime && !eventSet.has(`${leadId}_sent`) && !eventSet.has(`${statsId}_sent`)) {
            await pgQuery(
                `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'sent', $2, $3)
                 ON CONFLICT DO NOTHING`,
                [leadId, `${statsId}_sent`, sentTime]
            );
            eventSet.add(`${leadId}_sent`);
        }

        if ((openTime || openCount > 0) && !eventSet.has(`${leadId}_opened`) && !eventSet.has(`${leadId}_email_open`) && !eventSet.has(`${statsId}_open`)) {
            await pgQuery(
                `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'opened', $2, $3)
                 ON CONFLICT DO NOTHING`,
                [leadId, `${statsId}_open`, openTime || sentTime || new Date()]
            );
            eventSet.add(`${leadId}_opened`);
        }

        if ((clickTime || clickCount > 0) && !eventSet.has(`${leadId}_clicked`) && !eventSet.has(`${leadId}_email_click`) && !eventSet.has(`${statsId}_click`)) {
            await pgQuery(
                `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'clicked', $2, $3)
                 ON CONFLICT DO NOTHING`,
                [leadId, `${statsId}_click`, clickTime || sentTime || new Date()]
            );
            eventSet.add(`${leadId}_clicked`);
        }

        if (isBounced && !eventSet.has(`${leadId}_bounced`) && !eventSet.has(`${leadId}_email_bounce`) && !eventSet.has(`${statsId}_bounce`)) {
            await pgQuery(
                `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'bounced', $2, $3)
                 ON CONFLICT DO NOTHING`,
                [leadId, `${statsId}_bounce`, sentTime || new Date()]
            );
            eventSet.add(`${leadId}_bounced`);
        }

        if (replyTime && !eventSet.has(`${leadId}_replied`) && !eventSet.has(`${leadId}_email_reply`) && !eventSet.has(`${statsId}_reply`)) {
            await pgQuery(
                `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'replied', $2, $3)
                 ON CONFLICT DO NOTHING`,
                [leadId, `${statsId}_reply`, replyTime]
            );
            eventSet.add(`${leadId}_replied`);
        }
    }

    return {
        success: true,
        status: mappedStatus,
        stats: {
            total_leads: existingLeads.length,
            sent: totalSent,
            opens: totalOpens,
            clicks: totalClicks,
            replies: totalReplies,
            bounces: totalBounces,
        },
    };
}
