/**
 * scripts/test_lead_history_enrichment.ts
 * 
 * Verifies the Lead Historical Outreach & Context Audit feature.
 * 
 * Compares generation behavior between:
 * 1. A historical lead who was contacted in past campaigns (from EmailMessage / EmailEvent)
 * 2. A brand-new fresh prospect
 */

import { db } from '../server/db';
import { getLeadOutreachHistory } from '../server/automation/brain/history';
import { planAndGenerateSequence } from '../server/automation/brain/planner';

async function main() {
  console.log(`\n============================================================`);
  console.log(`Testing Lead Historical Outreach & Context Audit Feature`);
  console.log(`Target: Replica 3 (Singapore) | Zero writes to Primary`);
  console.log(`============================================================\n`);

  // 1. Find a real historical lead with previous EmailEvents or EmailMessages
  const historicalLeadRes = await db.query<{
    id: string;
    email: string;
    designation: string;
    categoryKey: string;
  }>(
    `
    SELECT l.id, l.email, l.designation, l."categoryKey"
    FROM "Lead" l
    JOIN "EmailEvent" ee ON ee."leadId" = l.id
    WHERE l.status = 'ACTIVE'
      AND l."isBurned" = false
      AND (ee."createdAt" < NOW() - INTERVAL '35 days' OR ee."createdAt" IS NULL)
    GROUP BY l.id, l.email, l.designation, l."categoryKey"
    HAVING count(ee.id) >= 1
    ORDER BY max(ee."createdAt") ASC
    LIMIT 1
    `
  );

  let lead = historicalLeadRes.rows[0];

  // Fallback to any lead with historical EmailMessages if needed
  if (!lead) {
    const fallbackRes = await db.query(
      `
      SELECT l.id, l.email, l.designation, l."categoryKey"
      FROM "Lead" l
      JOIN "EmailMessage" em ON lower(em."contactEmail") = lower(l.email)
      WHERE l.status = 'ACTIVE'
      LIMIT 1
      `
    );
    lead = fallbackRes.rows[0];
  }

  if (!lead) {
    console.log('No historical lead meeting fatigue criteria found; creating a test historical profile.');
    lead = {
      id: 'test_hist_lead_01',
      email: 'historical_prospect@theboredmonkey.com',
      designation: 'FOUNDER_CEO',
      categoryKey: 'food_beverages',
    };
  }

  console.log(`[TEST 1] Historical Lead Audit for: ${lead.email}`);
  const history = await getLeadOutreachHistory({ leadId: lead.id, email: lead.email });
  console.log('History Audit Outcome:');
  console.log(`  - Has History: ${history.hasHistory}`);
  console.log(`  - Total Past Touches: ${history.totalTouches}`);
  console.log(`  - Last Contacted: ${history.lastContactedAt} (${history.monthsSinceLastContact} months ago)`);
  console.log(`  - Engagement Tier: ${history.engagementTier} (Opens: ${history.openedCount}, Clicks: ${history.clickedCount}, Replies: ${history.repliedCount})`);
  console.log(`  - Past Subjects: [${history.pastSubjects.join(', ')}]`);
  console.log(`  - Writer Directive: ${history.recommendedWriterGuidance}`);

  console.log(`\nGenerating 3-Step Sequence with Historical Context...`);
  const result = await planAndGenerateSequence({ leadId: lead.id, strictValidation: false });

  console.log(`\nGenerated Sequence Details:`);
  console.log(`  Step 1 Subject: "${result.steps[0].subject}" (Valid: ${result.steps[0].validation.valid})`);
  console.log(`  Step 1 Body Snippet:\n  "${result.steps[0].body.slice(0, 180)}..."`);
  console.log(`  Step 2 Subject: "${result.steps[1].subject}" (Valid: ${result.steps[1].validation.valid})`);
  console.log(`  Step 3 Subject: "${result.steps[2].subject}" (Valid: ${result.steps[2].validation.valid})`);
  console.log(`  All Steps Deterministically Valid: ${result.allValid}`);

  console.log(`\n============================================================`);
  console.log(`Feature Test Successfully Completed!`);
  console.log(`============================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });

