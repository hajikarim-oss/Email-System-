import type { IncomingMessage, ServerResponse } from "http";
import { getCampaignStats } from "../campaigns";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { send } from "./send";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
    try {
        const payload = await getCampaignStats(pgQuery);
        send(res, 200, payload, 60);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so live campaign statistics cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
