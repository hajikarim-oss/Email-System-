import type { IncomingMessage, ServerResponse } from "http";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk) => { text += chunk; });
        req.on("end", () => resolve(text));
        req.on("error", () => resolve(""));
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
        send(res, 405, { error: "Method not allowed" });
        return;
    }

    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);

        const rawBody = await readBody(req);
        const parsed = JSON.parse(rawBody || "[]");
        const items: any[] = Array.isArray(parsed) ? parsed : (parsed.contacts || [parsed]);
        const validItems = items.filter((item: any) => {
            const email = (item.email || "").toLowerCase().trim();
            return email && email.includes("@");
        });

        const BATCH_SIZE = 100;
        let count = 0;

        for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
            const chunk = validItems.slice(i, i + BATCH_SIZE);
            const emails = chunk.map((c: any) => (c.email || "").toLowerCase().trim());
            const defaultCampId = (parsed as any).campaign_id || (parsed as any).campaignId || null;

            // 1. Fetch existing leads FOR THIS CAMPAIGN to avoid corrupting other campaigns
            const existingRows = defaultCampId
                ? await pgQuery<{ id: string; email: string }>(
                    `SELECT id, lower(email) as email FROM "Lead" WHERE lower(email) = ANY($1) AND "campaignId" = $2`,
                    [emails, defaultCampId]
                )
                : await pgQuery<{ id: string; email: string }>(
                    `SELECT id, lower(email) as email FROM "Lead" WHERE lower(email) = ANY($1) AND "campaignId" IS NULL`,
                    [emails]
                );
            const existingMap = new Map<string, string>();
            for (const r of existingRows) {
                existingMap.set(r.email, r.id);
            }

            const toInsert: any[] = [];
            const toUpdate: Promise<any>[] = [];

            for (const item of chunk) {
                const email = (item.email || "").toLowerCase().trim();
                const campId = item.campaign_id || item.campaignId || (Array.isArray(item.campaigns) ? item.campaigns[0] : null) || defaultCampId;
                const firstName = item.first_name || item.firstName || (item.name ? item.name.split(" ")[0] : "") || "";
                const lastName = item.last_name || item.lastName || (item.name ? item.name.split(" ").slice(1).join(" ") : "") || "";
                const domain = email.split("@")[1] || "";
                const company = item.company || item.company_name || "";
                const customData = JSON.stringify({
                    ...(item.custom_fields || {}),
                    ...(company ? { company } : {}),
                });

                const existingId = existingMap.get(email);
                if (existingId) {
                    toUpdate.push(
                        pgQuery(
                            `UPDATE "Lead" 
                             SET "firstName" = CASE WHEN "firstName" IS NULL OR "firstName" = '' THEN $1 ELSE "firstName" END,
                                 "lastName" = CASE WHEN "lastName" IS NULL OR "lastName" = '' THEN $2 ELSE "lastName" END,
                                 "customData" = COALESCE("customData", '{}'::jsonb) || $3::jsonb,
                                 "updatedAt" = now()
                             WHERE id = $4`,
                            [firstName, lastName, customData, existingId]
                        )
                    );
                } else {
                    const cuid = `cld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    toInsert.push([cuid, email, firstName, lastName, campId || null, domain, customData]);
                }
                count++;
            }

            // Run updates in parallel
            if (toUpdate.length > 0) {
                await Promise.all(toUpdate);
            }

            // Multi-row bulk insert for new leads in one round-trip
            if (toInsert.length > 0) {
                const valuePlaceholders: string[] = [];
                const flatParams: any[] = [];
                let pIdx = 1;

                for (const row of toInsert) {
                    valuePlaceholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, 'ACTIVE', 'NEVER_REACHED', $${pIdx + 6}::jsonb, now(), now())`);
                    flatParams.push(...row);
                    pIdx += 7;
                }

                await pgQuery(
                    `INSERT INTO "Lead" (id, email, "firstName", "lastName", "campaignId", domain, status, "outreachState", "customData", "createdAt", "updatedAt")
                     VALUES ${valuePlaceholders.join(", ")}`,
                    flatParams
                );
            }
        }

        send(res, 200, { success: true, count });
    } catch (err: any) {
        console.error("[add-contacts] Error:", err);
        send(res, 500, { error: err.message || "Failed to persist contacts" });
    }
}
