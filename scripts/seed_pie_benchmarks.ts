/**
 * seed_pie_benchmarks.ts
 * Phase-0 / Phase-2 head start: seed Category Benchmarks (Layer 3) for the two
 * data-richest pilot categories (food_beverages, consumer_tech), derived from
 * TBM's own best-in-category client results.
 *
 * ALL benchmarks land GATED (approved=false) — invisible to the Gap Engine until
 * the owner approves. Start with these; add more dimensions later as ChangeProposals
 * (spec Phase-2 gate: minimum 3 dimensions, 8 target, incremental).
 *
 * Writes to Replica 3 via server/db.ts. Run: npx tsx scripts/seed_pie_benchmarks.ts
 */
import { upsertBenchmark, BenchmarkSeed } from '../server/automation/brain/pie/benchmarks';
import { closeBrainDb } from '../server/db';

const SEEDS: BenchmarkSeed[] = [
  // ---- food_beverages ----
  {
    categoryKey: 'food_beverages',
    dimension: 'content_format_mix',
    leaderPattern: 'Category leaders run >=50% short-form demo/UGC video (consumption-moment led)',
    benchmarkValue: { videoShareTarget: 0.5 },
    source: 'client:F&B-Growth-Collective',
    confidence: 0.6,
  },
  {
    categoryKey: 'food_beverages',
    dimension: 'cadence',
    leaderPattern: 'Leaders publish ~8-12 creator videos/month to sustain discovery',
    benchmarkValue: { monthlyVideos: 10 },
    source: 'client:Curapod,F&B-Collective',
    confidence: 0.5,
  },
  {
    categoryKey: 'food_beverages',
    dimension: 'funnel',
    leaderPattern: 'Consumption-moment hooks (late-night, tea-time, festive) outperform ingredient/packaging shots',
    benchmarkValue: { hookStyle: 'consumption_moment' },
    source: 'client:F&B-Growth-Collective',
    confidence: 0.6,
  },
  // ---- consumer_tech ----
  {
    categoryKey: 'consumer_tech',
    dimension: 'content_format_mix',
    leaderPattern: 'Leaders maintain a YouTube evaluation-shelf presence with >=50% video',
    benchmarkValue: { videoShareTarget: 0.5 },
    source: 'client:Atomberg',
    confidence: 0.6,
  },
  {
    categoryKey: 'consumer_tech',
    dimension: 'channel_mix',
    leaderPattern: 'Vernacular YouTube SOV runs alongside Amazon/Flipkart search, not instead of it',
    benchmarkValue: { channels: ['youtube_vernacular', 'marketplace_search'] },
    source: 'client:Atomberg',
    confidence: 0.6,
  },
];

async function main() {
  let n = 0;
  for (const s of SEEDS) {
    await upsertBenchmark(s);
    n++;
  }
  console.log(`[PIE seed] Benchmarks upserted: ${n} (ALL gated: approved=false).`);
  console.log('[PIE seed] Owner approves per dimension before the Gap Engine reads them.');
  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('[PIE seed] failed:', e);
  await closeBrainDb();
  process.exit(1);
});
