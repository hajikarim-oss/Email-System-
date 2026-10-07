import type { IncomingMessage, ServerResponse } from "http";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery, DatabaseUnavailableError } from "../../server/pg";
import { send } from "../../server/handlers/send";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;

        if (req.method === "POST") {
            // suppress-contacts inline (POST /api/intelligence/suppressions)
            let body = "";
            req.on("data", (c: Buffer) => { body += c; });
            await new Promise<void>((resolve) => req.on("end", resolve));

            const parsed = JSON.parse(body || "{}");
            const emails: string[] = (parsed.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean);
            const reason = parsed.reason || "MANUAL";

            for (const email of emails) {
                await pgQuery(
                    `INSERT INTO "SuppressedEmail" (id, email, reason, source, "createdAt")
                     VALUES (gen_random_uuid()::text, $1, $2, 'manual_suppression', now())
                     ON CONFLICT (email) DO UPDATE SET reason = $2`,
                    [email, reason]
                );
            }
            send(res, 200, { success: true, count: emails.length });
            return;
        }

        // GET — list suppressions
        const urlObj = new URL(req.url || "", "http://localhost:3001");
        const query = (urlObj.searchParams.get("query") || urlObj.searchParams.get("q") || "").trim();
        const page = Math.max(1, parseInt(urlObj.searchParams.get("page") || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get("limit") || "50", 10)));
        const offset = (page - 1) * limit;

        const whereClause = query ? `WHERE email ILIKE $3` : "";
        const params = query ? [limit, offset, `%${query}%`] : [limit, offset];

        const [totals, rows] = await Promise.all([
            pgQuery<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM "SuppressedEmail" ${whereClause}`,
                query ? [`%${query}%`] : []
            ),
            pgQuery<any>(
                `SELECT id, email, reason, source, "createdAt" FROM "SuppressedEmail" ${whereClause} ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2`,
                params
            ),
        ]);

        const totalCount = parseInt(totals[0]?.count || "0", 10);
        const data = rows.map((s: any) => ({
            id: s.id,
            organization_id: "org_default",
            email: s.email,
            kind: "email",
            reason: s.reason,
            source: s.reason === "HARD_BOUNCE" ? "bounce" : s.reason === "SPAM_COMPLAINT" ? "complaint" : "unsubscribe",
            created_at: s.createdAt,
            updated_at: s.createdAt,
        }));

        send(res, 200, {
            data,
            total: totalCount,
            pagination: {
                next_cursor: page * limit < totalCount ? String(page + 1) : null,
                has_more: page * limit < totalCount,
            },
        });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, { error: "database_unavailable" });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}
