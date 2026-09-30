import type { QueryFn, QueryRow } from "./types";

export interface DashboardRequest {
    period?: string;
    from?: string;
    to?: string;
}

const DAY_MS = 86_400_000;

const SENT_EVENT = "sent";
const OPEN_EVENTS = ["opened", "email_open", "open"];
const CLICK_EVENTS = ["clicked", "email_click", "click"];
const REPLY_EVENTS = ["replied", "email_reply", "reply"];
const BOUNCE_EVENTS = ["bounced", "email_bounce", "hard_bounce", "soft_bounce"];

function inList(events: string[]): string {
    return `(${events.map((e) => `'${e}'`).join(", ")})`;
}

export function periodToDays(period?: string): number {
    const match = /^(\d+)d$/.exec((period || "").trim());
    if (match) {
        const days = parseInt(match[1], 10);
        if (days >= 1 && days <= 365) return days;
    }
    return 7;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value?: string): Date | null {
    const raw = (value || "").trim();
    if (!DAY_RE.test(raw)) return null;
    const parsed = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface DashboardRange {
    start: Date;
    endExclusive: Date;
    days: number;
    label: string;
}

// Resolves the requested window: either period=Nd ending today, or an explicit
// from/to day range (inclusive end) for the Custom chart filter.
export function resolveRange(req: DashboardRequest): DashboardRange {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = parseDay(req.from);
    const to = parseDay(req.to);

    if (from || to) {
        const endExclusive = to ? new Date(to.getTime() + DAY_MS) : new Date(today.getTime() + DAY_MS);
        let start = from || new Date(endExclusive.getTime() - 7 * DAY_MS);
        if (start.getTime() >= endExclusive.getTime()) start = new Date(endExclusive.getTime() - DAY_MS);
        const days = Math.max(
            1,
            Math.min(365, Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS)),
        );
        start = new Date(endExclusive.getTime() - days * DAY_MS);
        return { start, endExclusive, days, label: `${days}d` };
    }

    const days = periodToDays(req.period);
    const endExclusive = new Date(today.getTime() + DAY_MS);
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    return { start, endExclusive, days, label: `${days}d` };
}

