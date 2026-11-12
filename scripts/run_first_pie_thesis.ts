/**
 * scripts/run_first_pie_thesis.ts
 * 
 * Runs the complete PIE Gap Engine (Layer 4) on The Whole Truth Foods (food_beverages)
 * on Replica 3 to produce the FIRST grounded, cited PartnershipThesis.
 */

import { generateThesisForBrand } from '../server/automation/brain/pie/gapEngine';
import { closeBrainDb, db } from '../server/db';

async function main() {
  const brandId = process.argv[2] || 'cmu3ti3fb01izicgossall46w';
  console.log(`\n============================================================`);
  console.log(`Generating First PIE Grounded Thesis on Replica 3`);
  console.log(`Brand: The Whole Truth Foods (${brandId})`);
  console.log(`============================================================\n`);

  const result = await generateThesisForBrand(brandId);
  console.log('Thesis Generation Outcome:');
  console.log(`  - Brand ID: ${result.brandId}`);
  console.log(`  - Reason / Status: ${result.reason || 'SUCCESS'}`);
  console.log(`  - Valid Grounded Gaps Emitted: ${result.validGaps.length}`);
  console.log(`  - Withheld Gaps: ${result.withheldCount}`);

  if (result.thesis) {
    console.log(`\n[THESIS SUMMARY]`);
    console.log(`  Thesis ID: ${result.thesis.id}`);
    console.log(`  Fit Score: ${result.thesis.fitScore}`);
    console.log(`  Tier: ${result.thesis.tier}`);
    console.log(`  Recommended Motion: ${result.thesis.recommendedMotion}`);
    console.log(`  Owner Approved: ${result.thesis.ownerApproved} (HARD GATE INTACT)`);
    console.log(`  Ranked Gap IDs:`, result.thesis.rankedGapIds);

    console.log(`\n[EMITTED GROUNDED GAPS]`);
    for (const g of result.validGaps) {
      console.log(`\n--- Gap #${g.rankInThesis || 1} [Dimension: ${g.benchmarkDim}] ---`);
      console.log(`  Observation: "${g.observation}"`);
      console.log(`  Citation Source: ${g.observationSource}`);
      console.log(`  Benchmark Pattern: "${g.benchmarkValue}"`);
      console.log(`  Implied Problem: "${g.impliedProblem}"`);
      console.log(`  Business Impact: "${g.businessImpact}"`);
      console.log(`  Capability ID: ${g.capabilityId}`);
      console.log(`  Proof ID: ${g.proofId}`);
      console.log(`  Severity: ${g.severity} | Confidence: ${g.confidence}`);
    }
  }

  console.log(`\n============================================================`);
  console.log(`First PIE Thesis generated! Reviewable at: http://localhost:5173/app/brain/theses`);
  console.log(`============================================================\n`);

  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('Failed to generate thesis:', e);
  await closeBrainDb();
  process.exit(1);
});
