import type { IncomingMessage, ServerResponse } from "http";
import { getMailboxes } from "../mailboxes";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { scopeFor } from "../scope";
import { requireUser } from "./auth";
import { send } from "./send";
import { reconcileSmartleadMailboxes } from "../smartleadSync";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;

        const urlObj = new URL(req.url || "/", "http://localhost");
        if (urlObj.searchParams.get("sync") === "true") {
            await reconcileSmartleadMailboxes(true).catch((e) => console.warn("[Mailboxes Manual Sync]", e));
        } else {
            reconcileSmartleadMailboxes(false).catch((e) => console.warn("[Mailboxes AutoSync]", e));
        }

        const payload = await getMailboxes(pgQuery, scopeFor(user));
        send(res, 200, payload, 60);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so live mailbox counters cannot be read.",
            });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
