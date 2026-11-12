/**
 * scripts/freeze_eval_cases.ts
 * 
 * Freezes 100 diverse, high-quality, category-aligned baseline evaluation cases
 * into the EvalCase table on Replica 3.
 * 
 * Each EvalCase contains:
 * - id: eval_case_<id>
 * - leadSnapshot: JSON snapshot of the lead, brand, research signals, category, and designation
 * - approvedEmail: JSON snapshot of the verified draft (Step 1/2/3 subject & body)
 * - tags: ['sprint5_baseline', categoryKey, designation]
 */

import { db } from '../server/db';
import { validateEmailDraft } from '../server/automation/brain/validator';

export async function freezeEvalCases(targetCount = 100) {
  console.log(`\n============================================================`);
  console.log(`Freezing ${targetCount} Baseline EvalCases into Replica 3`);
  console.log(`============================================================\n`);

  // Clear existing baseline if re-running
  await db.query(`DELETE FROM "EvalCase" WHERE tags @> ARRAY['sprint5_baseline']::text[]`);

  // Fetch valid, high-quality DraftGenerations across categories
  const drafts = await db.query<{
    id: string;
    leadId: string;
    leadEmail: string;
    sequenceStep: number;
    categoryKey: string;
    designation: string;
    subject: string;
    body: string;
    hardViolations: any;
    softViolations: any;
    companyName: string;
    brandTier: string;
  }>(
    `
    SELECT DISTINCT ON (dg."leadId", dg."sequenceStep")
      dg.id,
      dg."leadId",
      dg."leadEmail",
      dg."sequenceStep",
      dg."categoryKey",
      dg.designation,
      dg.subject,
      dg.body,
      dg."hardViolations",
      dg."softViolations",
      COALESCE(l."customData"->>'company', b.name, 'the brand') as "companyName",
      COALESCE(b.tier, 'GROWTH') as "brandTier"
    FROM "DraftGeneration" dg
    JOIN "Lead" l ON l.id = dg."leadId"
    LEFT JOIN "Brand" b ON b.id = l."brandId"
    WHERE dg."validatorPass" = true
      AND (dg."hardViolations" IS NULL OR dg."hardViolations" = '[]'::jsonb)
      AND dg.subject IS NOT NULL
      AND dg.body IS NOT NULL
      AND dg.body NOT ILIKE '%meet%'
      AND dg.body NOT ILIKE '%call%'
      AND dg.body NOT ILIKE '%15-min%'
    ORDER BY dg."leadId", dg."sequenceStep", dg."createdAt" DESC
    LIMIT $1
    `,
    [targetCount * 2]
  );

  console.log(`Found ${drafts.rows.length} valid draft steps from DraftGeneration.`);

  let inserted = 0;
  for (const d of drafts.rows) {
    if (inserted >= targetCount) break;

    // Strict validator check to ensure 100% clean baseline
    const val = validateEmailDraft({
      subject: d.subject || '',
      body: d.body || '',
      stepNumber: d.sequenceStep,
      leadCategoryKey: d.categoryKey,
    });
    if (!val.valid) continue;

    const evalCaseId = `ec_${d.id.replace('dg_', '')}`;
    const leadSnapshot = {
      leadId: d.leadId,
      email: d.leadEmail,
      categoryKey: d.categoryKey,
      designation: d.designation,
      companyName: d.companyName,
      brandTier: d.brandTier,
      frozenAt: new Date().toISOString(),
    };

    const approvedEmail = {
      step: d.sequenceStep,
      subject: d.subject,
      body: d.body,
    };

    const tags = ['sprint5_baseline', d.categoryKey, d.designation, `step_${d.sequenceStep}`];

    await db.query(
      `
      INSERT INTO "EvalCase" (id, "leadSnapshot", "approvedEmail", tags, "createdAt")
      VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
      `,
      [evalCaseId, JSON.stringify(leadSnapshot), JSON.stringify(approvedEmail), tags]
    );

    inserted++;
  }

  console.log(`Successfully froze ${inserted} EvalCase records into Replica 3.`);
  console.log(`============================================================\n`);

  return inserted;
}

if (require.main === module) {
  freezeEvalCases(100)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Freeze eval cases failed:', err);
      process.exit(1);
    });
}
