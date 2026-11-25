// Self-healing Smartlead event & lead activity sync (Batched SQL for ultra-fast sync).
//
// Rebuilds any sent / open / click / reply / bounce events that occurred while
// the server was offline or that webhooks missed, and updates Lead timestamps &
// counters in single batched SQL queries per campaign so it finishes in seconds.

import { pgQuery } from "./pg";
import { getAllSmartleadKeys } from "./smartleadKeys";

const BASE = "https://server.smartlead.ai/api/v1";
const REQUEST_GAP_MS = 180;
const MIN_INTERVAL_MS = 3 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SentSyncOptions {
    days?: number;
    fromDate?: string;
    apply?: boolean;
    force?: boolean;
    log?: (msg: string) => void;
}

export interface SentSyncResult {
    scanned: number;
    inserted: number;
    alreadyCounted: number;
    noLead: number;
    perDay: Record<string, number>;
    skipped?: string;
}

let inFlight: Promise<SentSyncResult> | null = null;
// Delay the first automatic sentEventsSync run after server startup by 45 seconds
// so initial Dashboard, Report, and Unibox page loads have 100% of database bandwidth.
let lastRun = Date.now() - (MIN_INTERVAL_MS - 45_000);

async function slGet(path: string, key: string): Promise<any | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(REQUEST_GAP_MS);
        const sep = path.includes("?") ? "&" : "?";
        let res: Response;
        try {
            res = await fetch(`${BASE}${path}${sep}api_key=${key}`);
        } catch {
            await sleep(1000);
            continue;
        }
        if (res.status === 429) {
            await sleep(6_000);
            continue;
        }
        if (!res.ok) return null;
        try {
            return await res.json();
        } catch {
            return null;
        }
    }
    return null;
}

export function syncSentEvents(opts: SentSyncOptions = {}): Promise<SentSyncResult> {
    if (inFlight) return inFlight;
    const now = Date.now();
    if (!opts.force && now - lastRun < MIN_INTERVAL_MS) {
        return Promise.resolve({
            scanned: 0, inserted: 0, alreadyCounted: 0, noLead: 0, perDay: {}, skipped: "cooldown",
        });
    }
    lastRun = now;
    inFlight = run(opts)
        .catch((err: any) => {
            console.warn("[SentSync] failed (will retry next cycle):", err?.message || err);
            return { scanned: 0, inserted: 0, alreadyCounted: 0, noLead: 0, perDay: {}, skipped: "error" } as SentSyncResult;
        })
        .finally(() => {
            inFlight = null;
        });
    return inFlight;
}

