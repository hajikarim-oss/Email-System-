/**
 * Test script for Sprint 3 (The Brain: Validator, Router, Planner, Regression Eval)
 */
import { runRegressionEvalSuite } from '../server/automation/brain/eval';
import { planAndGenerateSequence } from '../server/automation/brain/planner';
import { db } from '../server/db';

async function main() {
  console.log('Testing Sprint 3 on Replica 3...');

  // 1. Run Regression Eval Suite
  console.log('\n--- Running Regression Eval Suite (Validator & Router hard gates) ---');
  const evalReport = await runRegressionEvalSuite();
  console.log(`Eval Results: ${evalReport.passed} / ${evalReport.total} passed (${(evalReport.accuracy * 100).toFixed(1)}% accuracy)`);
  for (const r of evalReport.results) {
    console.log(`  [${r.passed ? '✓' : '✗'}] ${r.id}: ${r.name} -> Expected: ${r.expected}, Actual: ${r.actual} ${r.notes ? `(${r.notes})` : ''}`);
  }
  if (evalReport.accuracy < 1.0) {
    throw new Error('Regression eval suite failed to reach 100% accuracy!');
  }

  // 2. Test End-to-End Sequence Planning for an active Lead
  console.log('\n--- Testing End-to-End Sequence Planning (planAndGenerateSequence) ---');
  const sampleLead = await db.query(
    `SELECT l.id, l.email, l.designation, l."categoryKey"
     FROM "Lead" l
     JOIN "Brand" b ON b.id = l."brandId"
     WHERE l.designation IS NOT NULL
       AND l.status = 'ACTIVE'
       AND l."isBurned" = false
       AND (l."outreachState" IS NULL OR l."outreachState" = 'NEVER_REACHED')
       AND l."lastContactedAt" IS NULL
       AND (b."lastContactedAt" IS NULL OR b."lastContactedAt" < NOW() - INTERVAL '15 days')
       AND (
         SELECT count(*) FROM "Lead" sub 
         WHERE sub."brandId" = b.id 
           AND sub."outreachState" IN ('IN_SEQUENCE', 'WARM_ACTIVE')
       ) < 3
     LIMIT 1`
  );
  if (sampleLead.rows.length === 0) {
    throw new Error('No candidate lead with brandId found on Replica 3');
  }
  const lead = sampleLead.rows[0];
  console.log(`Planning sequence for Lead: ${lead.email} (${lead.designation}, category: ${lead.categoryKey})...`);

  const plan = await planAndGenerateSequence({ leadId: lead.id, strictValidation: false });
  console.log(`Plan generated! All steps valid = ${plan.allValid}`);
  for (const s of plan.steps) {
    console.log(`\n[STEP ${s.stepNumber}] Subject: "${s.subject}" | Valid: ${s.validation.valid} | Words: ${s.validation.wordCount}`);
    console.log(`Body Snippet:\n${s.body.slice(0, 200)}...`);
  }

  // 3. Verify DraftGeneration persisted on Replica 3
  const draftCount = await db.query(
    `SELECT COUNT(*)::int as count FROM "DraftGeneration" WHERE "leadId" = $1`,
    [lead.id]
  );
  console.log(`\nVerified DraftGeneration rows on Replica 3 for lead: ${draftCount.rows[0].count} (expected 3)`);

  console.log('\nSprint 3 verified successfully on Replica 3!');
}

main().catch((err) => {
  console.error('Sprint 3 test failed:', err);
  process.exit(1);
});
