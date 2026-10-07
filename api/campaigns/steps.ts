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
        const campaignId = urlObj.searchParams.get("campaign_id") || urlObj.searchParams.get("id") || "";

        if (req.method === "GET") {
            if (!campaignId) { send(res, 400, { error: "missing_campaign_id" }); return; }
            const steps = await pgQuery<any>(
                `SELECT s.id, s."stepNumber", s.subject, s."bodyTemplate", s."delayDays", s."createdAt", s."updatedAt"
                 FROM "CampaignStep" s
                 JOIN "Campaign" c ON c.id = s."campaignId"
                 WHERE s."campaignId" = $1${scope.master ? "" : ` AND c."userId" = $2`}
                 ORDER BY s."stepNumber" ASC`,
                scope.master ? [campaignId] : [campaignId, scope.userId]
            );
            send(res, 200, steps.map((s: any) => ({
                id: s.id,
                stepNumber: s.stepNumber,
                position: s.stepNumber,
                name: s.stepNumber === 1 ? "First email" : `Follow-up ${s.stepNumber - 1}`,
                subject: s.subject || "",
                body_plain: (s.bodyTemplate || "").replace(/<[^>]+>/g, ""),
                body_html: s.bodyTemplate || "",
                wait_after: s.delayDays || (s.stepNumber === 1 ? 0 : 3),
                created_at: s.createdAt,
                updated_at: s.updatedAt,
            })));
            return;
        }

        if (req.method === "POST" || req.method === "PUT") {
            let body = "";
            req.on("data", (c: Buffer) => { body += c; });
            await new Promise<void>((resolve) => req.on("end", resolve));
            const parsed = JSON.parse(body || "{}");
            const targetId = campaignId || parsed.campaign_id || parsed.campaignId;
            const stepsData: any[] = Array.isArray(parsed) ? parsed : (parsed.steps || []);
            if (!targetId || !Array.isArray(stepsData)) { send(res, 400, { error: "invalid_payload" }); return; }

            const updated: any[] = [];
            for (let i = 0; i < stepsData.length; i++) {
                const s = stepsData[i];
                const stepNum = i + 1;
                const html = s.body_html || (s.body_plain ? `<div>${s.body_plain.replace(/\n/g, "<br/>")}</div>` : "<p></p>");
                const rows = await pgQuery<any>(
                    `INSERT INTO "CampaignStep" (id, "campaignId", "stepNumber", subject, "bodyTemplate", "delayDays", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now(), now())
                     ON CONFLICT ("campaignId", "stepNumber") DO UPDATE
                       SET subject = $3, "bodyTemplate" = $4, "delayDays" = $5, "updatedAt" = now()
                     RETURNING *`,
                    [targetId, stepNum, s.subject || "", html, s.wait_after !== undefined ? s.wait_after : (stepNum === 1 ? 0 : 3)]
                );
                updated.push(rows[0]);
            }
            send(res, 200, updated);
            return;
        }

        send(res, 405, { error: "method_not_allowed" });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
