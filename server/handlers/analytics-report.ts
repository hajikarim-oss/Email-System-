import type { IncomingMessage, ServerResponse } from "http";
import { getReport } from "../report";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { scopeFor, scopeKey } from "../scope";
import { requireUser } from "./auth";
import { Memo, send } from "./send";

const CACHE_SECONDS = 300;
const memo = new Memo<unknown>(120_000);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const memberId = urlObj.searchParams.get("member_id");
        let scope = scopeFor(user);
        if (user.role === "MASTER" && memberId && memberId !== "all") {
            scope = { userId: memberId, master: false };
        }
        const key = `${scopeKey(scope)}|report|${memberId || "all"}`;
        const hit = memo.get(key);
        if (hit !== undefined) {
            send(res, 200, hit, CACHE_SECONDS);
            return;
        }
        const payload = await getReport(pgQuery, scope);
        memo.set(key, payload);
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
