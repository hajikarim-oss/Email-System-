import type { IncomingMessage, ServerResponse } from "http";
import { getDashboard } from "../analytics";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { resolveRequestedScope, scopeFor, scopeKey, ScopeForbiddenError } from "../scope";
import { syncSentEvents } from "../sentEventsSync";
import { requireUser } from "./auth";
import { Memo, send } from "./send";

const CACHE_SECONDS = 0;
const memo = new Memo<unknown>(15_000, 32);
const inFlight = new Map<string, Promise<unknown>>();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const memberId = urlObj.searchParams.get("member_id");
        // Scope comes from the authenticated session. Team members are always
        // locked to their own campaigns; only MASTER may pass all / another id.
        // (The capacity tracker inside the payload is computed workspace-wide
        // server-side as aggregate scheduling data, independent of this scope.)
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
        const period = urlObj.searchParams.get("period") || "7d";
        const from = urlObj.searchParams.get("from") || undefined;
        const to = urlObj.searchParams.get("to") || undefined;
        const key = `${scopeKey(scope)}|${period}|${from || ""}|${to || ""}|${memberId || "all"}`;
        // No response memo here: getDashboard() already caches each window and
        // stamps the shared live "sent today" value onto every payload, so a
        // memoised copy would only reintroduce stale per-key today counts.
        void memo;
        let pending = inFlight.get(key);
        if (!pending) {
            pending = getDashboard({ period, from, to }, pgQuery, scope).finally(() => {
                inFlight.delete(key);
            });
            inFlight.set(key, pending);
        }
        const payload = await pending;
        send(res, 200, payload, CACHE_SECONDS);
        syncSentEvents({ days: 2 }).catch(() => {});
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
