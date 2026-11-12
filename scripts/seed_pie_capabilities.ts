/**
 * seed_pie_capabilities.ts
 * Phase-0 head start: load the Capability Graph (Layer 1) from the 14 mined
 * candidates in docs/brain/MINED_CANDIDATES_FOR_REVIEW.md.
 *
 * ALL rows land GATED: Capability.active=false, CapabilityProof.approvedToMention=false.
 * Nothing is visible to the Gap Engine until the owner approves in /app/brain.
 * Only proofs that satisfy the STRENGTH CONTRACT (named client + numeric metric
 * + categoryKey) are seeded; qualitative-only candidates (Streax DVC, Neeman's
 * voxpop) are intentionally skipped.
 *
 * Writes to Replica 3 via server/db.ts (BRAIN_DB_TARGET=replica3 default).
 * Run:  npx tsx scripts/seed_pie_capabilities.ts
 */
import * as crypto from 'crypto';
import { db, closeBrainDb } from '../server/db';

const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

interface ProofSeed {
  clientName: string;
  categoryKey: string;
  metricType: string;
  metricValue: number;
  metricRaw: string;
}
interface CapSeed {
  name: string;
  slug: string;
  problemSolved: string;
  categoryKeys: string[];
  outcomeType: string;
  proofs: ProofSeed[];
}

const CAPABILITIES: CapSeed[] = [
  {
    name: 'YouTube SOV Creator Seeding',
    slug: 'youtube_sov_seeding',
    problemSolved: 'Low share of voice on YouTube where buyers research product comparisons',
    categoryKeys: ['consumer_tech', 'general_b2c', 'ecommerce_retail'],
    outcomeType: 'SOV',
    proofs: [
      { clientName: 'Atomberg', categoryKey: 'consumer_tech', metricType: 'SOV', metricValue: 64, metricRaw: '15% to 64% YouTube SOV (100M+ views, 6x return)' },
      { clientName: 'Wakefit', categoryKey: 'general_b2c', metricType: 'ROI', metricValue: 5.4, metricRaw: 'Rs 1.5 Cr organic revenue at 5.4x ROI, zero paid media' },
    ],
  },
  {
    name: 'Short-Form Performance Video',
    slug: 'short_form_perf_video',
    problemSolved: 'Static-only creative underperforms on CPV and top-funnel reach',
    categoryKeys: ['fitness_wellness', 'food_beverages', 'beauty_personal_care', 'luggage_travel', 'consumer_tech', 'general_b2c', 'healthcare_pharma'],
    outcomeType: 'CPV',
    proofs: [
      { clientName: 'Setu Nutrition', categoryKey: 'fitness_wellness', metricType: 'CPV', metricValue: 0.35, metricRaw: '2.8M+ views at Rs 0.35 CPV (60% below display)' },
      { clientName: 'F&B Growth Collective', categoryKey: 'food_beverages', metricType: 'CPV', metricValue: 0.13, metricRaw: '2.38M+ views, 11.63% ER, Rs 0.13 CPV (Prasuma, Anveshan, Tagz)' },
      { clientName: 'Assembly Travel', categoryKey: 'luggage_travel', metricType: 'ROAS', metricValue: 7.58, metricRaw: '7.58x ROAS on premium luggage paid social' },
      { clientName: 'Curapod', categoryKey: 'fitness_wellness', metricType: 'videosPerMonth', metricValue: 80, metricRaw: '60-80 performance video ads per month' },
      { clientName: 'Forever 52', categoryKey: 'beauty_personal_care', metricType: 'creatives', metricValue: 12, metricRaw: '12 performance creatives across 4 angles' },
      { clientName: 'Superbottoms', categoryKey: 'general_b2c', metricType: 'creatives', metricValue: 16, metricRaw: '12-16 ad creatives/month, 6+ hook variations' },
      { clientName: 'Boult', categoryKey: 'consumer_tech', metricType: 'launches', metricValue: 3, metricRaw: '3 simultaneous audio product launches, multi-tier push' },
    ],
  },
  {
    name: 'AI Film Production (Zero Shoot Days)',
    slug: 'ai_film_production',
    problemSolved: 'Long pre-production delays, model casting costs, and vendor fragmentation',
    categoryKeys: ['beauty_personal_care', 'general_b2c'],
    outcomeType: 'speed',
    proofs: [
      { clientName: 'Eclipse Solaire', categoryKey: 'beauty_personal_care', metricType: 'films', metricValue: 3, metricRaw: '3 AI films in 15 days, zero shoot days' },
      { clientName: 'Aditya Birla Health Insurance', categoryKey: 'general_b2c', metricType: 'adsFromOneShoot', metricValue: 4, metricRaw: '4 concept films from 1 shoot day, dubbed into 6 languages' },
    ],
  },
  {
    name: 'Creator-Led Retail Activation',
    slug: 'retail_activation',
    problemSolved: 'Weak sell-in and retail distribution during peak buying windows',
    categoryKeys: ['consumer_tech', 'ecommerce_retail'],
    outcomeType: 'reach',
    proofs: [
      { clientName: 'Atomberg', categoryKey: 'consumer_tech', metricType: 'retailers', metricValue: 12000, metricRaw: '12,000+ retail store registrations via creator store-visit cuts' },
    ],
  },
];

async function main() {
  let caps = 0;
  let proofs = 0;
  for (const c of CAPABILITIES) {
    const capId = id('cap');
    const r = await db.query(
      `INSERT INTO "Capability" (id,name,slug,"problemSolved","categoryKeys","outcomeType",active,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,false,NOW(),NOW())
       ON CONFLICT (slug) DO UPDATE SET "problemSolved"=EXCLUDED."problemSolved","categoryKeys"=EXCLUDED."categoryKeys","updatedAt"=NOW()
       RETURNING id`,
      [capId, c.name, c.slug, c.problemSolved, c.categoryKeys, c.outcomeType]
    );
    const resolvedCapId = r.rows[0].id;
    caps++;
    for (const p of c.proofs) {
      await db.query(
        `INSERT INTO "CapabilityProof" (id,"capabilityId","clientName","categoryKey","metricType","metricValue","metricRaw","verifiedBy","approvedToMention","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'owner-pending',false,NOW())
         ON CONFLICT (id) DO NOTHING`,
        [id('pp'), resolvedCapId, p.clientName, p.categoryKey, p.metricType, p.metricValue, p.metricRaw]
      );
      proofs++;
    }
  }
  console.log(`[PIE seed] Capabilities upserted: ${caps}; Proofs seeded: ${proofs} (ALL gated: active=false, approvedToMention=false).`);
  console.log('[PIE seed] Owner must approve in /app/brain before the Gap Engine can use any of these.');
  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('[PIE seed] failed:', e);
  await closeBrainDb();
  process.exit(1);
});
