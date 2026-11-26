import type { IncomingMessage, ServerResponse } from "node:http";
import { pgQuery } from "./pg";
import { requireUser } from "./handlers/auth";
import { scopeFor } from "./scope";
import { send } from "./handlers/send";
import { syncLeadMessageHistory, isBounceOrNdrMessage } from "./smartleadRepliesSync";
import { cleanSnippetText } from "./report";
import { classifyReplyDeterministic } from "./automation/pipeline/replyClassifier";

function extractReplyMessage(raw: Record<string, any>, isReply = true) {
    const replyMsg = raw.reply_message || {};
    const bodyHtml =
        replyMsg.html ||
        replyMsg.text ||
        raw.reply_text ||
        raw.reply_body ||
        raw.email_body ||
        raw.body ||
        raw.custom_email_message ||
        raw.sent_message_body ||
        "";
    const plainCand =
        replyMsg.text ||
        raw.snippet ||
        replyMsg.html ||
        raw.reply_text ||
        raw.reply_body ||
        raw.email_body ||
        raw.body ||
        raw.custom_email_message ||
        raw.sent_message_body ||
        "";
    const fallback = isReply
        ? (raw.subject || raw.email_subject || "Prospect replied")
        : (raw.subject || raw.email_subject || "Outbound outreach email");
    const bodyPlain = cleanSnippetText(plainCand, fallback);
    return { bodyHtml, bodyPlain };
}

