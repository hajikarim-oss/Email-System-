import type { IncomingMessage, ServerResponse } from "http";
import { getReport } from "../report";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { resolveRequestedScope, scopeFor, scopeKey, ScopeForbiddenError } from "../scope";
import { requireUser } from "./auth";
import { Memo, send } from "./send";

const CACHE_SECONDS = 0;
const memo = new Memo<unknown>(15_000, 32);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const memberId = urlObj.searchParams.get("member_id");
        // Scope comes from the authenticated session, not the query string.
        let scope;
        try {
            scope = resolveRequestedScope(scopeFor(user), memberId);
        } catch (err) {
            if (err instanceof ScopeForbiddenError) {
                send(res, 403, { error: "forbidden", message: err.message });
                return;
            }
            throw err;
        }
        const key = `${scopeKey(scope)}|report`;
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