async function run(opts: SentSyncOptions): Promise<SentSyncResult> {
    const log = opts.log || ((m: string) => console.log(m));
    const apply = opts.apply !== false;
    const fromDay =
        opts.fromDate ||
        new Date(Date.now() - (opts.days ?? 2) * 86_400_000).toISOString().slice(0, 10);
    const fromTs = new Date(`${fromDay}T00:00:00Z`).getTime();

    const result: SentSyncResult = { scanned: 0, inserted: 0, alreadyCounted: 0, noLead: 0, perDay: {} };
    const keys = getAllSmartleadKeys().map((k) => k.key);
    if (keys.length === 0) return { ...result, skipped: "no_api_key" };

    const camps = await pgQuery<any>(
        `SELECT id, "providerCampaignId" FROM "Campaign" WHERE "providerCampaignId" IS NOT NULL`,
    );
    const campByProvider = new Map<string, string>(camps.map((c: any) => [String(c.providerCampaignId), c.id]));

    const existing = new Set<string>(
        (
            await pgQuery<any>(
                `SELECT "leadId" AS id, to_char("createdAt",'YYYY-MM-DD') AS d FROM "EmailEvent"
                 WHERE "eventType" IN ('sent','email_sent','emailsent','SENT') AND "createdAt" >= $1::timestamp
                 UNION
                 SELECT id, to_char("lastContactedAt",'YYYY-MM-DD') FROM "Lead" WHERE "lastContactedAt" >= $1::timestamp`,
                [fromDay],
            )
        ).map((r: any) => `${r.id}|${r.d}`),
    );

    for (const key of keys) {
        const list = await slGet("/campaigns", key);
        if (!Array.isArray(list)) continue;
        for (const sc of list) {
            const campDbId = campByProvider.get(String(sc.id));
            if (!campDbId) continue;
            const touched = sc.updated_at ? new Date(sc.updated_at).getTime() : 0;
            if (touched < fromTs && String(sc.status || "").toUpperCase() !== "ACTIVE") continue;

            const leads = await pgQuery<any>(`SELECT id, lower(email) AS email FROM "Lead" WHERE "campaignId" = $1`, [campDbId]);
            const leadByEmail = new Map<string, string>(leads.map((l: any) => [l.email, l.id]));

            const leadUpdates: Array<{
                id: string;
                sentIso: string | null;
                openIso: string | null;
                openCount: number;
                clickCount: number;
                replyIso: string | null;
                isBounced: boolean;
            }> = [];

            const eventsToInsert: Array<{
                leadId: string;
                eventType: string;
                providerEventId: string;
                payload: string;
                createdAt: string;
            }> = [];

            for (let offset = 0; offset < 3000; offset += 500) {
                const page = await slGet(`/campaigns/${sc.id}/statistics?offset=${offset}&limit=500`, key);
                const rows: any[] = Array.isArray(page) ? page : (page?.data || []);
                if (rows.length === 0) break;

                for (const r of rows) {
                    result.scanned++;
                    const sentAt = r.sent_time ? new Date(r.sent_time) : null;
                    const openAt = r.open_time ? new Date(r.open_time) : null;
                    const clickAt = r.click_time ? new Date(r.click_time) : null;
                    const replyAt = r.reply_time ? new Date(r.reply_time) : null;
                    const isBounced = Boolean(r.is_bounced || r.sender_bounce);

                    const newestActivity = Math.max(
                        sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt.getTime() : 0,
                        openAt && !Number.isNaN(openAt.getTime()) ? openAt.getTime() : 0,
                        clickAt && !Number.isNaN(clickAt.getTime()) ? clickAt.getTime() : 0,
                        replyAt && !Number.isNaN(replyAt.getTime()) ? replyAt.getTime() : 0,
                    );
                    if (newestActivity < fromTs) continue;

                    const emailLower = String(r.lead_email || "").toLowerCase().trim();
                    const leadId = leadByEmail.get(emailLower);
                    if (!leadId) {
                        result.noLead++;
                        continue;
                    }

                    // NOTE: Do NOT treat r.reply_time as a genuine reply if the row is bounced!
                    // Smartlead sets reply_time on bounce NDRs when is_bounced / sender_bounce is true.
                    const genuineReplyAt = (!isBounced && !r.ignore_reply && replyAt && !Number.isNaN(replyAt.getTime())) ? replyAt : null;

                    leadUpdates.push({
                        id: leadId,
                        sentIso: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt.toISOString() : null,
                        openIso: openAt && !Number.isNaN(openAt.getTime()) ? openAt.toISOString() : null,
                        openCount: Number(r.open_count || (openAt ? 1 : 0)),
                        clickCount: Number(r.click_count || (clickAt ? 1 : 0)),
                        replyIso: genuineReplyAt ? genuineReplyAt.toISOString() : null,
                        isBounced,
                    });

                    const statsId = r.stats_id || `${leadId}_${r.sequence_number || 1}`;
                    const basePayload = JSON.stringify({
                        source: "sent_sync",
                        campaign: sc.id,
                        step: r.sequence_number,
                        subject: r.email_subject || "",
                        email_body: r.email_message || "",
                    });

                    if (sentAt && !Number.isNaN(sentAt.getTime()) && sentAt.getTime() >= fromTs) {
                        const day = sentAt.toISOString().slice(0, 10);
                        const k = `${leadId}|${day}`;
                        if (existing.has(k)) {
                            result.alreadyCounted++;
                        } else {
                            existing.add(k);
                            eventsToInsert.push({
                                leadId,
                                eventType: "sent",
                                providerEventId: `sl_stat_sent_${statsId}`,
                                payload: basePayload,
                                createdAt: sentAt.toISOString(),
                            });
                            result.inserted++;
                            result.perDay[day] = (result.perDay[day] || 0) + 1;
                        }
                    }

                    if (openAt && !Number.isNaN(openAt.getTime()) && openAt.getTime() >= fromTs) {
                        eventsToInsert.push({
                            leadId,
                            eventType: "opened",
                            providerEventId: `sl_stat_open_${statsId}`,
                            payload: basePayload,
                            createdAt: openAt.toISOString(),
                        });
                    }

                    if (clickAt && !Number.isNaN(clickAt.getTime()) && clickAt.getTime() >= fromTs) {
                        eventsToInsert.push({
                            leadId,
                            eventType: "clicked",
                            providerEventId: `sl_stat_click_${statsId}`,
                            payload: basePayload,
                            createdAt: clickAt.toISOString(),
                        });
                    }

                    // Do NOT insert synthetic body-less sl_stat_reply_% rows from /statistics!
                    // Genuine replies are ingested with full reply body via Smartlead EMAIL_REPLY webhooks
                    // and smartleadRepliesSync.ts (/message-history).

                    if (isBounced && sentAt && !Number.isNaN(sentAt.getTime()) && sentAt.getTime() >= fromTs) {
                        eventsToInsert.push({
                            leadId,
                            eventType: "bounced",
                            providerEventId: `sl_stat_bounce_${statsId}`,
                            payload: basePayload,
                            createdAt: sentAt.toISOString(),
                        });
                    }
                }
                if (rows.length < 500) break;
            }

            if (apply && leadUpdates.length > 0) {
                // Deduplicate by lead id (keep latest activity)
                const byLead = new Map<string, (typeof leadUpdates)[0]>();
                for (const u of leadUpdates) {
                    const prev = byLead.get(u.id);
                    if (!prev) {
                        byLead.set(u.id, { ...u });
                    } else {
                        if (u.sentIso && (!prev.sentIso || u.sentIso > prev.sentIso)) prev.sentIso = u.sentIso;
                        if (u.openIso && (!prev.openIso || u.openIso > prev.openIso)) prev.openIso = u.openIso;
                        if (u.replyIso && (!prev.replyIso || u.replyIso > prev.replyIso)) prev.replyIso = u.replyIso;
                        prev.openCount = Math.max(prev.openCount, u.openCount);
                        prev.clickCount = Math.max(prev.clickCount, u.clickCount);
                        prev.isBounced = prev.isBounced || u.isBounced;
                    }
                }
                const uniqueUpdates = Array.from(byLead.values());
                for (let i = 0; i < uniqueUpdates.length; i += 200) {
                    const chunk = uniqueUpdates.slice(i, i + 200);
                    await pgQuery(
                        `UPDATE "Lead" AS l
                         SET "lastContactedAt" = GREATEST(coalesce(l."lastContactedAt", v.sent_at), coalesce(v.sent_at, l."lastContactedAt")),
                             "firstContactedAt" = COALESCE(l."firstContactedAt", v.sent_at),
                             "firstOpenAt" = COALESCE(l."firstOpenAt", v.open_at),
                             "lastOpenAt" = GREATEST(coalesce(l."lastOpenAt", v.open_at), coalesce(v.open_at, l."lastOpenAt")),
                             "openCount" = GREATEST(coalesce(l."openCount", 0), v.open_cnt),
                             "clickCount" = GREATEST(coalesce(l."clickCount", 0), v.click_cnt),
                             "repliedAt" = COALESCE(l."repliedAt", v.reply_at),
                             "lastRepliedAt" = GREATEST(coalesce(l."lastRepliedAt", v.reply_at), coalesce(v.reply_at, l."lastRepliedAt")),
                             "totalReplied" = CASE WHEN v.reply_at IS NOT NULL THEN GREATEST(coalesce(l."totalReplied", 0), 1) ELSE coalesce(l."totalReplied", 0) END,
                             "bounceCount" = CASE WHEN v.is_bounced THEN GREATEST(coalesce(l."bounceCount", 0), 1) ELSE coalesce(l."bounceCount", 0) END,
                             "totalBounced" = CASE WHEN v.is_bounced THEN GREATEST(coalesce(l."totalBounced", 0), 1) ELSE coalesce(l."totalBounced", 0) END,
                             "lastBouncedAt" = CASE WHEN v.is_bounced THEN COALESCE(l."lastBouncedAt", v.sent_at, NOW()) ELSE l."lastBouncedAt" END,
                             "totalOutbound" = CASE WHEN v.sent_at IS NOT NULL THEN GREATEST(coalesce(l."totalOutbound", 0), 1) ELSE coalesce(l."totalOutbound", 0) END,
                             "updatedAt" = NOW()
                         FROM (
                             SELECT unnest($1::text[]) AS id,
                                    unnest($2::timestamp[]) AS sent_at,
                                    unnest($3::timestamp[]) AS open_at,
                                    unnest($4::int[]) AS open_cnt,
                                    unnest($5::int[]) AS click_cnt,
                                    unnest($6::timestamp[]) AS reply_at,
                                    unnest($7::boolean[]) AS is_bounced
                         ) AS v
                         WHERE l.id = v.id`,
                        [
                            chunk.map((c) => c.id),
                            chunk.map((c) => c.sentIso),
                            chunk.map((c) => c.openIso),
                            chunk.map((c) => c.openCount),
                            chunk.map((c) => c.clickCount),
                            chunk.map((c) => c.replyIso),
                            chunk.map((c) => c.isBounced),
                        ],
                    ).catch(() => {});
                }
            }

            if (apply && eventsToInsert.length > 0) {
                for (let i = 0; i < eventsToInsert.length; i += 200) {
                    const chunk = eventsToInsert.slice(i, i + 200);
                    await pgQuery(
                        `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "rawPayload", "createdAt")
                         SELECT gen_random_uuid()::text,
                                unnest($1::text[]),
                                unnest($2::text[]),
                                unnest($3::text[]),
                                unnest($4::jsonb[]),
                                unnest($5::timestamp[])
                         ON CONFLICT ("providerEventId") DO NOTHING`,
                        [
                            chunk.map((e) => e.leadId),
                            chunk.map((e) => e.eventType),
                            chunk.map((e) => e.providerEventId),
                            chunk.map((e) => e.payload),
                            chunk.map((e) => e.createdAt),
                        ],
                    ).catch(() => {});
                }
            }
        }
    }
    if (result.inserted > 0 || opts.force) {
        log(`[SentSync] ${apply ? "inserted" : "would insert"} ${result.inserted} sent events (scanned ${result.scanned}, already counted ${result.alreadyCounted}, no lead ${result.noLead})`);
    }
    return result;
}
