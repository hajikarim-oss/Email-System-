// Self-healing sent-event sync.
//
// Lead.lastContactedAt only remembers the LATEST send and Smartlead webhooks can
// be missed (restarts, deploys, 429s), which used to leave whole days showing 0
// on the dashboard. This rebuilds missing "sent" EmailEvent rows from Smartlead's
// per-lead statistics, so the daily trend is derived from durable rows.
//
// Properties that keep it safe across `git pull` / VPS restarts:
//   - State lives only in PostgreSQL; nothing depends on process memory.
//   - Idempotent: providerEventId = sl_stat_sent_<stats_id>, ON CONFLICT DO NOTHING.
//   - Never double counts a lead/day that already has a sent event or lastContactedAt.
//   - Only INSERTs into EmailEvent; never edits Lead / Campaign rows.
//   - Single-flight + cooldown + paced requests + 429 backoff (Smartlead: 200 req/min).
//   - Never throws to the caller; failures are logged and retried next cycle.

import { pgQuery } from "./pg";
import { getAllSmartleadKeys } from "./smartleadKeys";

const BASE = "https://server.smartlead.ai/api/v1";
const REQUEST_GAP_MS = 400;
const MIN_INTERVAL_MS = 20 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SentSyncOptions {
    /** Look back this many days (default 3). Ignored when `fromDate` is given. */
    days?: number;
    /** Explicit start day, YYYY-MM-DD (UTC). */
    fromDate?: string;
    /** When false, only counts what would be inserted. */
    apply?: boolean;
    /** Bypass the cooldown (used by the CLI script). */
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
let lastRun = 0;

async function slGet(path: string, key: string): Promise<any | null> {
    for (let attempt = 0; attempt < 6; attempt++) {
        await sleep(REQUEST_GAP_MS);
        const sep = path.includes("?") ? "&" : "?";
        let res: Response;
        try {
            res = await fetch(`${BASE}${path}${sep}api_key=${key}`);
        } catch {
            await sleep(2000);
            continue;
        }
        if (res.status === 429) {
            await sleep(20_000);
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
        new Date(Date.now() - (opts.days ?? 3) * 86_400_000).toISOString().slice(0, 10);
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
                 WHERE lower("eventType") IN ('sent','email_sent','emailsent') AND "createdAt" >= $1::timestamp
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
            // Cheap skip: nothing can have been sent in the window if the campaign
            // was never touched since then.
            const touched = sc.updated_at ? new Date(sc.updated_at).getTime() : Date.now();
            if (touched < fromTs) continue;

            const leads = await pgQuery<any>(`SELECT id, lower(email) AS email FROM "Lead" WHERE "campaignId" = $1`, [campDbId]);
            const leadByEmail = new Map<string, string>(leads.map((l: any) => [l.email, l.id]));

            for (let offset = 0; ; offset += 500) {
                const page = await slGet(`/campaigns/${sc.id}/statistics?offset=${offset}&limit=500`, key);
                const rows: any[] = page?.data || [];
                if (rows.length === 0) break;
                for (const r of rows) {
                    result.scanned++;
                    const sentAt = r.sent_time ? new Date(r.sent_time) : null;
                    if (!sentAt || Number.isNaN(sentAt.getTime()) || sentAt.getTime() < fromTs) continue;
                    const leadId = leadByEmail.get(String(r.lead_email || "").toLowerCase());
                    if (!leadId) { result.noLead++; continue; }
                    const day = sentAt.toISOString().slice(0, 10);
                    const k = `${leadId}|${day}`;
                    if (existing.has(k)) { result.alreadyCounted++; continue; }
                    existing.add(k);
                    if (apply) {
                        await pgQuery(
                            `INSERT INTO "EmailEvent" ("id","leadId","eventType","providerEventId","fromEmail","rawPayload","createdAt")
                             VALUES (gen_random_uuid()::text,$1,'sent',$2,NULL,$3::json,$4::timestamp)
                             ON CONFLICT ("providerEventId") DO NOTHING`,
                            [leadId, `sl_stat_sent_${r.stats_id}`, JSON.stringify({ source: "sent_sync", campaign: sc.id, step: r.sequence_number }), sentAt.toISOString()],
                        );
                    }
                    result.inserted++;
                    result.perDay[day] = (result.perDay[day] || 0) + 1;
                }
                if (rows.length < 500) break;
            }
        }
    }
    if (result.inserted > 0 || opts.force) {
        log(`[SentSync] ${apply ? "inserted" : "would insert"} ${result.inserted} sent events (scanned ${result.scanned}, already counted ${result.alreadyCounted}, no lead ${result.noLead})`);
    }
    return result;
}

