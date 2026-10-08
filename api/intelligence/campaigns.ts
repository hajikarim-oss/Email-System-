import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";

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

async function generateCuid(): Promise<string> {
    return await pgQuery<any>(`SELECT gen_random_uuid()::text as id`).then(rows => rows?.[0]?.id || "");
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);

        // Handle DELETE campaign (both live DB and Smartlead)
        if (req.method === "DELETE") {
            const parsedUrl = new URL(req.url || "", "http://localhost");
            const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
            let campId = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("campaignId");
            
            // Extract from path if /campaigns/:id or /api/campaigns/:id
            if (!campId && pathParts.length > 0) {
                const last = pathParts[pathParts.length - 1];
                if (last !== "campaigns" && last !== "intelligence") {
                    campId = last;
                }
            }

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

            // Master-only check for campaign deletion
            if (!scope.master) {
                send(res, 403, { error: "Only master can delete campaigns" });
                return;
            }

            // Find campaign in DB and verify it belongs to user's workspace
            const existing = await pgQuery<any>(
                `SELECT id, "userId", "workspaceId", "providerCampaignId", name FROM "Campaign" WHERE (id = $1 OR "providerCampaignId" = $1) AND "workspaceId" = $2 LIMIT 1`,
                [campId, scope.workspaceId]
            );

            if (existing && existing.length > 0) {
                const camp = existing[0];

                // Delete associated records
                await pgQuery(`DELETE FROM "CampaignMailbox" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`DELETE FROM "CampaignStep" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`UPDATE "Lead" SET "campaignId" = NULL WHERE "campaignId" = $1 OR "campaignId" = $2`, [camp.id, camp.providerCampaignId || camp.id]);
                await pgQuery(`DELETE FROM "Campaign" WHERE id = $1`, [camp.id]);

                // Delete from Smartlead if connected
                if (camp.providerCampaignId) {
                    await deleteFromSmartlead(camp.providerCampaignId);
                }
            } else {
                // If not in DB, it might still be a Smartlead ID directly
                if (/^\d+$/.test(campId)) {
                    await deleteFromSmartlead(campId);
                }
            }

            send(res, 200, { success: true, deleted_id: campId });
            return;
        }

        // Handle POST campaign creation
        if (req.method === "POST") {
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

                // Create campaign in database WITH workspaceId
                const campaign = await pgQuery<any>(
                    `INSERT INTO "Campaign" (id, "workspaceId", "userId", name, status, "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                     RETURNING id, "workspaceId", "userId", name, status, "providerCampaignId", "createdAt", "updatedAt"`,
                    [
                        scope.workspaceId,
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
                        // Validate subject and body length
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

                // NO CACHE on campaign creation - devices must sync immediately
                send(res, 201, campaign[0], 0);
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

        // GET campaigns - Filter by workspace (not just userId)
        if (!scope.workspaceId) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "workspace_id_required", message: "Workspace ID missing from scope" }));
            return;
        }

        // FIXED: Filter by workspaceId so team members see all campaigns in their workspace
        const campaigns = await pgQuery<any>(
            `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId", c."workspaceId",
                    COUNT(l.id)::int AS lead_count
             FROM "Campaign" c
             LEFT JOIN "Lead" l ON l."campaignId" = c.id
             WHERE c."workspaceId" = $1
             GROUP BY c.id
             ORDER BY c."createdAt" DESC`,
            [scope.workspaceId]
        );

        // Security check: all campaigns should belong to user's workspace
        if (campaigns.length > 0) {
            const unauthorizedCampaigns = campaigns.filter((c: any) => c.workspaceId !== scope.workspaceId);
            if (unauthorizedCampaigns.length > 0) {
                console.error(`[SECURITY] User ${scope.userId} attempted to access campaigns outside their workspace:`, unauthorizedCampaigns.map((c: any) => c.id));
                // Filter out unauthorized campaigns
                const filteredCampaigns = campaigns.filter((c: any) => c.workspaceId === scope.workspaceId);
                send(res, 200, filteredCampaigns, 0); // NO CACHE - security critical
                return;
            }
        }

        // NO CACHE for campaigns list - always fresh from database
        // Cache: 0 means no caching (browser won't cache this)
        send(res, 200, campaigns, 0);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
