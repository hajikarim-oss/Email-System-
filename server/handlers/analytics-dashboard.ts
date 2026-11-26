import type { IncomingMessage, ServerResponse } from "http";
import { getDashboard } from "../analytics";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { scopeFor, scopeKey } from "../scope";
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
        let scope = scopeFor(user);
        // When "All Team Members" is active (no member_id or member_id === "all"),
        // show full workspace-wide fleet capacity and telemetry so every team member
        // sees the true 3,400 daily limit utilization and all aligned campaigns.
        if (memberId && memberId !== "all") {
            scope = { userId: memberId, master: false, isTroops: Boolean(scope.isTroops) };
        } else {
            scope = { ...scope, master: true };
        }
        const period = urlObj.searchParams.get("period") || "7d";
        const from = urlObj.searchParams.get("from") || undefined;
        const to = urlObj.searchParams.get("to") || undefined;
        const key = `${scopeKey(scope)}|${period}|${from || ""}|${to || ""}|${memberId || "all"}`;
        const hit = memo.get(key);
        if (hit !== undefined) {
            send(res, 200, hit, CACHE_SECONDS);
            return;
        }
        let pending = inFlight.get(key);
        if (!pending) {
            pending = getDashboard({ period, from, to }, pgQuery, scope).finally(() => {
                inFlight.delete(key);
            });
            inFlight.set(key, pending);
        }
        const payload = await pending;
        memo.set(key, payload);
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
