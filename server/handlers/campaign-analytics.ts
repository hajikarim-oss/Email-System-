import type { IncomingMessage, ServerResponse } from "http";
import { getCampaignAnalytics } from "../campaigns";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { scopeFor } from "../scope";
import { requireUser } from "./auth";
import { send } from "./send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const campaignId = urlObj.searchParams.get("id") || "";
        const days = Math.min(365, Math.max(1, parseInt(String(urlObj.searchParams.get("days") || "30"), 10) || 30));
        const from = urlObj.searchParams.get("from") || undefined;
        if (!campaignId) {
            send(res, 400, { error: "missing_campaign_id", message: "An id query parameter is required." });
            return;
        }
        const payload = await getCampaignAnalytics(pgQuery, scopeFor(user), campaignId, days, from);
        send(res, 200, payload, 60);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so live campaign analytics cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
