import type { IncomingMessage, ServerResponse } from "http";
import { getDashboard } from "../analytics";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { Memo, send } from "./send";

const CACHE_SECONDS = 60;
const memo = new Memo<unknown>(30_000);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const period = urlObj.searchParams.get("period") || "7d";
        const from = urlObj.searchParams.get("from") || undefined;
        const to = urlObj.searchParams.get("to") || undefined;
        const key = `${period}|${from || ""}|${to || ""}`;
        const hit = memo.get(key);
        if (hit !== undefined) {
            send(res, 200, hit, CACHE_SECONDS);
            return;
        }
        const payload = await getDashboard({ period, from, to }, pgQuery);
        memo.set(key, payload);
        send(res, 200, payload, CACHE_SECONDS);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so live analytics cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
