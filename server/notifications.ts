import type { IncomingMessage, ServerResponse } from "node:http";
import { pgQuery } from "./pg";
import { requireUser } from "./handlers/auth";
import { scopeFor } from "./scope";
import { send } from "./handlers/send";
import { cleanSnippetText } from "./report";

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk) => { text += chunk; });
        req.on("end", () => resolve(text));
        req.on("error", () => resolve(""));
    });
}

interface NotificationRow {
    id: string;
    category: string;
    title: string;
    body: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
}

export async function handleNotifications(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);
        const isMaster = scope.master;

        const urlObj = new URL(req.url || "", "http://localhost");
        const pathname = urlObj.pathname.replace(/\/+$/, "");
        const searchParams = urlObj.searchParams;

        // Mark single notification as read: POST .../notifications/{id}/read
        if (req.method === "POST" && pathname.match(/\/notifications\/[^/]+\/read$/)) {
            const parts = pathname.split("/");
            const notifId = parts[parts.length - 2];
            try {
                await pgQuery(
                    `UPDATE "Notification" SET read = true WHERE id = $1 AND "userId" = $2`,
                    [notifId, scope.userId]
                );
            } catch {}
            send(res, 200, { status: "ok" });
            return;
        }

        // Mark all as read: PUT .../notifications
        if (req.method === "PUT" && (pathname.endsWith("/notifications") || pathname.endsWith("/me/notifications"))) {
            try {
                await pgQuery(
                    `UPDATE "Notification" SET read = true WHERE "userId" = $1 AND read = false`,
                    [scope.userId]
                );
            } catch {}
            send(res, 200, { status: "ok" });
            return;
        }

        // Clear read: DELETE .../notifications
        if (req.method === "DELETE" && (pathname.endsWith("/notifications") || pathname.endsWith("/me/notifications"))) {
            try {
                await pgQuery(
                    `DELETE FROM "Notification" WHERE "userId" = $1 AND read = true`,
                    [scope.userId]
                );
            } catch {}
            send(res, 200, { status: "ok", cleared: true });
            return;
        }

        // GET: build live notifications from database events
        const unreadOnly = searchParams.get("unread") === "1";
        const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

        // Try Notification table first
        let dbNotifs: NotificationRow[] = [];
        let hasNotifTable = true;
        try {
            const readFilter = unreadOnly ? ` AND n.read = false` : "";
            const userFilter = isMaster ? "" : ` AND n."userId" = '${scope.userId}'`;
            dbNotifs = await pgQuery<any>(
                `SELECT n.id, n.type as category, n.title, n.message as body,
                        n."campaignId", n."campaignName", n."leadEmail",
                        CASE WHEN n.read THEN n."createdAt"::text ELSE NULL END as read_at,
                        n."createdAt" as created_at
                 FROM "Notification" n
                 WHERE 1=1 ${userFilter} ${readFilter}
                 ORDER BY n."createdAt" DESC
                 LIMIT ${limit}`
            );
        } catch {
            hasNotifTable = false;
        }

        // Generate live notifications from real database events
        const notifications: any[] = [];

        if (dbNotifs.length > 0) {
            for (const n of dbNotifs) {
                notifications.push({
                    id: n.id,
                    category: n.category || "inbound_reply",
                    title: n.title,
                    body: n.body,
                    link: n.link,
                    read_at: n.read_at,
                    created_at: n.created_at,
                });
            }
        }

        // Always supplement with live reply events from the last 14 days
        const memberFilter = isMaster ? "" : `AND c."userId" = '${scope.userId}'`;
        const replyNotifs = await pgQuery<any>(
            `SELECT e.id, e."leadId", e."fromEmail", e."eventType", e."rawPayload", e."createdAt",
                    l.email as "leadEmail", l."firstName", l."lastName",
                    c.name as "campaignName", c.id as "campaignId"
             FROM "EmailEvent" e
             JOIN "Lead" l ON l.id = e."leadId"
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             WHERE e."eventType" = 'replied'
               AND e."createdAt" >= NOW() - INTERVAL '14 days'
               ${memberFilter}
             ORDER BY e."createdAt" DESC
             LIMIT 20`
        );

        const existingIds = new Set(notifications.map(n => n.id));
        for (const r of replyNotifs) {
            const notifId = `notif_reply_${r.id}`;
            if (existingIds.has(notifId)) continue;
            const raw = (r.rawPayload || {}) as Record<string, any>;
            const replyMsg = raw.reply_message || {};
            const contactName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.leadEmail || r.fromEmail || "Unknown";
            const rawSnippet = replyMsg.text || replyMsg.html || raw.reply_text || raw.email_body || raw.body || raw.snippet || "";
            const snippet = cleanSnippetText(rawSnippet, r.campaignName ? `Replied to ${r.campaignName}` : "Inbound prospect reply");
            notifications.push({
                id: notifId,
                category: "inbound_reply",
                title: `New reply from ${contactName}`,
                body: snippet.slice(0, 150),
                link: `/app/unibox/all/th_camp_${r.leadId}`,
                read_at: null,
                created_at: r.createdAt,
            });
        }

        // Bounced leads in last 7 days
        const bounceNotifs = await pgQuery<any>(
            `SELECT l.id, l.email, l."firstName", l."lastName", l."updatedAt",
                    c.name as "campaignName"
             FROM "Lead" l
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             WHERE l.status = 'BOUNCED'
               AND l."updatedAt" >= NOW() - INTERVAL '7 days'
               ${memberFilter}
             ORDER BY l."updatedAt" DESC
             LIMIT 10`
        );

        for (const b of bounceNotifs) {
            const notifId = `notif_bounce_${b.id}`;
            if (existingIds.has(notifId)) continue;
            const contactName = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email;
            notifications.push({
                id: notifId,
                category: "health_bounce",
                title: `Bounce: ${contactName}`,
                body: `Email to ${b.email} bounced in ${b.campaignName || "campaign"}`,
                link: `/app/contacts?search=${encodeURIComponent(b.email)}`,
                read_at: null,
                created_at: b.updatedAt,
            });
        }

        // Paused campaigns
        const pausedCampaigns = await pgQuery<any>(
            `SELECT id, name, status, "updatedAt"
             FROM "Campaign"
             WHERE (status::text ILIKE 'paused%' OR status::text = 'PAUSED')
               AND "updatedAt" >= NOW() - INTERVAL '7 days'
             ORDER BY "updatedAt" DESC
             LIMIT 5`
        );

        for (const p of pausedCampaigns) {
            const notifId = `notif_paused_${p.id}`;
            if (existingIds.has(notifId)) continue;
            const reason = p.status === "paused_no_accounts" ? " (no active accounts)" :
                p.status === "paused_trial_expired" ? " (trial expired)" :
                p.status === "paused_guardrail" ? " (auto-paused)" : "";
            notifications.push({
                id: notifId,
                category: "campaign_paused",
                title: `Campaign paused${reason}`,
                body: p.name,
                link: `/app/campaigns/${p.id}`,
                read_at: null,
                created_at: p.updatedAt,
            });
        }

        // Sort all notifications by created_at DESC
        notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const finalList = unreadOnly ? notifications.filter(n => !n.read_at) : notifications;
        const unreadCount = notifications.filter(n => !n.read_at).length;

        console.log(`[Notifications] Returning ${finalList.length} notifications (${unreadCount} unread) for ${isMaster ? "master" : scope.userId}`);

        send(res, 200, {
            notifications: finalList.slice(0, limit),
            unread: unreadCount,
        }, 0);
    } catch (err: any) {
        console.error("[Notifications Handler Error]", err?.message || err);
        if (!res.headersSent) {
            send(res, 500, { error: "internal_server_error", message: err?.message });
        }
    }
}
