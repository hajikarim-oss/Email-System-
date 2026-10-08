import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery } from "../../server/pg";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();
const BASE_URL = "https://server.smartlead.ai/api/v1";

function apiCall(endpoint: string, method: string = "GET", body?: any, customKey?: string): Promise<{ status: number; data: any }> {
    const apiKey = customKey || PRIMARY_KEY;
    if (!apiKey) {
        return Promise.resolve({ status: 503, data: { error: "smartlead_api_key_not_configured" } });
    }
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const fullPath = `${endpoint}${separator}api_key=${apiKey}`;
        const url = `${BASE_URL}${fullPath}`;
        const payload = body ? JSON.stringify(body) : "";

        const req = https.request(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(body ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        }, (res: any) => {
            let text = "";
            res.on("data", (chunk: any) => { text += chunk; });
            res.on("end", async () => {
                try {
                    const parsed = text ? JSON.parse(text) : {};
                    if ((res.statusCode === 401 || res.statusCode === 404) && !customKey && SECONDARY_KEY && apiKey !== SECONDARY_KEY) {
                        try {
                            const fallbackRes = await apiCall(endpoint, method, body, SECONDARY_KEY);
                            if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                                return resolve(fallbackRes);
                            }
                        } catch {}
                    }
                    resolve({ status: res.statusCode, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, data: { raw: text } });
                }
            });
        });
        req.on("error", (err: any) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

function normalizeToSmartleadTemplate(text: string): string {
    if (!text) return "";
    return text
        .replace(/&nbsp;/g, " ")
        .replace(/<span[^>]*style="[^"]*(?:background|border|monospace)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
        .replace(/<span[^>]*class="[^"]*(?:variable-badge|token-badge)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
        .replace(/\{\{\s*(\.?first_?name|first|fname)\s*\}\}/gi, "{{first_name}}")
        .replace(/\[\s*(First\s*Name|Name)\s*\]/gi, "{{first_name}}")
        .replace(/\{\{\s*(\.?last_?name|last|lname|surname)\s*\}\}/gi, "{{last_name}}")
        .replace(/\[\s*(Last\s*Name|Surname)\s*\]/gi, "{{last_name}}")
        .replace(/\{\{\s*(\.?company_?name|company|org|organization|brand)\s*\}\}/gi, "{{company_name}}")
        .replace(/\[\s*(Company\s*Name|Company|Brand\s*Name|Brand|Org)\s*\]/gi, "{{company_name}}")
        .replace(/\{\{\s*(\.?job_?title|title|role|position)\s*\}\}/gi, "{{title}}")
        .replace(/\[\s*(Job\s*Title|Title|Role|Position)\s*\]/gi, "{{title}}");
}

// Detect and warn about spam-trigger phrases
function detectSpamTriggers(text: string): string[] {
    const triggers = [
        { phrase: /I hope this message finds you/gi, reason: "Classic spam phrase" },
        { phrase: /pleasure to formally confirm/gi, reason: "Overly formal (spam indicator)" },
        { phrase: /I am writing to you/gi, reason: "Generic spam opener" },
        { phrase: /please ensure/gi, reason: "Directive tone (looks like instruction)" },
        { phrase: /kindly request/gi, reason: "Formal/robotic language" },
        { phrase: /per your request/gi, reason: "Generic corporate speak" },
        { phrase: /seamless campaign execution/gi, reason: "Corporate jargon (spam trigger)" },
        { phrase: /adhering to this schedule/gi, reason: "Directive language (not personal)" },
    ];

    const found: string[] = [];
    for (const trigger of triggers) {
        if (trigger.phrase.test(text)) {
            found.push(`⚠️ "${text.match(trigger.phrase)?.[0]}" - ${trigger.reason}`);
        }
    }
    return found;
}

function cleanCompanyName(nameOrDomain?: string): string {
    if (!nameOrDomain) return "TheBoredMonkey";
    let cleaned = nameOrDomain.trim();
    if (cleaned.includes("@")) {
        cleaned = cleaned.split("@")[1] || cleaned;
    }
    cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    cleaned = cleaned.split("/")[0].split("?")[0].trim();
    cleaned = cleaned.replace(/\.(com|co|org|net|in|io|ai|tech|biz|info|us|uk|ca|de|jp|fr|au|ru|ch|it|nl|se|no|es|cz|eu|gov|edu)(\.[a-z]{2,3})?$/i, "");
    cleaned = cleaned.replace(/\.[a-z]{2,4}$/i, "");
    return cleaned || nameOrDomain;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    let body = "";
    const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10 MB limit
    let totalSize = 0;

    req.on("data", (chunk: any) => {
        totalSize += chunk.length;
        if (totalSize > MAX_PAYLOAD_SIZE) {
            req.destroy();
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "payload_too_large", max_size: MAX_PAYLOAD_SIZE }));
            return;
        }
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            const parsed = JSON.parse(body || "{}");
            let campaignName = (parsed.name || `Campaign ${Date.now()}`).trim();

            // Validate campaign name (max 255 chars, no null bytes)
            if (!campaignName || campaignName.length > 255) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "invalid_campaign_name", message: "Campaign name must be 1-255 characters" }));
                return;
            }

            if (campaignName.includes("\0")) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "invalid_campaign_name", message: "Campaign name contains invalid characters" }));
                return;
            }
            let smartleadId = parsed.smartlead_id;

            const sender = (parsed.sender_email || parsed.from_email || "").toLowerCase();
            const isPreeti = sender.includes("preeti") || (Array.isArray(parsed.mailbox_ids) && parsed.mailbox_ids.includes(23458016));
            const chosenKey = parsed.api_key || (isPreeti ? SECONDARY_KEY : PRIMARY_KEY);

            // 1. Create or find campaign in Smartlead
            if (!smartleadId) {
                // Try to find existing campaign first to avoid duplicates
                const listRes = await apiCall("/campaigns", "GET", undefined, chosenKey);
                const campaignsList = Array.isArray(listRes.data) ? listRes.data : [];
                const existing = campaignsList.find((c: any) =>
                    c.name?.toLowerCase() === campaignName.toLowerCase()
                );

                if (existing?.id) {
                    smartleadId = validateSmartleadId(existing.id);
                    if (!smartleadId) {
                        throw new Error("Invalid Smartlead campaign ID format");
                    }
                    console.log(`[Smartlead Sync] Using existing campaign: ${smartleadId}`);
                } else {
                    const createRes = await apiCall("/campaigns/create", "POST", { name: campaignName }, chosenKey);
                    if (createRes.data?.id) {
                        smartleadId = validateSmartleadId(createRes.data.id);
                        if (!smartleadId) {
                            throw new Error("Invalid Smartlead campaign ID format from API");
                        }
                        console.log(`[Smartlead Sync] Created new campaign: ${smartleadId}`);
                    } else {
                        throw new Error("Failed to create or find campaign in Smartlead");
                    }
                }
            } else {
                // Validate provided smartleadId
                const validated = validateSmartleadId(smartleadId);
                if (!validated) {
                    throw new Error("Invalid Smartlead campaign ID provided");
                }
                smartleadId = validated;
            }

            // Helper function to validate Smartlead numeric IDs (prevent overflow)
            function validateSmartleadId(id: any): string | null {
                if (!id) return null;
                const idStr = String(id).trim();
                // Must be numeric string, no spaces, no overflow risk
                if (!/^\d{1,15}$/.test(idStr)) return null;
                const num = BigInt(idStr);
                if (num > BigInt("999999999999999")) return null; // Max safe Smartlead ID
                return idStr;
            }

            // 2. Link rotational mailboxes (dedicated per campaign/team member)
            let mailboxIds: number[] = [];
            try {
                const mbRes = await apiCall("/email-accounts", "GET", undefined, chosenKey);
                const allAccounts: any[] = Array.isArray(mbRes.data) ? mbRes.data : [];

                if (Array.isArray(parsed.mailbox_ids) && parsed.mailbox_ids.length > 0) {
                    mailboxIds = parsed.mailbox_ids.map(Number).filter(Boolean);
                } else if (Array.isArray(parsed.sender_emails) && parsed.sender_emails.length > 0) {
                    const requested = parsed.sender_emails.map((e: string) => String(e).toLowerCase().trim());
                    mailboxIds = allAccounts
                        .filter((m: any) => requested.includes(String(m.from_email || m.email || "").toLowerCase().trim()))
                        .map((m: any) => m.id);
                } else if (sender) {
                    const matched = allAccounts.filter((m: any) =>
                        String(m.from_email || m.email || "").toLowerCase().trim() === sender
                    );
                    if (matched.length > 0) {
                        mailboxIds = matched.map((m: any) => m.id);
                    }
                }

                if (mailboxIds.length === 0 && allAccounts.length > 0) {
                    mailboxIds = allAccounts.map((m: any) => m.id);
                }
            } catch (err: any) {
                console.warn("[Smartlead Sync] Mailbox lookup warning:", err.message);
            }

            if (mailboxIds.length > 0) {
                await apiCall(`/campaigns/${smartleadId}/email-accounts`, "POST", {
                    email_account_ids: mailboxIds,
                }, chosenKey);
            }

            // 3. Sequences (Step 1, Step 2, Step 3 with precise delay_in_days)
            const seqSteps = (parsed.steps && parsed.steps.length > 0)
                ? parsed.steps.map((s: any, idx: number) => {
                    const subject = normalizeToSmartleadTemplate(s.subject || (idx === 0 ? `Quick question for {{first_name}}` : ""));
                    const body = normalizeToSmartleadTemplate(s.body_html || s.body_plain || (idx === 0
                        ? "<p>Hi {{first_name}},</p><p>Thought of you when I came across {{company_name}}.</p><p>Quick question - how are you handling [topic]?</p><p>Haji</p>"
                        : "<p>Hi {{first_name}},</p><p>Did you get a chance to think about it?</p><p>Happy to chat.</p><p>Haji</p>"
                    ));

                    // Warn about spam triggers
                    const triggers = detectSpamTriggers(subject + " " + body);
                    if (triggers.length > 0) {
                        console.warn(`[Smartlead Sync] ⚠️ SPAM ALERT - Step ${idx + 1}:`);
                        triggers.forEach(t => console.warn(`     ${t}`));
                    }

                    return {
                        seq_number: idx + 1,
                        seq_delay_details: { delay_in_days: idx === 0 ? 0 : (s.wait_after !== undefined ? Number(s.wait_after) : 3) },
                        subject: subject,
                        email_body: body,
                    };
                })
                : [
                    {
                        seq_number: 1,
                        seq_delay_details: { delay_in_days: 0 },
                        subject: `Quick question for {{first_name}}`,
                        email_body: "<p>Hi {{first_name}},</p><p>Thought of you when I came across {{company_name}}.</p><p>How are you handling [key area]?</p><p>Haji</p>",
                    },
                ];

            await apiCall(`/campaigns/${smartleadId}/sequences`, "POST", { sequences: seqSteps }, chosenKey);

            // 4. Decode Schedule (Timezone, Days of week bitmask/array, sending window)
            // Smartlead expects 0=Sunday, 1=Monday, ..., 6=Saturday
            let daysOfTheWeek: number[] = [1, 2, 3, 4, 5];
            if (Array.isArray(parsed.days) && parsed.days.length > 0) {
                daysOfTheWeek = parsed.days.map((d: any) => {
                    const n = Number(d);
                    return n === 7 ? 0 : n;
                });
            } else if (typeof parsed.days === "number" && parsed.days > 0) {
                const decodedDays: number[] = [];
                for (let i = 0; i < 7; i++) {
                    if ((parsed.days & (1 << i)) !== 0) {
                        // Bit 0 is Mon -> 1, Bit 5 is Sat -> 6, Bit 6 is Sun -> 0
                        decodedDays.push(i === 6 ? 0 : i + 1);
                    }
                }
                if (decodedDays.length > 0) daysOfTheWeek = decodedDays.sort((a, b) => a - b);
            }

            const startHour = parsed.start_time || parsed.startTime || "08:00";
            const endHour = parsed.end_time || parsed.endTime || "18:00";
            const dailyCap = Number(parsed.daily_limit) || Number(parsed.max_new_leads_per_day) || 50;

            // Support aggressive sending: 2-4 sec for ultra-fast, default 180 sec (3 min)
            let minTimeSeconds = Number(parsed.min_time_between_emails) || Number(parsed.send_interval_seconds) || 180;

            // Auto-optimize interval based on mailbox count (if provided)
            const mailboxCount = parsed.mailbox_count || mailboxIds?.length || 8;
            if (parsed.auto_optimize_interval === true && mailboxCount > 0) {
                // Calculate optimal interval: 9 hours / (max_daily_cap / mailbox_count)
                const leadsPerMailbox = dailyCap / mailboxCount;
                const nineHoursSeconds = 9 * 60 * 60; // 32,400 seconds
                const calculatedInterval = Math.round(nineHoursSeconds / leadsPerMailbox);
                minTimeSeconds = calculatedInterval;
                console.log(`[Smartlead Sync] Auto-optimized interval: ${calculatedInterval}s for ${mailboxCount} mailboxes (${leadsPerMailbox} leads/mailbox)`);
            }

            // Allow 2-600 seconds (2 sec to 10 min) - WARNING: <5 sec is high-risk for ISP blocks
            const safeSendInterval = Math.max(2, Math.min(minTimeSeconds, 600));

            // Log warning for aggressive intervals
            if (safeSendInterval < 5) {
                console.warn(`[Smartlead Sync] ⚠️  AGGRESSIVE SENDING: ${safeSendInterval}sec interval - HIGH RISK for ISP blocks/spam filters`);
            }

            // Log optimization info
            if (mailboxCount > 8) {
                console.log(`[Smartlead Sync] 📊 Optimized for ${mailboxCount} mailboxes: ${safeSendInterval}s interval, ${dailyCap / mailboxCount} leads/mailbox`);
            }

            const schedulePayload: Record<string, any> = {
                timezone: parsed.timezone || "Asia/Kolkata",
                days_of_the_week: daysOfTheWeek,
                start_hour: startHour,
                end_hour: endHour,
                min_time_btw_emails: safeSendInterval,
                max_new_leads_per_day: dailyCap,
            };
            if (parsed.start_date) schedulePayload.start_date = parsed.start_date;
            if (parsed.end_date) schedulePayload.end_date = parsed.end_date;

            await apiCall(`/campaigns/${smartleadId}/schedule`, "POST", schedulePayload, chosenKey);

            // 5. Update Campaign Settings (Stop on Reply, Open & Click Tracking)
            try {
                const trackSettings: string[] = [];
                if (parsed.open_tracking === false || parsed.track_opens === false) {
                    trackSettings.push("DONT_TRACK_EMAIL_OPEN");
                }
                if (parsed.link_tracking === false || parsed.track_clicks === false) {
                    trackSettings.push("DONT_TRACK_LINK_CLICK");
                }
                const stopCondition = parsed.stop_on_reply === false ? null : "REPLY_TO_AN_EMAIL";

                await apiCall(`/campaigns/${smartleadId}/settings`, "POST", {
                    stop_lead_settings: stopCondition,
                    track_settings: trackSettings,
                }, chosenKey);
            } catch (settingsErr: any) {
                console.warn("[Smartlead Sync] Settings update warning:", settingsErr.message);
            }

            // 5. Leads
            const rawLeads = parsed.leads || [];
            if (rawLeads.length > 0) {
                const leadList = rawLeads.map((l: any) => {
                    const fName = l.first_name || l.firstName || (l.name ? l.name.split(" ")[0] : "") || (l.email ? l.email.split("@")[0] : "Prospect");
                    const lName = l.last_name || l.lastName || (l.name ? l.name.split(" ").slice(1).join(" ") : "") || "";
                    const cName = cleanCompanyName(l.company || l.company_name || l.custom_fields?.company);
                    const jobTitle = l.title || l.role || l.custom_fields?.title || "Executive";
                    return {
                        email: l.email,
                        first_name: fName,
                        last_name: lName,
                        company_name: cName,
                        custom_fields: {
                            title: jobTitle,
                            firstName: fName,
                            lastName: lName,
                            company: cName,
                            first_name: fName,
                            last_name: lName,
                            company_name: cName,
                        },
                    };
                });
                await apiCall(`/campaigns/${smartleadId}/leads`, "POST", { lead_list: leadList }, chosenKey);
            }

            // 6. Start campaign
            const startRes = await apiCall(`/campaigns/${smartleadId}/status`, "POST", { status: "START" }, chosenKey);

            // 7. Save campaign to database (CRITICAL FIX: This was missing)
            // Use explicit transaction to prevent race condition on concurrent upserts
            let dbCampaignId: string | null = null;
            try {
                // Start transaction for atomic campaign + steps + leads persistence
                await pgQuery(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

                const dbResult = await pgQuery<any>(
                    `INSERT INTO "Campaign" (id, "userId", name, status, "providerCampaignId", "sendTimezone", "preferredSendHour", "preferredSendDays")
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT ("userId", name) DO UPDATE SET "providerCampaignId" = EXCLUDED."providerCampaignId", "updatedAt" = NOW()
                     RETURNING id`,
                    [
                        user.id,
                        campaignName,
                        'ACTIVE',
                        String(smartleadId),
                        parsed.timezone || "Asia/Kolkata",
                        parsed.start_time ? parseInt(parsed.start_time.split(":")[0]) : null,
                        JSON.stringify(parsed.days || [1, 2, 3, 4, 5]),
                    ]
                );
                dbCampaignId = dbResult?.[0]?.id;
                console.log(`[Smartlead Sync] Campaign saved to database: ${dbCampaignId}`);
            } catch (dbErr: any) {
                await pgQuery(`ROLLBACK`).catch(() => {});
                console.error("[Smartlead Sync] Database persistence failed:", dbErr.message);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "database_persistence_failed", details: dbErr.message }));
                return;
            }

            // 8. Save leads to database with campaign linkage (within transaction)
            if (rawLeads.length > 0 && dbCampaignId) {
                try {
                    for (const lead of rawLeads) {
                        // Validate and truncate inputs
                        const firstName = (lead.first_name || lead.firstName || (lead.name ? lead.name.split(" ")[0] : "") || (lead.email ? lead.email.split("@")[0] : "Prospect")).slice(0, 100);
                        const lastName = (lead.last_name || lead.lastName || (lead.name ? lead.name.split(" ").slice(1).join(" ") : "") || "").slice(0, 100);
                        const email = (lead.email || "").toLowerCase().trim();

                        // Validate email
                        if (!email || !email.includes("@")) {
                            console.warn(`[Smartlead Sync] Skipping invalid email: ${email}`);
                            continue;
                        }

                        await pgQuery(
                            `INSERT INTO "Lead" (id, "campaignId", email, "firstName", "lastName", source, status)
                             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'smartlead', 'ACTIVE')
                             ON CONFLICT (email, "campaignId") DO NOTHING`,
                            [dbCampaignId, email, firstName, lastName]
                        );
                    }
                    console.log(`[Smartlead Sync] ${rawLeads.length} leads linked to campaign ${dbCampaignId}`);

                    // Commit transaction after all leads inserted successfully
                    await pgQuery(`COMMIT`);
                    console.log(`[Smartlead Sync] Transaction committed for campaign ${dbCampaignId}`);
                } catch (leadsErr: any) {
                    await pgQuery(`ROLLBACK`).catch(() => {});
                    console.error("[Smartlead Sync] Lead linkage failed:", leadsErr.message);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "lead_linkage_failed", details: leadsErr.message }));
                    return;
                }
            } else if (dbCampaignId) {
                // Commit even if no leads
                await pgQuery(`COMMIT`).catch(() => {});
            }

            // 9. Ensure Live Webhook is registered pointing to production domain
            try {
                // Use environment variable for webhook URL to support different deployments
                const webhookUrl = process.env.WEBHOOK_URL || "https://tbmoutreach.tech/api/webhooks/smartlead";

                const whRes = await apiCall(`/campaigns/${smartleadId}/webhooks`, "GET", undefined, chosenKey);
                const existing = Array.isArray(whRes.data) ? whRes.data : [];
                const hasWebhook = existing.some((w: any) => w.webhook_url === webhookUrl);

                if (!hasWebhook) {
                    await apiCall(`/campaigns/${smartleadId}/webhooks`, "POST", {
                        name: "Email System Live Webhook",
                        webhook_url: webhookUrl,
                        event_types: [
                            "EMAIL_OPEN",
                            "EMAIL_SENT",
                            "EMAIL_REPLY",
                            "EMAIL_BOUNCE",
                            "EMAIL_LINK_CLICK",
                            "LEAD_UNSUBSCRIBED",
                        ],
                    }, chosenKey);
                    console.log(`[Smartlead Sync] Webhook registered: ${webhookUrl}`);
                }
            } catch (wErr: any) {
                console.warn(`[Smartlead API] Webhook check/register warning:`, wErr.message);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                id: dbCampaignId,
                smartlead_id: smartleadId,
                status: "ACTIVE",
                leads_count: rawLeads.length,
                mailbox_linked: mailboxIds,
                smartlead_response: startRes.data,
            }));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}
