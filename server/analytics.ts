import type { QueryFn, QueryRow } from "./types";
import { eventOwned, leadOwned, messageOwned, ownerOwned, type DataScope } from "./scope";
import { readSnapshot, writeSnapshot } from "./snapshotCache";

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
function engagementCte(scope: DataScope): string {
    return `
        open_rows AS (
            SELECT e."leadId" AS lead_id,
                   'open'::text AS kind,
                   e."createdAt" AS occurred_at,
                   1::int AS weight
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" IN ${inList(OPEN_EVENTS)}
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
            UNION ALL
            SELECT l.id AS lead_id,
                   'open'::text AS kind,
                   coalesce(l."lastOpenAt", l."firstOpenAt") AS occurred_at,
                   1::int AS weight
            FROM "Lead" l
            WHERE (l."lastOpenAt" IS NOT NULL OR l."firstOpenAt" IS NOT NULL)
              AND coalesce(l."lastOpenAt", l."firstOpenAt") >= $1::timestamp
              AND coalesce(l."lastOpenAt", l."firstOpenAt") < $2::timestamp
              AND ${leadOwned(scope, "l")}
              AND NOT EXISTS (
                  SELECT 1 FROM "EmailEvent" ev
                  WHERE ev."leadId" = l.id
                    AND ev."eventType" IN ${inList(OPEN_EVENTS)}
                    AND ev."createdAt" >= date_trunc('day', coalesce(l."lastOpenAt", l."firstOpenAt"))
                    AND ev."createdAt" < date_trunc('day', coalesce(l."lastOpenAt", l."firstOpenAt")) + interval '1 day'
              )
        ),
        reply_rows AS (
            SELECT DISTINCT ON (e."leadId", date_trunc('day', e."createdAt"))
                   e."leadId" AS lead_id,
                   'reply'::text AS kind,
                   e."createdAt" AS occurred_at,
                   1::int AS weight
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" IN ${inList(REPLY_EVENTS)}
              AND coalesce(e."providerEventId", '') NOT LIKE 'sl_stat_reply_%'
              AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%mailer-daemon%'
              AND lower(coalesce(e."fromEmail", e."rawPayload"->>'from_email', '')) NOT LIKE '%postmaster@%'
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
            ORDER BY e."leadId", date_trunc('day', e."createdAt"), e."createdAt" DESC
        ),
        bounce_rows AS (
            SELECT e."leadId" AS lead_id,
                   'bounce'::text AS kind,
                   e."createdAt" AS occurred_at,
                   1::int AS weight
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" IN ${inList(BOUNCE_EVENTS)}
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
            UNION ALL
            SELECT l.id AS lead_id,
                   'bounce'::text AS kind,
                   l."lastBouncedAt" AS occurred_at,
                   1::int AS weight
            FROM "Lead" l
            WHERE l."lastBouncedAt" >= $1::timestamp
              AND l."lastBouncedAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
              AND NOT EXISTS (
                  SELECT 1 FROM "EmailEvent" ev
                  WHERE ev."leadId" = l.id
                    AND ev."eventType" IN ${inList(BOUNCE_EVENTS)}
                    AND ev."createdAt" >= date_trunc('day', l."lastBouncedAt")
                    AND ev."createdAt" < date_trunc('day', l."lastBouncedAt") + interval '1 day'
              )
        ),
        engagement_window AS (
            SELECT lead_id, kind, occurred_at, weight FROM open_rows
            UNION ALL
            SELECT lead_id, kind, occurred_at, weight FROM reply_rows
            UNION ALL
            SELECT lead_id, kind, occurred_at, weight FROM bounce_rows
        )`;
}

