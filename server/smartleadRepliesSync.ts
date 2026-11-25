import https from "node:https";
import { pgQuery } from "./pg";
import { smartleadPrimary, smartleadSecondary } from "./smartleadKeys";
import { classifyReplyDeterministic } from "./automation/pipeline/replyClassifier";

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
    repliesFound?: number;
    error?: string;
}

const BOUNCE_NDR_PATTERNS = [
    /mail delivery subsystem/i,
    /delivery status notification/i,
    /undelivered mail returned/i,
    /address not found/i,
    /message wasn't delivered/i,
    /recipient address rejected/i,
    /550 5\.1\.1/i,
    /550-5\.1\.1/i,
    /user unknown/i,
    /does not exist/i,
];

export function isBounceOrNdrMessage(fromEmail: string, subject: string, body: string): boolean {
    const f = (fromEmail || "").toLowerCase();
    const s = (subject || "").toLowerCase();
    const b = (body || "").toLowerCase();
    if (f.includes("mailer-daemon") || f.includes("postmaster@") || f.includes("mail delivery")) return true;
    if (s.startsWith("undeliverable:") || s.includes("delivery status notification") || s.includes("failure notice") || s.includes("returned mail:")) return true;
    return BOUNCE_NDR_PATTERNS.some((rx) => rx.test(s) || rx.test(b.slice(0, 1200)));
}

/**
 * Fetch full conversation history from Smartlead API for a lead
 * and persist each email/reply into the PostgreSQL EmailEvent table.
 */
