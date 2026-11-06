/**
 * Backfill missing "sent" EmailEvent rows from Smartlead's per-lead statistics.
 *
 * Why: Lead.lastContactedAt only keeps the LATEST send and the webhook missed
 * several days, so the dashboard's daily trend showed 0 for days that really
 * had sends. /campaigns/:id/statistics returns one row per (lead, step) with
 * sent_time + a unique stats_id, which is enough to rebuild exact daily sends.
 *
 * Safe by design:
 *   - DRY RUN by default; pass --apply to write.
 *   - Idempotent: providerEventId = sl_stat_sent_<stats_id> (ON CONFLICT DO NOTHING).
 *   - No double counting: skips a lead/day that already has a sent event or
 *     whose lastContactedAt falls on that day.
 *   - Only touches EmailEvent. Never edits Lead / Campaign rows.
 *   - Paced + 429 backoff to respect Smartlead's 200 req/min limit.
 *
 * Usage: npx tsx scripts/backfill_sent_events.ts [--from=2026-10-29] [--apply]
 */
import { pgQuery } from "../server/pg";
import { getAllSmartleadKeys } from "../server/smartleadKeys";

const BASE = "https://server.smartlead.ai/api/v1";
const APPLY = process.argv.includes("--apply");
const FROM = (process.argv.find((a) => a.startsWith("--from=")) || "--from=2026-10-29").split("=")[1];
const FROM_TS = new Date(`${FROM}T00:00:00Z`).getTime();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sl(path: string, key: string): Promise<any> {
    for (let attempt = 0; attempt < 6; attempt++) {
        await sleep(400);
        const sep = path.includes("?") ? "&" : "?";
        const res = await fetch(`${BASE}${path}${sep}api_key=${key}`);
        if (res.status === 429) {
            console.warn("  429 rate limited, waiting 20s...");
            await sleep(20_000);
            continue;
        }
        if (!res.ok) return null;
        return res.json();
    }
    return null;
}

async function main() {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"} | from ${FROM}`);
    const keys = getAllSmartleadKeys();
    const keyList: string[] = keys.map((k: any) => (typeof k === "string" ? k : k.key || k.apiKey)).filter(Boolean);

    const camps = await pgQuery<any>(
        `SELECT id, name, "providerCampaignId" FROM "Campaign" WHERE "providerCampaignId" IS NOT NULL`,
    );
    const campByProvider = new Map<string, any>(camps.map((c: any) => [String(c.providerCampaignId), c]));

    // Existing sent evidence per lead/day, so we never double count.
    const existing = new Set<string>(
        (
            await pgQuery<any>(
                `SELECT "leadId" AS id, to_char("createdAt",'YYYY-MM-DD') AS d FROM "EmailEvent"
                 WHERE lower("eventType") IN ('sent','email_sent','emailsent') AND "createdAt" >= $1::timestamp
                 UNION
                 SELECT id, to_char("lastContactedAt",'YYYY-MM-DD') FROM "Lead" WHERE "lastContactedAt" >= $1::timestamp`,
                [FROM],
            )
        ).map((r: any) => `${r.id}|${r.d}`),
    );

    const perDay = new Map<string, number>();
    let inserted = 0, skippedDup = 0, noLead = 0, scanned = 0;

    for (const key of keyList) {
        const list = await sl("/campaigns", key);
        if (!Array.isArray(list)) continue;
        for (const sc of list) {
            const camp = campByProvider.get(String(sc.id));
            if (!camp) continue;
            const leads = await pgQuery<any>(`SELECT id, lower(email) AS email FROM "Lead" WHERE "campaignId" = $1`, [camp.id]);
            const leadByEmail = new Map<string, string>(leads.map((l: any) => [l.email, l.id]));

            for (let offset = 0; ; offset += 500) {
                const page = await sl(`/campaigns/${sc.id}/statistics?offset=${offset}&limit=500`, key);
                const rows: any[] = page?.data || [];
                if (!rows.length) break;
                let allOld = true;
                for (const r of rows) {
                    scanned++;
                    const sentAt = r.sent_time ? new Date(r.sent_time) : null;
                    if (!sentAt || isNaN(sentAt.getTime())) continue;
                    if (sentAt.getTime() >= FROM_TS) allOld = false; else continue;
                    const leadId = leadByEmail.get(String(r.lead_email || "").toLowerCase());
                    if (!leadId) { noLead++; continue; }
                    const day = sentAt.toISOString().slice(0, 10);
                    const k = `${leadId}|${day}`;
                    if (existing.has(k)) { skippedDup++; continue; }
                    existing.add(k);
                    perDay.set(day, (perDay.get(day) || 0) + 1);
                    if (APPLY) {
                        await pgQuery(
                            `INSERT INTO "EmailEvent" ("id","leadId","eventType","providerEventId","fromEmail","rawPayload","createdAt")
                             VALUES (gen_random_uuid()::text,$1,'sent',$2,NULL,$3::json,$4::timestamp)
                             ON CONFLICT ("providerEventId") DO NOTHING`,
                            [leadId, `sl_stat_sent_${r.stats_id}`, JSON.stringify({ source: "backfill", campaign: sc.id, step: r.sequence_number }), sentAt.toISOString()],
                        );
                    }
                    inserted++;
                }
                if (rows.length < 500) break;
                if (allOld && offset > 0) break;
            }
            console.log(`  #${sc.id} ${sc.name}: running total ${inserted}`);
        }
    }

    console.log(`\nScanned ${scanned} stat rows | ${APPLY ? "inserted" : "would insert"} ${inserted} | already counted ${skippedDup} | no matching lead ${noLead}`);
    console.table([...perDay.entries()].sort().map(([day, n]) => ({ day, sent: n })));
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

