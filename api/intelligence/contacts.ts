import type { IncomingMessage, ServerResponse } from "http";
import { getContacts } from "../../server/contacts";
import { DatabaseUnavailableError, pgQuery } from "../../server/pg";
import { Memo, send } from "../../server/handlers/send";

const memo = new Memo<unknown>(30_000);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const params = urlObj.searchParams;

        const campaignIds = (params.get("campaign_ids") || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const campaignId = params.get("campaign_id");
        if (campaignId) campaignIds.unshift(campaignId);

        const subscribedRaw = params.get("subscribed");
        const subscribed =
            subscribedRaw === null || subscribedRaw === "" ? null : subscribedRaw === "true" || subscribedRaw === "1";

        const key = urlObj.pathname + urlObj.search;
        const hit = memo.get(key);
        if (hit !== undefined) {
            send(res, 200, hit, 60);
            return;
        }
        const payload = await getContacts(
            {
                query: params.get("query") || params.get("q") || "",
                page: parseInt(params.get("page") || "1", 10) || 1,
                limit: parseInt(params.get("limit") || "50", 10) || 50,
                campaignIds: [...new Set(campaignIds)],
                outreachState: params.get("outreach_state") || undefined,
                recencyBucket: params.get("recency_bucket") || undefined,
                subscribed,
                company: params.get("company") || "",
                domain: params.get("domain") || "",
            },
            pgQuery,
        );
        memo.set(key, payload);

        send(res, 200, payload, 60);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so live contact data cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
