import type { IncomingMessage, ServerResponse } from "http";
import { getReport } from "../report";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { Memo, send } from "./send";

const CACHE_SECONDS = 300;
const memo = new Memo<unknown>(120_000);

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
    try {
        const hit = memo.get("report");
        if (hit !== undefined) {
            send(res, 200, hit, CACHE_SECONDS);
            return;
        }
        const payload = await getReport(pgQuery);
        memo.set("report", payload);
        send(res, 200, payload, CACHE_SECONDS);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so the system report cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
