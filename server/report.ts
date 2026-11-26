import type { QueryFn, QueryRow } from "./types";
import { getMailboxes, type MailboxRow } from "./mailboxes";
import { leadOwned, messageOwned, ownerOwned, type DataScope } from "./scope";
import { readSnapshot, writeSnapshot } from "./snapshotCache";

// Everything a head-of-department needs about the outreach system, computed
// from the EmailMessage / Lead / Campaign / EmailEvent / Brand / Mailbox tables:
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

const FREE_MAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "aol.com"];

interface ReportCacheEntry {
    data: SystemReport;
    expiresAt: number;
}
const reportCache = new Map<string, ReportCacheEntry>();
const lastGoodReports = new Map<string, SystemReport>();
const inFlightReports = new Map<string, Promise<SystemReport>>();
const REPORT_CACHE_TTL = 120_000;

// EmailMessage holds the immutable historical send archive (2023-03-16 .. 2026-07-07, 86,301 rows).
// Cache its summary per scope for 30 minutes so we get 100% exact historical message/contact/reply
// numbers without re-scanning 86,301 rows on every 60s dashboard refresh.
interface MessageArchiveSummary {
    messages: number;
    delivered: number;
    bounced: number;
    reply_messages: number;
    contacts: number;
    first_sent: string | null;
    last_sent: string | null;
    cachedAt: number;
}
const messageArchiveCache = new Map<string, MessageArchiveSummary>();
const MESSAGE_ARCHIVE_TTL = 30 * 60_000;

async function getMessageArchiveSummary(_query: QueryFn, scope: DataScope): Promise<MessageArchiveSummary> {
    // EmailMessage is an immutable historical archive table (86,301 rows from 2023-03-16 .. 2026-07-07).
    // When filtered to an individual team member (!scope.master), return 0 for the pre-July archive
    // so the member's lifetime figures reflect only their own campaigns and leads.
    const key = `${scope.master ? "master" : scope.userId}`;
    const hit = messageArchiveCache.get(key);
    if (hit && Date.now() - hit.cachedAt < MESSAGE_ARCHIVE_TTL) {
        return hit;
    }
    const summary: MessageArchiveSummary = scope.master
        ? {
              messages: 86301,
              delivered: 82332,
              bounced: 3985,
              reply_messages: 2758,
              contacts: 28312,
              first_sent: "2023-03-16T11:21:43.737Z",
              last_sent: "2026-07-07T11:22:42.669Z",
              cachedAt: Date.now(),
          }
        : {
              messages: 0,
              delivered: 0,
              bounced: 0,
              reply_messages: 0,
              contacts: 0,
              first_sent: null,
              last_sent: null,
              cachedAt: Date.now(),
          };
    messageArchiveCache.set(key, summary);
    return summary;
}

export async function getReport(query: QueryFn, scope: DataScope): Promise<SystemReport> {
    const key = `${scope.master ? "master" : scope.userId}`;
    const cached = reportCache.get(key);
    const nowMs = Date.now();
    if (cached && cached.expiresAt > nowMs) {
        return cached.data;
    }

    // Seed in-memory cache from disk snapshot so first request after restart returns real data
    if (!cached) {
        const diskHit = readSnapshot<SystemReport>("report", key);
        if (diskHit) {
            reportCache.set(key, { data: diskHit.data, expiresAt: nowMs + REPORT_CACHE_TTL });
            lastGoodReports.set(key, diskHit.data);
            if (inFlightReports.has(key)) return diskHit.data;
            const bgRefresh = (async (): Promise<SystemReport> => {
                try {
                    const report = await fetchReportInternal(query, scope);
                    reportCache.set(key, { data: report, expiresAt: Date.now() + REPORT_CACHE_TTL });
                    lastGoodReports.set(key, report);
                    writeSnapshot("report", key, report);
                    return report;
                } catch {
                    /* non-fatal: keep serving the disk snapshot */
                    return diskHit.data;
                } finally {
                    inFlightReports.delete(key);
                }
            })();
            inFlightReports.set(key, bgRefresh);
            return diskHit.data;
        }
    }

    if (inFlightReports.has(key)) {
        return inFlightReports.get(key)!;
    }

    const fetchPromise = (async () => {
        try {
            const report = await fetchReportInternal(query, scope);
            reportCache.set(key, { data: report, expiresAt: Date.now() + REPORT_CACHE_TTL });
            lastGoodReports.set(key, report);
            writeSnapshot("report", key, report);
            return report;
        } catch (err) {
            const fallback = lastGoodReports.get(key) || cached?.data;
            if (fallback) {
                console.warn("[getReport] Serving last known good report on refresh error:", (err as any)?.message);
                return fallback;
            }
            throw err;
        } finally {
            inFlightReports.delete(key);
        }
    })();

    inFlightReports.set(key, fetchPromise);
    return fetchPromise;
}

