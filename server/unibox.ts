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

// Map user names/emails for Vatsal, Snehal, Riya, and Sanika
const SNEHAL_USER_ID = "cmttwwhj5000ovdkr7ooyb6qt";
const VATSAL_USER_ID = "cmu6m304o00003307qj8ex6oa";
const RIYA_USER_ID = "usr_tbm_riya_thapliyal";
const SANIKA_USER_ID = "usr_tbm_sanika_pingulkar";

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
                   AND u.id IN (
                     SELECT ut."userId" FROM "UserTeam" ut
                     WHERE ut."teamId" IN (
                       SELECT "teamId" FROM "UserTeam" WHERE "userId" = $1
                     )
                     UNION ALL
                     SELECT $1
                   )
                 ORDER BY u."createdAt" ASC`,
                [scope.userId]
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
                    const emailLower = (u.email || "").toLowerCase();
                    let roleLabel = "Team Member";
                    if (u.role === "MASTER") roleLabel = "Master";
                    else if (u.id === SNEHAL_USER_ID || emailLower.includes("snehal")) roleLabel = "Campaigns";
                    else if (u.id === VATSAL_USER_ID || emailLower.includes("vatsal")) roleLabel = "Growth";
                    else if (u.id === RIYA_USER_ID || emailLower.includes("riya")) roleLabel = "Campaigns";
                    else if (u.id === SANIKA_USER_ID || emailLower.includes("sanika")) roleLabel = "Campaigns";
                    return {
                        id: u.id,
                        name: u.name || (u.email ? u.email.split("@")[0] : "Member"),
                        email: u.email,
                        role: roleLabel,
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
            const creatorOnly = searchParams.get("creator_only") === "true";

            const cacheKey = `${isMaster ? `master_${scope.userId}` : scope.userId}_${memberId || "all"}_${campaignId || "all"}_${creatorOnly ? "creators" : "all"}`;
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
            } else {
                conditions.push(`c."userId" IN (
                    SELECT ut."userId" FROM "UserTeam" ut 
                    WHERE ut."teamId" IN (SELECT "teamId" FROM "UserTeam" WHERE "userId" = $${pIdx++})
                    UNION ALL SELECT $${pIdx++}
                )`);
                params.push(scope.userId, scope.userId);
            }

            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            if (creatorOnly) {
                conditions.push(`(EXISTS (SELECT 1 FROM "Creator" cr WHERE lower(cr."primaryEmail") = lower(l.email)) OR l."customData"->>'handle' IS NOT NULL OR l."customData"->>'form_link' IS NOT NULL OR l."customData"->>'intake_link' IS NOT NULL)`);
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
                `SELECT id, "senderEmail" as email, status FROM "Mailbox" 
                 WHERE status != 'RETIRED' 
                   AND ("userId" IN (
                       SELECT ut."userId" FROM "UserTeam" ut
                       WHERE ut."teamId" IN (SELECT "teamId" FROM "UserTeam" WHERE "userId" = $1)
                       UNION ALL SELECT $1
                   ) OR "userId" IS NULL)
                 ORDER BY "createdAt" ASC`,
                [scope.userId]
            );
            const emailCountsPromise = pgQuery<any>(
                `SELECT lower("fromEmail") as email, count(*)::int as total FROM "EmailEvent" WHERE "fromEmail" IS NOT NULL GROUP BY 1`
            );

            const [counts, eventCounts, mailboxes, emailEventCounts, creatorIntakeCounts] = await Promise.all([
                countsPromise,
                eventCountsPromise,
                mailboxesPromise,
                emailCountsPromise,
                creatorOnly
                    ? pgQuery<any>(`
                        SELECT
                            COUNT(*) FILTER (WHERE "intakeStatus" IN ('COMPLETED', 'PARTIALLY_FILLED', 'FORM_OPENED'))::int AS intake_replied,
                            COUNT(*) FILTER (WHERE "intakeStatus" = 'COMPLETED')::int AS intake_completed,
                            COUNT(*) FILTER (WHERE "intakeStatus" = 'INVITATION_SENT')::int AS intake_awaiting,
                            COUNT(*) FILTER (WHERE "lastIntakeActivityAt" >= CURRENT_DATE AND "intakeStatus" IN ('COMPLETED', 'PARTIALLY_FILLED', 'FORM_OPENED'))::int AS intake_today,
                            COUNT(*) FILTER (WHERE "lastIntakeActivityAt" >= NOW() - INTERVAL '7 days' AND "intakeStatus" IN ('COMPLETED', 'PARTIALLY_FILLED', 'FORM_OPENED'))::int AS intake_week
                        FROM "Creator"
                    `)
                    : Promise.resolve([]),
            ]);

            const eventCountMap = new Map(emailEventCounts.map((r: any) => [r.email?.toLowerCase(), r.total]));
            const cData = counts[0] || {};
            const eData = eventCounts[0] || {};
            const crData = creatorIntakeCounts?.[0] || {};

            const mailboxSummaries = mailboxes.map((m: any) => ({
                id: m.id,
                email: m.email,
                name: m.email.split("@")[0],
                unread: 0,
                total: eventCountMap.get(m.email?.toLowerCase()) || 0,
            }));

            const repliedCount = (cData.replied_leads || 0) + (creatorOnly ? (crData.intake_replied || 0) : 0);

            const overview = {
                total: repliedCount,
                unread: repliedCount,
                today: (eData.today_replies || 0) + (creatorOnly ? (crData.intake_today || 0) : 0),
                week: (eData.week_replies || 0) + (creatorOnly ? (crData.intake_week || 0) : 0),
                snoozed: 0,
                awaiting_reply: (cData.awaiting_reply || 0) + (creatorOnly ? (crData.intake_awaiting || 0) : 0),
                awaiting_agent_draft: 0,
                scheduled_pending: 0,
                scheduled_pending_max: 500,
                folders: [
                    { folder: "inbox", unread: repliedCount, total: repliedCount },
                    { folder: "sent", unread: 0, total: (eData.total_sent || 0) + (creatorOnly ? (crData.intake_replied || 0) : 0) },
                    { folder: "drafts", unread: 0, total: 0 },
                    { folder: "archive", unread: 0, total: 0 },
                    { folder: "spam", unread: 0, total: 0 },
                    { folder: "trash", unread: 0, total: 0 },
                ],
                mailboxes: mailboxSummaries,
                tags: [],
                categories: [
                    { id: "cat_interested", title: creatorOnly ? "100% Enriched / Replied" : "Interested", color: "#10b981", unread: repliedCount, total: repliedCount },
                    { id: "cat_warm", title: creatorOnly ? "Form Opened" : "Warm Lead", color: "#f59e0b", unread: creatorOnly ? Math.max(0, (crData.intake_replied || 0) - (crData.intake_completed || 0)) : 0, total: creatorOnly ? Math.max(0, (crData.intake_replied || 0) - (crData.intake_completed || 0)) : 0 },
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
            if (threadId.startsWith("th_creator_")) {
                const creatorId = threadId.replace(/^th_creator_/, "");
                const crRows = await pgQuery<any>(
                    `SELECT * FROM "Creator" WHERE id = $1 OR lower("handle") = lower($1) LIMIT 1`,
                    [creatorId]
                );
                if (!crRows || crRows.length === 0) {
                    send(res, 200, { data: [], pagination: { has_more: false, next_cursor: null } });
                    return;
                }
                const cr = crRows[0];
                const cleanHandle = String(cr.handle || "").replace(/^@/, "");
                const cEmail = cr.primaryEmail || `${cleanHandle}@instagram.creator`;
                const formUrl = `https://theboredmonkey.com/creator/intake/${cr.intakeToken || cr.id}`;
                const sentDate = cr.lastContactedAt || cr.createdAt || new Date(Date.now() - 86400000).toISOString();
                const replyDate = cr.lastIntakeActivityAt || cr.updatedAt || new Date().toISOString();
                const outSubj = `Collaboration Opportunity with The Bored Monkey x ${cr.fullName || `@${cleanHandle}`}`;
                const outHtml = `<p>Hi ${cr.fullName || `@${cleanHandle}`},</p><p>Hope you're doing well!</p><p>We're reaching out from <strong>The Bored Monkey</strong> to connect with creators like you and explore potential brand collaboration opportunities.</p><p>We'd love to have your details in our creator network so we can reach out whenever a campaign matches your content and audience. We believe in keeping communication meaningful, so you won't receive unnecessary or irrelevant messages from us.</p><p>No spam, no random promotions just genuine collaboration opportunities that are relevant to you.</p><p>If you're interested, please share your details here: <a href="${formUrl}" target="_blank" style="color: #ea580c; font-weight: 600; text-decoration: underline;">${formUrl}</a></p><p>Looking forward to connecting!</p><p>Best,<br/>Team The Bored Monkey</p>`;
                const outPlain = `Hi ${cr.fullName || `@${cleanHandle}`},\n\nHope you're doing well!\n\nWe're reaching out from The Bored Monkey to connect with creators like you and explore potential brand collaboration opportunities.\n\nIf you're interested, please share your details here: ${formUrl}\n\nBest,\nTeam The Bored Monkey`;

                const langs = Array.isArray(cr.languages) && cr.languages.length ? cr.languages.join(", ") : "Hindi, English";
                const genres = Array.isArray(cr.subGenres) && cr.subGenres.length ? cr.subGenres.join(", ") : (cr.category || "Creator");
                const inHtml = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                    <p>Hi Team The Bored Monkey,</p>
                    <p>I've confirmed my creator profile and collaboration details via the Creator Intake link (${cr.intakeCompletionPct || 100}% complete):</p>
                    <ul style="padding-left: 18px; margin: 10px 0;">
                        <li><strong>Instagram:</strong> <a href="https://instagram.com/${cleanHandle}" target="_blank">@${cleanHandle}</a> (${cr.followersRaw || cr.followersCount || "Verified"} followers)</li>
                        <li><strong>Primary Niche:</strong> ${cr.category || "Creator"} (${genres})</li>
                        <li><strong>Languages:</strong> ${langs}</li>
                        <li><strong>Location:</strong> ${[cr.city, cr.state, cr.pincode].filter(Boolean).join(", ") || "India"}</li>
                        <li><strong>WhatsApp / Mobile:</strong> ${cr.whatsappNumber || cr.phone || "Verified on file"}</li>
                        ${cr.contentDescription ? `<li><strong>Content Style:</strong> ${cr.contentDescription}</li>` : ""}
                    </ul>
                    <p>Looking forward to upcoming brand campaigns!</p>
                    <p>Best,<br/><strong>${cr.fullName || `@${cleanHandle}`}</strong></p>
                </div>`;
                const inPlain = `Hi Team The Bored Monkey,\n\nI've confirmed my creator profile (@${cleanHandle} · ${cr.followersRaw || cr.followersCount} followers · ${cr.category || "Creator"}).\nWhatsApp: ${cr.whatsappNumber || cr.phone || "—"}\nLocation: ${[cr.city, cr.state, cr.pincode].filter(Boolean).join(", ") || "India"}\nLanguages: ${langs}\n${cr.contentDescription ? `Content: ${cr.contentDescription}\n` : ""}\nLooking forward to upcoming brand campaigns!`;

                const messages = [
                    {
                        id: `msg_creator_out_${cr.id}`,
                        email_id: cr.activeCampaignId || "creator_engine",
                        thread_id: threadId,
                        from_addr: ["pratik@theboredmonkey.com"],
                        to_addr: [cEmail],
                        subject: outSubj,
                        snippet: outPlain.slice(0, 300),
                        body_html: outHtml,
                        body_plain: outPlain,
                        internal_date: sentDate,
                        seen: true,
                    },
                    {
                        id: `msg_creator_in_${cr.id}`,
                        email_id: cr.activeCampaignId || "creator_engine",
                        thread_id: threadId,
                        from_addr: [cEmail],
                        to_addr: ["pratik@theboredmonkey.com"],
                        subject: `Re: ${outSubj}`,
                        snippet: inPlain.slice(0, 300),
                        body_html: inHtml,
                        body_plain: inPlain,
                        internal_date: replyDate,
                        seen: cr.intakeStatus !== "COMPLETED",
                    },
                ];
                send(res, 200, { data: messages, pagination: { has_more: false, next_cursor: null } }, 0);
                return;
            }
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

            // Access check: non-master can only see their own campaigns; master only their workspace team
            if (targetLead.campaignOwner) {
                if (!isMaster && targetLead.campaignOwner !== scope.userId) {
                    send(res, 403, { error: "forbidden", message: "You can only view threads from your own campaigns" });
                    return;
                }
                if (isMaster && targetLead.campaignOwner !== scope.userId) {
                    const sameTeam = await pgQuery<any>(
                        `SELECT 1 FROM "UserTeam" ut1
                         JOIN "UserTeam" ut2 ON ut1."teamId" = ut2."teamId"
                         WHERE ut1."userId" = $1 AND ut2."userId" = $2
                         LIMIT 1`,
                        [scope.userId, targetLead.campaignOwner]
                    );
                    if (sameTeam.length === 0) {
                        send(res, 403, { error: "forbidden", message: "You can only view threads from your own workspace" });
                        return;
                    }
                }
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
            const creatorOnly = searchParams.get("creator_only") === "true";
            const folder = searchParams.get("folder") || "inbox";
            const unseen = searchParams.get("unseen") === "true";
            const since = searchParams.get("since");
            const until = searchParams.get("until");
            const subjectQuery = searchParams.get("subject");
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
            } else {
                conditions.push(`c."userId" IN (
                    SELECT ut."userId" FROM "UserTeam" ut 
                    WHERE ut."teamId" IN (SELECT "teamId" FROM "UserTeam" WHERE "userId" = $${pIdx++})
                    UNION ALL SELECT $${pIdx++}
                )`);
                params.push(scope.userId, scope.userId);
            }

            // 2. Campaign filter
            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            if (creatorOnly) {
                conditions.push(`(EXISTS (SELECT 1 FROM "Creator" cr WHERE lower(cr."primaryEmail") = lower(l.email)) OR l."customData"->>'handle' IS NOT NULL OR l."customData"->>'form_link' IS NOT NULL OR l."customData"->>'intake_link' IS NOT NULL)`);
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

            if (creatorOnly) {
                const crConds: string[] = [];
                const crParams: any[] = [];
                let crIdx = 1;
                if (folder === "sent") {
                    crConds.push(`"intakeStatus" != 'SCRAPED_BASELINE'`);
                } else {
                    crConds.push(`"intakeStatus" IN ('COMPLETED', 'PARTIALLY_FILLED', 'FORM_OPENED')`);
                }
                if (subjectQuery && subjectQuery.trim()) {
                    crConds.push(`(lower("fullName") LIKE $${crIdx} OR lower("handle") LIKE $${crIdx} OR lower("primaryEmail") LIKE $${crIdx} OR lower("category") LIKE $${crIdx})`);
                    crParams.push(`%${subjectQuery.trim().toLowerCase()}%`);
                    crIdx++;
                }
                const crRows = await pgQuery<any>(
                    `SELECT id, "handle", "fullName", "primaryEmail", "whatsappNumber", "phone",
                            "followersRaw", "followersCount", "category", "city", "state",
                            "intakeStatus", "intakeCompletionPct", "contentDescription",
                            "lastIntakeActivityAt", "updatedAt"
                     FROM "Creator"
                     WHERE ${crConds.join(" AND ")}
                     ORDER BY COALESCE("lastIntakeActivityAt", "updatedAt") DESC
                     LIMIT 50`,
                    crParams
                );
                const seenEmails = new Set(threadData.map((t: any) => (t.from_addr?.[0] || "").toLowerCase()));
                for (const cr of crRows) {
                    const cleanHandle = String(cr.handle || "").replace(/^@/, "");
                    const cEmail = (cr.primaryEmail || `${cleanHandle}@instagram.creator`).toLowerCase();
                    if (seenEmails.has(cEmail)) continue;
                    seenEmails.add(cEmail);
                    const isCompleted = cr.intakeStatus === "COMPLETED";
                    const displayFrom = `${cr.fullName || `@${cleanHandle}`} (@${cleanHandle}) <${cEmail}>`;
                    const subj = `Re: Collaboration Opportunity with The Bored Monkey x ${cr.fullName || `@${cleanHandle}`}`;
                    const snip = isCompleted
                        ? `Confirmed creator profile (${cr.followersRaw || cr.followersCount} · ${cr.category || "Creator"}${cr.city ? ` · ${cr.city}` : ""}${cr.whatsappNumber ? ` · WhatsApp: ${cr.whatsappNumber}` : ""})`
                        : `Opened Creator Intake Form (@${cleanHandle} · ${cr.category || "Creator"} · ${cr.intakeCompletionPct || 45}% completed)`;
                    threadData.push({
                        id: `th_creator_${cr.id}`,
                        email_id: "creator_engine",
                        thread_id: `th_creator_${cr.id}`,
                        from_addr: [cEmail],
                        to_addr: ["pratik@theboredmonkey.com"],
                        from: displayFrom,
                        subject: subj,
                        snippet: snip,
                        internal_date: cr.lastIntakeActivityAt || cr.updatedAt || new Date().toISOString(),
                        seen: !isCompleted,
                        message_count: 2,
                        has_unread: isCompleted,
                        folder: folder === "sent" ? "sent" : "inbox",
                        campaign_id: "creator_engine",
                        campaign_name: `${cr.category || "Creator"} Scouting & Intake`,
                        labels: [
                            isCompleted
                                ? { id: "cat_interested", title: "100% Enriched", color: "#10b981" }
                                : { id: "cat_warm", title: "Form Opened", color: "#f59e0b" },
                        ],
                    });
                }
            }

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
