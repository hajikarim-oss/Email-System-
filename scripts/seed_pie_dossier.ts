/**
 * seed_pie_dossier.ts — build a BrandDossier (Layer 2) for one brand.
 * Reuses the Brain researcher for web signals; you may ALSO supply a structured
 * ad-library snapshot (owner-entered real data) so the Gap Engine has the
 * structured counts it needs — no live scraping required.
 *
 *   npx tsx scripts/seed_pie_dossier.ts <brandId>
 *   npx tsx scripts/seed_pie_dossier.ts <brandId> ./snapshot.json
 *
 * snapshot.json shape (all counts REAL, owner-verified from the ad library):
 *   {
 *     "activeCount": 10, "staticCount": 9, "videoCount": 1,
 *     "longestRunningDays": 120, "monthlyOutput": 3,
 *     "channels": ["paid_social"],
 *     "capturedFrom": "https://www.facebook.com/ads/library/?id=..."
 *   }
 *
 * Writes to Replica 3 via server/db.ts.
 */
import * as fs from 'fs';
import { buildBrandDossier } from '../server/automation/brain/pie/dossier';
import { closeBrainDb } from '../server/db';
import type { AdLibrarySnapshot } from '../server/automation/brain/pie/types';

async function main() {
  const brandId = process.argv[2];
  if (!brandId) {
    console.error('Usage: npx tsx scripts/seed_pie_dossier.ts <brandId> [snapshot.json]');
    process.exit(2);
  }

  let snapshot: AdLibrarySnapshot | undefined;
  const snapPath = process.argv[3];
  if (snapPath) {
    const raw = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    if (typeof raw.activeCount !== 'number' || typeof raw.videoCount !== 'number' || !raw.capturedFrom) {
      console.error('[PIE dossier] snapshot.json must include numeric activeCount/videoCount and a capturedFrom URL.');
      process.exit(2);
    }
    snapshot = raw as AdLibrarySnapshot;
  }

  const { dossier, completeness, cached } = await buildBrandDossier(brandId, {
    forceRefresh: true,
    adLibrarySnapshot: snapshot,
  });
  console.log(`[PIE dossier] brand=${brandId} category=${dossier.categoryKey ?? '(none)'} completeness=${completeness} cached=${cached}`);
  console.log(`[PIE dossier] adLibrarySnapshot: ${snapshot ? 'owner-supplied' : 'none (content/cadence/channel gaps will not fire)'}`);
  console.log('[PIE dossier] Next: approve capabilities/proofs/benchmarks in /app/brain/approvals, then Run Gap Engine for this brandId.');
  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('[PIE dossier] FAILED:', e?.message || e);
  await closeBrainDb();
  process.exit(1);
});
