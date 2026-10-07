import type { IncomingMessage, ServerResponse } from "http";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { scopeFor } from "../../server/scope";
import { send } from "../../server/handlers/send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);

        const campaigns = await pgQuery<any>(
            `SELECT c.id, c.name, c.status, c."createdAt", c."updatedAt", c."userId",
                    COUNT(l.id)::int AS lead_count
             FROM "Campaign" c
             LEFT JOIN "Lead" l ON l."campaignId" = c.id
             ${scope.master ? "" : `WHERE c."userId" = $1`}
             GROUP BY c.id
             ORDER BY c."createdAt" DESC`,
            scope.master ? [] : [scope.userId]
        );

        send(res, 200, campaigns, 30);
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