// One row per (lead, activity) inside the window: sends, opens, replies,
// bounces and clicks, each joined to its campaign. Everything downstream -
// daily trend, heatmap, engaged totals, recent activity and per-campaign
// engagement - is bucketed from these rows in memory.
async function readActivityRows(query: QueryFn, startTs: string, endTs: string, scope: DataScope): Promise<QueryRow[]> {
    return query(
        `WITH ${engagementCte(scope)},
        click_rows AS (
            SELECT e."leadId" AS lead_id, 'click'::text AS type, e."createdAt" AS ts
            FROM "EmailEvent" e
            WHERE e."eventType" IN ${inList(CLICK_EVENTS)}
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND ${eventOwned(scope, "e")}
        ),
        send_rows AS (
            SELECT e."leadId" AS lead_id,
                   'sent'::text AS type,
                   e."createdAt" AS ts,
                   1::int AS weight
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            WHERE e."eventType" = '${SENT_EVENT}'
              AND e."createdAt" >= $1::timestamp
              AND e."createdAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
            UNION ALL
            SELECT l.id AS lead_id,
                   'sent'::text AS type,
                   l."lastContactedAt" AS ts,
                   1::int AS weight
            FROM "Lead" l
            WHERE l."lastContactedAt" >= $1::timestamp
              AND l."lastContactedAt" < $2::timestamp
              AND ${leadOwned(scope, "l")}
              AND NOT EXISTS (
                  SELECT 1 FROM "EmailEvent" ev
                  WHERE ev."leadId" = l.id
                    AND ev."eventType" = '${SENT_EVENT}'
                    AND ev."createdAt" >= date_trunc('day', l."lastContactedAt")
                    AND ev."createdAt" < date_trunc('day', l."lastContactedAt") + interval '1 day'
              )
        ),
        activity AS (
            SELECT lead_id, type, ts, weight FROM send_rows
            UNION ALL
            SELECT lead_id, kind, occurred_at, weight FROM engagement_window
            UNION ALL
            SELECT lead_id, type, ts, 1::int AS weight FROM click_rows
        )
        SELECT a.lead_id,
               a.type,
               a.weight,
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

async function readCampaignMeta(query: QueryFn, scope: DataScope): Promise<QueryRow[]> {
    return query(
        `SELECT c.id AS campaign_id,
                c.name,
                c.status,
                coalesce(lc.leads, 0)::int AS leads
         FROM "Campaign" c
         LEFT JOIN (
             SELECT "campaignId", count(*)::int AS leads
             FROM "Lead"
             WHERE "campaignId" IS NOT NULL
             GROUP BY "campaignId"
         ) lc ON lc."campaignId" = c.id
         WHERE ${ownerOwned(scope, `c."userId"`)}`,
    );
}

async function readAccountHealth(query: QueryFn, _scope: DataScope): Promise<QueryRow[]> {
    // All 17 active mailboxes (17 * 200 = 3,400 daily capacity) operate as a shared
    // Smartlead sending pool across the workspace.
    return query(
        `SELECT
            count(*)::int AS total_accounts,
            count(*) FILTER (WHERE status = 'ACTIVE')::int AS healthy_accounts,
            count(*) FILTER (WHERE status IN ('WARMING', 'PAUSED'))::int AS warning_accounts,
            count(*) FILTER (WHERE status = 'RETIRED')::int AS error_accounts,
            GREATEST(coalesce(sum("dailySendLimit") FILTER (WHERE status IN ('ACTIVE', 'WARMING')), 0)::int, 3400) AS daily_capacity
        FROM "Mailbox"`,
    );
}

async function readActiveCounts(query: QueryFn, scope: DataScope): Promise<{ activeCampaigns: number }> {
    const rows = await query(
        `SELECT count(*)::int AS active FROM "Campaign" WHERE status = 'ACTIVE' AND ${ownerOwned(scope)}`,
    );
    return { activeCampaigns: rows[0]?.active ?? 0 };
}

export interface CalendarCampaignSlot {
    id: string;
    name: string;
    owner_name: string;
    owner_id: string;
    preferred_hour: number;
    time_label: string;
    total_leads: number;
    new_leads: number;
    followup_leads: number;
    remaining_after: number;
    max_steps: number;
    is_finishing: boolean;
    is_new_launch: boolean;
}

export interface CapacityTimelineDay {
    date: string;
    day_name: string;
    full_day_name?: string;
    projected_leads: number;
    new_leads_count?: number;
    followup_leads_count?: number;
    free_slots?: number;
    capacity: number;
    utilization_pct: number;
    is_sending_day: boolean;
    campaigns_count: number;
    finishing_campaigns_count?: number;
    status: 'OPTIMAL' | 'BUSY' | 'CAPPED' | 'REST_DAY';
    scheduled_campaigns?: CalendarCampaignSlot[];
}

export interface AlignedCampaignItem {
    id: string;
    name: string;
    owner_name: string;
    owner_id: string;
    status: string;
    uncontacted_leads: number;
    in_sequence_leads: number;
    sent_today?: number;
    max_steps?: number;
    is_dormant?: boolean;
    estimated_days_left?: number;
    runs_today: boolean;
    runs_tomorrow: boolean;
    estimated_daily: number;
    quota_share_pct: number;
    preferred_hour: number;
    preferred_days?: number[];
}

export interface CapacityTracker {
    daily_limit: number;
    today: {
        date: string;
        day_name: string;
        sent_so_far: number;
        remaining_capacity: number;
        utilization_pct: number;
        active_campaigns_count: number;
        status: 'OPTIMAL' | 'BUSY' | 'CAPPED';
        status_label: string;
    };
    tomorrow: {
        date: string;
        day_name: string;
        is_sending_day: boolean;
        projected_leads: number;
        projected_remaining: number;
        projected_utilization_pct: number;
        aligned_campaigns_count: number;
        finishing_campaigns_count?: number;
        status: 'OPTIMAL' | 'BUSY' | 'CAPPED';
        status_label: string;
    };
    timeline: CapacityTimelineDay[];
    aligned_campaigns: AlignedCampaignItem[];
    decision_assistant: {
        can_launch_today: boolean;
        safe_slots_today: number;
        safe_slots_tomorrow: number;
        recommended_action: string;
        best_window: string;
    };
}

function formatHourLabel(hour: number): string {
    const h = Math.max(0, Math.min(23, Number(hour) || 10));
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${suffix}`;
}

async function readCapacityTracker(
    query: QueryFn,
    todaySent: number,
    dailyCapacity: number,
    scope: DataScope,
): Promise<CapacityTracker> {
    const dailyLimit = Math.max(3400, dailyCapacity || 0);

    const campaignRows = await query(
        `SELECT 
            c.id,
            c.name,
            c."userId",
            c.status,
            c."preferredSendHour",
            c."preferredSendDays",
            c."createdAt",
            coalesce(u.name, 'Team Member') as owner_name,
            GREATEST(coalesce(cs.step_count, 1), 1)::int as max_steps,
            GREATEST(coalesce(cs.avg_delay, 1), 1)::int as avg_delay_days,
            coalesce(lc.uncontacted, 0)::int as uncontacted_leads,
            coalesce(lc.active_sequence, 0)::int as in_sequence_leads,
            coalesce(lc.sent_today, 0)::int as sent_today,
            coalesce(lc.sent_yesterday, 0)::int as sent_yesterday,
            coalesce(lc.sent_last_7d, 0)::int as sent_last_7d,
            (c."createdAt" >= CURRENT_DATE - interval '7 days')::boolean as is_recently_created
         FROM "Campaign" c
         LEFT JOIN "User" u ON u.id = c."userId"
         LEFT JOIN (
             SELECT "campaignId",
                    count(*)::int as step_count,
                    coalesce(round(avg(NULLIF("delayDays", 0))), 1)::int as avg_delay
             FROM "CampaignStep"
             GROUP BY "campaignId"
         ) cs ON cs."campaignId" = c.id
         LEFT JOIN (
             SELECT 
                 l."campaignId",
                 count(*) FILTER (
                     WHERE l.status = 'ACTIVE'
                       AND coalesce(l."totalOutbound", 0) = 0
                       AND l."lastContactedAt" IS NULL
                 )::int as uncontacted,
                 count(*) FILTER (
                     WHERE l.status = 'ACTIVE'
                       AND (coalesce(l."totalOutbound", 0) > 0 OR l."lastContactedAt" IS NOT NULL)
                       AND coalesce(l."totalReplied", 0) = 0
                       AND coalesce(l."totalBounced", 0) = 0
                       AND coalesce(l."totalOutbound", 1) < GREATEST(
                           coalesce((SELECT count(*) FROM "CampaignStep" s2 WHERE s2."campaignId" = l."campaignId"), 1),
                           1
                       )
                 )::int as active_sequence,
                 count(*) FILTER (WHERE l."lastContactedAt" >= CURRENT_DATE)::int as sent_today,
                 count(*) FILTER (WHERE l."lastContactedAt" >= CURRENT_DATE - interval '1 day' AND l."lastContactedAt" < CURRENT_DATE)::int as sent_yesterday,
                 count(*) FILTER (WHERE l."lastContactedAt" >= CURRENT_DATE - interval '7 days')::int as sent_last_7d
             FROM "Lead" l
             WHERE l."campaignId" IS NOT NULL
             GROUP BY l."campaignId"
         ) lc ON lc."campaignId" = c.id
         WHERE c.status = 'ACTIVE' AND ${ownerOwned(scope, `c."userId"`)}
         ORDER BY coalesce(lc.sent_today, 0) DESC, coalesce(lc.uncontacted, 0) DESC`,
    );

    const now = new Date();
    const todayDow = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowDow = tomorrow.getDay();

    const isDayMatch = (days: unknown, dow: number) => {
        if (!days || !Array.isArray(days) || days.length === 0) return dow >= 1 && dow <= 5;
        return (days as number[]).includes(dow);
    };

    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    interface SimCampaignState {
        id: string;
        name: string;
        owner_name: string;
        owner_id: string;
        preferred_hour: number;
        preferred_days: number[];
        max_steps: number;
        avg_delay_days: number;
        sent_today: number;
        sent_yesterday: number;
        sent_last_7d: number;
        is_recently_created: boolean;
        is_dormant: boolean;
        daily_pace: number;
        rem_uncontacted: number;
        rem_sequence: number;
    }

    const simStates: SimCampaignState[] = [];
    const alignedCampaigns: AlignedCampaignItem[] = [];

    for (const row of campaignRows) {
        const sendDays = Array.isArray(row.preferredSendDays) ? (row.preferredSendDays as number[]) : [1, 2, 3, 4, 5];
        const uncontacted = Number(row.uncontacted_leads) || 0;
        const inSequence = Number(row.in_sequence_leads) || 0;
        const sentTodayCamp = Number(row.sent_today) || 0;
        const sentYesterdayCamp = Number(row.sent_yesterday) || 0;
        const sentLast7d = Number(row.sent_last_7d) || 0;
        const maxSteps = Math.max(1, Number(row.max_steps) || 1);
        const avgDelay = Math.max(1, Number(row.avg_delay_days) || 1);
        const isRecent = Boolean(row.is_recently_created);
        const prefHour = Number(row.preferredSendHour) || 10;

        // A campaign is dormant if it was created >7 days ago and has sent 0 emails in the last 7 days
        const isDormant = !isRecent && sentLast7d === 0 && sentTodayCamp === 0;

        // Real daily pace based on observed Smartlead dispatch velocity (~180-220/day per active campaign)
        const observedPace = Math.max(sentTodayCamp, sentYesterdayCamp);
        const dailyPace = isDormant
            ? 0
            : observedPace > 0
            ? Math.min(230, Math.max(150, observedPace))
            : 180;

        // Next sending day's expected dispatch for this campaign
        const followUpDueTomorrow = !isDormant && maxSteps > 1
            ? Math.min(inSequence, Math.min(90, Math.ceil(inSequence / avgDelay)))
            : 0;
        const newBatchTomorrow = !isDormant
            ? Math.min(uncontacted, Math.max(0, dailyPace - followUpDueTomorrow))
            : 0;
        const estimatedTomorrow = newBatchTomorrow + followUpDueTomorrow;
        const estimatedDailyDisplay = sentTodayCamp > 0 ? sentTodayCamp : estimatedTomorrow;

        const totalRemainingWork = uncontacted + (maxSteps > 1 ? inSequence : 0);
        const estDaysLeft = !isDormant && dailyPace > 0 && totalRemainingWork > 0
            ? Math.max(1, Math.ceil(totalRemainingWork / Math.min(dailyPace, Math.max(1, estimatedTomorrow || dailyPace))))
            : 0;

        const runsToday = !isDormant && isDayMatch(sendDays, todayDow) && (sentTodayCamp > 0 || (isRecent && uncontacted > 0));
        const runsTomorrow = !isDormant && isDayMatch(sendDays, tomorrowDow) && estimatedTomorrow > 0;

        simStates.push({
            id: String(row.id),
            name: String(row.name),
            owner_name: String(row.owner_name),
            owner_id: String(row.userId || ""),
            preferred_hour: prefHour,
            preferred_days: sendDays,
            max_steps: maxSteps,
            avg_delay_days: avgDelay,
            sent_today: sentTodayCamp,
            sent_yesterday: sentYesterdayCamp,
            sent_last_7d: sentLast7d,
            is_recently_created: isRecent,
            is_dormant: isDormant,
            daily_pace: dailyPace,
            rem_uncontacted: uncontacted,
            rem_sequence: maxSteps > 1 ? inSequence : 0,
        });

        alignedCampaigns.push({
            id: String(row.id),
            name: String(row.name),
            owner_name: String(row.owner_name),
            owner_id: String(row.userId || ""),
            status: isDormant ? "DORMANT" : String(row.status),
            uncontacted_leads: uncontacted,
            in_sequence_leads: maxSteps > 1 ? inSequence : 0,
            sent_today: sentTodayCamp,
            max_steps: maxSteps,
            is_dormant: isDormant,
            estimated_days_left: estDaysLeft,
            runs_today: runsToday,
            runs_tomorrow: runsTomorrow,
            estimated_daily: estimatedDailyDisplay,
            quota_share_pct: Math.min(100, Math.round((estimatedDailyDisplay / dailyLimit) * 100)),
            preferred_hour: prefHour,
            preferred_days: sendDays,
        });
    }

    // 7-Day Stateful Lead Depletion & Sequence Simulation (Google Calendar Engine)
    const timeline: CapacityTimelineDay[] = [];

    for (let i = 0; i < 7; i++) {
        const targetDate = new Date(now.getTime() + i * 86400000);
        const dow = targetDate.getDay();
        const dateStr = targetDate.toISOString().split("T")[0];
        const isSending = dow >= 1 && dow <= 5;

        const daySlots: CalendarCampaignSlot[] = [];
        let dayProjected = 0;
        let dayNewLeads = 0;
        let dayFollowupLeads = 0;
        let dayFinishingCount = 0;

        if (i === 0) {
            // Day 0 (Today): reflects actual sent_today + newly aligned campaigns ready today
            for (const st of simStates) {
                if (st.is_dormant) continue;
                if (!isDayMatch(st.preferred_days, dow)) continue;

                if (st.sent_today > 0) {
                    const estFollowup = st.max_steps > 1 && st.rem_sequence > 0
                        ? Math.min(st.sent_today, Math.round(st.sent_today * 0.35))
                        : 0;
                    const estNew = Math.max(0, st.sent_today - estFollowup);
                    const isDoneToday = st.rem_uncontacted === 0 && st.rem_sequence === 0;
                    if (isDoneToday) dayFinishingCount++;

                    daySlots.push({
                        id: st.id,
                        name: st.name,
                        owner_name: st.owner_name,
                        owner_id: st.owner_id,
                        preferred_hour: st.preferred_hour,
                        time_label: formatHourLabel(st.preferred_hour),
                        total_leads: st.sent_today,
                        new_leads: estNew,
                        followup_leads: estFollowup,
                        remaining_after: st.rem_uncontacted + st.rem_sequence,
                        max_steps: st.max_steps,
                        is_finishing: isDoneToday,
                        is_new_launch: false,
                    });
                    dayNewLeads += estNew;
                    dayFollowupLeads += estFollowup;
                } else if (st.is_recently_created && st.rem_uncontacted > 0) {
                    // Brand-new campaign created today and queued for dispatch
                    daySlots.push({
                        id: st.id,
                        name: st.name,
                        owner_name: st.owner_name,
                        owner_id: st.owner_id,
                        preferred_hour: st.preferred_hour,
                        time_label: `${formatHourLabel(st.preferred_hour)} (Queued)`,
                        total_leads: st.rem_uncontacted,
                        new_leads: st.rem_uncontacted,
                        followup_leads: 0,
                        remaining_after: st.rem_uncontacted,
                        max_steps: st.max_steps,
                        is_finishing: false,
                        is_new_launch: true,
                    });
                }
            }
            dayProjected = todaySent;
        } else if (isSending) {
            // Future working day (i = 1..6): stateful lead depletion per campaign
            for (const st of simStates) {
                if (st.is_dormant) continue;
                if (!isDayMatch(st.preferred_days, dow)) continue;
                if (st.rem_uncontacted <= 0 && st.rem_sequence <= 0) continue;

                // 1. Due sequence follow-ups
                const followupsToday = st.max_steps > 1 && st.rem_sequence > 0
                    ? Math.min(
                          st.rem_sequence,
                          Math.min(85, Math.max(15, Math.ceil(st.rem_sequence / Math.max(1, st.avg_delay_days)))),
                      )
                    : 0;

                // 2. New uncontacted leads (Step 1)
                const remainingDailyQuotaForCamp = Math.max(0, st.daily_pace - followupsToday);
                const newToday = Math.min(st.rem_uncontacted, remainingDailyQuotaForCamp);

                const totalCampToday = newToday + followupsToday;
                if (totalCampToday <= 0) continue;

                const wasNewLaunch = i === 1 && st.sent_today === 0 && st.is_recently_created;

                // Deplete pools for subsequent days
                st.rem_uncontacted = Math.max(0, st.rem_uncontacted - newToday);
                st.rem_sequence = Math.max(0, st.rem_sequence - followupsToday);

                // If campaign has multiple steps, newly contacted Step-1 leads enter follow-up sequence
                if (st.max_steps > 1 && newToday > 0) {
                    st.rem_sequence += Math.round(newToday * 0.75);
                }

                const remainingAfter = st.rem_uncontacted + st.rem_sequence;
                const isFinishingToday = remainingAfter === 0 || (st.rem_uncontacted === 0 && st.max_steps === 1);
                if (isFinishingToday) {
                    st.rem_uncontacted = 0;
                    st.rem_sequence = 0;
                    dayFinishingCount++;
                }

                dayProjected += totalCampToday;
                dayNewLeads += newToday;
                dayFollowupLeads += followupsToday;

                daySlots.push({
                    id: st.id,
                    name: st.name,
                    owner_name: st.owner_name,
                    owner_id: st.owner_id,
                    preferred_hour: st.preferred_hour,
                    time_label: formatHourLabel(st.preferred_hour),
                    total_leads: totalCampToday,
                    new_leads: newToday,
                    followup_leads: followupsToday,
                    remaining_after: st.rem_uncontacted + st.rem_sequence,
                    max_steps: st.max_steps,
                    is_finishing: isFinishingToday,
                    is_new_launch: wasNewLaunch,
                });
            }
        }

        // Sort day slots by preferred_hour asc, then total_leads desc
        daySlots.sort((a, b) => a.preferred_hour - b.preferred_hour || b.total_leads - a.total_leads);

        const dayUtil = Math.round((dayProjected / dailyLimit) * 100);
        let dayStatus: 'OPTIMAL' | 'BUSY' | 'CAPPED' | 'REST_DAY' = 'OPTIMAL';
        if (!isSending) {
            dayStatus = 'REST_DAY';
        } else if (dayUtil >= 95) {
            dayStatus = 'CAPPED';
        } else if (dayUtil >= 70) {
            dayStatus = 'BUSY';
        }

        timeline.push({
            date: dateStr,
            day_name: DAY_NAMES[dow],
            full_day_name: FULL_DAY_NAMES[dow],
            projected_leads: dayProjected,
            new_leads_count: dayNewLeads,
            followup_leads_count: dayFollowupLeads,
            free_slots: isSending ? Math.max(0, dailyLimit - dayProjected) : 0,
            capacity: dailyLimit,
            utilization_pct: Math.min(100, dayUtil),
            is_sending_day: isSending,
            campaigns_count: daySlots.length,
            finishing_campaigns_count: dayFinishingCount,
            status: dayStatus,
            scheduled_campaigns: daySlots,
        });
    }

    const todayTimeline = timeline[0];
    const tomorrowTimeline = timeline[1];

    // Today summary derived directly from Day 0
    const remainingToday = Math.max(0, dailyLimit - todaySent);
    const utilToday = Math.min(100, Math.round((todaySent / dailyLimit) * 100));
    const todayCampsCount = todayTimeline?.campaigns_count || 0;
    const statusToday: 'OPTIMAL' | 'BUSY' | 'CAPPED' =
        utilToday >= 90 ? 'CAPPED' : utilToday >= 70 ? 'BUSY' : 'OPTIMAL';
    const statusLabelToday =
        statusToday === 'CAPPED'
            ? 'Daily Limit Reached · Hold New Dispatches'
            : statusToday === 'BUSY'
            ? `Window Busy (${remainingToday.toLocaleString()} slots left)`
            : `Optimal Window Open (${remainingToday.toLocaleString()} slots free)`;

    // Tomorrow summary derived directly from Day 1 of the depleted timeline
    const isTomorrowSendingDay = tomorrowDow >= 1 && tomorrowDow <= 5;
    const tomorrowProjected = tomorrowTimeline?.projected_leads ?? 0;
    const tomorrowCampsCount = tomorrowTimeline?.campaigns_count ?? 0;
    const tomorrowFinishingCount = tomorrowTimeline?.finishing_campaigns_count ?? 0;
    const remainingTomorrow = Math.max(0, dailyLimit - tomorrowProjected);
    const utilTomorrow = Math.min(120, Math.round((tomorrowProjected / dailyLimit) * 100));
    const statusTomorrow: 'OPTIMAL' | 'BUSY' | 'CAPPED' =
        !isTomorrowSendingDay
            ? 'OPTIMAL'
            : utilTomorrow >= 95
            ? 'CAPPED'
            : utilTomorrow >= 70
            ? 'BUSY'
            : 'OPTIMAL';
    const statusLabelTomorrow =
        !isTomorrowSendingDay
            ? 'Weekend · Scheduled Rest Window'
            : statusTomorrow === 'CAPPED'
            ? `Fully Allocated (${tomorrowProjected.toLocaleString()} leads · ${utilTomorrow}%)`
            : statusTomorrow === 'BUSY'
            ? `${remainingTomorrow.toLocaleString()} free slots (${tomorrowFinishingCount} campaigns finishing)`
            : `Wide Open (${remainingTomorrow.toLocaleString()} free slots available)`;

    // Smart Decision Assistant Logic
    const canLaunchToday = remainingToday >= 100;
    let recommendedAction = "";
    let bestWindow = "";

    if (remainingToday >= 300) {
        recommendedAction = `Safe to launch new campaigns today! You have ${remainingToday.toLocaleString()} free sending slots remaining before midnight (${tomorrowFinishingCount} existing campaigns complete tomorrow).`;
        bestWindow = `Today before 6:00 PM IST (Up to ${remainingToday.toLocaleString()} leads)`;
    } else if (remainingTomorrow >= 400) {
        recommendedAction = `Today's window is nearly full (${utilToday}% used). Align new campaigns for Tomorrow (${FULL_DAY_NAMES[tomorrowDow]}), where ${remainingTomorrow.toLocaleString()} slots are open.`;
        bestWindow = `Tomorrow 10:00 AM IST (${remainingTomorrow.toLocaleString()} open slots)`;
    } else {
        recommendedAction = `High fleet volume tomorrow (${utilTomorrow}% across ${tomorrowCampsCount} campaigns). Best open window is Friday (${(timeline[2]?.free_slots ?? 0).toLocaleString()} slots free).`;
        bestWindow = `Friday 10:00 AM IST (${(timeline[2]?.free_slots ?? 0).toLocaleString()} open slots)`;
    }

    return {
        daily_limit: dailyLimit,
        today: {
            date: now.toISOString().split("T")[0],
            day_name: FULL_DAY_NAMES[todayDow],
            sent_so_far: todaySent,
            remaining_capacity: remainingToday,
            utilization_pct: utilToday,
            active_campaigns_count: todayCampsCount,
            status: statusToday,
            status_label: statusLabelToday,
        },
        tomorrow: {
            date: tomorrow.toISOString().split("T")[0],
            day_name: FULL_DAY_NAMES[tomorrowDow],
            is_sending_day: isTomorrowSendingDay,
            projected_leads: tomorrowProjected,
            projected_remaining: remainingTomorrow,
            projected_utilization_pct: utilTomorrow,
            aligned_campaigns_count: tomorrowCampsCount,
            finishing_campaigns_count: tomorrowFinishingCount,
            status: statusTomorrow,
            status_label: statusLabelTomorrow,
        },
        timeline,
        aligned_campaigns: alignedCampaigns,
        decision_assistant: {
            can_launch_today: canLaunchToday,
            safe_slots_today: remainingToday,
            safe_slots_tomorrow: remainingTomorrow,
            recommended_action: recommendedAction,
            best_window: bestWindow,
        },
    };
}

// Today's sends are always reported for the current UTC day, even when the
// chart window ends in the past (Custom range).
async function readTodaySends(query: QueryFn, startTs: string, endTs: string, scope: DataScope): Promise<number> {
    const rows = await query(
        `SELECT (
            (SELECT count(*)::int
             FROM "EmailEvent" e
             JOIN "Lead" l ON l.id = e."leadId"
             WHERE e."eventType" = '${SENT_EVENT}'
               AND e."createdAt" >= $1::timestamp AND e."createdAt" < $2::timestamp
               AND ${leadOwned(scope, "l")})
            +
            (SELECT count(*)::int
             FROM "Lead" l
             WHERE l."lastContactedAt" >= $1::timestamp AND l."lastContactedAt" < $2::timestamp
               AND ${leadOwned(scope, "l")}
               AND NOT EXISTS (
                   SELECT 1 FROM "EmailEvent" e2
                   WHERE e2."leadId" = l.id
                     AND e2."eventType" = '${SENT_EVENT}'
                     AND e2."createdAt" >= $1::timestamp AND e2."createdAt" < $2::timestamp
               ))
         )::int AS sent`,
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

interface DashboardCacheEntry {
    data: any;
    expiresAt: number;
}
const dashboardCache = new Map<string, DashboardCacheEntry>();
const lastGoodDashboards = new Map<string, any>();
const inFlightDashboards = new Map<string, Promise<any>>();
const DASHBOARD_CACHE_TTL = 60_000;

export async function getDashboard(req: DashboardRequest, query: QueryFn, scope: DataScope) {
    const key = `${scope.master ? "master" : scope.userId}_${req.period || "custom"}_${req.from || ""}_${req.to || ""}`;
    const cached = dashboardCache.get(key);
    const nowMs = Date.now();
    if (cached && cached.expiresAt > nowMs) {
        return cached.data;
    }

    // Seed in-memory cache from disk snapshot so first request after restart returns real data
    if (!cached) {
        const diskHit = readSnapshot<any>("dashboard", key);
        if (diskHit) {
            dashboardCache.set(key, { data: diskHit.data, expiresAt: nowMs + DASHBOARD_CACHE_TTL });
            lastGoodDashboards.set(key, diskHit.data);
            // Return stale disk data immediately; background refresh will update it shortly
            if (inFlightDashboards.has(key)) return diskHit.data;
            const bgRefresh = (async () => {
                try {
                    const data = await fetchDashboardInternal(req, query, scope);
                    dashboardCache.set(key, { data, expiresAt: Date.now() + DASHBOARD_CACHE_TTL });
                    lastGoodDashboards.set(key, data);
                    writeSnapshot("dashboard", key, data);
                } catch { /* non-fatal */ } finally { inFlightDashboards.delete(key); }
            })();
            inFlightDashboards.set(key, bgRefresh);
            return diskHit.data;
        }
    }

    if (inFlightDashboards.has(key)) {
        return inFlightDashboards.get(key)!;
    }

    const fetchPromise = (async () => {
        try {
            const data = await fetchDashboardInternal(req, query, scope);
            dashboardCache.set(key, { data, expiresAt: Date.now() + DASHBOARD_CACHE_TTL });
            lastGoodDashboards.set(key, data);
            writeSnapshot("dashboard", key, data);
            return data;
        } catch (err) {
            const fallback = lastGoodDashboards.get(key) || cached?.data;
            if (fallback) {
                console.warn("[getDashboard] Serving last known good dashboard on refresh error:", (err as any)?.message);
                return fallback;
            }
            throw err;
        } finally {
            inFlightDashboards.delete(key);
        }
    })();

    inFlightDashboards.set(key, fetchPromise);
    return fetchPromise;
}

async function fetchDashboardInternal(req: DashboardRequest, query: QueryFn, scope: DataScope) {
    const range = resolveRange(req);
    const startTs = toTs(range.start);
    const endTs = toTs(range.endExclusive);
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);

    // Stage in two small groups so multiple concurrent getDashboard() calls
    // (e.g. AppNav 30d + Dashboard current window + Dashboard previous window)
    // never saturate the 5-connection primary semaphore at once.
    const [activity, todaySent] = await Promise.all([
        readActivityRows(query, startTs, endTs, scope),
        readTodaySends(query, toTs(todayStart), toTs(todayEnd), scope),
    ]);
    const [campaignMeta, healthRows, activeCounts] = await Promise.all([
        readCampaignMeta(query, scope),
        readAccountHealth(query, scope),
        readActiveCounts(query, scope),
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
            const w = Math.max(1, Number(row.weight) || 1);
            bucket.sent += w;
            if (campaignBucket) campaignBucket.sent += w;
            continue;
        }

        engagedLeads.add(leadId);
        if (campaignBucket) campaignBucket.engaged.add(leadId);
        const w = Math.max(1, Number(row.weight) || 1);

        if (type === "open") {
            bucket.opens += w;
            if (campaignBucket) campaignBucket.opens += w;
        } else if (type === "reply") {
            bucket.replies += w;
            if (campaignBucket) campaignBucket.replies += w;
        } else if (type === "bounce") {
            bucket.bounces += w;
            if (campaignBucket) campaignBucket.bounces += w;
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
    const capacityTracker = await readCapacityTracker(query, todaySent, health.daily_capacity || 0, scope);

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
        capacity_tracker: capacityTracker,
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
