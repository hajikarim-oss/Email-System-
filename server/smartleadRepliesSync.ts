import https from "node:https";
import { pgQuery } from "./pg";
import { smartleadPrimary, smartleadSecondary } from "./smartleadKeys";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function apiGet(endpoint: string, apiKey: string = PRIMARY_KEY): Promise<{ status: number; data: any }> {
    return new Promise((resolve) => {
        const sep = endpoint.includes("?") ? "&" : "?";
        const url = `https://server.smartlead.ai/api/v1${endpoint}${sep}api_key=${apiKey}`;
        const req = https.get(url, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 200, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode || 200, data: body });
                }
            });
        });
        req.on("error", (err) => resolve({ status: 500, data: { error: err.message } }));
    });
}

export interface SyncMessageResult {
    success: boolean;
    leadEmail?: string;
    messagesSynced: number;
    error?: string;
}

/**
 * Fetch full conversation history from Smartlead API for a lead
 * and persist each email/reply into the PostgreSQL EmailEvent table.
 */
export async function syncLeadMessageHistory(leadIdentifier: string): Promise<SyncMessageResult> {
    try {
        const cleanId = leadIdentifier.replace(/^th_camp_/, "").replace(/^th_/, "");
        
        // Find lead and campaign details from PostgreSQL
        const rows = await pgQuery<any>(
            `SELECT l.id, l.email, l."providerLeadId", l."campaignId",
                    c.name as "campaignName", c."providerCampaignId"
             FROM "Lead" l
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             WHERE l.id = $1 OR lower(l.email) = lower($1)
             ORDER BY l."updatedAt" DESC
             LIMIT 1`,
            [cleanId]
        );

        if (!rows || rows.length === 0) {
            return { success: false, error: "Lead not found in database" };
        }

        const lead = rows[0];
        let providerCampaignId = lead.providerCampaignId;
        let providerLeadId = lead.providerLeadId;

        // If providerLeadId or providerCampaignId is missing, try to resolve from another Lead record with same email
        if (!providerCampaignId || !providerLeadId) {
            const siblingRows = await pgQuery<any>(
                `SELECT l."providerLeadId", c."providerCampaignId"
                 FROM "Lead" l
                 JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE lower(l.email) = lower($1) AND l."providerLeadId" IS NOT NULL AND c."providerCampaignId" IS NOT NULL
                 LIMIT 1`,
                [lead.email]
            );
            if (siblingRows.length > 0) {
                providerCampaignId = providerCampaignId || siblingRows[0].providerCampaignId;
                providerLeadId = providerLeadId || siblingRows[0].providerLeadId;
            }
        }

        if (!providerCampaignId || !providerLeadId) {
            return { success: false, leadEmail: lead.email, messagesSynced: 0, error: "Missing Smartlead campaign or lead ID" };
        }

        // Call Smartlead API for message history
        let slRes = await apiGet(`/campaigns/${providerCampaignId}/leads/${providerLeadId}/message-history`);
        if (slRes.status === 401 && SECONDARY_KEY) {
            slRes = await apiGet(`/campaigns/${providerCampaignId}/leads/${providerLeadId}/message-history`, SECONDARY_KEY);
        }

        if (slRes.status !== 200 || !slRes.data) {
            return { success: false, leadEmail: lead.email, messagesSynced: 0, error: `Smartlead API responded with status ${slRes.status}` };
        }

        const history = Array.isArray(slRes.data?.history) ? slRes.data.history : [];
        if (history.length === 0) {
            return { success: true, leadEmail: lead.email, messagesSynced: 0 };
        }

        let syncedCount = 0;
        const campName = lead.campaignName || "Outreach";

        for (const item of history) {
            const isReply = String(item.type || "").toUpperCase() === "REPLY";
            const eventType = isReply ? "replied" : "sent";
            const rawBody = item.email_body || item.custom_email_message || item.reply_body || "";
            const subject = item.subject || (isReply ? `Re: ${campName}` : `Outreach: ${campName}`);
            const fromEmail = item.from || (isReply ? lead.email : "haji.karim@theboredmonkey.com");
            const toEmail = item.to || (isReply ? "haji.karim@theboredmonkey.com" : lead.email);
            const eventTime = item.time ? new Date(item.time).toISOString() : new Date().toISOString();
            const statsId = item.stats_id || item.message_id || `hist_${syncedCount}`;
            const providerEventId = `sl_hist_${providerCampaignId}_${providerLeadId}_${statsId}_${eventType}`;

            const payload = {
                subject,
                email_subject: subject,
                email_body: rawBody,
                body: rawBody,
                reply_text: isReply ? rawBody : undefined,
                reply_body: isReply ? rawBody : undefined,
                snippet: String(rawBody).replace(/<[^>]*>/g, "").slice(0, 1000),
                from_email: fromEmail,
                to_email: toEmail,
                stats_id: item.stats_id,
                message_id: item.message_id,
                type: item.type,
                time: item.time,
                email_seq_number: item.email_seq_number,
            };

            await pgQuery(
                `INSERT INTO "EmailEvent" ("id", "leadId", "eventType", "providerEventId", "fromEmail", "rawPayload", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb, $6::timestamptz)
                 ON CONFLICT ("providerEventId") DO UPDATE
                 SET "rawPayload" = EXCLUDED."rawPayload",
                     "fromEmail" = EXCLUDED."fromEmail"`,
                [lead.id, eventType, providerEventId, fromEmail, JSON.stringify(payload), eventTime]
            );

            // Also update any pre-existing blank events for this lead
            if (isReply) {
                await pgQuery(
                    `UPDATE "EmailEvent"
                     SET "rawPayload" = $1::jsonb, "fromEmail" = $2
                     WHERE "leadId" = $3 AND "eventType" = 'replied' AND "rawPayload" IS NULL`,
                    [JSON.stringify(payload), fromEmail, lead.id]
                );
                await pgQuery(
                    `UPDATE "Lead"
                     SET status = 'REPLIED', "repliedAt" = $2::timestamptz, "lastRepliedAt" = $2::timestamptz,
                         "totalReplied" = GREATEST("totalReplied", 1), "updatedAt" = NOW()
                     WHERE id = $1`,
                    [lead.id, eventTime]
                );
            } else {
                await pgQuery(
                    `UPDATE "EmailEvent"
                     SET "rawPayload" = $1::jsonb, "fromEmail" = $2
                     WHERE "leadId" = $3 AND "eventType" = 'sent' AND "rawPayload" IS NULL`,
                    [JSON.stringify(payload), fromEmail, lead.id]
                );
            }

            syncedCount++;
        }

        return { success: true, leadEmail: lead.email, messagesSynced: syncedCount };
    } catch (err: any) {
        console.error("[syncLeadMessageHistory] Error:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Scan all campaigns with replies and sync message history into PostgreSQL
 */
export async function syncAllRepliedThreads(): Promise<{ totalSynced: number }> {
    const repliedLeads = await pgQuery<any>(
        `SELECT DISTINCT l.id
         FROM "Lead" l
         WHERE l.status = 'REPLIED' OR l."totalReplied" > 0 OR l."repliedAt" IS NOT NULL
            OR EXISTS (SELECT 1 FROM "EmailEvent" ev WHERE ev."leadId" = l.id AND ev."eventType" = 'replied')`
    );

    let total = 0;
    for (const row of repliedLeads) {
        const res = await syncLeadMessageHistory(row.id);
        if (res.success && res.messagesSynced > 0) {
            total += res.messagesSynced;
        }
    }
    return { totalSynced: total };
}