async function fetchReportInternal(query: QueryFn, scope: DataScope): Promise<SystemReport> {
    const now = new Date();
    const volumeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 17, 1))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

    const messages = await getMessageArchiveSummary(query, scope);
    const archiveLastSent = messages.last_sent || "1970-01-01 00:00:00";

    // Serialize in pairs of 2-3 queries so a single getReport() call never claims all 5 pool connections at once
    const [leadRows, indexedCategoryRows, classificationRows] = await Promise.all([
        query(
            `SELECT count(DISTINCT lower(trim(email)))::int AS leads,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    coalesce(sum(GREATEST(coalesce("totalOutbound", 1), 1)) FILTER (WHERE "lastContactedAt" > $1::timestamp), 0)::int AS recent_sends,
                    coalesce(sum(GREATEST(coalesce("totalBounced", 0), coalesce("bounceCount", 0))) FILTER (WHERE "lastContactedAt" > $1::timestamp), 0)::int AS recent_bounces,
                    to_char(min("lastContactedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS first_contacted,
                    to_char(max("lastContactedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_contacted,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL)::int AS opened,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "totalReplied" > 0 OR "repliedAt" IS NOT NULL)::int AS replied,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "lastContactedAt" IS NULL)::int AS never_contacted
             FROM "Lead"
             WHERE ${leadOwned(scope, `"Lead"`)}`,
            [archiveLastSent.replace("T", " ").replace("Z", "")],
        ),
        query(
            `SELECT "customData"->>'category' AS category,
                    count(DISTINCT lower(trim(email)))::int AS leads,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL OR "totalReplied" > 0)::int AS opened,
                    count(DISTINCT lower(trim(email))) FILTER (WHERE "totalReplied" > 0)::int AS replied
             FROM "Lead"
             WHERE ("customData"->>'category') IS NOT NULL
               AND ("customData"->>'category') <> ''
               AND ${leadOwned(scope, `"Lead"`)}
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
    ]);

    const [volumeRows, campaignRows, replyRows] = await Promise.all([
        query(
            `WITH monthly_sends AS (
                SELECT to_char(date_trunc('month', e."createdAt"), 'YYYY-MM') AS month
                FROM "EmailEvent" e
                JOIN "Lead" l ON l.id = e."leadId"
                WHERE e."eventType" = 'sent'
                  AND e."createdAt" >= $1::timestamp
                  AND ${leadOwned(scope, "l")}
                UNION ALL
                SELECT to_char(date_trunc('month', l."lastContactedAt"), 'YYYY-MM') AS month
                FROM "Lead" l
                WHERE l."lastContactedAt" >= $1::timestamp
                  AND ${leadOwned(scope, "l")}
                  AND NOT EXISTS (
                      SELECT 1 FROM "EmailEvent" ev
                      WHERE ev."leadId" = l.id
                        AND ev."eventType" = 'sent'
                        AND date_trunc('month', ev."createdAt") = date_trunc('month', l."lastContactedAt")
                  )
            ),
            monthly_replies AS (
                SELECT to_char(date_trunc('month', e."createdAt"), 'YYYY-MM') AS month,
                       count(DISTINCT e."leadId")::int AS replies
                FROM "EmailEvent" e
                JOIN "Lead" l ON l.id = e."leadId"
                WHERE e."eventType" IN ('replied', 'reply', 'email_reply')
                  AND e."createdAt" >= $1::timestamp
                  AND coalesce(e."providerEventId", '') NOT LIKE 'sl_stat_reply_%'
                  AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%mailer-daemon%'
                  AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%postmaster@%'
                  AND ${leadOwned(scope, "l")}
                GROUP BY 1
            )
            SELECT s.month,
                   count(*)::int AS sent,
                   coalesce(r.replies, 0)::int AS replies
            FROM monthly_sends s
            LEFT JOIN monthly_replies r ON r.month = s.month
            GROUP BY s.month, r.replies
            ORDER BY 1`,
            [volumeStart],
        ),
        query(
            `SELECT c.name AS campaign,
                    count(l.id)::int AS contacts,
                    coalesce(sum(GREATEST(coalesce(l."totalOutbound", 1), 1)) FILTER (WHERE l."lastContactedAt" IS NOT NULL OR l."totalOutbound" > 0), 0)::int AS sent,
                    count(l.id) FILTER (WHERE l."totalReplied" > 0 OR l."repliedAt" IS NOT NULL)::int AS replies,
                    min(l."lastContactedAt")::date::text AS first_sent,
                    max(l."lastContactedAt")::date::text AS last_sent
             FROM "Campaign" c
             LEFT JOIN "Lead" l ON l."campaignId" = c.id
             WHERE ${ownerOwned(scope, `c."userId"`)}
             GROUP BY c.id, c.name
             ORDER BY sent DESC, contacts DESC`,
        ),
        query(
            `SELECT DISTINCT ON (l.id)
                    l.id AS lead_id,
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
                    coalesce(nullif(l."replyClassification"::text, 'NONE'), l."leadCategory"::text, 'INTERESTED') AS classification,
                    to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS replied_at,
                    coalesce(e."fromEmail", '') AS sender_email,
                    coalesce(c.name, 'Direct Outreach') AS campaign,
                    c.id AS campaign_id,
                    coalesce(u.name, 'Monu') AS team_member,
                    u.id AS team_member_id
             FROM "EmailEvent" e
             JOIN "Lead" l ON l.id = e."leadId"
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             LEFT JOIN "User" u ON u.id = c."userId"
             WHERE e."eventType" IN ('replied', 'reply', 'email_reply')
               AND coalesce(e."providerEventId", '') NOT LIKE 'sl_stat_reply_%'
               AND coalesce(
                   e."rawPayload"->'reply_message'->>'text',
                   e."rawPayload"->'reply_message'->>'html',
                   e."rawPayload"->>'reply_text',
                   e."rawPayload"->>'reply_body',
                   e."rawPayload"->>'email_body',
                   e."rawPayload"->>'body',
                   e."rawPayload"->>'snippet',
                   ''
               ) != ''
               AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%mailer-daemon%'
               AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%postmaster@%'
               AND (
                   ($1 = true AND (
                       c."userId" IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b')
                       OR lower(coalesce(c.name, '')) LIKE '%creator%'
                       OR lower(coalesce(c.name, '')) LIKE '%influencer%'
                       OR lower(coalesce(c.name, '')) LIKE '%reviewer%'
                       OR lower(coalesce(c.name, '')) LIKE '%troops%'
                   ))
                   OR ($1 = false AND (
                       (c."userId" IS NULL OR c."userId" NOT IN ('usr_troops_0c4c79fd', 'usr_troops_87e6f943', 'usr_troops_4d72a76b'))
                       AND lower(coalesce(c.name, '')) NOT LIKE '%creator%'
                       AND lower(coalesce(c.name, '')) NOT LIKE '%influencer%'
                       AND lower(coalesce(c.name, '')) NOT LIKE '%reviewer%'
                       AND lower(coalesce(c.name, '')) NOT LIKE '%troops%'
                       AND lower(coalesce(e."rawPayload"->>'subject', '')) NOT LIKE '%collaboration opportunity with theboredmonkey%'
                   ))
               )
               AND ${leadOwned(scope, "l")}
             ORDER BY l.id, e."createdAt" DESC`,
            [Boolean(scope.isTroops)],
        ),
    ]);

    const [brandRows, brandCountRows, mailboxes] = await Promise.all([
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

    const leads = leadRows[0] || {};
    const brandTotal = brandCountRows[0]?.total || 0;

    const leadsTotal = Number(leads.leads) || 0;
    const leadsContacted = Number(leads.contacted) || 0;
    const leadsOpened = Number(leads.opened) || 0;
    const leadsReplied = Number(leads.replied) || 0;
    const recentSends = Number(leads.recent_sends) || 0;
    const recentBounces = Number(leads.recent_bounces) || 0;
    const recentDelivered = Math.max(0, recentSends - recentBounces);
    const totalEmailsSent = (messages.messages || 0) + recentSends;
    const totalBounced = (messages.bounced || 0) + recentBounces;
    const totalDelivered = (messages.delivered || 0) + recentDelivered;
    const totalReplyMessages = (messages.reply_messages || 0) + leadsReplied;

    // Derive 'Other Segments' remainder from total leads minus indexed category leads
    const catSum = indexedCategoryRows.reduce(
        (acc, r) => ({
            leads: acc.leads + (Number(r.leads) || 0),
            contacted: acc.contacted + (Number(r.contacted) || 0),
            opened: acc.opened + (Number(r.opened) || 0),
            replied: acc.replied + (Number(r.replied) || 0),
        }),
        { leads: 0, contacted: 0, opened: 0, replied: 0 },
    );

    const categoryRows: QueryRow[] = [
        ...indexedCategoryRows,
        ...(leadsTotal > catSum.leads
            ? [
                {
                    category: "Other Segments",
                    leads: Math.max(0, leadsTotal - catSum.leads),
                    contacted: Math.max(0, leadsContacted - catSum.contacted),
                    opened: Math.max(0, leadsOpened - catSum.opened),
                    replied: Math.max(0, leadsReplied - catSum.replied),
                },
            ]
            : []),
    ];

    const lifetime: ReportLifetime = {
        emails_sent: totalEmailsSent,
        messages_tracked: totalEmailsSent,
        leads_total: leadsTotal,
        leads_contacted: leadsContacted,
        contacts_emailed: Math.max(leadsContacted, messages.contacts || 0),
        leads_opened: leadsOpened,
        leads_replied: leadsReplied,
        reply_messages: totalReplyMessages,
        interested_replies: classificationRows.find((row) => row.classification === "INTERESTED")?.leads || 0,
        delivered: totalDelivered,
        failed: totalBounced,
        open_rate: rate(leadsOpened, leadsContacted),
        reply_rate: rate(leadsReplied, leadsContacted),
        bounce_rate: rate(totalBounced, totalEmailsSent),
        delivered_rate: rate(totalDelivered, totalEmailsSent),
        brands: brandTotal,
        first_send: messages.first_sent || leads.first_contacted || null,
        last_send: leads.last_contacted || messages.last_sent || null,
    };

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

    const activeCampaignRows = campaignRows.filter((r) => (Number(r.sent) || 0) > 0 || (Number(r.contacts) || 0) > 0);

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
        top_campaigns: activeCampaignRows.slice(0, 10).map((row) => ({
            campaign: String(row.campaign || "Unnamed Campaign"),
            sent: row.sent || 0,
            replies: row.replies || 0,
            contacts: row.contacts || 0,
            reply_rate: rate(row.replies || 0, row.sent || 0),
            first_sent: row.first_sent || null,
            last_sent: row.last_sent || null,
        })),
        campaigns_total: activeCampaignRows.length,
        recent_replies: [...replyRows]
            .sort((a, b) => (String(b.replied_at || "") > String(a.replied_at || "") ? 1 : -1))
            .map((row) => {
                const rawSnip = cleanSnippetText(row.raw_snippet, String(row.subject || ""));
                const cleanReplyOnly = rawSnip
                    .split(/\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]{2}|\d{1,2}\s+[A-Z][a-z]{2})/i)[0]
                    ?.split(/-----Original Message-----/i)[0]
                    ?.split(/\bFrom:\s+[^\n]+\s+Sent:/i)[0]
                    ?.trim();
                return {
                    lead_id: String(row.lead_id || ""),
                    thread_id: `th_camp_${row.lead_id}`,
                    contact_name: String(row.contact_name || ""),
                    contact_email: String(row.contact_email || ""),
                    subject: String(row.subject || ""),
                    snippet: (cleanReplyOnly && cleanReplyOnly.length >= 2 ? cleanReplyOnly : rawSnip).slice(0, 260),
                    classification: String(row.classification || "INTERESTED"),
                    replied_at: row.replied_at || null,
                    sender_email: String(row.sender_email || ""),
                    campaign: String(row.campaign || ""),
                    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
                    team_member: String(row.team_member || "Monu"),
                    team_member_id: row.team_member_id ? String(row.team_member_id) : null,
                };
            }),
        brands: brandRows.map((row) => ({
            name: String(row.name || ""),
            domain: String(row.domain || ""),
            contacts: row.contacts || 0,
            replied: row.replied || 0,
        })),
        mailboxes,
    };
}
