/**
 * scripts/evalHarness.ts
 * 
 * Eval Harness for the TBM AI Outreach Brain
 * Runs automated regression benchmarking against the 100 frozen EvalCase records on Replica 3.
 */

import { db } from '../server/db';
import { validateEmailDraft, ValidationResult } from '../server/automation/brain/validator';

export async function runEvalHarness() {
  console.log(`\n============================================================`);
  console.log(`Running Eval Harness on Frozen EvalCases (Replica 3)`);
  console.log(`============================================================\n`);

  const rows = await db.query<{
    id: string;
    leadSnapshot: any;
    approvedEmail: any;
    tags: string[];
  }>(
    `
    SELECT id, "leadSnapshot", "approvedEmail", tags
    FROM "EvalCase"
    WHERE tags @> ARRAY['sprint5_baseline']::text[]
    ORDER BY "createdAt" ASC
    `
  );

  if (rows.rows.length === 0) {
    throw new Error('No frozen EvalCases found with tag sprint5_baseline.');
  }

  console.log(`Loaded ${rows.rows.length} frozen baseline cases.`);

  let totalValid = 0;
  let totalHighFrictionCtas = 0;
  let totalExceededSubjects = 0;
  let totalBannedPhrases = 0;
  let totalWordCount = 0;
  const categoryPass: Record<string, { total: number; passed: number }> = {};

  for (const c of rows.rows) {
    const snap = c.leadSnapshot;
    const email = c.approvedEmail;

    const val: ValidationResult = validateEmailDraft({
      subject: email.subject || '',
      body: email.body || '',
      stepNumber: email.step || 1,
      leadCategoryKey: snap.categoryKey,
    });

    const hasHighFrictionCta = val.issues.some((i) => i.code === 'HIGH_FRICTION_CTA_DETECTED');
    const hasSubjectOverflow = val.issues.some((i) => i.code === 'SUBJECT_EXCEEDS_WORD_COUNT');
    const hasBannedPhrase = val.issues.some((i) => i.code === 'BANNED_PHRASE_DETECTED');

    if (hasHighFrictionCta) totalHighFrictionCtas++;
    if (hasSubjectOverflow) totalExceededSubjects++;
    if (hasBannedPhrase) totalBannedPhrases++;

    if (val.valid) totalValid++;
    totalWordCount += val.wordCount;

    const cat = snap.categoryKey || 'unknown';
    if (!categoryPass[cat]) categoryPass[cat] = { total: 0, passed: 0 };
    categoryPass[cat].total++;
    if (val.valid) categoryPass[cat].passed++;
  }

  const n = rows.rows.length;
  const passRate = ((totalValid / n) * 100).toFixed(1);
  const avgWords = (totalWordCount / n).toFixed(1);

  console.log(`\n============================================================`);
  console.log(`Eval Harness Baseline Results:`);
  console.log(`============================================================`);
  console.log(`Total Cases Evaluated: ${n}`);
  console.log(`Overall Clean Pass Rate: ${passRate}% (${totalValid}/${n})`);
  console.log(`High-Friction Meeting CTAs: ${totalHighFrictionCtas} (0.0% expected)`);
  console.log(`Subject Word Count Violations (>7 words): ${totalExceededSubjects}`);
  console.log(`Banned Phrase Violations: ${totalBannedPhrases}`);
  console.log(`Average Word Count: ${avgWords} words/email`);
  console.log(`\nCategory Breakdown:`);
  for (const [cat, stat] of Object.entries(categoryPass)) {
    console.log(`  - ${cat}: ${stat.passed}/${stat.total} (${((stat.passed / stat.total) * 100).toFixed(1)}%)`);
  }
  console.log(`============================================================\n`);

  return {
    total: n,
    totalValid,
    passRate: Number.parseFloat(passRate),
    totalHighFrictionCtas,
    totalExceededSubjects,
    totalBannedPhrases,
    avgWords: Number.parseFloat(avgWords),
    categoryPass,
  };
}

if (require.main === module) {
  runEvalHarness()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Eval harness failed:', err);
      process.exit(1);
    });
}

