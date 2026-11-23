/**
 * 24/7 Resumable VPS BFS Tree Harvester Worker
 *
 * Usage on VPS (with PM2):
 *   pm2 start "npm run harvest:tree" --name tbm-creator-harvester
 *
 * Or one-off local / seeded run:
 *   npx tsx scripts/harvest_tree_worker.ts --seed="https://www.instagram.com/navyaaaaa_____/?hl=en" --max=500
 *
 * Features:
 * - Respects Meta's free business_discovery limit (180 calls/hour per IG_ACCESS_TOKEN = 4,320/day * N tokens)
 * - Auto-rotates across all configured IG_ACCESS_TOKENs in .env
 * - Auto-pauses when hourly token budget is reached and auto-resumes cleanly next hour
 * - Auto-expands verified 50K-3M Indian seeds via Lookalike Adapter (HikerAPI / RapidAPI / SocialCrawl)
 * - Zero lost progress: every handle is persisted in PostgreSQL "CreatorHarvestQueue"
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
    autoExpandNextSeedInTree,
    enqueueSeedAndLookalikes,
    ensureHarvestQueueSchema,
    getHarvestQueueStatus,
    processHarvestQueueBatch,
} from "../server/harvest_queue";
import { getMetaTokenPool } from "../server/instagram_graph";

// Load .env into process.env
function loadDotEnv() {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
        if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    }
}

function parseArgs() {
    const args: Record<string, string> = {};
    for (const arg of process.argv.slice(2)) {
        const m = arg.match(/^--([^=]+)=(.*)$/);
        if (m) args[m[1]] = m[2];
        else if (arg.startsWith("--")) args[arg.slice(2)] = "true";
    }
    return args;
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    loadDotEnv();
    const args = parseArgs();
    const maxToProcess = args.max ? parseInt(args.max, 10) : Infinity;
    const batchSize = Math.min(Math.max(parseInt(args.batch || "5", 10), 1), 10);
    const seedArg = args.seed || "";
    const categoryArg = args.category || undefined;
    const autoExpand = args.autoExpand !== "false";

    await ensureHarvestQueueSchema();

    const tokenPool = getMetaTokenPool();
    const safeHourlyBudget = Math.max(1, tokenPool.length) * 180; // 180/hr per free Meta token = 4,320/day per token
    console.log("==============================================================");
    console.log("  TBM 24/7 BFS CREATOR TREE HARVESTER WORKER");
    console.log(`  Active Meta IG_ACCESS_TOKENs : ${tokenPool.length} (Safe Capacity: ${safeHourlyBudget}/hr | ${safeHourlyBudget * 24}/day)`);
    console.log(`  Batch Size                   : ${batchSize}`);
    console.log(`  Max Creators This Run        : ${maxToProcess === Infinity ? "Unlimited (24/7 Daemon)" : maxToProcess}`);
    console.log("==============================================================\n");

    // Optional initial seed(s) passed via --seed="url1,url2"
    if (seedArg) {
        const seeds = seedArg.split(",").map((s) => s.trim()).filter(Boolean);
        for (const s of seeds) {
            console.log(`[Seed] Expanding lookalike tree for: ${s}`);
            const enq = await enqueueSeedAndLookalikes(s, { targetCategory: categoryArg });
            console.log(`[Seed] ${enq.seedHandle} (${enq.provider}) -> discovered ${enq.totalDiscovered}, newly queued ${enq.newlyQueued}`);
        }
    }

    let totalProcessedThisRun = 0;
    let totalStoredThisRun = 0;
    let totalEmailThisRun = 0;
    let processedInCurrentHour = 0;
    let hourWindowStart = Date.now();

    while (totalProcessedThisRun < maxToProcess) {
        // 1. Reset hourly Meta rate-limit window if 60 minutes elapsed
        const elapsedSinceHourStart = Date.now() - hourWindowStart;
        if (elapsedSinceHourStart >= 60 * 60 * 1000) {
            hourWindowStart = Date.now();
            processedInCurrentHour = 0;
        }

        // 2. If hourly free Meta token budget is reached, sleep cleanly until next hour
        if (processedInCurrentHour >= safeHourlyBudget) {
            const waitMs = Math.max(60_000, 60 * 60 * 1000 - elapsedSinceHourStart + 15_000);
            console.log(`[RateGuard] Reached safe hourly Meta limit (${processedInCurrentHour}/${safeHourlyBudget}). Sleeping ${Math.round(waitMs / 60000)} min until next window...`);
            await sleep(waitMs);
            hourWindowStart = Date.now();
            processedInCurrentHour = 0;
            continue;
        }

        // 3. Check queue depth — auto-expand next verified 50K-3M Indian seed if pending < 25
        const status = await getHarvestQueueStatus();
        if (status.pending < 25 && autoExpand) {
            console.log(`[TreeExpand] Queue low (${status.pending} pending). Expanding next verified Indian seed (50K–3M)...`);
            const exp = await autoExpandNextSeedInTree({ category: categoryArg });
            if (exp.expanded) {
                console.log(`[TreeExpand] Expanded ${exp.seedHandle} via ${exp.provider} -> +${exp.newlyQueued} new PENDING handles`);
            } else {
                console.log(`[TreeExpand] No more unexpanded seeds found. Sleeping 5 minutes...`);
                await sleep(5 * 60 * 1000);
                continue;
            }
        }

        // 4. Process next micro-batch
        const remainingAllowed = Math.min(batchSize, maxToProcess - totalProcessedThisRun, safeHourlyBudget - processedInCurrentHour);
        const batchRes = await processHarvestQueueBatch({ batchSize: remainingAllowed });

        if (batchRes.processed === 0) {
            console.log(`[Idle] No PENDING items in queue. Sleeping 30s...`);
            await sleep(30_000);
            continue;
        }

        totalProcessedThisRun += batchRes.processed;
        totalStoredThisRun += batchRes.stored;
        totalEmailThisRun += batchRes.withEmail;
        processedInCurrentHour += batchRes.processed;

        console.log(
            `[Batch] Processed: ${batchRes.processed} | Stored: ${batchRes.stored} | Emails: ${batchRes.withEmail} | Skipped: ${batchRes.skipped} | ` +
            `Run Total: ${totalStoredThisRun} stored (${totalEmailThisRun} emails) | Hour Budget: ${processedInCurrentHour}/${safeHourlyBudget}`
        );

        // Gentle 1.5s spacing between batches
        await sleep(1500);
    }

    console.log(`\n=== WORKER COMPLETE: Stored ${totalStoredThisRun} creators (${totalEmailThisRun} with verified emails) ===`);
    process.exit(0);
}

main().catch((err) => {
    console.error("[HarvestWorker Fatal]:", err);
    process.exit(1);
});
