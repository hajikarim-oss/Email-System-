import type { IncomingMessage, ServerResponse } from "http";
import { checkBatch } from "../../server/checkBatch";
import { DatabaseUnavailableError } from "../../server/pg";
import { readJsonBody, send } from "../../server/handlers/send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== "POST") {
        send(res, 405, { error: "method_not_allowed" });
        return;
    }

    try {
        const body = await readJsonBody<{ emails?: string[] }>(req);
        const emails = Array.isArray(body?.emails) ? body.emails : [];
        const result = await checkBatch(emails);
        send(res, 200, result);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 200, { duplicates: [], quarantined: [], warning: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