function mapClassificationLabel(
    rawClass: string | null | undefined,
    bodyText: string,
    subjectText: string,
    email: string,
): { id: string; title: string; color: string } {
    let cls = String(rawClass || "").toUpperCase().trim();
    if (!cls || cls === "NONE") {
        const det = classifyReplyDeterministic({
            text: bodyText,
            subject: subjectText,
            contactEmail: email,
        });
        cls = det.dbClassification;
    }
    switch (cls) {
        case "INTERESTED":
            return { id: "cat_interested", title: "Interested", color: "#10b981" };
        case "NOT_NOW":
            return { id: "cat_not_now", title: "Not Interested", color: "#f43f5e" };
        case "WRONG_PERSON":
            return { id: "cat_wrong_person", title: "Referral / Redirect", color: "#8b5cf6" };
        case "OOO":
            return { id: "cat_ooo", title: "Out of Office", color: "#f59e0b" };
        case "AUTO_RESPONDER":
            return { id: "cat_auto", title: "Auto-Reply", color: "#64748b" };
        case "UNSUBSCRIBE":
            return { id: "cat_unsub", title: "Unsubscribe", color: "#ef4444" };
        default:
            return { id: "cat_replied", title: "Replied", color: "#0ea5e9" };
    }
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
const UNIBOX_CACHE_TTL = 20_000;

// SQL predicate for genuine inbound prospect reply events (excludes synthetic body-less sl_stat_reply_% and bounce NDRs)
const GENUINE_REPLY_EVENT_SQL = `
    ev."eventType" = 'replied'
    AND coalesce(ev."providerEventId", '') NOT LIKE 'sl_stat_reply_%'
    AND coalesce(
        ev."rawPayload"->'reply_message'->>'text',
        ev."rawPayload"->'reply_message'->>'html',
        ev."rawPayload"->>'reply_text',
        ev."rawPayload"->>'reply_body',
        ev."rawPayload"->>'email_body',
        ev."rawPayload"->>'body',
        ev."rawPayload"->>'snippet',
        ''
    ) != ''
    AND lower(coalesce(ev."fromEmail", ev."rawPayload"->>'from_email', '')) NOT LIKE '%mailer-daemon%'
    AND lower(coalesce(ev."fromEmail", ev."rawPayload"->>'from_email', '')) NOT LIKE '%postmaster@%'
    AND lower(coalesce(ev."rawPayload"->>'subject', '')) NOT LIKE '%delivery status notification%'
    AND lower(coalesce(ev."rawPayload"->>'subject', '')) NOT LIKE '%undeliverable:%'
`;

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
            const isTroopsUser = Boolean(scope.isTroops);
            const users = await pgQuery<any>(
                `SELECT u.id, u.name, u.email, u.role
                 FROM "User" u
                 WHERE u."isActive" = true
                   AND (
                       ($1 = true AND u.id IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b'))
                       OR ($1 = false AND u.id NOT IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b') AND lower(u.email) NOT LIKE '%@example.com' AND lower(u.email) NOT LIKE 'agent_%')
                   )
                 ORDER BY u."createdAt" ASC`,
                [isTroopsUser]
            );

            const mailboxes = await pgQuery<any>(
                `SELECT id, "userId", "senderEmail"
                 FROM "Mailbox"
                 WHERE status != 'RETIRED'`
            );

            // Group genuine reply counts per campaign owner across the workspace (excluding Troops / Creator campaigns in TBM Workspace)
            const replyCounts = await pgQuery<any>(
                `SELECT c."userId", COUNT(DISTINCT l.id)::int as unread
                 FROM "EmailEvent" ev
                 JOIN "Lead" l ON l.id = ev."leadId"
                 JOIN "Campaign" c ON c.id = l."campaignId"
                 WHERE ${GENUINE_REPLY_EVENT_SQL}
                   AND (
                     ($1 = true AND c."userId" IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b'))
                     OR ($1 = false AND (
                         c."userId" NOT IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b')
                         AND lower(coalesce(c.name, '')) NOT LIKE '%creator%'
                         AND lower(coalesce(c.name, '')) NOT LIKE '%influencer%'
                         AND lower(coalesce(c.name, '')) NOT LIKE '%reviewer%'
                         AND lower(coalesce(c.name, '')) NOT LIKE '%troops%'
                     ))
                   )
                 GROUP BY c."userId"`,
                [isTroopsUser]
            );

            const unreadMap = new Map<string, number>();
            let totalUnread = 0;
            const visibleUserIds = new Set(users.map((u: any) => u.id));
            for (const r of replyCounts) {
                if (r.userId) {
                    unreadMap.set(r.userId, (unreadMap.get(r.userId) || 0) + Number(r.unread));
                    if (visibleUserIds.has(r.userId)) {
                        totalUnread += Number(r.unread);
                    }
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
                    if (emailLower.includes("simran.d")) roleLabel = "Admin";
                    else if (u.role === "MASTER") roleLabel = "Master";
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

            if (!isMaster && memberId && memberId !== "all" && memberId !== scope.userId) {
                send(res, 403, { error: "forbidden", message: "You can only view your own unibox." }, 0);
                return;
            }
            const effectiveMemberId = isMaster
                ? (memberId && memberId !== "all" ? memberId : null)
                : scope.userId;

            const cacheKey = `${isMaster ? `master_${scope.userId}` : scope.userId}_${effectiveMemberId || "all"}_${campaignId || "all"}_${creatorOnly ? "creators" : "all"}`;
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

            const isTroopsUser = Boolean(scope.isTroops);
            if (effectiveMemberId) {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(effectiveMemberId);
            }
            if (isTroopsUser) {
                conditions.push(`c."userId" IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b')`);
            } else {
                conditions.push(`(c."userId" IS NULL OR c."userId" NOT IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b'))`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%creator%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%influencer%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%reviewer%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%troops%'`);
            }

            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            if (creatorOnly) {
                conditions.push(`(EXISTS (SELECT 1 FROM "Creator" cr WHERE lower(cr."primaryEmail") = lower(l.email)) OR l."customData"->>'handle' IS NOT NULL OR l."customData"->>'form_link' IS NOT NULL OR l."customData"->>'intake_link' IS NOT NULL)`);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            // Dynamic aggregations from PostgreSQL (fast Lead + EmailEvent queries)
            const countsPromise = pgQuery<any>(
                `SELECT
                    COUNT(*)::int AS total_leads,
                    COUNT(*) FILTER (WHERE l.status = 'ACTIVE' AND l."totalOutbound" > 0)::int AS awaiting_reply,
                    COUNT(*) FILTER (WHERE l.status = 'BOUNCED')::int AS bounced_leads
                 FROM "Lead" l
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${whereClause}`,
                params
            );

            // Genuine reply counts & today/week reply events (driven from EmailEvent_eventType_createdAt_idx)
            const replyWhereClause = conditions.length > 0
                ? `WHERE ${GENUINE_REPLY_EVENT_SQL} AND ${conditions.join(" AND ")}`
                : `WHERE ${GENUINE_REPLY_EVENT_SQL}`;
            const eventCountsPromise = pgQuery<any>(
                `SELECT
                    COUNT(DISTINCT ev."leadId")::int AS replied_leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'REPLIED' THEN ev."leadId" END)::int AS unread_replied_leads,
                    COUNT(DISTINCT CASE WHEN ev."createdAt" >= CURRENT_DATE THEN ev."leadId" END)::int AS today_replies,
                    COUNT(DISTINCT CASE WHEN ev."createdAt" >= NOW() - INTERVAL '7 days' THEN ev."leadId" END)::int AS week_replies
                 FROM "EmailEvent" ev
                 JOIN "Lead" l ON l.id = ev."leadId"
                 LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                 ${replyWhereClause}`,
                params
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

            const repliedCount = (eData.replied_leads || 0) + (creatorOnly ? (crData.intake_replied || 0) : 0);
            const unreadCount = (eData.unread_replied_leads || eData.replied_leads || 0) + (creatorOnly ? (crData.intake_completed || 0) : 0);

            const overview = {
                total: repliedCount,
                unread: unreadCount,
                today: (eData.today_replies || 0) + (creatorOnly ? (crData.intake_today || 0) : 0),
                week: (eData.week_replies || 0) + (creatorOnly ? (crData.intake_week || 0) : 0),
                snoozed: 0,
                awaiting_reply: (cData.awaiting_reply || 0) + (creatorOnly ? (crData.intake_awaiting || 0) : 0),
                awaiting_agent_draft: 0,
                scheduled_pending: 0,
                scheduled_pending_max: 500,
                folders: [
                    { folder: "inbox", unread: unreadCount, total: repliedCount },
                    { folder: "sent", unread: 0, total: (cData.awaiting_reply || 0) + repliedCount },
                    { folder: "drafts", unread: 0, total: 0 },
                    { folder: "archive", unread: 0, total: 0 },
                    { folder: "spam", unread: 0, total: 0 },
                    { folder: "trash", unread: 0, total: 0 },
                ],
                mailboxes: mailboxSummaries,
                tags: [],
                categories: [
                    { id: "cat_interested", title: creatorOnly ? "100% Enriched / Replied" : "Interested", color: "#10b981", unread: unreadCount, total: repliedCount },
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
                        l.email as "leadEmail", l."firstName", l."lastName", l."campaignId", c.name as "campaignName"
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
            const { bodyHtml, bodyPlain } = extractReplyMessage(raw, isReply);
            const subject = raw.subject || raw.email_subject || (isReply ? `Re: ${ev.campaignName || "Outreach"}` : `Outreach: ${ev.campaignName || "Partnership"}`);
            const prospectName = [ev.firstName, ev.lastName].filter(Boolean).join(" ").trim();
            const prospectDisplay = prospectName ? `${prospectName} <${ev.leadEmail}>` : ev.leadEmail;
            const rawTo = raw.to_email || raw.to || "";
            const teamMailbox = (!isReply ? (ev.fromEmail || raw.from_email || raw.from) : (rawTo && rawTo.toLowerCase().includes("theboredmonkey.com") ? rawTo : raw.from_email)) || "haji.karim@theboredmonkey.com";
            const fromAddr = isReply ? (ev.fromEmail && !ev.fromEmail.includes("theboredmonkey.com") ? (prospectName ? `${prospectName} <${ev.fromEmail}>` : ev.fromEmail) : prospectDisplay) : teamMailbox;
            const toAddr = isReply ? teamMailbox : ev.leadEmail;

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
                direction: isReply ? "inbound" : "outbound",
            }, 0);
            return;
        }

        // Route: /api/v1/unibox/thread (Single Thread Message History)
        if (pathname.endsWith("/thread")) {
            const threadId = searchParams.get("thread_id") || "";
            if (/^th_creator_/i.test(threadId)) {
                const creatorId = threadId.replace(/^th_creator_/i, "");
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
                const formUrl = `https://tbmoutreach.tech/creator/intake/${cr.intakeToken || cr.id}`;
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
                        direction: "outbound",
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
                        direction: "inbound",
                    },
                ];
                send(res, 200, { data: messages, pagination: { has_more: false, next_cursor: null } }, 0);
                return;
            }

            // Important: case-insensitive strip of Th_camp_ / th_camp_ (React Router Breadcrumb title-cases URL segments in some links)
            const leadId = threadId.replace(/^th_camp_/i, "").replace(/^th_/i, "");

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
                 WHERE lower(l.id) = lower($1) OR lower(l.email) = lower($1)
                 ORDER BY l."updatedAt" DESC
                 LIMIT 1`,
                [leadId]
            );

            if (!leads || leads.length === 0) {
                send(res, 200, { data: [], pagination: { has_more: false, next_cursor: null } });
                return;
            }

            const targetLead = leads[0];

            // Workspace access check: Troops users only see Troops threads; TBM workspace users see all TBM workspace threads
            const isTroopsOwner = ["usr_troops_0c4c79fd", "usr_troops_87e6f943", "usr_troops_4d72a76b"].includes(String(targetLead.campaignOwner || ""));
            if (targetLead.campaignOwner && Boolean(scope.isTroops) !== isTroopsOwner) {
                send(res, 403, { error: "forbidden", message: "You can only view threads from your own workspace" });
                return;
            }

            // Fetch events for this lead
            let events = await pgQuery<any>(
                `SELECT e.id, e."eventType", e."providerEventId", e."fromEmail", e."rawPayload", e."createdAt"
                 FROM "EmailEvent" e
                 WHERE e."leadId" = $1 AND e."eventType" IN ('sent', 'replied')
                 ORDER BY e."createdAt" ASC`,
                [targetLead.id]
            );

            // Check if any reply event is missing its body or if we only have synthetic events
            const hasEmptyReply = events.some((e: any) => {
                if (e.eventType !== "replied") return false;
                const raw = e.rawPayload || {};
                const body = raw.reply_message?.html || raw.reply_message?.text || raw.reply_text || raw.reply_body || raw.email_body || raw.body || "";
                return !body || String(e.providerEventId || "").startsWith("sl_stat_reply_");
            });

            if (events.length === 0 || hasEmptyReply) {
                try {
                    await syncLeadMessageHistory(targetLead.id);
                    events = await pgQuery<any>(
                        `SELECT e.id, e."eventType", e."providerEventId", e."fromEmail", e."rawPayload", e."createdAt"
                         FROM "EmailEvent" e
                         WHERE e."leadId" = $1 AND e."eventType" IN ('sent', 'replied')
                         ORDER BY e."createdAt" ASC`,
                        [targetLead.id]
                    );
                } catch (syncErr) {
                    console.warn("[unibox/thread] Auto-sync message history warning:", syncErr);
                }
            }

            // Filter out synthetic body-less placeholders and duplicate sent events
            const hasRealSentWithBody = events.some((e: any) => {
                if (e.eventType !== "sent") return false;
                const raw = e.rawPayload || {};
                return Boolean(raw.email_body || raw.body || raw.sent_message_body || raw.custom_email_message);
            });

            const filteredEvents = events.filter((event: any) => {
                const raw = (event.rawPayload || {}) as Record<string, any>;
                const pId = String(event.providerEventId || "");
                const body =
                    raw.reply_message?.html ||
                    raw.reply_message?.text ||
                    raw.reply_text ||
                    raw.reply_body ||
                    raw.email_body ||
                    raw.body ||
                    raw.custom_email_message ||
                    raw.sent_message_body ||
                    "";

                if (event.eventType === "replied") {
                    if (pId.startsWith("sl_stat_reply_") && !body) return false;
                    if (!body) return false;
                    if (isBounceOrNdrMessage(event.fromEmail || raw.from_email || "", raw.subject || "", body)) return false;
                    return true;
                }
                if (event.eventType === "sent") {
                    if (hasRealSentWithBody && !body) return false;
                    return true;
                }
                return true;
            });

            // Deduplicate identical messages by (eventType + normalized snippet/stats_id)
            const seenKeys = new Set<string>();
            const uniqueEvents = filteredEvents.filter((event: any) => {
                const raw = (event.rawPayload || {}) as Record<string, any>;
                const statsId = raw.stats_id || raw.message_id || "";
                const { bodyPlain } = extractReplyMessage(raw, event.eventType === "replied");
                const dedupKey = `${event.eventType}|${statsId || bodyPlain.slice(0, 120)}`;
                if (seenKeys.has(dedupKey)) return false;
                seenKeys.add(dedupKey);
                return true;
            });

            // Identify our team's sender mailbox from the outbound message(s)
            const outboundSender =
                uniqueEvents
                    .filter((e: any) => e.eventType === "sent")
                    .map((e: any) => e.fromEmail || e.rawPayload?.from_email || e.rawPayload?.from)
                    .find((addr: any) => addr && String(addr).includes("@")) ||
                "haji.karim@theboredmonkey.com";

            const prospectName = [targetLead.firstName, targetLead.lastName].filter(Boolean).join(" ").trim();
            const prospectDisplay = prospectName ? `${prospectName} <${targetLead.email}>` : targetLead.email;

            const messages = uniqueEvents.map((event: any) => {
                const raw = (event.rawPayload || {}) as Record<string, any>;
                const isReply = event.eventType === "replied";
                const subject =
                    raw.subject ||
                    raw.email_subject ||
                    (isReply
                        ? `Re: ${targetLead.campaignName || "Outreach"}`
                        : `Outreach: ${targetLead.campaignName || "Partnership"}`);
                const { bodyHtml, bodyPlain } = extractReplyMessage(raw, isReply);
                const snippet = bodyPlain.slice(0, 2000);

                // For inbound replies, the sender is the prospect; for outbound, our team mailbox
                const rawSender = event.fromEmail || raw.from_email || raw.from || "";
                const senderEmail = isReply
                    ? (rawSender && !rawSender.toLowerCase().includes("theboredmonkey.com")
                        ? (prospectName && !rawSender.includes("<") ? `${prospectName} <${rawSender}>` : rawSender)
                        : prospectDisplay)
                    : (rawSender || outboundSender);
                const rawTo = raw.to_email || raw.to || "";
                const recipientEmail = isReply
                    ? (rawTo && rawTo.toLowerCase().includes("theboredmonkey.com") ? rawTo : outboundSender)
                    : targetLead.email;

                return {
                    id: `msg_${event.id}`,
                    email_id: targetLead.campaignId || "",
                    thread_id: `th_camp_${targetLead.id}`,
                    from_addr: [senderEmail],
                    to_addr: [recipientEmail],
                    subject,
                    snippet,
                    body_html: bodyHtml,
                    body_plain: bodyPlain,
                    internal_date: event.createdAt,
                    seen: true,
                    direction: isReply ? "inbound" : "outbound",
                    prospect_email: targetLead.email,
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
                const leadId = threadId ? threadId.replace(/^th_camp_/i, "").replace(/^th_/i, "") : null;
                if (leadId) {
                    await pgQuery(`UPDATE "Lead" SET "status" = 'ACTIVE' WHERE lower(id) = lower($1)`, [leadId]);
                }
            } catch {}
            uniboxOverviewCache.clear();
            send(res, 200, { success: true });
            return;
        }

        // Route: GET /api/v1/unibox or /api/unibox (Inbox List)
        if (req.method === "GET") {
            const memberId = searchParams.get("member_id");
            const campaignId = searchParams.get("campaign_id");
            const creatorOnly = searchParams.get("creator_only") === "true";
            const folder = searchParams.get("folder") || "inbox";
            const awaitingReply = searchParams.get("awaiting_reply") === "true";
            const unseen = searchParams.get("unseen") === "true";
            const since = searchParams.get("since");
            const until = searchParams.get("until");
            const subjectQuery = (searchParams.get("subject") || searchParams.get("query") || "").trim();
            const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

            const conditions: string[] = [];
            const params: any[] = [];
            let pIdx = 1;

            // 1. Team access scoping — strict userId match derived from authenticated session
            if (!isMaster && memberId && memberId !== "all" && memberId !== scope.userId) {
                send(res, 403, { error: "forbidden", message: "You can only view your own unibox." }, 0);
                return;
            }
            const effectiveMemberId = isMaster
                ? (memberId && memberId !== "all" ? memberId : null)
                : scope.userId;
            const isTroopsUser = Boolean(scope.isTroops);
            if (effectiveMemberId) {
                conditions.push(`c."userId" = $${pIdx++}`);
                params.push(effectiveMemberId);
            }
            if (isTroopsUser) {
                conditions.push(`c."userId" IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b')`);
            } else {
                conditions.push(`(c."userId" IS NULL OR c."userId" NOT IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b'))`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%creator%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%influencer%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%reviewer%'`);
                conditions.push(`lower(coalesce(c.name, '')) NOT LIKE '%troops%'`);
            }

            // 2. Campaign filter
            if (campaignId && campaignId !== "all") {
                conditions.push(`l."campaignId" = $${pIdx++}`);
                params.push(campaignId);
            }

            if (creatorOnly) {
                conditions.push(`(EXISTS (SELECT 1 FROM "Creator" cr WHERE lower(cr."primaryEmail") = lower(l.email)) OR l."customData"->>'handle' IS NOT NULL OR l."customData"->>'form_link' IS NOT NULL OR l."customData"->>'intake_link' IS NOT NULL)`);
            }

            // 3. Search query filter (matches email, name, campaign, or reply content)
            if (subjectQuery) {
                const likeParam = `$${pIdx++}`;
                params.push(`%${subjectQuery}%`);
                conditions.push(`(
                    l.email ILIKE ${likeParam}
                    OR coalesce(l."firstName", '') ILIKE ${likeParam}
                    OR coalesce(l."lastName", '') ILIKE ${likeParam}
                    OR coalesce(c.name, '') ILIKE ${likeParam}
                )`);
            }

            // 4. Folder filter:
            // - "sent" or "awaiting_reply": show leads who were sent an email
            // - "inbox" / "all" / default: strictly show leads who have a GENUINE inbound reply event with body!
            const isSentView = folder === "sent" || awaitingReply;
            if (isSentView) {
                conditions.push(`l."totalOutbound" > 0`);
                if (awaitingReply) {
                    conditions.push(`NOT EXISTS (
                        SELECT 1 FROM "EmailEvent" ev WHERE ev."leadId" = l.id AND ${GENUINE_REPLY_EVENT_SQL}
                    )`);
                }
            } else {
                conditions.push(`EXISTS (
                    SELECT 1 FROM "EmailEvent" ev WHERE ev."leadId" = l.id AND ${GENUINE_REPLY_EVENT_SQL}
                )`);
            }

            if (unseen) {
                conditions.push(`l.status = 'REPLIED'`);
            }

            // 5. Time filter
            if (since) {
                conditions.push(`l."updatedAt" >= $${pIdx++}::timestamptz`);
                params.push(since);
            }

            if (until) {
                conditions.push(`l."updatedAt" <= $${pIdx++}::timestamptz`);
                params.push(until + "T23:59:59.999Z");
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            const rows = await pgQuery<any>(
                `WITH replied_events AS (
                    SELECT DISTINCT ON (ev."leadId")
                           ev."leadId",
                           ev."fromEmail" as reply_from,
                           ev."createdAt" as reply_created_at,
                           ev."rawPayload" as reply_payload
                    FROM "EmailEvent" ev
                    WHERE ${GENUINE_REPLY_EVENT_SQL}
                    ORDER BY ev."leadId", ev."createdAt" DESC
                ),
                sent_events AS (
                    SELECT DISTINCT ON (ev."leadId")
                           ev."leadId",
                           ev."fromEmail" as sent_from,
                           ev."createdAt" as sent_created_at,
                           ev."rawPayload" as sent_payload
                    FROM "EmailEvent" ev
                    WHERE ev."eventType" = 'sent'
                    ORDER BY ev."leadId",
                             (CASE WHEN coalesce(ev."providerEventId", '') NOT LIKE 'sl_stat_sent_%' THEN 0 ELSE 1 END) ASC,
                             ev."createdAt" DESC
                ),
                event_counts AS (
                    SELECT ev."leadId",
                           COUNT(DISTINCT CASE WHEN ev."eventType" = 'sent' AND coalesce(ev."providerEventId", '') NOT LIKE 'sl_stat_sent_%' THEN ev.id END)::int as real_sent_cnt,
                           COUNT(DISTINCT CASE WHEN ${GENUINE_REPLY_EVENT_SQL} THEN ev.id END)::int as real_reply_cnt
                    FROM "EmailEvent" ev
                    GROUP BY ev."leadId"
                )
                SELECT l.id, l.email, l."firstName", l."lastName", l."campaignId", l.status,
                       l."leadCategory", l."replyClassification", l."totalOutbound", l."totalInbound", l."updatedAt",
                       c.name as "campaignName", c."userId" as "campaignOwner",
                       coalesce(se.sent_from, se.sent_payload->>'from_email', 'haji.karim@theboredmonkey.com') as "fromEmail",
                       se.sent_payload as "sentPayload",
                       se.sent_created_at as "sentCreatedAt",
                       re.reply_from as "replyFromEmail",
                       re.reply_created_at as "replyCreatedAt",
                       re.reply_payload as "replyPayload",
                       coalesce(ec.real_sent_cnt, 1) as "realSentCnt",
                       coalesce(ec.real_reply_cnt, 0) as "realReplyCnt"
                FROM "Lead" l
                LEFT JOIN "Campaign" c ON c.id = l."campaignId"
                LEFT JOIN replied_events re ON re."leadId" = l.id
                LEFT JOIN sent_events se ON se."leadId" = l.id
                LEFT JOIN event_counts ec ON ec."leadId" = l.id
                ${whereClause}
                ORDER BY coalesce(re.reply_created_at, se.sent_created_at, l."updatedAt") DESC
                LIMIT ${limit + 1}`,
                params
            );

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;

            const threadData = items.map((lead: any) => {
                const payload = ((isSentView ? lead.sentPayload : lead.replyPayload) || lead.replyPayload || lead.sentPayload || {}) as Record<string, any>;
                const replyMsg = payload.reply_message || {};
                const snippetRaw =
                    replyMsg.text ||
                    replyMsg.html ||
                    payload.reply_text ||
                    payload.reply_body ||
                    payload.snippet ||
                    payload.body ||
                    payload.email_body ||
                    payload.sent_message_body ||
                    payload.text ||
                    "";
                const rawSubject =
                    payload.subject ||
                    payload.email_subject ||
                    (lead.campaignName ? `Re: ${lead.campaignName}` : "Partnership Discussion");
                const subject = !isSentView && !/^re:/i.test(rawSubject) ? `Re: ${rawSubject}` : rawSubject;

                // Clean snippet and strip quoted email history so only the prospect's actual reply shows in the list preview
                const fullPlain = cleanSnippetText(snippetRaw, "Prospect replied");
                const replySegment = fullPlain
                    .split(/\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]{2}|\d{1,2}\s+[A-Z][a-z]{2})/i)[0]
                    ?.split(/-----Original Message-----/i)[0]
                    ?.split(/\bFrom:\s+[^\n]+\s+Sent:/i)[0]
                    ?.trim();
                const snippet = (replySegment && replySegment.length >= 2 ? replySegment : fullPlain).slice(0, 240);

                // In the Inbox, the sender displayed is the PROSPECT who replied
                const leadDisplayName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
                const fromDisplay = leadDisplayName ? `${leadDisplayName} <${lead.email}>` : lead.email;
                const fromAddr = [fromDisplay];
                const toAddr = [lead.fromEmail || "haji.karim@theboredmonkey.com"];

                const classificationChip = isSentView
                    ? { id: "cat_sent", title: "Dispatched", color: "#64748b" }
                    : mapClassificationLabel(lead.replyClassification, snippet, subject, lead.email);

                const labels: { id: string; title: string; color: string }[] = [classificationChip];
                const eventTime = lead.replyCreatedAt || lead.sentCreatedAt || lead.updatedAt;
                const msgCount = Math.max(
                    isSentView ? 1 : 2,
                    Math.max(1, Number(lead.realSentCnt || 1)) + Number(lead.realReplyCnt || (isSentView ? 0 : 1)),
                );

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
                    message_count: msgCount,
                    has_unread: lead.status === "REPLIED",
                    folder: isSentView ? "sent" : "inbox",
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
                if (subjectQuery) {
                    crConds.push(`(lower("fullName") LIKE $${crIdx} OR lower("handle") LIKE $${crIdx} OR lower("primaryEmail") LIKE $${crIdx} OR lower("category") LIKE $${crIdx})`);
                    crParams.push(`%${subjectQuery.toLowerCase()}%`);
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

        send(res, 405, { error: "method_not_allowed" });
    } catch (err: any) {
        console.error("[unibox] Error:", err);
        send(res, 500, { error: "internal_error", message: err?.message });
    }
}
