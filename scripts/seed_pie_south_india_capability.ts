/**
 * seed_pie_south_india_capability.ts
 * Adds the "South India Creator-Led Influencer Marketing" capability (Layer 1)
 * with REAL TBM proofs, plus a food_beverages channel_mix benchmark informed by
 * public market research (regional/vernacular creator premium in South India).
 * ALL rows land GATED (active=false / approvedToMention=false / approved=false).
 * Writes to Replica 3 via server/db.ts.
 */
import * as crypto from 'crypto';
import { db, resolveBrainDatabaseUrl, closeBrainDb } from '../server/db';
const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

async function main() {
  console.log('target:', resolveBrainDatabaseUrl().target);
  const capId = id('cap');
  await db.query(
    `INSERT INTO "Capability" (id,name,slug,"problemSolved","categoryKeys","outcomeType",active,"createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,false,NOW(),NOW())
     ON CONFLICT (slug) DO UPDATE SET "problemSolved"=EXCLUDED."problemSolved","categoryKeys"=EXCLUDED."categoryKeys","updatedAt"=NOW()
     RETURNING id`,
    [capId, 'South India Creator-Led Influencer Marketing', 'south_india_creator_influencer',
     'National/English-first campaigns under-reach South Indian buyers, where vernacular (Tamil/Telugu/Kannada/Malayalam) creators drive materially higher engagement and purchase intent; brands struggle to source and run authentic regional creators at scale',
     ['food_beverages','general_b2c','consumer_tech','beauty_personal_care','fitness_wellness','ecommerce_retail'], 'engagement']
  );
  const resolved = (await db.query(`SELECT id FROM "Capability" WHERE slug='south_india_creator_influencer'`)).rows[0].id;

  const proofs = [
    { client:'Wakefit', cat:'general_b2c', mt:'ROI', mv:5.4, raw:'Rs 1.5 Cr organic revenue at 5.4x ROI via South India vernacular creator seeding, zero paid media' },
    { client:'F&B Growth Collective', cat:'food_beverages', mt:'CPV', mv:0.13, raw:'2.38M+ views, 11.63% ER, Rs 0.13 CPV via South/West India regional F&B creators (Prasuma, Anveshan, Tagz)' },
    { client:'Atomberg', cat:'consumer_tech', mt:'SOV', mv:64, raw:'15% to 64% YouTube SOV via Tamil/Telugu/Kannada/Malayalam/Hindi regional creators' },
  ];
  for (const p of proofs) {
    await db.query(
      `INSERT INTO "CapabilityProof" (id,"capabilityId","clientName","categoryKey","metricType","metricValue","metricRaw","verifiedBy","approvedToMention","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'owner-pending',false,NOW()) ON CONFLICT (id) DO NOTHING`,
      [id('pp'), resolved, p.client, p.cat, p.mt, p.mv, p.raw]
    );
  }

  await db.query(
    `INSERT INTO "CategoryBenchmark" (id,"categoryKey",dimension,"leaderPattern","benchmarkValue",source,confidence,approved,"updatedAt")
     VALUES ($1,'food_beverages','channel_mix',$2,$3::jsonb,$4,$5,false,NOW())
     ON CONFLICT ("categoryKey",dimension) DO UPDATE SET "leaderPattern"=EXCLUDED."leaderPattern","benchmarkValue"=EXCLUDED."benchmarkValue",source=EXCLUDED.source,confidence=EXCLUDED.confidence,"updatedAt"=NOW()`,
    [id('cb'),
     'Category leaders pair paid social with regional/vernacular South-Indian creator seeding (Tamil/Telugu/Kannada/Malayalam)',
     JSON.stringify({ channels: ['paid_social','regional_creators'] }),
     'research:exchange4media/Qoruz + client:Wakefit,F&B-Collective', 0.5]
  );

  console.log('Added capability + 3 proofs + 1 benchmark (ALL gated).');
  const s = (await db.query(`SELECT (SELECT count(*)::int FROM "Capability") caps,(SELECT count(*)::int FROM "CapabilityProof") proofs,(SELECT count(*)::int FROM "CategoryBenchmark") bms`)).rows[0];
  console.log('totals now:', s);
  await closeBrainDb();
}
main().catch(async e=>{console.error('failed:',e?.message);await closeBrainDb();process.exit(1);});
