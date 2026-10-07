import type { IncomingMessage, ServerResponse } from "http";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);
        const urlObj = new URL(req.url || "", "http://localhost:3001");
        const campaignId = urlObj.searchParams.get("id") || "";
        if (!campaignId) { send(res, 400, { error: "missing_campaign_id" }); return; }

        const events = await pgQuery<any>(
            `SELECT e.id, e."eventType" AS event_type, e."createdAt" AS created_at,
                    coalesce(e."rawPayload"->>'description', '') AS description,
                    l.email, l."firstName" AS first_name, l."lastName" AS last_name
             FROM "EmailEvent" e
             JOIN "Lead" l ON l.id = e."leadId"
             JOIN "Campaign" c ON c.id = l."campaignId"
             WHERE l."campaignId" = $1${scope.master ? "" : ` AND c."userId" = $2`}
             ORDER BY e."createdAt" DESC
             LIMIT 50`,
            scope.master ? [campaignId] : [campaignId, scope.userId]
        );

        const logs = events.map((row: any) => {
            const et = String(row.event_type || "").toLowerCase();
            const isSent = et === "sent";
            const isOpen = et.includes("open");
            const isReply = et.includes("reply");
            const isClick = et.includes("click");
            const isBounce = et.includes("bounce");
            const leadName = `${row.first_name || ""} ${row.last_name || ""}`.trim() || (row.email ? row.email.split("@")[0] : "Prospect");
            let message = row.description;
            if (!message) {
                if (isSent) message = `Email sent to ${leadName} (${row.email})`;
                else if (isOpen) message = `Email opened by ${leadName} (${row.email})`;
                else if (isReply) message = `Reply received from ${leadName} (${row.email})`;
                else if (isClick) message = `Link clicked by ${leadName} (${row.email})`;
                else if (isBounce) message = `Email bounced for ${leadName} (${row.email})`;
                else message = `Event ${row.event_type} for ${leadName} (${row.email})`;
            }
            return {
                id: row.id,
                event_type: isSent ? "EMAIL_SENT" : isOpen ? "EMAIL_OPENED" : isReply ? "EMAIL_REPLIED" : isClick ? "EMAIL_LINK_CLICK" : isBounce ? "EMAIL_BOUNCED" : row.event_type,
                message,
                metadata: { level: isBounce ? "error" : isReply ? "success" : "info" },
                created_at: row.created_at,
            };
        });

        send(res, 200, { data: logs });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
