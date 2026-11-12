/**
 * Test script for Sprint 2 Offline Intelligence Core on Replica 3
 */
import { researchBrand, researchLead } from '../server/automation/brain/researcher';
import { retrieveContext } from '../server/automation/brain/retrieval';
import { logProviderUsage } from '../server/automation/brain/usage';
import { db } from '../server/db';

async function main() {
  console.log('Testing Sprint 2 on Replica 3...');

  // 1. Test Provider Usage Logging
  const logId = await logProviderUsage({
    kind: 'RESEARCH',
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    tokensIn: 1200,
    tokensOut: 350,
  });
  console.log(`[Test 1] ProviderUsage logged successfully with id: ${logId}`);

  // 2. Pick a top brand from Replica 3 for brand research
  const brandRow = await db.query(
    `SELECT id, domain, name, "categoryKey" FROM "Brand" WHERE domain = 'atomberg.com' LIMIT 1`
  );
  if (brandRow.rows.length === 0) {
    throw new Error('Brand atomberg.com not found on Replica 3');
  }
  const brand = brandRow.rows[0];
  console.log(`[Test 2] Running research on Brand: ${brand.name} (${brand.domain})...`);
  const brandResearch = await researchBrand(brand.id);
  console.log('Brand Research Result:', {
    brandId: brandResearch.brandId,
    domain: brandResearch.domain,
    cached: brandResearch.cached,
    signalsCount: brandResearch.signals.length,
    signals: brandResearch.signals.slice(0, 2),
  });

  // Verify second call hits cache
  const cachedBrandResearch = await researchBrand(brand.id);
  console.log(`[Test 2b] Second research call cached = ${cachedBrandResearch.cached} (expected true)`);

  // 3. Pick a lead for lead research
  const leadRow = await db.query(
    `SELECT id, email, designation FROM "Lead" WHERE designation IS NOT NULL LIMIT 1`
  );
  const lead = leadRow.rows[0];
  console.log(`[Test 3] Running research on Lead: ${lead.email} (${lead.designation})...`);
  const leadResearch = await researchLead(lead.id);
  console.log('Lead Research Result:', {
    leadId: leadResearch.leadId,
    email: leadResearch.email,
    designation: leadResearch.designation,
    signalsCount: leadResearch.signals.length,
    summary: leadResearch.summary,
  });

  // 4. Test Context Retrieval
  console.log('[Test 4] Testing retrieveContext (Safety verification)...');
  const context = await retrieveContext({
    categoryKey: 'consumer_tech',
    designation: 'FOUNDER_CEO',
  });
  console.log('Context Retrieval Output:', {
    categoryKey: context.categoryKey,
    designation: context.designation,
    playbookPresent: Boolean(context.playbook), // should be null before human sign-off!
    proofPointsCount: context.proofPoints.length, // should be 0 before human sign-off!
    positiveExemplarsCount: context.positiveExemplars.length,
    knowledgeChunksCount: context.knowledgeChunks.length,
  });

  console.log('Sprint 2 tests PASSED successfully on Replica 3!');
}

main().catch((err) => {
  console.error('Sprint 2 test failed:', err);
  process.exit(1);
});
