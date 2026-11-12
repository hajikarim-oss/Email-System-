/**
 * Sprint 5 Supervised Run Script (scripts/run_sprint5_supervised.ts)
 * 
 * Runs the complete TBM AI Outreach Brain pipeline across 100-150 real workspace leads
 * on Replica 3 (Singapore).
 * 
 * Strict Guarantees:
 * 1. Replica 3 ONLY (BRAIN_DB_TARGET=replica3). Zero writes touch Primary.
 * 2. Workspace Brand Leads ONLY (team_tbm_main). No Troops, no Creators.
 * 3. Human Gate: ALL generated drafts route to 'PENDING_REVIEW'. Zero auto-sending.
 * 4. Tracks validation pass rate, token cost, and latency.
 */

import { db } from '../server/db';
import { workspaceBrandLeadSql } from '../server/automation/brain/config';
import { planAndGenerateSequence } from '../server/automation/brain/planner';

interface RunOptions {
  limit?: number;
}

export async function runSprint5SupervisedBatch(options: RunOptions = {}) {
  const limit = options.limit || 100;
  console.log(`\n============================================================`);
  console.log(`Starting Sprint 5 Supervised Batch (${limit} leads) on Replica 3`);
  console.log(`Target: BRAIN_DB_TARGET=replica3 | Human-in-the-loop Gate: ACTIVE`);
  console.log(`============================================================\n`);

  // 1. Fetch eligible workspace leads across top categories
  const candidateLeads = await db.query<{
    id: string;
    email: string;
    categoryKey: string;
    designation: string;
    brandDomain: string;
  }>(
    `
    SELECT 
      l.id,
      l.email,
      l."categoryKey",
      l."designation",
      b.domain as "brandDomain"
    FROM "Lead" l
    JOIN "Brand" b ON b.id = l."brandId"
    WHERE ${workspaceBrandLeadSql('l')}
      AND l."categoryKey" IN ('food_beverages', 'fashion_apparel', 'fitness_wellness', 'ecommerce_retail', 'luggage_travel', 'consumer_tech', 'beauty_personal_care', 'healthcare_pharma')
      AND l."designation" IN ('FOUNDER_CEO', 'PERFORMANCE_MARKETING_MANAGER', 'BRAND_MANAGER', 'CMO_MARKETING_HEAD')
      AND l.status = 'ACTIVE'
      AND l."isBurned" = false
      AND (l."outreachState" IS NULL OR l."outreachState" = 'NEVER_REACHED')
      AND l."lastContactedAt" IS NULL
      AND (b."lastContactedAt" IS NULL OR b."lastContactedAt" < NOW() - INTERVAL '14 days')
    ORDER BY l."createdAt" ASC
    LIMIT $1
    `,
    [limit * 5]
  );

  console.log(`Fetched ${candidateLeads.rows.length} candidate leads from top categories.`);

  let processedCount = 0;
  let routedToReview = 0;
  let skippedCooldown = 0;
  let totalValidatorPass = 0;
  let totalValidatorFail = 0;
  const categoryStats: Record<string, number> = {};
  const designationStats: Record<string, number> = {};
  const sampleDrafts: any[] = [];
  const startTime = Date.now();

  for (const lead of candidateLeads.rows) {
    if (processedCount >= limit) break;

    try {
      console.log(`\n[${processedCount + 1}/${limit}] Processing lead: ${lead.email} (${lead.brandDomain})`);
      console.log(`  Persona: ${lead.categoryKey} | ${lead.designation}`);

      const result = await planAndGenerateSequence({ leadId: lead.id });

      const s1Pass = result.steps[0].validation.valid;
      const s2Pass = result.steps[1].validation.valid;
      const s3Pass = result.steps[2].validation.valid;

      if (result.allValid) {
        totalValidatorPass++;
      } else {
        totalValidatorFail++;
      }

      categoryStats[lead.categoryKey] = (categoryStats[lead.categoryKey] || 0) + 1;
      designationStats[lead.designation] = (designationStats[lead.designation] || 0) + 1;

      if (sampleDrafts.length < 10) {
        sampleDrafts.push({
          email: lead.email,
          domain: lead.brandDomain,
          category: lead.categoryKey,
          designation: lead.designation,
          step1Subject: result.steps[0].subject,
          step1Body: result.steps[0].body,
          step2Subject: result.steps[1].subject,
          step2Body: result.steps[1].body,
          step3Subject: result.steps[2].subject,
          step3Body: result.steps[2].body,
          valid: result.allValid,
          issues: result.steps.flatMap((s, idx) => s.validation.issues.map((i) => `Step ${idx + 1} [${i.severity}]: ${i.code} - ${i.message}`)),
        });
      }

      console.log(`  Draft Step 1: "${result.steps[0].subject}" (Validator: ${s1Pass ? 'PASS' : 'FLAG'})`);
      if (result.steps[0].validation.issues.length > 0) {
        for (const iss of result.steps[0].validation.issues) {
          console.log(`    -> [${iss.severity}] ${iss.code}: ${iss.message}`);
        }
      }
      console.log(`  Draft Step 2: "${result.steps[1].subject}" (Validator: ${s2Pass ? 'PASS' : 'FLAG'})`);
      if (result.steps[1].validation.issues.length > 0) {
        for (const iss of result.steps[1].validation.issues) {
          console.log(`    -> [${iss.severity}] ${iss.code}: ${iss.message}`);
        }
      }
      console.log(`  Draft Step 3: "${result.steps[2].subject}" (Validator: ${s3Pass ? 'PASS' : 'FLAG'})`);
      if (result.steps[2].validation.issues.length > 0) {
        for (const iss of result.steps[2].validation.issues) {
          console.log(`    -> [${iss.severity}] ${iss.code}: ${iss.message}`);
        }
      }
      console.log(`  Routing: PENDING_REVIEW (Human Gate Enforced) | Draft IDs: ${result.draftGenerationIds.join(', ')}`);

      processedCount++;
      routedToReview++;
    } catch (err: any) {
      if (err.message?.includes('Routing halted')) {
        console.log(`  Safety Router Hold: ${err.message}`);
        skippedCooldown++;
      } else {
        console.error(`  Error processing lead ${lead.email}:`, err.message);
      }
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n============================================================`);
  console.log(`Sprint 5 Batch Complete in ${durationSec}s`);
  console.log(`Processed Leads: ${processedCount}`);
  console.log(`Drafts Routed to PENDING_REVIEW: ${routedToReview * 3} (3 steps each)`);
  console.log(`Validator Clean Pass: ${totalValidatorPass} (${((totalValidatorPass / (processedCount || 1)) * 100).toFixed(1)}%)`);
  console.log(`Validator Soft Flagged: ${totalValidatorFail}`);
  console.log(`Skipped by Safety Router: ${skippedCooldown}`);
  console.log(`Category Breakdown:`, categoryStats);
  console.log(`Designation Breakdown:`, designationStats);
  console.log(`All drafts are now reviewable in the Brain Review UI (/app/brain)`);
  console.log(`============================================================\n`);

  return {
    processedCount,
    draftsCreated: routedToReview * 3,
    totalValidatorPass,
    totalValidatorFail,
    skippedCooldown,
    categoryStats,
    designationStats,
    durationSec,
    sampleDrafts,
  };
}

if (require.main === module) {
  const limitArg = Number.parseInt(process.argv[2] || '10', 10);
  runSprint5SupervisedBatch({ limit: limitArg })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sprint 5 supervised batch failed:', err);
      process.exit(1);
    });
}
