import type { IncomingMessage, ServerResponse } from "http";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
        send(res, 405, { error: "method_not_allowed" });
        return;
    }
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);

        let body = "";
        req.on("data", (c: Buffer) => { body += c; });
        await new Promise<void>((resolve) => req.on("end", resolve));

        const parsed = JSON.parse(body || "{}");
        const emails: string[] = (parsed.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean);
        const ids: string[] = parsed.ids || [];

        const orClauses: string[] = [];
        const params: any[] = [];
        if (emails.length > 0) {
            params.push(emails);
            orClauses.push(`email = ANY($${params.length})`);
        }
        if (ids.length > 0) {
            params.push(ids);
            orClauses.push(`id = ANY($${params.length})`);
        }
        if (orClauses.length === 0) {
            send(res, 400, { error: "no_targets" });
            return;
        }
        const scopeClause = scope.master ? "" : (() => {
            params.push(scope.userId);
            return ` AND "campaignId" IN (SELECT id FROM "Campaign" WHERE "userId" = $${params.length})`;
        })();

        const result = await pgQuery<{ count: string }>(
            `WITH deleted AS (
               DELETE FROM "Lead"
               WHERE (${orClauses.join(" OR ")})${scopeClause}
               RETURNING id
             ) SELECT COUNT(*)::text AS count FROM deleted`,
            params
        );

        send(res, 200, { success: true, count: parseInt(result[0]?.count || "0", 10) });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
