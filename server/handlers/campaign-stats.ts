import type { IncomingMessage, ServerResponse } from "http";
import { getCampaignStats, type CampaignStats } from "../campaigns";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { scopeFor, scopeKey } from "../scope";
import { requireUser } from "./auth";
import { Memo, send } from "./send";

const CACHE_SECONDS = 60;
const memo = new Memo<CampaignStats[]>(30_000, 16);
const inFlight = new Map<string, Promise<CampaignStats[]>>();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);
        const key = `${scopeKey(scope)}|${scope.isTroops ? "troops" : "tbm"}`;
        const hit = memo.get(key);
        if (hit !== undefined) {
            send(res, 200, hit, CACHE_SECONDS);
            return;
        }
        let pending = inFlight.get(key);
        if (!pending) {
            pending = getCampaignStats(pgQuery, scope).finally(() => {
                inFlight.delete(key);
            });
            inFlight.set(key, pending);
        }
        const payload = await pending;
        memo.set(key, payload);
        send(res, 200, payload, CACHE_SECONDS);
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
