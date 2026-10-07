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

            // Find campaign in DB
            const existing = await pgQuery<any>(
                `SELECT id, "userId", "providerCampaignId", name FROM "Campaign" WHERE id = $1 OR "providerCampaignId" = $1 LIMIT 1`,
                [campId]
            );

            if (existing && existing.length > 0) {
                const camp = existing[0];
                if (!scope.master && camp.userId !== scope.userId) {
                    send(res, 403, { error: "forbidden" });
                    return;
                }

                // Delete associated records
                await pgQuery(`DELETE FROM "CampaignMailbox" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`DELETE FROM "CampaignStep" WHERE "campaignId" = $1`, [camp.id]);
                await pgQuery(`UPDATE "Lead" SET "campaignId" = NULL WHERE "campaignId" = $1`, [camp.id]);
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

        // GET campaigns
        const campaigns = await pgQuery<any>(
            `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
                    COUNT(l.id)::int AS lead_count
             FROM "Campaign" c
             LEFT JOIN "Lead" l ON l."campaignId" = c.id
             ${scope.master ? "" : `WHERE c."userId" = $1`}
             GROUP BY c.id
             ORDER BY c."createdAt" DESC`,
            scope.master ? [] : [scope.userId]
        );

        send(res, 200, campaigns, 30);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
