import type { QueryFn, QueryRow } from "./types";
import { getMailboxes, type MailboxRow } from "./mailboxes";

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
    contact_email: string;
    subject: string;
    snippet: string;
    classification: string;
    replied_at: string | null;
    sender_email: string;
    campaign: string;
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

// Free consumer domains are contacts, not target brands, so they stay out of
// the "primary target brands" list.
const FREE_MAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "aol.com"];

export async function getReport(query: QueryFn): Promise<SystemReport> {
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
        yearlyRows,
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
             FROM "EmailMessage"`,
        ),
        query(
            `SELECT count(*)::int AS leads,
                    count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    count(*) FILTER (WHERE "lastContactedAt" > coalesce((SELECT max("createdAt") FROM "EmailMessage"), '1970-01-01'::timestamp))::int AS recent_sends,
                    max("lastContactedAt")::timestamp::text AS last_contacted,
                    count(*) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL)::int AS opened,
                    count(*) FILTER (WHERE "totalReplied" > 0)::int AS replied,
                    count(*) FILTER (WHERE "lastContactedAt" IS NULL)::int AS never_contacted
             FROM "Lead"`,
        ),
        query(
            `SELECT coalesce(nullif(btrim("customData"->>'category'), ''), 'Uncategorized') AS category,
                    count(*)::int AS leads,
                    count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    count(*) FILTER (WHERE "openCount" > 0)::int AS opened,
                    count(*) FILTER (WHERE "totalReplied" > 0)::int AS replied
             FROM "Lead"
             GROUP BY 1
             ORDER BY 2 DESC`,
        ),
        query(
            `SELECT "replyClassification"::text AS classification, count(*)::int AS leads
             FROM "Lead"
             WHERE "replyClassification" IS NOT NULL
               AND "replyClassification" <> 'NONE'
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
                GROUP BY 1
             ),
             recent AS (
                SELECT to_char(date_trunc('month', "lastContactedAt"), 'YYYY-MM') AS month,
                       count(*)::int AS sent,
                       0::int AS replies
                FROM "Lead"
                WHERE "lastContactedAt" >= $1::timestamp
                  AND "lastContactedAt" > coalesce((SELECT max("createdAt") FROM "EmailMessage"), '1970-01-01'::timestamp)
                GROUP BY 1
             )
             SELECT month, sum(sent)::int AS sent, sum(replies)::int AS replies
             FROM (SELECT * FROM messages UNION ALL SELECT * FROM recent) combined
             GROUP BY 1
             ORDER BY 1`,
            [volumeStart],
        ),
        query(
            `SELECT to_char(date_trunc('year', "createdAt"), 'YYYY') AS year,
                    count(*)::int AS sent,
                    count(*) FILTER (WHERE "replied")::int AS replies
             FROM "EmailMessage"
             GROUP BY 1
             ORDER BY 1`,
        ),
        query(
            `SELECT coalesce(nullif("campaignClean", ''), 'Unattributed') AS campaign,
                    count(*)::int AS sent,
                    count(*) FILTER (WHERE "replied")::int AS replies,
                    count(DISTINCT "contactEmail")::int AS contacts,
                    min("createdAt")::date::text AS first_sent,
                    max("createdAt")::date::text AS last_sent
             FROM "EmailMessage"
             GROUP BY 1
             ORDER BY 2 DESC
             LIMIT 10`,
        ),
        query(`SELECT count(DISTINCT nullif("campaignClean", ''))::int AS total FROM "EmailMessage"`),
        query(
            `SELECT "contactEmail" AS contact_email,
                    coalesce(nullif("subjectRaw", ''), '(no subject)') AS subject,
                    left(coalesce("bodyHook", ''), 180) AS snippet,
                    coalesce("replyClassification"::text, 'UNCLASSIFIED') AS classification,
                    "createdAt"::timestamp::text AS replied_at,
                    coalesce("senderEmail", '') AS sender_email,
                    coalesce(nullif("campaignClean", ''), '') AS campaign
             FROM "EmailMessage"
             WHERE "replied"
             ORDER BY "createdAt" DESC
             LIMIT 6`,
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
        getMailboxes(query),
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

    // Top named categories stay visible; the long tail of single-lead segments
    // and the uncategorised bulk are each folded into one card so the strip
    // stays scrollable instead of exploding into hundreds of tiles.
    const categorized = categoryRows.filter((row) => row.category !== "Uncategorized");
    const uncategorized = categoryRows.find((row) => row.category === "Uncategorized");
    // Only segments with enough leads are worth their own card; single-lead
    // name entries (data left over from imports) join one combined card.
    const meaningful = categorized.filter((row) => (row.leads || 0) >= 10);
    const trivial = categorized.filter((row) => (row.leads || 0) < 10);
    const top = meaningful.slice(0, 6);
    const tail = [...meaningful.slice(6), ...trivial];
    const tailTotals = tail.reduce(
        (acc, row) => ({
            leads: acc.leads + (row.leads || 0),
            contacted: acc.contacted + (row.contacted || 0),
            opened: acc.opened + (row.opened || 0),
            replied: acc.replied + (row.replied || 0),
        }),
        { leads: 0, contacted: 0, opened: 0, replied: 0 },
    );

    const toCategory = (row: QueryRow): ReportCategory => ({
        category: String(row.category ?? ""),
        leads: row.leads || 0,
        contacted: row.contacted || 0,
        opened: row.opened || 0,
        replied: row.replied || 0,
        reply_rate: rate(row.replied || 0, row.leads || 0),
    });

    const categories: ReportCategory[] = top.map(toCategory);
    if (tailTotals.leads > 0) {
        categories.push({
            category: "Other Segments",
            leads: tailTotals.leads,
            contacted: tailTotals.contacted,
            opened: tailTotals.opened,
            replied: tailTotals.replied,
            reply_rate: rate(tailTotals.replied, tailTotals.leads),
        });
    }
    if (uncategorized) categories.push(toCategory(uncategorized));

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
            contact_email: String(row.contact_email || ""),
            subject: String(row.subject || ""),
            snippet: String(row.snippet || ""),
            classification: String(row.classification || "UNCLASSIFIED"),
            replied_at: row.replied_at || null,
            sender_email: String(row.sender_email || ""),
            campaign: String(row.campaign || ""),
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