function toTs(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function utcDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function rate(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Math.min(100, round1((numerator / denominator) * 100));
}

// ---------------------------------------------------------------------------
// Engagement attribution
//
// EmailEvent only covers 15 historical rows, while the Smartlead webhook writes
// opens/replies/bounces straight onto the Lead row (openCount, totalReplied,
// lastContactedAt ...). Every engagement event therefore resolves to exactly one
// date per lead, in this priority order:
//   1. the lead's own timestamp (lastOpenAt / repliedAt / lastBouncedAt)
//   2. an EmailEvent row for that kind
//   3. an EmailMessage row flagged replied / bounced, matched by email
//   4. the send the lead belongs to (lastContactedAt) - webhook-stored opens of
//      a same-day batch land on the send date
//   5. updatedAt, only for leads that were never contacted (reply rows the
//      webhook wrote on their own)
// The bulk intelligence refresh (updatedAt) never wins over a real timestamp or
// a send, so no engagement is painted on a date it did not happen.
// ---------------------------------------------------------------------------
function engagementCte(): string {
    return `
        lead_activity AS (
            SELECT l.id AS lead_id,
                   lower(coalesce(l.email, '')) AS email,
                   l."lastContactedAt" AS send_at,
                   l."lastOpenAt" AS open_at,
                   coalesce(l."lastRepliedAt", l."repliedAt") AS reply_at,
                   l."lastBouncedAt" AS bounce_at,
                   (l."openCount" > 0 OR l."firstOpenAt" IS NOT NULL) AS has_open,
                   (l."totalReplied" > 0) AS has_reply,
                   (l."totalBounced" > 0 OR l."bounceCount" > 0) AS has_bounce,
                   l."updatedAt" AS updated_at
            FROM "Lead" l
        ),
        event_dates AS (
            SELECT e."leadId" AS lead_id,
                   min(e."createdAt") FILTER (WHERE e."eventType" IN ${inList(OPEN_EVENTS)}) AS open_at,
                   min(e."createdAt") FILTER (WHERE e."eventType" IN ${inList(REPLY_EVENTS)}) AS reply_at,
                   min(e."createdAt") FILTER (WHERE e."eventType" IN ${inList(BOUNCE_EVENTS)}) AS bounce_at
            FROM "EmailEvent" e
            GROUP BY 1
        ),
        message_dates AS (
            SELECT lower("contactEmail") AS email,
                   min("createdAt") FILTER (WHERE "replied") AS reply_at,
                   min("createdAt") FILTER (WHERE "bounced") AS bounce_at
            FROM "EmailMessage"
            GROUP BY 1
        ),
        engagement AS (
            SELECT la.lead_id,
                   'open'::text AS kind,
                   coalesce(la.open_at, ed.open_at,
                            CASE WHEN la.has_open THEN coalesce(la.send_at, la.updated_at) END) AS occurred_at
            FROM lead_activity la
            LEFT JOIN event_dates ed ON ed.lead_id = la.lead_id
            WHERE la.has_open OR ed.open_at IS NOT NULL
            UNION ALL
            SELECT la.lead_id,
                   'reply',
                   coalesce(la.reply_at, ed.reply_at, md.reply_at,
                            CASE WHEN la.has_reply THEN la.send_at END,
                            CASE WHEN la.has_reply THEN la.updated_at END) AS occurred_at
            FROM lead_activity la
            LEFT JOIN event_dates ed ON ed.lead_id = la.lead_id
            LEFT JOIN message_dates md ON md.email = la.email AND la.email <> ''
            WHERE la.has_reply OR ed.reply_at IS NOT NULL OR md.reply_at IS NOT NULL
            UNION ALL
            SELECT la.lead_id,
                   'bounce',
                   coalesce(la.bounce_at, ed.bounce_at, md.bounce_at,
                            CASE WHEN la.has_bounce THEN la.send_at END,
                            CASE WHEN la.has_bounce THEN la.updated_at END) AS occurred_at
            FROM lead_activity la
            LEFT JOIN event_dates ed ON ed.lead_id = la.lead_id
            LEFT JOIN message_dates md ON md.email = la.email AND la.email <> ''
            WHERE la.has_bounce OR ed.bounce_at IS NOT NULL OR md.bounce_at IS NOT NULL
        ),
        engagement_window AS (
            SELECT lead_id, kind, occurred_at
            FROM engagement
            WHERE occurred_at IS NOT NULL
              AND occurred_at >= $1::timestamp
              AND occurred_at < $2::timestamp
        )`;
}

// One row per (lead, activity) inside the window: sends, opens, replies,
// bounces and clicks, each joined to its campaign. Everything downstream -
// daily trend, heatmap, engaged totals, recent activity and per-campaign
// engagement - is bucketed from these rows in memory.
async function readActivityRows(query: QueryFn, startTs: string, endTs: string): Promise<QueryRow[]> {
    return query(
        `WITH ${engagementCte()},
        click_rows AS (
            SELECT e."leadId" AS lead_id, 'click'::text AS type, e."createdAt" AS ts
            FROM "EmailEvent" e
            WHERE e."eventType" IN ${inList(CLICK_EVENTS)}
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
        ),
        send_rows AS (
            SELECT l.id AS lead_id, 'sent'::text AS type, l."lastContactedAt" AS ts
            FROM "Lead" l
            WHERE l."lastContactedAt" >= $1::timestamp
              AND l."lastContactedAt" < $2::timestamp
            UNION
            SELECT e."leadId", 'sent', e."createdAt"
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" = '${SENT_EVENT}'
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND (l."lastContactedAt" IS NULL
                   OR date_trunc('day', l."lastContactedAt") <> date_trunc('day', e."createdAt"))
        ),
        activity AS (
            SELECT lead_id, type, ts FROM send_rows
            UNION ALL
            SELECT lead_id, kind, occurred_at FROM engagement_window
            UNION ALL
            SELECT lead_id, type, ts FROM click_rows
        )
        SELECT a.lead_id,
               a.type,
               to_char(a.ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts,
               l."campaignId" AS campaign_id,
               coalesce(c.name, '') AS campaign_name,
               coalesce(l.email, '') AS contact_email
        FROM activity a
        JOIN "Lead" l ON l.id = a.lead_id
        LEFT JOIN "Campaign" c ON c.id = l."campaignId"`,
        [startTs, endTs],
    );
}

async function readCampaignMeta(query: QueryFn): Promise<QueryRow[]> {
    return query(
        `SELECT c.id AS campaign_id,
                c.name,
                c.status,
                (SELECT count(*)::int FROM "Lead" l WHERE l."campaignId" = c.id)::int AS leads
         FROM "Campaign" c`,
    );
}

async function readAccountHealth(query: QueryFn): Promise<QueryRow[]> {
    return query(
        `SELECT
            count(*)::int AS total_accounts,
            count(*) FILTER (WHERE status = 'ACTIVE')::int AS healthy_accounts,
            count(*) FILTER (WHERE status IN ('WARMING', 'PAUSED'))::int AS warning_accounts,
            count(*) FILTER (WHERE status = 'RETIRED')::int AS error_accounts,
            coalesce(sum("dailySendLimit") FILTER (WHERE status IN ('ACTIVE', 'WARMING')), 0)::int AS daily_capacity
        FROM "Mailbox"`,
    );
}

async function readActiveCounts(query: QueryFn): Promise<{ activeCampaigns: number }> {
    const rows = await query(`SELECT count(*)::int AS active FROM "Campaign" WHERE status = 'ACTIVE'`);
    return { activeCampaigns: rows[0]?.active ?? 0 };
}

// Today's sends are always reported for the current UTC day, even when the
// chart window ends in the past (Custom range).
async function readTodaySends(query: QueryFn, startTs: string, endTs: string): Promise<number> {
    const rows = await query(
        `SELECT coalesce(sum(sent), 0)::int AS sent
         FROM (
            SELECT count(*)::int AS sent
            FROM "Lead"
            WHERE "lastContactedAt" >= $1::timestamp AND "lastContactedAt" < $2::timestamp
            UNION ALL
            SELECT count(DISTINCT e."leadId")::int
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" = '${SENT_EVENT}'
              AND e."createdAt" >= $1::timestamp AND e."createdAt" < $2::timestamp
              AND (l."lastContactedAt" IS NULL
                   OR date_trunc('day', l."lastContactedAt") <> date_trunc('day', e."createdAt"))
         ) parts`,
        [startTs, endTs],
    );
    return rows[0]?.sent ?? 0;
}

const HEATMAP_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEATMAP_SLOT_COUNT = 8;

export interface HeatmapCell {
    opens: number;
    replies: number;
    level: number;
}

// Opens and inbound replies bucketed by weekday x 3-hour window from attributed
// engagement in the period. Empty windows stay at zero instead of showing an
// invented "best time to send" pattern.
function buildHeatmap(activity: QueryRow[]): Record<string, HeatmapCell[]> {
    const cells = new Map<string, { opens: number; replies: number }>();

    for (const row of activity) {
        const type = String(row.type);
        if (type !== "open" && type !== "reply") continue;
        const stamp = new Date(String(row.ts));
        if (Number.isNaN(stamp.getTime())) continue;
        const dayIdx = (stamp.getUTCDay() + 6) % 7;
        const slotIdx = Math.floor(stamp.getUTCHours() / 3);
        const key = `${dayIdx}:${slotIdx}`;
        const cell = cells.get(key) || { opens: 0, replies: 0 };
        if (type === "open") cell.opens += 1;
        else cell.replies += 1;
        cells.set(key, cell);
    }

    // Shade level 0-4 by share of the busiest window so intensity is relative
    // to this workspace's own data.
    const max = Math.max(0, ...[...cells.values()].map((cell) => cell.opens + cell.replies));

    const heatmap: Record<string, HeatmapCell[]> = {};
    for (let day = 0; day < HEATMAP_DAY_LABELS.length; day++) {
        const slots: HeatmapCell[] = [];
        for (let slot = 0; slot < HEATMAP_SLOT_COUNT; slot++) {
            const cell = cells.get(`${day}:${slot}`) || { opens: 0, replies: 0 };
            const total = cell.opens + cell.replies;
            let level = 0;
            if (max > 0 && total > 0) {
                const ratio = total / max;
                level = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
            }
            slots.push({ opens: cell.opens, replies: cell.replies, level });
        }
        heatmap[HEATMAP_DAY_LABELS[day]] = slots;
    }
    return heatmap;
}

const EVENT_TYPE_ALIASES: Record<string, string> = {
    email_open: "opened",
    email_reply: "replied",
    email_click: "clicked",
    email_bounce: "bounced",
    open: "opened",
    reply: "replied",
    click: "clicked",
    bounce: "bounced",
};

type MetricKey = "sent" | "opens" | "clicks" | "replies" | "bounces";

interface DailyBucket extends Record<MetricKey, number> {
    date: string;
}

interface CampaignBucket {
    sent: number;
    opens: number;
    replies: number;
    bounces: number;
    clickLeads: Set<string>;
    engaged: Set<string>;
}

export async function getDashboard(req: DashboardRequest, query: QueryFn) {
    const range = resolveRange(req);
    const startTs = toTs(range.start);
    const endTs = toTs(range.endExclusive);
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);

    const [activity, campaignMeta, healthRows, activeCounts, todaySent] = await Promise.all([
        readActivityRows(query, startTs, endTs),
        readCampaignMeta(query),
        readAccountHealth(query),
        readActiveCounts(query),
        readTodaySends(query, toTs(todayStart), toTs(todayEnd)),
    ]);

    const daily = new Map<string, DailyBucket>();
    const clickLeadsByDay = new Map<string, Set<string>>();
    const engagedLeads = new Set<string>();
    const campaignBuckets = new Map<string, CampaignBucket>();

    const bucketFor = (date: string): DailyBucket => {
        let bucket = daily.get(date);
        if (!bucket) {
            bucket = { date, sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 };
            daily.set(date, bucket);
        }
        return bucket;
    };

    const campaignBucketFor = (campaignId: string): CampaignBucket => {
        let bucket = campaignBuckets.get(campaignId);
        if (!bucket) {
            bucket = { sent: 0, opens: 0, replies: 0, bounces: 0, clickLeads: new Set(), engaged: new Set() };
            campaignBuckets.set(campaignId, bucket);
        }
        return bucket;
    };

    for (const row of activity) {
        const timestamp = String(row.ts || "");
        const type = String(row.type || "");
        const leadId = String(row.lead_id || "");
        const date = timestamp.slice(0, 10);
        if (!date || date < startTs.slice(0, 10) || date >= endTs.slice(0, 10)) continue;

        const bucket = bucketFor(date);
        const campaignId = row.campaign_id ? String(row.campaign_id) : "";
        const campaignBucket = campaignId ? campaignBucketFor(campaignId) : null;

        if (type === "sent") {
            bucket.sent += 1;
            if (campaignBucket) campaignBucket.sent += 1;
            continue;
        }

        engagedLeads.add(leadId);
        if (campaignBucket) campaignBucket.engaged.add(leadId);

        if (type === "open") {
            bucket.opens += 1;
            if (campaignBucket) campaignBucket.opens += 1;
        } else if (type === "reply") {
            bucket.replies += 1;
            if (campaignBucket) campaignBucket.replies += 1;
        } else if (type === "bounce") {
            bucket.bounces += 1;
            if (campaignBucket) campaignBucket.bounces += 1;
        } else if (type === "click") {
            let clickers = clickLeadsByDay.get(date);
            if (!clickers) {
                clickers = new Set();
                clickLeadsByDay.set(date, clickers);
            }
            clickers.add(leadId);
            if (campaignBucket) campaignBucket.clickLeads.add(leadId);
        }
    }

    // Daily clicks are distinct leads per day, matching the EmailEvent-based
    // semantics this endpoint used before.
    for (const [date, clickers] of clickLeadsByDay) {
        const bucket = daily.get(date);
        if (bucket) bucket.clicks = clickers.size;
    }

    const dailyTrend: DailyBucket[] = [];
    for (let i = 0; i < range.days; i++) {
        const date = utcDayKey(new Date(range.start.getTime() + i * DAY_MS));
        dailyTrend.push(
            daily.get(date) || { date, sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 },
        );
    }

    const totals = dailyTrend.reduce(
        (acc, day) => ({
            sent: acc.sent + day.sent,
            opens: acc.opens + day.opens,
            clicks: acc.clicks + day.clicks,
            replies: acc.replies + day.replies,
            bounces: acc.bounces + day.bounces,
        }),
        { sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 },
    );

    const delivered = Math.max(0, totals.sent - totals.bounces);
    // Engagement recorded in this window can belong to sends tracked outside it,
    // so rate denominators use the larger of delivered sends and engaged contacts.
    // rate() itself clamps to 100% so no displayed rate can exceed it.
    const engagementDenom = Math.max(delivered, engagedLeads.size);
    const bounceDenom = Math.max(totals.sent, totals.bounces);
    const health: Record<string, any> = healthRows[0] || {};

    const recentActivity = [...activity]
        .sort((a, b) => (String(b.ts) > String(a.ts) ? 1 : String(b.ts) < String(a.ts) ? -1 : 0))
        .slice(0, 10)
        .map((row) => ({
            type: EVENT_TYPE_ALIASES[String(row.type)] || String(row.type),
            campaign_id: row.campaign_id || "",
            campaign_name: row.campaign_name || "",
            contact_email: row.contact_email || "",
            contact_id: row.lead_id,
            timestamp: String(row.ts),
        }));

    const topCampaigns = campaignMeta
        .map((meta) => {
            const bucket = campaignBuckets.get(String(meta.campaign_id));
            const sent = bucket?.sent || 0;
            const bounces = bucket?.bounces || 0;
            const engaged = bucket?.engaged.size || 0;
            const deliveredInPeriod = Math.max(0, sent - bounces);
            const denom = Math.max(deliveredInPeriod, engaged);
            return {
                campaign_id: String(meta.campaign_id),
                name: String(meta.name || ""),
                status: String(meta.status || "").toLowerCase(),
                emails_sent: sent,
                open_rate: rate(bucket?.opens || 0, denom),
                click_rate: rate(bucket?.clickLeads.size || 0, denom),
                reply_rate: rate(bucket?.replies || 0, denom),
                leads: meta.leads || 0,
            };
        })
        .filter((campaign) => campaign.leads > 0 || campaign.emails_sent > 0)
        .sort(
            (a, b) =>
                b.emails_sent - a.emails_sent ||
                b.leads - a.leads ||
                (a.campaign_id < b.campaign_id ? -1 : a.campaign_id > b.campaign_id ? 1 : 0),
        )
        .slice(0, 10);

    return {
        period: range.label,
        from: utcDayKey(range.start),
        to: utcDayKey(new Date(range.endExclusive.getTime() - DAY_MS)),
        today_sent: todaySent,
        daily_capacity: health.daily_capacity || 0,
        heatmap: buildHeatmap(activity),
        overall_stats: {
            total_emails_sent: totals.sent,
            total_opens: totals.opens,
            machine_opens: 0,
            total_clicks: totals.clicks,
            machine_clicks: 0,
            total_replies: totals.replies,
            total_bounces: totals.bounces,
            open_rate: rate(totals.opens, engagementDenom),
            click_rate: rate(totals.clicks, engagementDenom),
            reply_rate: rate(totals.replies, engagementDenom),
            bounce_rate: rate(totals.bounces, bounceDenom),
            active_campaigns: activeCounts.activeCampaigns,
            active_accounts: (health.healthy_accounts || 0) + (health.warning_accounts || 0),
        },
        recent_activity: recentActivity,
        top_campaigns: topCampaigns.map((campaign) => ({
            campaign_id: campaign.campaign_id,
            name: campaign.name,
            status: campaign.status,
            emails_sent: campaign.emails_sent,
            open_rate: campaign.open_rate,
            click_rate: campaign.click_rate,
            reply_rate: campaign.reply_rate,
        })),
        account_health: {
            total_accounts: health.total_accounts || 0,
            healthy_accounts: health.healthy_accounts || 0,
            warning_accounts: health.warning_accounts || 0,
            error_accounts: health.error_accounts || 0,
        },
        daily_trend: dailyTrend,
    };
}
