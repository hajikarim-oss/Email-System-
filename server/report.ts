import type { QueryFn, QueryRow } from "./types";
import { getMailboxes, type MailboxRow } from "./mailboxes";
import { leadOwned, messageOwned, type DataScope } from "./scope";

// Everything a head-of-department needs about the outreach system, computed
// from the message/lead/brand tables rather than any seeded fixture:
// - lifetime volume (EmailMessage rows plus sends newer than that table)
// - company categories with their response
// - reply classification mix, monthly volume, top campaigns, latest replies.

export interface ReportLifetime {
    emails_sent: number;
    messages_tracked: number;
    leads_total: number;
    leads_contacted: number;
    contacts_emailed: number;
    leads_opened: number;
    leads_replied: number;
    reply_messages: number;
    interested_replies: number;
    delivered: number;
    failed: number;
    // Lifetime rates, all over the same counts printed next to them:
    // open/reply are lead-based (share of contacted leads), bounce and
    // delivery are message-based (share of tracked messages).
    open_rate: number;
    reply_rate: number;
    bounce_rate: number;
    delivered_rate: number;
    brands: number;
    first_send: string | null;
    last_send: string | null;
}

export interface ReportCategory {
    category: string;
    leads: number;
    contacted: number;
    opened: number;
    replied: number;
    reply_rate: number;
}

export interface ReportClassification {
    classification: string;
    leads: number;
}

export interface ReportVolumePoint {
    month: string;
    sent: number;
    replies: number;
}

export interface ReportCampaign {
    campaign: string;
    sent: number;
    replies: number;
    contacts: number;
    reply_rate: number;
    first_sent: string | null;
    last_sent: string | null;
}

export interface ReportReply {
    lead_id?: string;
    thread_id?: string;
    contact_name?: string;
    contact_email: string;
    subject: string;
    snippet: string;
    classification: string;
    replied_at: string | null;
    sender_email: string;
    campaign: string;
    campaign_id?: string | null;
    team_member?: string;
    team_member_id?: string | null;
}

export interface ReportBrand {
    name: string;
    domain: string;
    contacts: number;
    replied: number;
}

export interface SystemReport {
    generated_at: string;
    lifetime: ReportLifetime;
    categories: ReportCategory[];
    reply_breakdown: ReportClassification[];
    volume: ReportVolumePoint[];
    top_campaigns: ReportCampaign[];
    campaigns_total: number;
    recent_replies: ReportReply[];
    brands: ReportBrand[];
    mailboxes: MailboxRow[];
}

function rate(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Math.min(100, Math.round((numerator / denominator) * 1000) / 10);
}

export function cleanSnippetText(raw: any, fallback?: string): string {
    if (!raw) return fallback || "Inbound prospect reply";
    const cleaned = String(raw)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x9;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.slice(0, 300) || fallback || "Inbound prospect reply";
}

// Free consumer domains are contacts, not target brands, so they stay out of
// the "primary target brands" list.
const FREE_MAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "aol.com"];

interface ReportCacheEntry {
    data: SystemReport;
    expiresAt: number;
}
const reportCache = new Map<string, ReportCacheEntry>();
const inFlightReports = new Map<string, Promise<SystemReport>>();
const REPORT_CACHE_TTL = 60_000;

export async function getReport(query: QueryFn, scope: DataScope): Promise<SystemReport> {
    const key = `${scope.master ? "master" : scope.userId}`;
    const cached = reportCache.get(key);
    const nowMs = Date.now();
    if (cached && cached.expiresAt > nowMs) {
        return cached.data;
    }

    if (inFlightReports.has(key)) {
        return inFlightReports.get(key)!;
    }

    const fetchPromise = (async () => {
        try {
            const report = await fetchReportInternal(query, scope);
            reportCache.set(key, { data: report, expiresAt: Date.now() + REPORT_CACHE_TTL });
            return report;
        } finally {
            inFlightReports.delete(key);
        }
    })();

    inFlightReports.set(key, fetchPromise);
    return fetchPromise;
}

