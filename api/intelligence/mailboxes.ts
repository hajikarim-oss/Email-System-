import type { IncomingMessage, ServerResponse } from "http";
import { getMailboxes } from "../../server/mailboxes";
import { DatabaseUnavailableError, pgQuery } from "../../server/pg";

function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
    try {
        const payload = await getMailboxes(pgQuery);
        send(res, 200, payload);
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
