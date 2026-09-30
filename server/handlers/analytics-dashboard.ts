import type { IncomingMessage, ServerResponse } from "http";
import { getDashboard } from "../analytics";
import { DatabaseUnavailableError, pgQuery } from "../pg";

function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const period = urlObj.searchParams.get("period") || "7d";
        const from = urlObj.searchParams.get("from") || undefined;
        const to = urlObj.searchParams.get("to") || undefined;
        const payload = await getDashboard({ period, from, to }, pgQuery);
        send(res, 200, payload);
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
