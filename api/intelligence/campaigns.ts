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

            // Find campaign in DB (workspace check added after migration)
            // TODO: After workspace migration, add: AND "workspaceId" = $2
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

                // Create campaign in database (will use workspaceId after migration)
                // NOTE: workspaceId column added via migration, will be populated in post-migration version
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

        // GET campaigns - Team-based visibility
        if (!scope.master && !scope.userId) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "user_id_required", message: "User ID missing from scope" }));
            return;
        }

        console.log(`[Campaigns API] User: ${user.email}, Role: ${user.role}, Master: ${scope.master}`);

        let campaigns: any[] = [];

        if (scope.master) {
            // Master sees all campaigns
            console.log(`[Campaigns API] Master user ${user.email} querying all campaigns`);
            campaigns = await pgQuery<any>(
                `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                        COUNT(l.id)::int AS lead_count
                 FROM "Campaign" c
                 LEFT JOIN "Lead" l ON l."campaignId" = c.id
                 GROUP BY c.id
                 ORDER BY c."createdAt" DESC`
            );
            console.log(`[Campaigns API] Master query returned ${campaigns.length} campaigns`);
        } else {
            // Team member sees campaigns from their team members + their own
            console.log(`[Campaigns API] Team member ${user.email} (${scope.userId}) querying team campaigns`);

            // First check what teams they belong to
            const userTeams = await pgQuery<{ teamId: string }>(
                `SELECT teamId FROM "UserTeam" WHERE userId = $1`,
                [scope.userId]
            );
            console.log(`[Campaigns API] User belongs to ${userTeams.length} teams:`, userTeams.map(t => t.teamId));

            campaigns = await pgQuery<any>(
                `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                        COUNT(l.id)::int AS lead_count
                 FROM "Campaign" c
                 LEFT JOIN "Lead" l ON l."campaignId" = c.id
                 WHERE c."userId" IN (
                   -- Get all users in the same teams as current user
                   SELECT DISTINCT ut.userId
                   FROM "UserTeam" ut
                   WHERE ut.teamId IN (
                     -- Get all teams the current user belongs to
                     SELECT teamId FROM "UserTeam" WHERE userId = $1
                   )
                   UNION ALL
                   -- Also include own campaigns (in case user has no teams)
                   SELECT $1 as userId
                 )
                 GROUP BY c.id
                 ORDER BY c."createdAt" DESC`,
                [scope.userId]
            );
            console.log(`[Campaigns API] Team member query returned ${campaigns.length} campaigns`);
        }

        // Verify authorization
        if (!scope.master && campaigns.length > 0) {
            // Check if user has access to campaigns (via team membership)
            const userTeams = await pgQuery<{ teamId: string }>(
                `SELECT DISTINCT teamId FROM "UserTeam" WHERE userId = $1`,
                [scope.userId]
            );
            const teamUserIds = await pgQuery<{ userId: string }>(
                `SELECT DISTINCT userId FROM "UserTeam" WHERE teamId = ANY($1)`,
                [userTeams.map((t: any) => t.teamId)]
            );
            const authorizedUserIds = new Set([scope.userId, ...teamUserIds.map((u: any) => u.userId)]);

            const unauthorizedCampaigns = campaigns.filter((c: any) => !authorizedUserIds.has(c.userId));
            if (unauthorizedCampaigns.length > 0) {
                console.error(`[SECURITY] User ${scope.userId} attempted to access unauthorized campaigns:`, unauthorizedCampaigns.map((c: any) => c.id));
                campaigns = campaigns.filter((c: any) => authorizedUserIds.has(c.userId));
            }
        }

        const formatted = campaigns.map((c: any) => ({
            ...c,
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
