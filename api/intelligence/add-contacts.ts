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

        let count = 0;
        for (const item of items) {
            const email = (item.email || "").toLowerCase().trim();
            if (!email || !email.includes("@")) continue;

            const campId = item.campaign_id || (Array.isArray(item.campaigns) ? item.campaigns[0] : null);
            const firstName = item.first_name || item.firstName || (item.name ? item.name.split(" ")[0] : "") || "";
            const lastName = item.last_name || item.lastName || (item.name ? item.name.split(" ").slice(1).join(" ") : "") || "";
            const domain = email.split("@")[1] || "";
            const company = item.company || item.company_name || "";
            const customData = JSON.stringify({
                ...(item.custom_fields || {}),
                ...(company ? { company } : {}),
            });

            // Check if lead exists
            const existing = await pgQuery<any>(
                `SELECT id, "campaignId", "firstName", "lastName", domain FROM "Lead" WHERE lower(email) = $1 LIMIT 1`,
                [email]
            );

            if (existing && existing.length > 0) {
                const lead = existing[0];
                await pgQuery(
                    `UPDATE "Lead" 
                     SET "campaignId" = COALESCE($1, "campaignId"),
                         "firstName" = CASE WHEN "firstName" IS NULL OR "firstName" = '' THEN $2 ELSE "firstName" END,
                         "lastName" = CASE WHEN "lastName" IS NULL OR "lastName" = '' THEN $3 ELSE "lastName" END,
                         "customData" = COALESCE("customData", '{}'::jsonb) || $4::jsonb,
                         "updatedAt" = now()
                     WHERE id = $5`,
                    [campId || null, firstName, lastName, customData, lead.id]
                );
            } else {
                const cuid = `cld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await pgQuery(
                    `INSERT INTO "Lead" (id, email, "firstName", "lastName", "campaignId", domain, status, "outreachState", "customData", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'NEVER_REACHED', $7::jsonb, now(), now())`,
                    [cuid, email, firstName, lastName, campId || null, domain, customData]
                );
            }
            count++;
        }

        send(res, 200, { success: true, count });
    } catch (err: any) {
        console.error("[add-contacts] Error:", err);
        send(res, 500, { error: err.message || "Failed to persist contacts" });
    }
}
