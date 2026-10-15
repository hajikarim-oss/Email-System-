import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { reconcileSmartleadCampaigns, ensureImmediateSendingSchedule } from "../../server/smartleadSync";

const SL_BASE = "https://server.smartlead.ai/api/v1";

function slApiCall(endpoint: string, method: string, body?: any, apiKey?: string): Promise<{ status: number; data: any }> {
    const key = apiKey || smartleadPrimary();
    if (!key) return Promise.resolve({ status: 503, data: { error: "no_api_key" } });
    return new Promise((resolve, reject) => {
        const sep = endpoint.includes("?") ? "&" : "?";
        const url = `${SL_BASE}${endpoint}${sep}api_key=${key}`;
        const payload = body ? JSON.stringify(body) : "";
        const req = https.request(url, {
            method,
            headers: { "Content-Type": "application/json", ...(body ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}) },
        }, (res) => {
            let text = "";
            res.on("data", (c: any) => { text += c; });
            res.on("end", () => {
                try { resolve({ status: res.statusCode || 200, data: JSON.parse(text) }); }
                catch { resolve({ status: res.statusCode || 200, data: text }); }
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function normalizeTemplate(text: string): string {
    if (!text) return "";
    return text
        .replace(/\{\{\s*firstName\s*\}\}/g, "{{first_name}}")
        .replace(/\{\{\s*lastName\s*\}\}/g, "{{last_name}}")
        .replace(/\{\{\s*CompanyName\s*\}\}/g, "{{company_name}}")
        .replace(/\{\{\s*JobTitle\s*\}\}/g, "{{title}}");
}

function deleteFromSmartlead(campaignId: string | number): Promise<boolean> {
    const keys = [smartleadPrimary(), smartleadSecondary()].filter(Boolean);
    if (!keys.length || !campaignId) return Promise.resolve(false);

    return Promise.all(
        keys.map(
            (k) =>
                new Promise<boolean>((resolve) => {
                    const url = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}?api_key=${k}`;
                    const parsedUrl = new URL(url);
                    const req = https.request(
                        {
                            hostname: parsedUrl.hostname,
                            path: parsedUrl.pathname + parsedUrl.search,
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                        },
                        (res) => {
                            resolve(res.statusCode === 200 || res.statusCode === 204);
                        }
                    );
                    req.on("error", () => resolve(false));
                    req.setTimeout(5000, () => {
                        req.destroy();
                        resolve(false);
                    });
                    req.end();
                })
        )
    ).then((results) => results.some(Boolean));
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk) => { text += chunk; });
        req.on("end", () => resolve(text));
        req.on("error", () => resolve(""));
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);

        const parsedUrl = new URL(req.url || "", "http://localhost:3000");
        const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

        let campIdParam: string | null = null;
        let subAction: string | null = null;

        const campaignsIdx = pathParts.findIndex((p) => p === "campaigns");
        if (campaignsIdx >= 0 && pathParts.length > campaignsIdx + 1) {
            campIdParam = pathParts[campaignsIdx + 1];
            if (pathParts.length > campaignsIdx + 2) {
                subAction = pathParts[campaignsIdx + 2];
            }
        } else if (pathParts.length > 0) {
            const last = pathParts[pathParts.length - 1];
            if (!["campaigns", "intelligence", "v1", "api"].includes(last)) {
                campIdParam = last;
            }
        }

        if (!campIdParam || ["campaigns", "intelligence", "v1", "api"].includes(campIdParam)) {
            campIdParam = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("campaignId");
        }

        if (campIdParam && ["stats", "steps", "analytics", "logs"].includes(campIdParam)) {
            campIdParam = null;
        }

        // Handle DELETE campaign (both live DB and Smartlead)
        if (req.method === "DELETE") {
            let campId = campIdParam;

            if (!campId) {
                const rawBody = await readBody(req);
                try {
                    const parsed = JSON.parse(rawBody || "{}");
                    campId = parsed.id || parsed.campaignId;
                } catch {}
            }

            if (!campId) {
                send(res, 400, { error: "missing_campaign_id" });
                return;
            }

            // Find campaign in DB
            const existing = await pgQuery<any>(
                `SELECT id, "userId", "providerCampaignId", name FROM "Campaign" WHERE id = $1 OR "providerCampaignId" = $1 LIMIT 1`,
                [campId]
            );

            if (existing && existing.length > 0) {
                const camp = existing[0];

                // Authorization check: master can delete any campaign, team members can only delete their own
                if (!scope.master && camp.userId !== scope.userId) {
                    send(res, 403, { error: "You can only delete your own campaigns" });
                    return;
                }

                console.log(`[Campaigns DELETE] User ${user.email} deleting campaign ${camp.id} (owner: ${camp.userId})`);

                // Delete associated records
                await pgQuery(`DELETE FROM "CampaignMailbox" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`DELETE FROM "CampaignStep" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`UPDATE "Lead" SET "campaignId" = NULL WHERE "campaignId" = $1 OR "campaignId" = $2`, [camp.id, camp.providerCampaignId || camp.id]);
                await pgQuery(`DELETE FROM "Campaign" WHERE id = $1`, [camp.id]);

                // Delete from Smartlead if connected
                if (camp.providerCampaignId) {
                    await deleteFromSmartlead(camp.providerCampaignId);
                }

                console.log(`[Campaigns DELETE] ✓ Campaign deleted successfully`);
            } else {
                if (/^\d+$/.test(campId)) {
                    await deleteFromSmartlead(campId);
                }
            }

            send(res, 200, { success: true, deleted_id: campId });
            return;
        }

        // Handle POST / PUT campaign launch or start
        if (campIdParam && (subAction === "launch" || subAction === "start") && (req.method === "POST" || req.method === "PUT")) {
            const existing = await pgQuery<any>(
                `SELECT id, name, status, "userId", "providerCampaignId", "sendTimezone", "preferredSendHour", "preferredSendDays"
                 FROM "Campaign"
                 WHERE id = $1 OR "providerCampaignId" = $1 LIMIT 1`,
                [campIdParam]
            );

            if (!existing || existing.length === 0) {
                send(res, 404, { error: "campaign_not_found" });
                return;
            }

            const camp = existing[0];
            if (!scope.master && camp.userId !== scope.userId) {
                send(res, 403, { error: "unauthorized" });
                return;
            }

            const apiKey = smartleadPrimary();
            if (!apiKey) {
                send(res, 500, { error: "smartlead_api_key_not_configured" });
                return;
            }

            const tz = camp.sendTimezone || "Asia/Kolkata";
            const days = Array.isArray(camp.preferredSendDays) && camp.preferredSendDays.length > 0
                ? camp.preferredSendDays : [1, 2, 3, 4, 5];

            // 1. Fetch active leads from database
            const leads = await pgQuery<any>(
                `SELECT email, "firstName", "lastName", "customData"
                 FROM "Lead" WHERE "campaignId" = $1 AND status = 'ACTIVE'`, [camp.id]
            );
            if (leads.length === 0) {
                send(res, 400, { error: "no_active_leads", message: "Campaign has no active leads" });
                return;
            }

            // 2. Get linked mailbox Smartlead IDs
            const mailboxRows = await pgQuery<any>(
                `SELECT m."providerMailboxId" FROM "CampaignMailbox" cm
                 JOIN "Mailbox" m ON m.id = cm."mailboxId"
                 WHERE cm."campaignId" = $1`, [camp.id]
            );
            let slMailboxIds: number[] = mailboxRows
                .map((m: any) => parseInt(m.providerMailboxId, 10))
                .filter((id: number) => !isNaN(id) && id > 0);

            // If no mailboxes linked locally, fetch all from Smartlead
            if (slMailboxIds.length === 0) {
                try {
                    const mbRes = await slApiCall("/email-accounts", "GET", undefined, apiKey);
                    if (Array.isArray(mbRes.data)) {
                        slMailboxIds = mbRes.data.map((m: any) => m.id).filter(Boolean);
                    }
                } catch {}
            }
            if (slMailboxIds.length === 0) {
                send(res, 400, { error: "no_mailboxes_available" });
                return;
            }

            // 3. Resolve or create campaign on Smartlead
            let smartleadId = camp.providerCampaignId;
            if (!smartleadId) {
                const createRes = await slApiCall("/campaigns/create", "POST", { name: camp.name }, apiKey);
                if (!createRes.data?.id) {
                    send(res, 502, { error: "smartlead_campaign_creation_failed", detail: createRes.data });
                    return;
                }
                smartleadId = String(createRes.data.id);
                console.log(`[Launch] Created Smartlead campaign #${smartleadId} for "${camp.name}"`);

                await pgQuery(
                    `UPDATE "Campaign" SET "providerCampaignId" = $1, status = 'ACTIVE', "updatedAt" = NOW() WHERE id = $2`,
                    [smartleadId, camp.id]
                );
            } else {
                await pgQuery(`UPDATE "Campaign" SET status = 'ACTIVE', "updatedAt" = NOW() WHERE id = $1`, [camp.id]);
            }

            // 4. Ensure sequences are present in Smartlead
            const steps = await pgQuery<any>(
                `SELECT "stepNumber", "delayDays", subject, "bodyTemplate"
                 FROM "CampaignStep" WHERE "campaignId" = $1 ORDER BY "stepNumber" ASC`, [camp.id]
            );
            if (steps.length > 0) {
                let existingSeqs: any[] = [];
                try {
                    const seqCheck = await slApiCall(`/campaigns/${smartleadId}/sequences`, "GET", undefined, apiKey);
                    if (Array.isArray(seqCheck.data)) existingSeqs = seqCheck.data;
                } catch {}

                if (existingSeqs.length === 0) {
                    const sequences = steps.map((s: any, idx: number) => ({
                        seq_number: idx + 1,
                        seq_delay_details: { delay_in_days: s.delayDays || (idx === 0 ? 0 : 3) },
                        subject: normalizeTemplate(s.subject || `Step ${idx + 1}`),
                        email_body: normalizeTemplate(s.bodyTemplate || ""),
                    }));
                    const seqRes = await slApiCall(`/campaigns/${smartleadId}/sequences`, "POST", { sequences }, apiKey);
                    if (seqRes.status >= 300) console.error("[Launch] Sequences error:", seqRes.data);
                }
            }

            // 5. Link mailboxes
            const mbLinkRes = await slApiCall(`/campaigns/${smartleadId}/email-accounts`, "POST", {
                email_account_ids: slMailboxIds,
            }, apiKey);
            if (mbLinkRes.status >= 300) console.error("[Launch] Mailbox link error:", mbLinkRes.data);

            // 6. Check existing leads in Smartlead & upload missing leads in batches of 50
            let slTotalLeads = 0;
            try {
                const slLeadsCheck = await slApiCall(`/campaigns/${smartleadId}/leads?limit=1`, "GET", undefined, apiKey);
                slTotalLeads = Number(slLeadsCheck.data?.total_leads) || 0;
            } catch {}

            console.log(`[Launch] Campaign #${smartleadId} has ${slTotalLeads} leads in Smartlead, ${leads.length} in DB`);
            if (slTotalLeads < leads.length) {
                for (let i = 0; i < leads.length; i += 50) {
                    const batch = leads.slice(i, i + 50);
                    const leadList = batch.map((l: any) => {
                        const custom = (typeof l.customData === "object" && l.customData) ? l.customData : {};
                        const companyName = custom.company || custom.company_name || l.company || l.company_name || "";
                        const title = custom.title || custom.role || l.title || l.role || "";
                        const fName = l.firstName || l.first_name || (l.name ? l.name.split(" ")[0] : "") || (l.email ? l.email.split("@")[0] : "Prospect");
                        const lName = l.lastName || l.last_name || (l.name ? l.name.split(" ").slice(1).join(" ") : "") || "";

                        return {
                            email: l.email,
                            first_name: fName,
                            last_name: lName,
                            company_name: companyName,
                            custom_fields: {
                                company: companyName,
                                company_name: companyName,
                                title: title,
                                firstName: fName,
                                lastName: lName,
                                ...custom,
                            },
                        };
                    });
                    const lRes = await slApiCall(`/campaigns/${smartleadId}/leads`, "POST", { lead_list: leadList }, apiKey);
                    if (lRes.status >= 300) {
                        console.error(`[Launch] Leads upload error for #${smartleadId} (batch ${i}..${i + batch.length}):`, lRes.data);
                    }
                }
            }

            // 7. Set schedule using campaign's configured send hour
            const configuredStartH = camp.preferredSendHour != null ? `${String(camp.preferredSendHour).padStart(2, "0")}:00` : "09:00";
            const configuredEndH = "18:00";

            await slApiCall(`/campaigns/${smartleadId}/schedule`, "POST", {
                timezone: tz,
                days_of_the_week: days,
                start_hour: configuredStartH,
                end_hour: configuredEndH,
                min_time_btw_emails: 3,
                max_new_leads_per_day: 50 * slMailboxIds.length,
            }, apiKey);

            // 8. Start campaign
            await slApiCall(`/campaigns/${smartleadId}/status`, "POST", { status: "START" }, apiKey);

            // 9. Ensure immediate sending window
            try {
                await ensureImmediateSendingSchedule(smartleadId, { timezone: tz, days, start_time: configuredStartH, end_time: configuredEndH, apiKey });
            } catch {}

            // 10. Register webhook
            const webhookUrl = process.env.WEBHOOK_URL || "https://tbmoutreach.tech/api/webhooks/smartlead";
            await slApiCall(`/campaigns/${smartleadId}/webhooks`, "POST", {
                name: "TBM Webhook",
                webhook_url: webhookUrl,
                event_types: ["EMAIL_OPEN", "EMAIL_SENT", "EMAIL_REPLY", "EMAIL_BOUNCE", "EMAIL_LINK_CLICK", "LEAD_UNSUBSCRIBED"],
            }, apiKey).catch(() => {});

            console.log(`[Launch] Campaign "${camp.name}" fully synced to Smartlead #${smartleadId} (${leads.length} leads, ${slMailboxIds.length} mailboxes)`);

            send(res, 200, {
                ok: true,
                id: camp.id,
                status: "ACTIVE",
                name: camp.name,
                smartlead_id: smartleadId,
                leads_count: leads.length,
                mailboxes_linked: slMailboxIds.length,
                message: `Campaign launched on Smartlead (ID: ${smartleadId}). ${leads.length} leads queued.`,
            });
            return;
        }

        // Handle POST campaign pause / stop
        if (campIdParam && (subAction === "pause" || subAction === "stop") && (req.method === "POST" || req.method === "PUT")) {
            const existing = await pgQuery<any>(
                `SELECT id, name, "userId", "providerCampaignId"
                 FROM "Campaign" WHERE id = $1 OR "providerCampaignId" = $1 LIMIT 1`,
                [campIdParam]
            );
            if (!existing || existing.length === 0) {
                send(res, 404, { error: "campaign_not_found" });
                return;
            }
            const camp = existing[0];
            if (!scope.master && camp.userId !== scope.userId) {
                send(res, 403, { error: "unauthorized" });
                return;
            }

            await pgQuery(`UPDATE "Campaign" SET status = 'PAUSED', "updatedAt" = NOW() WHERE id = $1`, [camp.id]);

            if (camp.providerCampaignId) {
                const apiKey = smartleadPrimary();
                if (apiKey) {
                    await slApiCall(`/campaigns/${camp.providerCampaignId}/status`, "POST", { status: "PAUSED" }, apiKey).catch(() => {});
                    console.log(`[Pause] Paused Smartlead campaign #${camp.providerCampaignId} ("${camp.name}")`);
                }
            }

            send(res, 200, { ok: true, id: camp.id, status: "PAUSED", name: camp.name });
            return;
        }

        // Handle POST campaign creation
        if (req.method === "POST" && (!subAction || subAction === "create")) {
            const rawBody = await readBody(req);
            try {
                const input = JSON.parse(rawBody || "{}");
                const campaignName = input.name || `Campaign ${Date.now()}`;

                // Validate required fields
                if (!campaignName || !campaignName.trim()) {
                    send(res, 400, { error: "campaign_name_required" });
                    return;
                }

                // Check for duplicate campaign name (unique per user)
                const existing = await pgQuery<any>(
                    `SELECT id FROM "Campaign" WHERE "userId" = $1 AND name = $2 LIMIT 1`,
                    [scope.userId, campaignName]
                );

                if (existing && existing.length > 0) {
                    send(res, 409, { error: "campaign_name_taken", name: campaignName });
                    return;
                }

                // Create campaign in database
                const campaign = await pgQuery<any>(
                    `INSERT INTO "Campaign" (id, "userId", name, status, "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
                     RETURNING id, "userId", name, status, "providerCampaignId", "createdAt", "updatedAt"`,
                    [
                        scope.userId,
                        campaignName,
                        input.status || "DRAFT",
                        input.timezone || "Asia/Kolkata",
                        input.start_time ? parseInt(input.start_time.split(":")[0]) : null,
                        (Array.isArray(input.days) ? input.days : [1, 2, 3, 4, 5]).map(Number),
                    ]
                );

                if (!campaign || campaign.length === 0) {
                    send(res, 500, { error: "campaign_creation_failed" });
                    return;
                }

                const campaignId = campaign[0].id;

                // If campaign has steps, create them
                if (Array.isArray(input.steps) && input.steps.length > 0) {
                    for (let i = 0; i < input.steps.length; i++) {
                        const step = input.steps[i];
                        const subject = (step.subject || `Step ${i + 1}`).slice(0, 255);
                        const body = (step.body_html || step.body_plain || "<p>Hello {{first_name}}</p>").slice(0, 65535);

                        await pgQuery(
                            `INSERT INTO "CampaignStep" (id, "campaignId", "stepNumber", "delayDays", subject, "bodyTemplate", "createdAt", "updatedAt")
                             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())`,
                            [
                                campaignId,
                                i + 1,
                                step.wait_after || (i === 0 ? 0 : 3),
                                subject,
                                body,
                            ]
                        );
                    }
                }

                // Auto-assign all active mailboxes so the campaign is ready to launch
                try {
                    const activeMbs = await pgQuery<any>(
                        `SELECT id FROM "Mailbox" WHERE status = 'ACTIVE'`
                    );
                    for (const mb of activeMbs) {
                        await pgQuery(
                            `INSERT INTO "CampaignMailbox" ("campaignId", "mailboxId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [campaignId, mb.id]
                        ).catch(() => {});
                    }
                } catch {}

                // NO CACHE on campaign creation - devices must sync immediately
                send(res, 201, {
                    ...campaign[0],
                    status: (campaign[0].status || "draft").toLowerCase(),
                }, 0);
                return;
            } catch (err: any) {
                if (err instanceof DatabaseUnavailableError) {
                    send(res, 503, { error: "database_unavailable" });
                    return;
                }
                send(res, 500, { error: err?.message || "Campaign creation failed" });
                return;
            }
        }

        // Single campaign GET: /:id
        if (req.method === "GET" && campIdParam && !subAction) {
            const campRows = await pgQuery<any>(
                `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                        c."sendTimezone", c."preferredSendHour", c."preferredSendDays",
                        COUNT(l.id)::int AS lead_count
                 FROM "Campaign" c
                 LEFT JOIN "Lead" l ON l."campaignId" = c.id
                 WHERE c.id = $1 OR c."providerCampaignId" = $1 OR lower(c.name) = lower($1)
                 GROUP BY c.id
                 LIMIT 1`,
                [campIdParam]
            );

            if (!campRows || campRows.length === 0) {
                send(res, 404, { error: "campaign_not_found" });
                return;
            }

            const camp = campRows[0];

            // Authorization check: master or same team
            if (!scope.master && camp.userId !== scope.userId) {
                const userTeams = await pgQuery<{ teamId: string }>(
                    `SELECT DISTINCT "teamId" FROM "UserTeam" WHERE "userId" = $1`,
                    [scope.userId]
                );
                const teamIds = userTeams.map((t: any) => t.teamId).filter(Boolean);
                let authorized = false;
                if (teamIds.length > 0) {
                    const teamUsers = await pgQuery<{ userId: string }>(
                        `SELECT DISTINCT "userId" FROM "UserTeam" WHERE "teamId" = ANY($1::text[])`,
                        [teamIds]
                    );
                    authorized = teamUsers.some((u: any) => u.userId === camp.userId);
                }
                if (!authorized) {
                    send(res, 403, { error: "unauthorized" });
                    return;
                }
            }

            const stepRows = await pgQuery<any>(
                `SELECT id, "stepNumber", "delayDays", subject, "bodyTemplate", "createdAt", "updatedAt"
                 FROM "CampaignStep"
                 WHERE "campaignId" = $1
                 ORDER BY "stepNumber" ASC`,
                [camp.id]
            );

            const mailboxRows = await pgQuery<any>(
                `SELECT cm."campaignId", cm."mailboxId", m."senderEmail", m."providerMailboxId"
                 FROM "CampaignMailbox" cm
                 JOIN "Mailbox" m ON m.id = cm."mailboxId"
                 WHERE cm."campaignId" = $1`,
                [camp.id]
            );

            const mappedCamp = {
                id: camp.id,
                userId: camp.userId,
                user_id: camp.userId,
                name: camp.name,
                description: "Outreach sequence",
                status: (camp.status || "draft").toLowerCase(),
                kind: "sequence",
                stop_on_reply: true,
                open_tracking: true,
                link_tracking: true,
                utm_tracking: false,
                text_only: false,
                daily_limit: 200,
                unsubscribe_header: true,
                risky_emails: false,
                unsubscribe_mode: "inherit",
                cc: [],
                bcc: [],
                start_date: camp.createdAt,
                end_date: null,
                timezone: camp.sendTimezone || "Asia/Kolkata",
                days: camp.preferredSendDays || [1, 2, 3, 4, 5],
                start_time: camp.preferredSendHour ? `${String(camp.preferredSendHour).padStart(2, "0")}:00` : "10:00",
                end_time: "18:00",
                total_leads: Number(camp.lead_count || 0),
                lead_count: Number(camp.lead_count || 0),
                _count: { leads: Number(camp.lead_count || 0) },
                smartlead_id: camp.providerCampaignId ? parseInt(camp.providerCampaignId) : undefined,
                smartlead_status: (camp.status || "").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED",
                steps: stepRows.map((s: any) => ({
                    id: s.id,
                    stepNumber: s.stepNumber,
                    position: s.stepNumber,
                    name: `Step ${s.stepNumber}`,
                    subject: s.subject || "",
                    body_plain: s.bodyTemplate || "",
                    body_html: s.bodyTemplate || "",
                    wait_after: s.delayDays ?? (s.stepNumber === 1 ? 0 : 3),
                })),
                mailboxes: mailboxRows.map((mb: any) => ({
                    id: mb.mailboxId,
                    senderEmail: mb.senderEmail,
                    senderName: (mb.senderEmail || "").split("@")[0],
                    providerMailboxId: mb.providerMailboxId,
                })),
                created_at: camp.createdAt ? new Date(camp.createdAt).toISOString() : new Date().toISOString(),
                updated_at: camp.updatedAt ? new Date(camp.updatedAt).toISOString() : new Date().toISOString(),
            };

            send(res, 200, mappedCamp, 0);
            return;
        }

        // GET campaigns - Team-based visibility
        if (!scope.master && !scope.userId) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "user_id_required", message: "User ID missing from scope" }));
            return;
        }

        console.log(`[Campaigns API] User: ${user.email}, Role: ${user.role}, Master: ${scope.master}`);

        // Automatically reconcile Smartlead campaigns so newly created campaigns register without manual sync
        await reconcileSmartleadCampaigns().catch(() => {});

        let campaigns: any[] = [];

        if (scope.master) {
            // Master sees all campaigns
            campaigns = await pgQuery<any>(
                `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                        COUNT(l.id)::int AS lead_count
                 FROM "Campaign" c
                 LEFT JOIN "Lead" l ON l."campaignId" = c.id
                 GROUP BY c.id
                 ORDER BY c."createdAt" DESC`
            );
        } else {
            // Team member sees campaigns from their team members + their own
            campaigns = await pgQuery<any>(
                `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                        COUNT(l.id)::int AS lead_count
                 FROM "Campaign" c
                 LEFT JOIN "Lead" l ON l."campaignId" = c.id
                 WHERE c."userId" IN (
                    SELECT DISTINCT ut."userId"
                    FROM "UserTeam" ut
                    WHERE ut."teamId" IN (
                      SELECT "teamId" FROM "UserTeam" WHERE "userId" = $1
                    )
                    UNION ALL
                    SELECT $1 as "userId"
                 )
                 GROUP BY c.id
                 ORDER BY c."createdAt" DESC`,
                [scope.userId]
            );
        }

        // Verify authorization
        if (!scope.master && campaigns.length > 0) {
            const userTeams = await pgQuery<{ teamId: string }>(
                `SELECT DISTINCT "teamId" FROM "UserTeam" WHERE "userId" = $1`,
                [scope.userId]
            );
            const teamIds = userTeams.map((t: any) => t.teamId).filter(Boolean);
            const authorizedUserIds = new Set<string>([scope.userId]);
            if (teamIds.length > 0) {
                const teamUserIds = await pgQuery<{ userId: string }>(
                    `SELECT DISTINCT "userId" FROM "UserTeam" WHERE "teamId" = ANY($1::text[])`,
                    [teamIds]
                );
                teamUserIds.forEach((u: any) => authorizedUserIds.add(u.userId));
            }

            const unauthorizedCampaigns = campaigns.filter((c: any) => !authorizedUserIds.has(c.userId));
            if (unauthorizedCampaigns.length > 0) {
                campaigns = campaigns.filter((c: any) => authorizedUserIds.has(c.userId));
            }
        }

        const formatted = campaigns.map((c: any) => ({
            ...c,
            status: (c.status || "draft").toLowerCase(),
            created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
            updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
            user_id: c.userId || "",
            smartlead_id: c.providerCampaignId ? Number(c.providerCampaignId) : undefined,
            _count: { leads: Number(c.lead_count || 0) },
            total_leads: Number(c.lead_count || 0),
        }));

        // NO CACHE for campaigns list - always fresh from database
        send(res, 200, formatted, 0);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
