import type { QueryFn, QueryRow } from "./types";

export interface CampaignStats {
    id: string;
    total_leads: number;
    sent_count: number;
    open_count: number;
    click_count: number;
    reply_count: number;
    bounce_count: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
}

const SENT_EVENT = "sent";
const OPEN_EVENTS = ["opened", "email_open", "open"];
const CLICK_EVENTS = ["clicked", "email_click", "click"];
const REPLY_EVENTS = ["replied", "email_reply", "reply"];
const BOUNCE_EVENTS = ["bounced", "email_bounce", "hard_bounce", "soft_bounce"];

function inList(events: string[]): string {
    return `(${events.map((e) => `'${e}'`).join(", ")})`;
}

function rate(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Math.min(100, Math.round((numerator / denominator) * 1000) / 10);
}

/**
 * Lifetime sending/engagement counters per campaign, aggregated from Lead and
 * EmailEvent — the Campaign table stores no counters of its own, so anything
 * read from a campaign fixture would be a guess.
 *
 * `sent_count` counts every contacted lead exactly once (leads stamped with
 * `lastContactedAt`, plus send events for leads that were never stamped), so
 * older sends and their opens/replies still fit under it.
 */
export async function getCampaignStats(query: QueryFn): Promise<CampaignStats[]> {
    const rows: QueryRow[] = await query(
        `WITH lead_stats AS (
            SELECT "campaignId" AS id,
                   count(*)::int AS total_leads,
                   count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS lead_sent,
                   count(*) FILTER (WHERE "openCount" > 0 OR "firstOpenAt" IS NOT NULL)::int AS opens,
                   count(*) FILTER (WHERE "clickCount" > 0)::int AS clicks,
                   count(*) FILTER (WHERE "totalReplied" > 0 OR "repliedAt" IS NOT NULL)::int AS replies,
                   count(*) FILTER (WHERE "totalBounced" > 0 OR "bounceCount" > 0)::int AS bounces
            FROM "Lead"
            WHERE "campaignId" IS NOT NULL
            GROUP BY 1
        ),
        event_stats AS (
            SELECT l."campaignId" AS id,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" = '${SENT_EVENT}'
                    AND l."lastContactedAt" IS NULL)::int AS event_sent
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE l."campaignId" IS NOT NULL
            GROUP BY 1
        )
        SELECT coalesce(lead_stats.id, event_stats.id) AS id,
               coalesce(lead_stats.total_leads, 0)::int AS total_leads,
               coalesce(lead_stats.lead_sent, 0)::int + coalesce(event_stats.event_sent, 0)::int AS sent_count,
               coalesce(lead_stats.opens, 0)::int AS open_count,
               coalesce(lead_stats.clicks, 0)::int AS click_count,
               coalesce(lead_stats.replies, 0)::int AS reply_count,
               coalesce(lead_stats.bounces, 0)::int AS bounce_count
        FROM lead_stats
        FULL OUTER JOIN event_stats ON event_stats.id = lead_stats.id`,
    );

    return rows.map((row) => {
        const sent = Number(row.sent_count) || 0;
        const bounces = Number(row.bounce_count) || 0;
        const opens = Number(row.open_count) || 0;
        const clicks = Number(row.click_count) || 0;
        const replies = Number(row.reply_count) || 0;
        const delivered = Math.max(0, sent - bounces);
        const engagementDenom = Math.max(delivered, opens, clicks, replies);
        return {
            id: String(row.id),
            total_leads: Number(row.total_leads) || 0,
            sent_count: sent,
            open_count: opens,
            click_count: clicks,
            reply_count: replies,
            bounce_count: bounces,
            open_rate: rate(opens, engagementDenom),
            click_rate: rate(clicks, engagementDenom),
            reply_rate: rate(replies, engagementDenom),
            bounce_rate: rate(bounces, Math.max(sent, bounces)),
        };
    });
}

export interface CampaignDailyPoint {
    date: string;
    sent: number;
    opens: number;
    clicks: number;
    replies: number;
    bounces: number;
}

export interface CampaignStepStats {
    step_number: number;
    emails_sent: number;
    opens: number;
    clicks: number;
    replies: number;
    bounces: number;
}

const DAY_MS = 86_400_000;

function utcDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Sends and engagement per day (UTC) for one campaign, over the last `days` days. */
async function readCampaignDaily(query: QueryFn, campaignId: string, startTs: string): Promise<QueryRow[]> {
    return query(
        `WITH lead_info AS (
            SELECT id, "lastContactedAt" FROM "Lead" WHERE "campaignId" = $2
        ),
        lead_sends AS (
            SELECT to_char("lastContactedAt", 'YYYY-MM-DD') AS date, count(*)::int AS sent
            FROM lead_info
            WHERE "lastContactedAt" >= $1::timestamp
            GROUP BY 1
        ),
        events AS (
            SELECT e."eventType" AS type,
                   e."leadId" AS lead_id,
                   e."createdAt" AS created_at,
                   l."lastContactedAt" AS last_contacted
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE l."campaignId" = $2
        ),
        event_sends AS (
            SELECT to_char(created_at, 'YYYY-MM-DD') AS date, count(DISTINCT lead_id)::int AS sent
            FROM events
            WHERE type = '${SENT_EVENT}'
              AND created_at >= $1::timestamp
              AND (last_contacted IS NULL OR date_trunc('day', last_contacted) <> date_trunc('day', created_at))
            GROUP BY 1
        ),
        sends AS (
            SELECT date, sum(sent)::int AS sent
            FROM (SELECT * FROM lead_sends UNION ALL SELECT * FROM event_sends) unioned
            GROUP BY 1
        ),
        engagement AS (
            SELECT to_char(created_at, 'YYYY-MM-DD') AS date,
                count(DISTINCT lead_id) FILTER (WHERE type IN ${inList(OPEN_EVENTS)})::int AS opens,
                count(DISTINCT lead_id) FILTER (WHERE type IN ${inList(CLICK_EVENTS)})::int AS clicks,
                count(DISTINCT lead_id) FILTER (WHERE type IN ${inList(REPLY_EVENTS)})::int AS replies,
                count(DISTINCT lead_id) FILTER (WHERE type IN ${inList(BOUNCE_EVENTS)})::int AS bounces
            FROM events
            WHERE created_at >= $1::timestamp
            GROUP BY 1
        )
        SELECT coalesce(sends.date, engagement.date) AS date,
               coalesce(sends.sent, 0)::int AS sent,
               coalesce(engagement.opens, 0)::int AS opens,
               coalesce(engagement.clicks, 0)::int AS clicks,
               coalesce(engagement.replies, 0)::int AS replies,
               coalesce(engagement.bounces, 0)::int AS bounces
        FROM sends
        FULL OUTER JOIN engagement ON engagement.date = sends.date
        ORDER BY 1`,
        [startTs, campaignId],
    );
}

/**
 * Per-step counters, recovered from the Smartlead webhook payload description
 * ("... opened Email 2 for campaign ..."). Events without a parseable step
 * number are excluded rather than spread evenly across steps.
 */
async function readCampaignSteps(query: QueryFn, campaignId: string, startTs: string): Promise<QueryRow[]> {
    return query(
        `SELECT (substring(coalesce(e."rawPayload"->>'description', '') from 'Email (\\d+)'))::int AS step_number,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" = '${SENT_EVENT}')::int AS emails_sent,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" IN ${inList(OPEN_EVENTS)})::int AS opens,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" IN ${inList(CLICK_EVENTS)})::int AS clicks,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" IN ${inList(REPLY_EVENTS)})::int AS replies,
                count(DISTINCT e."leadId") FILTER (WHERE e."eventType" IN ${inList(BOUNCE_EVENTS)})::int AS bounces
         FROM "EmailEvent" e
         JOIN "Lead" l ON l.id = e."leadId"
         WHERE l."campaignId" = $2
           AND e."createdAt" >= $1::timestamp
           AND substring(coalesce(e."rawPayload"->>'description', '') from 'Email (\\d+)') IS NOT NULL
         GROUP BY 1
         ORDER BY 1`,
        [startTs, campaignId],
    );
}

export interface CampaignAnalytics {
    campaign_id: string;
    summary: CampaignStats;
    daily_stats: CampaignDailyPoint[];
    steps: CampaignStepStats[];
}

/**
 * Everything the campaign detail view renders: lifetime counters, the daily
 * series behind its chart, and per-step breakdowns - all from the database.
 * `days` controls how many days are zero-filled; `from` (YYYY-MM-DD) overrides
 * where that window starts.
 */
export async function getCampaignAnalytics(
    query: QueryFn,
    campaignId: string,
    days = 30,
    from?: string,
): Promise<CampaignAnalytics | null> {
    const allStats = await getCampaignStats(query);
    const summary = allStats.find((s) => s.id === campaignId) || {
        id: campaignId,
        total_leads: 0,
        sent_count: 0,
        open_count: 0,
        click_count: 0,
        reply_count: 0,
        bounce_count: 0,
        open_rate: 0,
        click_rate: 0,
        reply_rate: 0,
        bounce_rate: 0,
    };

    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const parsedFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? Date.parse(`${from}T00:00:00.000Z`) : NaN;
    const start = Number.isFinite(parsedFrom) && parsedFrom <= today
        ? new Date(parsedFrom)
        : new Date(today - (days - 1) * DAY_MS);
    const startTs = start.toISOString().slice(0, 19).replace("T", " ");

    const [dailyRows, stepRows] = await Promise.all([
        readCampaignDaily(query, campaignId, startTs),
        readCampaignSteps(query, campaignId, startTs),
    ]);

    const byDate = new Map<string, QueryRow>();
    for (const row of dailyRows) byDate.set(String(row.date).slice(0, 10), row);

    const dailyStats: CampaignDailyPoint[] = [];
    for (let i = 0; i < days; i++) {
        const date = utcDayKey(new Date(start.getTime() + i * DAY_MS));
        const row = byDate.get(date);
        dailyStats.push({
            date,
            sent: Number(row?.sent) || 0,
            opens: Number(row?.opens) || 0,
            clicks: Number(row?.clicks) || 0,
            replies: Number(row?.replies) || 0,
            bounces: Number(row?.bounces) || 0,
        });
    }

    const steps: CampaignStepStats[] = stepRows
        .map((row) => ({
            step_number: Number(row.step_number) || 0,
            emails_sent: Number(row.emails_sent) || 0,
            opens: Number(row.opens) || 0,
            clicks: Number(row.clicks) || 0,
            replies: Number(row.replies) || 0,
            bounces: Number(row.bounces) || 0,
        }))
        .filter((step) => step.step_number > 0);

    return { campaign_id: campaignId, summary, daily_stats: dailyStats, steps };
}
