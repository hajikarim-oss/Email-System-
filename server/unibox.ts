import type { IncomingMessage, ServerResponse } from "node:http";
import { pgQuery } from "./pg";
import { requireUser } from "./handlers/auth";
import { scopeFor } from "./scope";
import { send } from "./handlers/send";
import { syncLeadMessageHistory } from "./smartleadRepliesSync";
import { cleanSnippetText } from "./report";

function extractReplyMessage(raw: Record<string, any>) {
    const replyMsg = raw.reply_message || {};
    const bodyHtml = replyMsg.html || replyMsg.text || raw.reply_text || raw.reply_body || raw.email_body || raw.body || raw.custom_email_message || raw.sent_message_body || "";
    const plainCand = replyMsg.text || raw.snippet || replyMsg.html || raw.reply_text || raw.reply_body || raw.email_body || raw.body || "";
    const bodyPlain = cleanSnippetText(plainCand, raw.subject || "Inbound prospect reply");
    return { bodyHtml, bodyPlain };
}

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

interface UniboxCacheEntry {
    data: any;
    expiresAt: number;
}
const uniboxOverviewCache = new Map<string, UniboxCacheEntry>();
const UNIBOX_CACHE_TTL = 30_000;

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
                `SELECT c."userId", COUNT(DISTINCT l.id)::int as unread
                 FROM "Lead" l
                 JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE l.status = 'REPLIED' OR l.id IN (
                     SELECT ev."leadId" FROM "EmailEvent" ev WHERE ev."eventType" = 'replied'
                 )
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

            const cacheKey = `${isMaster ? "master" : scope.userId}_${memberId || "all"}_${campaignId || "all"}`;
            const cachedOverview = uniboxOverviewCache.get(cacheKey);
            if (cachedOverview && cachedOverview.expiresAt > Date.now()) {
                if (pathname.endsWith("/count")) {
                    send(res, 200, { unseen: cachedOverview.data.unread }, 0);
                    return;
                }
                send(res, 200, cachedOverview.data, 0);
                return;
            }

            // Filter conditions
            const conditions: string[] = [];
            const params: any[] = [];
            let pIdx = 1;

            if (!isMaster) {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(scope.userId);
            } else if (memberId && memberId !== "all") {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(memberId);
            }

            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            // Dynamic aggregations from PostgreSQL
            const countsPromise = pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT l.id)::int AS total_leads,
                    COUNT(DISTINCT CASE WHEN (l.status = 'REPLIED' OR l.id IN (
                        SELECT ev."leadId" FROM "EmailEvent" ev WHERE ev."eventType" = 'replied'
                    )) THEN l.id END)::int AS replied_leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l."totalOutbound" > 0 THEN l.id END)::int AS awaiting_reply,
                    COUNT(DISTINCT CASE WHEN l.status = 'BOUNCED' THEN l.id END)::int AS bounced_leads
                 FROM "Lead" l
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}`,
                params
            );

            // Reply events today and this week
            const eventCountsPromise = conditions.length > 0 ? pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= CURRENT_DATE AND e."eventType" = 'replied' THEN e."leadId" END)::int AS today_replies,
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= NOW() - INTERVAL '7 days' AND e."eventType" = 'replied' THEN e."leadId" END)::int AS week_replies,
                    COUNT(DISTINCT CASE WHEN e."eventType" = 'sent' THEN e.id END)::int AS total_sent
                 FROM "EmailEvent" e
                 JOIN "Lead" l ON l.id = e."leadId"
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}`,
                params
            ) : pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= CURRENT_DATE AND e."eventType" = 'replied' THEN e."leadId" END)::int AS today_replies,
                    COUNT(DISTINCT CASE WHEN e."createdAt" >= NOW() - INTERVAL '7 days' AND e."eventType" = 'replied' THEN e."leadId" END)::int AS week_replies,
                    COUNT(DISTINCT CASE WHEN e."eventType" = 'sent' THEN e.id END)::int AS total_sent
                 FROM "EmailEvent" e`
            );

            // Mailboxes and event counts
            const mailboxesPromise = pgQuery<any>(
                `SELECT id, "senderEmail" as email, status FROM "Mailbox" WHERE status != 'RETIRED' ORDER BY "createdAt" ASC`
            );
            const emailCountsPromise = pgQuery<any>(
                `SELECT lower("fromEmail") as email, count(*)::int as total FROM "EmailEvent" WHERE "fromEmail" IS NOT NULL GROUP BY 1`
            );

            const [counts, eventCounts, mailboxes, emailEventCounts] = await Promise.all([
                countsPromise,
                eventCountsPromise,
                mailboxesPromise,
                emailCountsPromise,
            ]);

            const eventCountMap = new Map(emailEventCounts.map((r: any) => [r.email?.toLowerCase(), r.total]));
            const cData = counts[0] || {};
            const eData = eventCounts[0] || {};

            const mailboxSummaries = mailboxes.map((m: any) => ({
                id: m.id,
                email: m.email,
                name: m.email.split("@")[0],
                unread: 0,
                total: eventCountMap.get(m.email?.toLowerCase()) || 0,
            }));

            const repliedCount = cData.replied_leads || 0;

            const overview = {
                total: repliedCount,
                unread: repliedCount,
                today: eData.today_replies || 0,
                week: eData.week_replies || 0,
                snoozed: 0,
                awaiting_reply: cData.awaiting_reply || 0,
                awaiting_agent_draft: 0,
                scheduled_pending: 0,
                scheduled_pending_max: 500,
                folders: [
                    { folder: "inbox", unread: repliedCount, total: repliedCount },
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

            uniboxOverviewCache.set(cacheKey, { data: overview, expiresAt: Date.now() + UNIBOX_CACHE_TTL });

            if (pathname.endsWith("/count")) {
                send(res, 200, { unseen: overview.unread }, 0);
                return;
            }

            send(res, 200, overview, 0);
            return;
        }

        // Route: /api/v1/unibox/message or /api/v1/unibox/email (Single Message Detail with Body)
        if (pathname.endsWith("/message") || pathname.endsWith("/email") || pathname.includes("/emails/")) {
            let msgId = searchParams.get("id") || "";
            if (!msgId) {
                const parts = pathname.split("/");
                msgId = parts[parts.length - 1];
            }
            const cleanMsgId = msgId.replace(/^msg_/, "");
            const evRows = await pgQuery<any>(
                `SELECT e.id, e."leadId", e."eventType", e."fromEmail", e."rawPayload", e."createdAt",
                        l.email as "leadEmail", l."campaignId", c.name as "campaignName"
                 FROM "EmailEvent" e
                 JOIN "Lead" l ON l.id = e."leadId"
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE e.id = $1 OR e."providerEventId" = $1 LIMIT 1`,
                [cleanMsgId]
            );

            if (!evRows || evRows.length === 0) {
                send(res, 404, { error: "message_not_found" });
                return;
            }

            const ev = evRows[0];
            const raw = (ev.rawPayload || {}) as Record<string, any>;
            const isReply = ev.eventType === "replied";
            const { bodyHtml, bodyPlain } = extractReplyMessage(raw);
            const subject = raw.subject || raw.email_subject || (isReply ? `Re: ${ev.campaignName || "Outreach"}` : `Outreach: ${ev.campaignName || "Partnership"}`);
            const fromAddr = ev.fromEmail || raw.from_email || (isReply ? ev.leadEmail : "haji.karim@theboredmonkey.com");
            const toAddr = isReply ? "haji.karim@theboredmonkey.com" : ev.leadEmail;

            send(res, 200, {
                id: `msg_${ev.id}`,
                from: fromAddr,
                to: toAddr,
                subject,
                date: ev.createdAt,
                body_html: bodyHtml,
                body_plain: bodyPlain,
                snippet: bodyPlain.slice(0, 300),
                account_id: ev.campaignId || "",
                is_seen: true,
            }, 0);
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
            let events = await pgQuery<any>(
                `SELECT e.id, e."eventType", e."fromEmail", e."rawPayload", e."createdAt"
                 FROM "EmailEvent" e
                 WHERE e."leadId" = $1 AND e."eventType" IN ('sent', 'replied')
                 ORDER BY e."createdAt" ASC`,
                [targetLead.id]
            );

            // If reply events are missing body or no events exist, sync message history from Smartlead API
            const hasEmptyReply = events.some((e: any) => e.eventType === "replied" && (!e.rawPayload || !e.rawPayload.email_body));
            if (events.length === 0 || hasEmptyReply) {
                try {
                    await syncLeadMessageHistory(targetLead.id);
                    events = await pgQuery<any>(
                        `SELECT e.id, e."eventType", e."fromEmail", e."rawPayload", e."createdAt"
                         FROM "EmailEvent" e
                         WHERE e."leadId" = $1 AND e."eventType" IN ('sent', 'replied')
                         ORDER BY e."createdAt" ASC`,
                        [targetLead.id]
                    );
                } catch (syncErr) {
                    console.warn("[unibox/thread] Auto-sync message history warning:", syncErr);
                }
            }

            const messages = events.map((event: any) => {
                const raw = (event.rawPayload || {}) as Record<string, any>;
                const isReply = event.eventType === "replied";
                const subject = raw.subject || raw.email_subject || (isReply ? `Re: ${targetLead.campaignName || "Outreach"}` : `Outreach: ${targetLead.campaignName || "Partnership"}`);
                const { bodyHtml, bodyPlain } = extractReplyMessage(raw);
                const snippet = bodyPlain.slice(0, 2000);
                const senderEmail = event.fromEmail || raw.from_email || raw.from || (isReply ? targetLead.email : "haji.karim@theboredmonkey.com");
                const fromAddr = isReply ? [senderEmail] : [senderEmail];
                const toAddr = isReply ? ["haji.karim@theboredmonkey.com"] : [targetLead.email];

                return {
                    id: `msg_${event.id}`,
                    email_id: targetLead.campaignId || "",
                    thread_id: threadId,
                    from_addr: fromAddr,
                    to_addr: toAddr,
                    subject,
                    snippet,
                    body_html: bodyHtml,
                    body_plain: bodyPlain,
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

            // 1. Team access scoping — strict userId match
            if (!isMaster) {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(scope.userId);
            } else if (memberId && memberId !== "all") {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(memberId);
            }

            // 2. Campaign filter
            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            // 3. Folder filter: inbox and default "all" only show reply conversations
            if (folder === "sent") {
                conditions.push(`l."totalOutbound" > 0`);
            } else {
                // inbox / all / any non-sent folder: ONLY show leads with genuine inbound replies!
                conditions.push(`(l.status = 'REPLIED' OR l.id IN (
                    SELECT ev."leadId" FROM "EmailEvent" ev WHERE ev."eventType" = 'replied'
                ))`);
            }

            if (unseen) {
                conditions.push(`l.status = 'REPLIED'`);
            }

            // 4. Time filter: 30-day default window for reply conversations
            if (since) {
                conditions.push(`l."updatedAt" >= $${pIdx++}::timestamptz`);
                params.push(since);
            } else {
                conditions.push(`l."updatedAt" >= (NOW() - INTERVAL '30 days')`);
            }

            if (until) {
                conditions.push(`l."updatedAt" <= $${pIdx++}::timestamptz`);
                params.push(until + "T23:59:59.999Z");
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            const rows = await pgQuery<any>(
                `WITH replied_events AS (
                    SELECT DISTINCT ON ("leadId")
                           "leadId", "fromEmail" as reply_from, "createdAt" as reply_created_at, "rawPayload" as reply_payload
                    FROM "EmailEvent"
                    WHERE "eventType" = 'replied'
                    ORDER BY "leadId", "createdAt" DESC
                ),
                sent_events AS (
                    SELECT DISTINCT ON ("leadId")
                           "leadId", "fromEmail" as sent_from
                    FROM "EmailEvent"
                    WHERE "eventType" = 'sent'
                    ORDER BY "leadId", "createdAt" DESC
                )
                SELECT l.id, l.email, l."firstName", l."lastName", l."campaignId", l.status,
                       l."leadCategory", l."totalOutbound", l."totalInbound", l."updatedAt",
                       c.name as "campaignName", c."userId" as "campaignOwner",
                       coalesce(se.sent_from, 'haji.karim@theboredmonkey.com') as "fromEmail",
                       re.reply_from as "replyFromEmail",
                       re.reply_created_at as "replyCreatedAt",
                       re.reply_payload as "replyPayload"
                FROM "Lead" l
                LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                LEFT JOIN replied_events re ON re."leadId" = l.id
                LEFT JOIN sent_events se ON se."leadId" = l.id
                ${whereClause}
                ORDER BY coalesce(re.reply_created_at, l."updatedAt") DESC
                LIMIT ${limit + 1}`,
                params
            );

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;

            const threadData = items.map((lead: any) => {
                const payload = (lead.replyPayload || {}) as Record<string, any>;
                const replyMsg = payload.reply_message || {};
                const snippetRaw = replyMsg.text || replyMsg.html || payload.reply_text || payload.reply_body || payload.snippet || payload.body || payload.email_body || payload.text || "";
                const subject = payload.subject || payload.email_subject || (lead.campaignName ? `Re: ${lead.campaignName}` : "Partnership Discussion");
                const snippet = cleanSnippetText(snippetRaw, subject);

                // In the Inbox, the sender displayed is the PROSPECT who replied
                const leadDisplayName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
                const fromDisplay = leadDisplayName ? `${leadDisplayName} <${lead.email}>` : lead.email;
                const fromAddr = [lead.email];
                const toAddr = [lead.fromEmail || "haji.karim@theboredmonkey.com"];

                const labels: { id: string; title: string; color: string }[] = [
                    { id: "cat_interested", title: "Interested", color: "#10b981" }
                ];

                const eventTime = lead.replyCreatedAt || lead.updatedAt;

                return {
                    id: `th_camp_${lead.id}`,
                    email_id: lead.campaignId || "",
                    thread_id: `th_camp_${lead.id}`,
                    from_addr: fromAddr,
                    to_addr: toAddr,
                    from: fromDisplay,
                    subject,
                    snippet,
                    internal_date: eventTime,
                    seen: lead.status !== "REPLIED",
                    message_count: Math.max(2, (lead.totalOutbound || 0) + (lead.totalInbound || 0)),
                    has_unread: lead.status === "REPLIED",
                    folder: "inbox",
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
