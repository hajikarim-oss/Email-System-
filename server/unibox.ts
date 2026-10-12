import type { IncomingMessage, ServerResponse } from "node:http";
import { pgQuery } from "./pg";
import { requireUser } from "./handlers/auth";
import { scopeFor } from "./scope";
import { send } from "./handlers/send";

// Helper to extract JSON body
function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk) => { text += chunk; });
        req.on("end", () => resolve(text));
        req.on("error", () => resolve(""));
    });
}

// Map user names/emails for Vatsal and Snehal
const SNEHAL_USER_ID = "cmttwwhj5000ovdkr7ooyb6qt";
const VATSAL_USER_ID = "cmu6m304o00003307qj8ex6oa";

export async function handleUnibox(req: IncomingMessage, res: ServerResponse) {
    try {
        const user = await requireUser(req, res);
        if (!user) return;
        const scope = scopeFor(user);
        const isMaster = scope.master;

        const urlObj = new URL(req.url || "", "http://localhost");
        const pathname = urlObj.pathname.replace(/\/+$/, "");
        const searchParams = urlObj.searchParams;

        // Route: /api/v1/unibox/team or /api/unibox/team or /unibox/team
        if (pathname.endsWith("/team")) {
            const users = await pgQuery<any>(
                `SELECT u.id, u.name, u.email, u.role
                 FROM "User" u
                 WHERE u."isActive" = true
                 ORDER BY u."createdAt" ASC`
            );

            const mailboxes = await pgQuery<any>(
                `SELECT id, "userId", "senderEmail"
                 FROM "Mailbox"
                 WHERE status != 'RETIRED'`
            );

            // Group reply counts per campaign owner
            const replyCounts = await pgQuery<any>(
                `SELECT c."userId", COUNT(l.id)::int as unread
                 FROM "Lead" l
                 JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE l.status = 'REPLIED'
                 GROUP BY c."userId"`
            );

            const unreadMap = new Map<string, number>();
            let totalUnread = 0;
            for (const r of replyCounts) {
                if (r.userId) {
                    unreadMap.set(r.userId, (unreadMap.get(r.userId) || 0) + Number(r.unread));
                    totalUnread += Number(r.unread);
                }
            }

            const members = [
                {
                    id: "all",
                    name: "All Team Members",
                    email: "all",
                    role: "Overview",
                    mailboxIds: [] as string[],
                    unread: totalUnread,
                },
                ...users.map((u: any) => {
                    const userMbs = mailboxes.filter((m: any) => m.userId === u.id).map((m: any) => m.id);
                    return {
                        id: u.id,
                        name: u.name || (u.email ? u.email.split("@")[0] : "Member"),
                        email: u.email,
                        role: u.role === "MASTER" ? "Master" : (u.id === SNEHAL_USER_ID ? "Campaigns" : u.id === VATSAL_USER_ID ? "Growth" : "Team Member"),
                        mailboxIds: userMbs,
                        unread: unreadMap.get(u.id) || 0,
                    };
                }),
            ];

            send(res, 200, members, 0);
            return;
        }

        // Route: /api/v1/unibox/overview or /api/unibox/overview or /unibox/overview
        if (pathname.endsWith("/overview") || pathname.endsWith("/count")) {
            const memberId = searchParams.get("member_id");
            const campaignId = searchParams.get("campaign_id");

            // Filter conditions
            const conditions: string[] = [];
            const params: any[] = [];
            let pIdx = 1;

            if (!isMaster) {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(scope.userId);
            } else if (memberId && memberId !== "all") {
                if (memberId === SNEHAL_USER_ID) {
                    conditions.push(`(c."userId" = $${pIdx} OR lower(c.name) LIKE '%snehal%' OR lower(c.name) LIKE '%health%' OR lower(c.name) LIKE '%personal care%')`);
                    params.push(memberId);
                    pIdx++;
                } else if (memberId === VATSAL_USER_ID) {
                    conditions.push(`(c."userId" = $${pIdx} OR lower(c.name) LIKE '%vatsal%' OR lower(c.name) LIKE '%q3%' OR lower(c.name) LIKE '%bewakoof%')`);
                    params.push(memberId);
                    pIdx++;
                } else {
                    conditions.push(`c."userId" = $${pIdx++}`);
                    params.push(memberId);
                }
            }

            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            // Dynamic aggregations from PostgreSQL
            const counts = await pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT l.id)::int AS total_leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'REPLIED' THEN l.id END)::int AS replied_leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l."totalOutbound" > 0 THEN l.id END)::int AS awaiting_reply,
                    COUNT(DISTINCT CASE WHEN l.status = 'BOUNCED' THEN l.id END)::int AS bounced_leads
                 FROM "Lead" l
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}`,
                params
            );

            // Events today and last 7 days
            const eventCounts = await pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= CURRENT_DATE THEN e.id END)::int AS today_events,
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= NOW() - INTERVAL '7 days' THEN e.id END)::int AS week_events,
                    COUNT(DISTINCT CASE WHEN e."eventType" = 'sent' THEN e.id END)::int AS total_sent
                 FROM "EmailEvent" e
                 JOIN "Lead" l ON l.id = e."leadId"
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}`,
                params
            );

            // Mailboxes
            const mailboxes = await pgQuery<any>(
                `SELECT m.id, m."senderEmail" as email, m.status,
                        coalesce(count(DISTINCT e.id), 0)::int as total
                 FROM "Mailbox" m
                 LEFT JOIN "EmailEvent" e ON lower(e."fromEmail") = lower(m."senderEmail")
                 WHERE m.status != 'RETIRED'
                 GROUP BY m.id, m."senderEmail", m.status
                 ORDER BY m."createdAt" ASC`
            );

            const cData = counts[0] || {};
            const eData = eventCounts[0] || {};

            const mailboxSummaries = mailboxes.map((m: any) => ({
                id: m.id,
                email: m.email,
                name: m.email.split("@")[0],
                unread: 0,
                total: m.total || 0,
            }));

            const overview = {
                total: cData.total_leads || 0,
                unread: cData.replied_leads || 0,
                today: eData.today_events || 0,
                week: eData.week_events || 0,
                snoozed: 0,
                awaiting_reply: cData.awaiting_reply || 0,
                awaiting_agent_draft: 0,
                scheduled_pending: 0,
                scheduled_pending_max: 500,
                folders: [
                    { folder: "inbox", unread: cData.replied_leads || 0, total: cData.total_leads || 0 },
                    { folder: "sent", unread: 0, total: eData.total_sent || 0 },
                    { folder: "drafts", unread: 0, total: 0 },
                    { folder: "archive", unread: 0, total: 0 },
                    { folder: "spam", unread: 0, total: 0 },
                    { folder: "trash", unread: 0, total: 0 },
                ],
                mailboxes: mailboxSummaries,
                tags: [],
                categories: [
                    { id: "cat_interested", title: "Interested", color: "#10b981", unread: cData.replied_leads || 0, total: cData.replied_leads || 0 },
                    { id: "cat_warm", title: "Warm Lead", color: "#f59e0b", unread: 0, total: 0 },
                ],
                generated_at: new Date().toISOString(),
            };

            if (pathname.endsWith("/count")) {
                send(res, 200, { unseen: overview.unread }, 0);
                return;
            }

            send(res, 200, overview, 0);
            return;
        }

        // Route: /api/v1/unibox/thread (Single Thread Message History)
        if (pathname.endsWith("/thread")) {
            const threadId = searchParams.get("thread_id") || "";
            const leadId = threadId.replace(/^th_camp_/, "").replace(/^th_/, "");

            if (!leadId) {
                send(res, 400, { error: "thread_id_required" });
                return;
            }

            // Find lead by ID or email
            const leads = await pgQuery<any>(
                `SELECT l.id, l.email, l."firstName", l."lastName", l."campaignId", l.status,
                        c.name as "campaignName", c."userId" as "campaignOwner"
                 FROM "Lead" l
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE l.id = $1 OR lower(l.email) = lower($1) OR l.id = (
                     SELECT id FROM "Lead" WHERE lower(email) = lower($1) LIMIT 1
                 )
                 LIMIT 1`,
                [leadId]
            );

            if (!leads || leads.length === 0) {
                send(res, 200, { data: [], pagination: { has_more: false, next_cursor: null } });
                return;
            }

            const targetLead = leads[0];

            // Access check: non-master can only see their own campaigns
            if (!isMaster && targetLead.campaignOwner && targetLead.campaignOwner !== scope.userId) {
                send(res, 403, { error: "forbidden", message: "You can only view threads from your own campaigns" });
                return;
            }

            // Fetch events for this lead
            const events = await pgQuery<any>(
                `SELECT e.id, e."eventType", e."fromEmail", e."rawPayload", e."createdAt"
                 FROM "EmailEvent" e
                 WHERE e."leadId" = $1 AND e."eventType" IN ('sent', 'replied')
                 ORDER BY e."createdAt" ASC`,
                [targetLead.id]
            );

            const messages = events.map((event: any, idx: number) => {
                const raw = (event.rawPayload || {}) as Record<string, any>;
                const isReply = event.eventType === "replied";
                const subject = raw.subject || raw.email_subject || (isReply ? `Re: ${targetLead.campaignName || "Outreach"}` : `Outreach: ${targetLead.campaignName || "Partnership"}`);
                const body = raw.reply_text || raw.body || raw.email_body || raw.snippet || "";
                const snippet = String(body).replace(/<[^>]*>/g, "").slice(0, 2000);
                const senderEmail = event.fromEmail || "haji.karim@theboredmonkey.com";
                const fromAddr = isReply ? [targetLead.email] : [senderEmail];
                const toAddr = isReply ? [senderEmail] : [targetLead.email];

                return {
                    id: `msg_${event.id}`,
                    email_id: targetLead.campaignId || "",
                    thread_id: threadId,
                    from_addr: fromAddr,
                    to_addr: toAddr,
                    subject,
                    snippet,
                    internal_date: event.createdAt,
                    seen: true,
                };
            });

            send(res, 200, { data: messages, pagination: { has_more: false, next_cursor: null } }, 0);
            return;
        }

        // Route: /api/v1/unibox/seen (Mark Read)
        if (pathname.endsWith("/seen") && req.method === "POST") {
            const bodyStr = await readBody(req);
            try {
                const parsed = JSON.parse(bodyStr || "{}");
                const threadId = parsed.thread_id || parsed.id;
                const leadId = threadId ? threadId.replace(/^th_camp_/, "").replace(/^th_/, "") : null;
                if (leadId) {
                    await pgQuery(`UPDATE "Lead" SET "status" = 'ACTIVE' WHERE id = $1`, [leadId]);
                }
            } catch {}
            send(res, 200, { success: true });
            return;
        }

        // Route: GET /api/v1/unibox or /api/unibox (Inbox List)
        if (req.method === "GET") {
            const memberId = searchParams.get("member_id");
            const campaignId = searchParams.get("campaign_id");
            const folder = searchParams.get("folder") || "inbox";
            const unseen = searchParams.get("unseen") === "true";
            const since = searchParams.get("since");
            const until = searchParams.get("until");
            const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

            const conditions: string[] = [];
            const params: any[] = [];
            let pIdx = 1;

            // 1. Team access scoping
            if (!isMaster) {
                // Dedicated inbox for team member
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(scope.userId);
            } else if (memberId && memberId !== "all") {
                // Master filtered by specific team member (Vatsal, Snehal, Preeti, etc.)
                if (memberId === SNEHAL_USER_ID) {
                    conditions.push(`(c."userId" = $${pIdx} OR lower(c.name) LIKE '%snehal%' OR lower(c.name) LIKE '%health%' OR lower(c.name) LIKE '%personal care%')`);
                    params.push(memberId);
                    pIdx++;
                } else if (memberId === VATSAL_USER_ID) {
                    conditions.push(`(c."userId" = $${pIdx} OR lower(c.name) LIKE '%vatsal%' OR lower(c.name) LIKE '%q3%' OR lower(c.name) LIKE '%bewakoof%')`);
                    params.push(memberId);
                    pIdx++;
                } else {
                    conditions.push(`c."userId" = $${pIdx++}`);
                    params.push(memberId);
                }
            }

            // 2. Campaign filter
            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            // 3. Folder filter (inbox shows replies, sent shows sent)
            if (folder === "inbox") {
                conditions.push(`(l.status = 'REPLIED' OR l."totalReplied" > 0 OR EXISTS (
                    SELECT 1 FROM "EmailEvent" ev WHERE ev."leadId" = l.id AND ev."eventType" = 'replied'
                ))`);
            } else if (folder === "sent") {
                conditions.push(`l."totalOutbound" > 0`);
            }

            if (unseen) {
                conditions.push(`l.status = 'REPLIED'`);
            }

            // 4. Time filter: KEEP 7 DAYS OLD DATA by default or use explicit since/until
            if (since) {
                conditions.push(`l."updatedAt" >= $${pIdx++}::timestamptz`);
                params.push(since);
            } else {
                // Default: keep 7 days old data
                conditions.push(`l."updatedAt" >= (NOW() - INTERVAL '7 days')`);
            }

            if (until) {
                conditions.push(`l."updatedAt" <= $${pIdx++}::timestamptz`);
                params.push(until + "T23:59:59.999Z");
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            const rows = await pgQuery<any>(
                `SELECT l.id, l.email, l."firstName", l."lastName", l."campaignId", l.status,
                        l."leadCategory", l."totalOutbound", l."totalInbound", l."updatedAt",
                        c.name as "campaignName", c."userId" as "campaignOwner",
                        (SELECT e."fromEmail" FROM "EmailEvent" e WHERE e."leadId" = l.id ORDER BY e."createdAt" DESC LIMIT 1) as "fromEmail",
                        (SELECT e."eventType" FROM "EmailEvent" e WHERE e."leadId" = l.id ORDER BY e."createdAt" DESC LIMIT 1) as "latestEventType",
                        (SELECT e."rawPayload" FROM "EmailEvent" e WHERE e."leadId" = l.id ORDER BY e."createdAt" DESC LIMIT 1) as "latestPayload"
                 FROM "Lead" l
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}
                 ORDER BY l."updatedAt" DESC
                 LIMIT ${limit + 1}`,
                params
            );

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;

            const threadData = items.map((lead: any) => {
                const isReply = lead.status === "REPLIED" || lead.latestEventType === "replied";
                const payload = (lead.latestPayload || {}) as Record<string, any>;
                const snippetRaw = payload.reply_text || payload.body || payload.email_body || payload.snippet || "";
                const snippet = String(snippetRaw).replace(/<[^>]*>/g, "").slice(0, 300) || (isReply ? "Interested in discussing further." : "Initial outreach sent.");
                const subject = payload.subject || (isReply ? `Re: ${lead.campaignName || "Partnership"}` : `Outreach: ${lead.campaignName || "Partnership"}`);

                const fromEmail = lead.fromEmail || "haji.karim@theboredmonkey.com";
                const fromAddr = isReply ? [lead.email] : [fromEmail];
                const toAddr = isReply ? [fromEmail] : [lead.email];

                const labels: { id: string; title: string; color: string }[] = [];
                if (isReply) {
                    labels.push({ id: "cat_interested", title: "Interested", color: "#10b981" });
                }

                return {
                    id: `th_camp_${lead.id}`,
                    email_id: lead.campaignId || "",
                    thread_id: `th_camp_${lead.id}`,
                    from_addr: fromAddr,
                    to_addr: toAddr,
                    subject,
                    snippet,
                    internal_date: lead.updatedAt,
                    seen: lead.status !== "REPLIED",
                    message_count: (lead.totalOutbound || 0) + (lead.totalInbound || 0) || 1,
                    has_unread: lead.status === "REPLIED",
                    folder: isReply ? "inbox" : "sent",
                    campaign_id: lead.campaignId,
                    campaign_name: lead.campaignName,
                    labels,
                };
            });

            send(res, 200, {
                data: threadData,
                pagination: {
                    total: threadData.length,
                    has_more: hasMore,
                    next_cursor: hasMore && items.length > 0 ? items[items.length - 1].updatedAt : null,
                }
            }, 0);
            return;
        }

        send(res, 404, { error: "not_found" });
    } catch (err: any) {
        console.error("[Unibox Handler Error]", err);
        send(res, 500, { error: "internal_server_error", message: err?.message });
    }
}