async function fetchReportInternal(query: QueryFn, scope: DataScope): Promise<SystemReport> {
    const now = new Date();
    // First day of the month 17 months back = an 18-month window incl. this one.
    const volumeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 17, 1))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

    const [
        messageRows,
        leadRows,
        categoryRows,
        classificationRows,
        volumeRows,
        campaignRows,
        campaignTotalRows,
        replyRows,
        brandRows,
        brandCountRows,
        mailboxes,
    ] = await Promise.all([
        query(
            `SELECT count(*)::int AS messages,
                    count(*) FILTER (WHERE "status" = 'completed')::int AS delivered,
                    count(*) FILTER (WHERE "bounced")::int AS bounced,
                    count(*) FILTER (WHERE "replied")::int AS reply_messages,
                    count(DISTINCT "contactEmail")::int AS contacts,
                    min("createdAt")::timestamp::text AS first_sent,
                    max("createdAt")::timestamp::text AS last_sent
             FROM "EmailMessage"
             WHERE ${messageOwned(scope, `"EmailMessage"`)}`,
        ),
        query(
            `SELECT count(*)::int AS leads,
                    count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    count(*) FILTER (WHERE "lastContactedAt" > coalesce((SELECT max("createdAt") FROM "EmailMessage"), '1970-01-01'::timestamp))::int AS recent_sends,
                    max("lastContactedAt")::timestamp::text AS last_contacted,
                    count(*) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL)::int AS opened,
                    count(*) FILTER (WHERE "totalReplied" > 0)::int AS replied,
                    count(*) FILTER (WHERE "lastContactedAt" IS NULL)::int AS never_contacted
             FROM "Lead"
             WHERE ${leadOwned(scope, `"Lead"`)}`,
        ),
        query(
            `SELECT coalesce(nullif("customData"->>'category', ''), 'Other Segments') AS category,
                    count(*)::int AS leads,
                    count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    count(*) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL OR "totalReplied" > 0)::int AS opened,
                    count(*) FILTER (WHERE "totalReplied" > 0)::int AS replied
             FROM "Lead"
             WHERE ${leadOwned(scope, `"Lead"`)}
             GROUP BY 1
             ORDER BY 2 DESC`,
        ),
        query(
            `SELECT "replyClassification"::text AS classification, count(*)::int AS leads
             FROM "Lead"
             WHERE "replyClassification" IS NOT NULL
               AND "replyClassification"::text <> 'NONE'
               AND ${leadOwned(scope, `"Lead"`)}
             GROUP BY 1
             ORDER BY 2 DESC`,
        ),
        query(
            `WITH messages AS (
                SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
                       count(*)::int AS sent,
                       count(*) FILTER (WHERE "replied")::int AS replies
                FROM "EmailMessage"
                WHERE "createdAt" >= $1::timestamp
                  AND ${messageOwned(scope, `"EmailMessage"`)}
                GROUP BY 1
             ),
             recent AS (
                SELECT to_char(date_trunc('month', "lastContactedAt"), 'YYYY-MM') AS month,
                       count(*)::int AS sent,
                       0::int AS replies
                FROM "Lead"
                WHERE "lastContactedAt" >= $1::timestamp
                  AND "lastContactedAt" > coalesce((SELECT max("createdAt") FROM "EmailMessage"), '1970-01-01'::timestamp)
                  AND ${leadOwned(scope, `"Lead"`)}
                GROUP BY 1
             )
             SELECT month, sum(sent)::int AS sent, sum(replies)::int AS replies
             FROM (SELECT * FROM messages UNION ALL SELECT * FROM recent) combined
             GROUP BY 1
             ORDER BY 1`,
            [volumeStart],
        ),
        query(
            `SELECT coalesce(nullif("campaignClean", ''), 'Unattributed') AS campaign,
                    count(*)::int AS sent,
                    count(*) FILTER (WHERE "replied")::int AS replies,
                    count(DISTINCT "contactEmail")::int AS contacts,
                    min("createdAt")::date::text AS first_sent,
                    max("createdAt")::date::text AS last_sent
             FROM "EmailMessage"
             WHERE ${messageOwned(scope, `"EmailMessage"`)}
             GROUP BY 1
             ORDER BY 2 DESC
             LIMIT 10`,
        ),
        query(
            `SELECT count(DISTINCT nullif("campaignClean", ''))::int AS total
             FROM "EmailMessage"
             WHERE ${messageOwned(scope, `"EmailMessage"`)}`,
        ),
        query(
            `SELECT l.id AS lead_id,
                    l.email AS contact_email,
                    coalesce(nullif(trim(concat(l."firstName", ' ', l."lastName")), ''), l.email) AS contact_name,
                    coalesce(nullif(e."rawPayload"->>'subject', ''), nullif(e."rawPayload"->>'email_subject', ''), concat('Re: ', coalesce(c.name, 'Outreach'))) AS subject,
                    coalesce(
                        nullif(e."rawPayload"->'reply_message'->>'text', ''),
                        nullif(e."rawPayload"->'reply_message'->>'html', ''),
                        nullif(e."rawPayload"->>'reply_text', ''),
                        nullif(e."rawPayload"->>'reply_body', ''),
                        nullif(e."rawPayload"->>'snippet', ''),
                        nullif(e."rawPayload"->>'body', ''),
                        nullif(e."rawPayload"->>'text', ''),
                        nullif(e."rawPayload"->>'email_body', ''),
                        ''
                    ) AS raw_snippet,
                    coalesce(l."replyClassification"::text, l."leadCategory"::text, 'Interested') AS classification,
                    e."createdAt"::timestamp::text AS replied_at,
                    coalesce(e."fromEmail", '') AS sender_email,
                    coalesce(c.name, 'Direct Outreach') AS campaign,
                    c.id AS campaign_id,
                    coalesce(u.name, 'Master') AS team_member,
                    u.id AS team_member_id
             FROM "EmailEvent" e
             JOIN "Lead" l ON l.id = e."leadId"
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             LEFT JOIN "User" u ON u.id = c."userId"
             WHERE e."eventType" = 'replied'
               AND ${leadOwned(scope, "l")}
             ORDER BY e."createdAt" DESC
             LIMIT 50`,
        ),
        query(
            `SELECT name, domain, "totalContacts"::int AS contacts, "repliedContacts"::int AS replied
             FROM "Brand"
             WHERE NOT (lower(domain) = ANY($1::text[]))
             ORDER BY "totalContacts" DESC
             LIMIT 6`,
            [FREE_MAIL_DOMAINS],
        ),
        query(`SELECT count(*)::int AS total FROM "Brand"`),
        getMailboxes(query, scope),
    ]);

    const messages = messageRows[0] || {};
    const leads = leadRows[0] || {};
    const campaignTotal = campaignTotalRows[0]?.total || 0;
    const brandTotal = brandCountRows[0]?.total || 0;

    const messagesTracked = messages.messages || 0;
    const recentSends = leads.recent_sends || 0;
    const replyMessages = messages.reply_messages || 0;

    const lifetime: ReportLifetime = {
        // Message rows are the mail record; leads contacted after the newest
        // message row are the sends that table has not caught up with yet.
        emails_sent: messagesTracked + recentSends,
        messages_tracked: messagesTracked,
        leads_total: leads.leads || 0,
        leads_contacted: leads.contacted || 0,
        contacts_emailed: messages.contacts || 0,
        leads_opened: leads.opened || 0,
        leads_replied: leads.replied || 0,
        reply_messages: replyMessages,
        interested_replies: classificationRows.find((row) => row.classification === "INTERESTED")?.leads || 0,
        delivered: messages.delivered || 0,
        failed: messages.bounced || 0,
        open_rate: rate(leads.opened || 0, leads.contacted || 0),
        reply_rate: rate(leads.replied || 0, leads.contacted || 0),
        bounce_rate: rate(messages.bounced || 0, messagesTracked),
        delivered_rate: rate(messages.delivered || 0, messagesTracked),
        brands: brandTotal,
        first_send: messages.first_sent || null,
        last_send: leads.last_contacted || messages.last_sent || null,
    };

    // All defined industry segments stay visible; 'Other Segments' is shown at the end
    const otherSeg = categoryRows.find((row) => row.category === "Other Segments" || row.category === "Uncategorized");
    const categorized = categoryRows.filter((row) => row.category !== "Other Segments" && row.category !== "Uncategorized");
    const meaningful = categorized.filter((row) => (row.leads || 0) >= 10);
    const trivial = categorized.filter((row) => (row.leads || 0) < 10);
    const top = meaningful;
    const tail = trivial;
    const tailTotals = tail.reduce(
        (acc, row) => ({
            leads: acc.leads + (row.leads || 0),
            contacted: acc.contacted + (row.contacted || 0),
            opened: acc.opened + (row.opened || 0),
            replied: acc.replied + (row.replied || 0),
        }),
        {
            leads: otherSeg?.leads || 0,
            contacted: otherSeg?.contacted || 0,
            opened: otherSeg?.opened || 0,
            replied: otherSeg?.replied || 0,
        },
    );

    const toCategory = (row: QueryRow): ReportCategory => ({
        category: String(row.category ?? ""),
        leads: row.leads || 0,
        contacted: row.contacted || 0,
        opened: row.opened || 0,
        replied: row.replied || 0,
        reply_rate: rate(row.replied || 0, row.contacted || row.leads || 0),
    });

    const categories: ReportCategory[] = top.map(toCategory);
    if (tailTotals.leads > 0) {
        categories.push({
            category: "Other Segments",
            leads: tailTotals.leads,
            contacted: tailTotals.contacted,
            opened: tailTotals.opened,
            replied: tailTotals.replied,
            reply_rate: rate(tailTotals.replied, tailTotals.contacted || tailTotals.leads),
        });
    }

    return {
        generated_at: now.toISOString(),
        lifetime,
        categories,
        reply_breakdown: classificationRows.map((row) => ({
            classification: row.classification,
            leads: row.leads || 0,
        })),
        volume: volumeRows.map((row) => ({
            month: String(row.month),
            sent: row.sent || 0,
            replies: row.replies || 0,
        })),
        top_campaigns: campaignRows.map((row) => ({
            campaign: String(row.campaign),
            sent: row.sent || 0,
            replies: row.replies || 0,
            contacts: row.contacts || 0,
            reply_rate: rate(row.replies || 0, row.sent || 0),
            first_sent: row.first_sent || null,
            last_sent: row.last_sent || null,
        })),
        campaigns_total: campaignTotal,
        recent_replies: replyRows.map((row) => ({
            lead_id: String(row.lead_id || ""),
            thread_id: `th_camp_${row.lead_id}`,
            contact_name: String(row.contact_name || ""),
            contact_email: String(row.contact_email || ""),
            subject: String(row.subject || ""),
            snippet: cleanSnippetText(row.raw_snippet, String(row.subject || "")),
            classification: String(row.classification || "INTERESTED"),
            replied_at: row.replied_at || null,
            sender_email: String(row.sender_email || ""),
            campaign: String(row.campaign || ""),
            campaign_id: row.campaign_id ? String(row.campaign_id) : null,
            team_member: String(row.team_member || "Master"),
            team_member_id: row.team_member_id ? String(row.team_member_id) : null,
        })),
        brands: brandRows.map((row) => ({
            name: String(row.name || ""),
            domain: String(row.domain || ""),
            contacts: row.contacts || 0,
            replied: row.replied || 0,
        })),
        mailboxes,
    };
}
