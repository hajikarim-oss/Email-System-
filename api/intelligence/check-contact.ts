import type { IncomingMessage, ServerResponse } from "http";
import { checkContact } from "../../server/checkBatch";
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
        const body = await readJsonBody<{ email?: string }>(req);
        const email = String(body?.email || "").trim().toLowerCase();
        if (!email) {
            send(res, 400, { error: "email_required" });
            return;
        }
        const result = await checkContact(email);
        send(res, 200, result);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 200, { isDuplicate: false, isQuarantined: false });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