export async function syncLeadMessageHistory(leadIdentifier: string): Promise<SyncMessageResult> {
    try {
        const cleanId = leadIdentifier.replace(/^th_camp_/i, "").replace(/^th_/i, "");

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
            return { success: false, messagesSynced: 0, error: "Lead not found in database" };
        }

        const lead = rows[0];
        let providerCampaignId = lead.providerCampaignId;
        let providerLeadId = lead.providerLeadId;

        // 1. Try to resolve providerLeadId from EmailEvent.rawPayload for this lead
        if (!providerLeadId) {
            const evLeadRows = await pgQuery<any>(
                `SELECT coalesce("rawPayload"->>'sl_email_lead_id', "rawPayload"->>'lead_id', "rawPayload"->'lead'->>'id') AS sl_lead_id,
                        coalesce("rawPayload"->>'campaign_id', "rawPayload"->>'email_campaign_id') AS sl_camp_id
                 FROM "EmailEvent"
                 WHERE "leadId" = $1
                   AND coalesce("rawPayload"->>'sl_email_lead_id', "rawPayload"->>'lead_id', "rawPayload"->'lead'->>'id') IS NOT NULL
                 LIMIT 1`,
                [lead.id]
            );
            if (evLeadRows.length > 0 && evLeadRows[0].sl_lead_id) {
                providerLeadId = String(evLeadRows[0].sl_lead_id);
                providerCampaignId = providerCampaignId || (evLeadRows[0].sl_camp_id ? String(evLeadRows[0].sl_camp_id) : null);
            }
        }

        // 2. Try sibling Lead record with same email
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

        // 3. Query Smartlead /leads/?email=... if still missing providerLeadId
        if (!providerLeadId && lead.email) {
            let lookupRes = await apiGet(`/leads/?email=${encodeURIComponent(lead.email)}`);
            if ((lookupRes.status === 401 || !lookupRes.data?.id) && SECONDARY_KEY) {
                const secLookup = await apiGet(`/leads/?email=${encodeURIComponent(lead.email)}`, SECONDARY_KEY);
                if (secLookup.status === 200 && secLookup.data?.id) lookupRes = secLookup;
            }
            if (lookupRes.status === 200 && lookupRes.data?.id) {
                providerLeadId = String(lookupRes.data.id);
                if (!providerCampaignId && Array.isArray(lookupRes.data.lead_campaign_data) && lookupRes.data.lead_campaign_data.length > 0) {
                    providerCampaignId = String(lookupRes.data.lead_campaign_data[0].campaign_id);
                }
            }
        }

        if (providerLeadId && providerLeadId !== lead.providerLeadId) {
            await pgQuery(`UPDATE "Lead" SET "providerLeadId" = $2 WHERE id = $1`, [lead.id, providerLeadId]).catch(() => {});
        }

        if (!providerCampaignId || !providerLeadId) {
            return { success: false, leadEmail: lead.email, messagesSynced: 0, error: "Missing Smartlead campaign or lead ID" };
        }

        // Call Smartlead API for message history
        let slRes = await apiGet(`/campaigns/${providerCampaignId}/leads/${providerLeadId}/message-history`);
        if ((slRes.status === 401 || slRes.status === 404) && SECONDARY_KEY) {
            slRes = await apiGet(`/campaigns/${providerCampaignId}/leads/${providerLeadId}/message-history`, SECONDARY_KEY);
        }

        if (slRes.status !== 200 || !slRes.data) {
            return { success: false, leadEmail: lead.email, messagesSynced: 0, error: `Smartlead API responded with status ${slRes.status}` };
        }

        const history = Array.isArray(slRes.data?.history) ? slRes.data.history : [];
        if (history.length === 0) {
            return { success: true, leadEmail: lead.email, messagesSynced: 0, repliesFound: 0 };
        }

        let syncedCount = 0;
        let repliesFound = 0;
        const campName = lead.campaignName || "Outreach";
        const defaultFrom = slRes.data?.from || "haji.karim@theboredmonkey.com";

        for (const item of history) {
            const isReply = String(item.type || "").toUpperCase() === "REPLY";
            const rawBody = item.email_body || item.custom_email_message || item.reply_body || "";
            const subject = item.subject || (isReply ? `Re: ${campName}` : `Outreach: ${campName}`);
            const fromEmail = item.from || (isReply ? lead.email : defaultFrom);
            const toEmail = item.to || (isReply ? defaultFrom : lead.email);
            const eventTime = item.time ? new Date(item.time).toISOString() : new Date().toISOString();
            const statsId = item.stats_id || item.message_id || `hist_${syncedCount}`;

            // Skip bounce NDR notifications masquerading as replies
            if (isReply && isBounceOrNdrMessage(fromEmail, subject, rawBody)) {
                continue;
            }

            const eventType = isReply ? "replied" : "sent";
            const providerEventId = `sl_hist_${providerCampaignId}_${providerLeadId}_${statsId}_${eventType}`;

            const payload = {
                subject,
                email_subject: subject,
                email_body: rawBody,
                body: rawBody,
                reply_text: isReply ? rawBody : undefined,
                reply_body: isReply ? rawBody : undefined,
                snippet: String(rawBody).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000),
                from_email: fromEmail,
                to_email: toEmail,
                stats_id: item.stats_id,
                message_id: item.message_id,
                type: item.type,
                time: item.time,
                email_seq_number: item.email_seq_number,
                sl_email_lead_id: providerLeadId,
                campaign_id: providerCampaignId,
            };

            await pgQuery(
                `INSERT INTO "EmailEvent" ("id", "leadId", "eventType", "providerEventId", "fromEmail", "rawPayload", "createdAt")
                 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb, $6::timestamptz)
                 ON CONFLICT ("providerEventId") DO UPDATE
                 SET "rawPayload" = EXCLUDED."rawPayload",
                     "fromEmail" = EXCLUDED."fromEmail"`,
                [lead.id, eventType, providerEventId, fromEmail, JSON.stringify(payload), eventTime]
            );

            if (isReply) {
                repliesFound++;
                const classification = classifyReplyDeterministic({
                    text: rawBody,
                    subject,
                    contactEmail: lead.email,
                });
                const isOOOorAuto = classification.dbClassification === "OOO" || classification.dbClassification === "AUTO_RESPONDER";
                const nextStatus = isOOOorAuto ? "ACTIVE" : "REPLIED";

                await pgQuery(
                    `DELETE FROM "EmailEvent"
                     WHERE "leadId" = $1 AND "eventType" = 'replied'
                       AND ("providerEventId" LIKE 'sl_stat_reply_%' OR "rawPayload" IS NULL)`,
                    [lead.id]
                );
                await pgQuery(
                    `UPDATE "Lead"
                     SET status = $2::"LeadStatus",
                         "repliedAt" = COALESCE("repliedAt", $3::timestamptz),
                         "lastRepliedAt" = $3::timestamptz,
                         "totalReplied" = GREATEST(coalesce("totalReplied", 0), 1),
                         "totalInbound" = GREATEST(coalesce("totalInbound", 0), 1),
                         "replyClassification" = $4,
                         "updatedAt" = NOW()
                     WHERE id = $1`,
                    [lead.id, nextStatus, eventTime, classification.dbClassification]
                );
            } else {
                // Remove duplicate synthetic body-less sent events for the same lead
                await pgQuery(
                    `DELETE FROM "EmailEvent"
                     WHERE "leadId" = $1 AND "eventType" = 'sent'
                       AND "providerEventId" LIKE 'sl_stat_sent_%'`,
                    [lead.id]
                );
            }

            syncedCount++;
        }

        return { success: true, leadEmail: lead.email, messagesSynced: syncedCount, repliesFound };
    } catch (err: any) {
        console.error("[syncLeadMessageHistory] Error:", err);
        return { success: false, messagesSynced: 0, error: err.message };
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
