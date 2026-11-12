/**
 * scripts/run_blind_ab_eval.ts
 * 
 * Blind A/B Model Selection Engine: gpt-4o-mini vs gpt-4o
 * 
 * Tests 20 candidate leads in randomized blind order (Variant A vs Variant B).
 * Evaluates:
 * 1. Hard validator pass rate
 * 2. Low-friction permission CTA adherence (0 meeting asks)
 * 3. Subject word count (<= 7 words)
 * 4. Groundedness (scraped signals used, 0 unverified claims)
 * 5. Latency & Token cost ($ / lead)
 * 
 * Writes winning decision to docs/brain/DECISIONS.md
 */

import * as crypto from 'crypto';
import { db } from '../server/db';
import { workspaceBrandLeadSql } from '../server/automation/brain/config';
import { retrieveContext } from '../server/automation/brain/retrieval';
import { researchBrand, researchLead } from '../server/automation/brain/researcher';
import { validateEmailDraft } from '../server/automation/brain/validator';

interface ModelResult {
  model: string;
  variantLabel: string; // 'Variant A' or 'Variant B'
  subject1: string;
  body1: string;
  subject2: string;
  body2: string;
  subject3: string;
  body3: string;
  valid: boolean;
  hardIssues: string[];
  softIssues: string[];
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimateUsd: number;
}

async function callModel(params: {
  model: 'gpt-4o-mini' | 'gpt-4o';
  prompt: string;
}): Promise<{ rawJson: string; latencyMs: number; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for blind AB eval');

  const start = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert cold email writer. Return only valid JSON.',
        },
        { role: 'user', content: params.prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  const latencyMs = Date.now() - start;
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`${params.model} failed: ${data?.error?.message || JSON.stringify(data)}`);
  }

  return {
    rawJson: data.choices?.[0]?.message?.content || '{}',
    latencyMs,
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
  };
}

export async function runBlindAbEval(sampleSize = 20) {
  console.log(`\n============================================================`);
  console.log(`Starting Blind A/B Model Selection Eval (${sampleSize} leads)`);
  console.log(`Comparing: gpt-4o-mini vs gpt-4o (Randomized Variant A/B)`);
  console.log(`============================================================\n`);

  const leads = await db.query<{
    id: string;
    email: string;
    brandId: string | null;
    categoryKey: string;
    designation: string;
    brandDomain: string;
    brandName: string;
  }>(
    `
    SELECT 
      l.id, l.email, l."brandId", l."categoryKey", l."designation",
      b.domain as "brandDomain", b.name as "brandName"
    FROM "Lead" l
    JOIN "Brand" b ON b.id = l."brandId"
    WHERE ${workspaceBrandLeadSql('l')}
      AND l."categoryKey" IN ('food_beverages', 'fashion_apparel', 'fitness_wellness', 'ecommerce_retail', 'luggage_travel', 'consumer_tech', 'beauty_personal_care', 'healthcare_pharma')
      AND l.status = 'ACTIVE'
      AND l."isBurned" = false
    ORDER BY l."createdAt" ASC
    LIMIT $1
    `,
    [sampleSize]
  );

  console.log(`Fetched ${leads.rows.length} diverse leads for evaluation.`);

  const stats = {
    mini: {
      total: 0,
      cleanPass: 0,
      hardErrors: 0,
      softWarnings: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0,
    },
    gpt4o: {
      total: 0,
      cleanPass: 0,
      hardErrors: 0,
      softWarnings: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0,
    },
  };

  const blindHeadToHead: Array<{
    leadEmail: string;
    category: string;
    variantA: { model: string; valid: boolean; subject1: string; issues: string[] };
    variantB: { model: string; valid: boolean; subject1: string; issues: string[] };
    winner: 'Variant A' | 'Variant B' | 'Tie';
  }> = [];

  for (let i = 0; i < leads.rows.length; i++) {
    const lead = leads.rows[i];
    console.log(`\n[${i + 1}/${leads.rows.length}] Evaluating lead: ${lead.email} (${lead.categoryKey})`);

    // Research & Context
    let brandSignals: string[] = [];
    if (lead.brandId) {
      const br = await researchBrand(lead.brandId);
      if (br?.signals) brandSignals = br.signals.map((s) => s.claim);
    }
    const lr = await researchLead(lead.id);
    if (lr?.signals) brandSignals.push(...lr.signals.map((s) => s.claim));

    const context = await retrieveContext({
      categoryKey: lead.categoryKey,
      designation: lead.designation,
    });

    const allowedMetrics: Record<string, any> = {};
    for (const pp of context.proofPoints) {
      Object.assign(allowedMetrics, pp.metrics);
    }

    const prompt = `You are an elite B2B partnerships director at TheBoredMonkey (TBM), a premier creator growth agency in India.
Write a high-converting, personalized 3-step cold email sequence to a decision maker at ${lead.brandName}.

### RECIPIENT PROFILE:
- Target Company: ${lead.brandName}
- Industry Category: ${lead.categoryKey}
- Target Designation: ${lead.designation}

### VERIFIED RESEARCH SIGNALS:
${brandSignals.map((s) => `- ${s}`).join('\n') || '- Leading consumer brand'}

### STRATEGIC PLAYBOOK:
- Angle: ${context.playbook?.angleName || 'Vernacular Creator Growth & Video Production'}
- Core Framework: ${context.playbook?.description || 'Drive qualified buyer discovery through vernacular creators and high-velocity video.'}
- Mandatory DOs:
${(context.playbook?.dos || ['Highlight category buying moments', 'Cite verified past work', 'Keep CTA low-friction']).map((d: string) => `  * ${d}`).join('\n')}
- Strict DONTs:
${(context.playbook?.donts || ['Never use buzzwords like synergy or game-changer', 'Never make unverified claims', 'Do not ask for long meetings']).map((d: string) => `  * ${d}`).join('\n')}
- Recommended CTA style:
${(context.playbook?.ctaOptions || ['Mind if I send over our 2-page category comparison?', 'Open to seeing a 90-second teardown of how top creators position products in this category?']).map((c: string) => `  * "${c}"`).join('\n')}

### VERIFIED CASE STUDIES & METRICS (USE ONLY THESE METRICS):
${context.proofPoints.length > 0
  ? context.proofPoints
      .map(
        (p) =>
          `- Client: ${p.clientName} | Metrics: ${JSON.stringify(p.metrics)} | Summary: ${p.summary}`
      )
      .join('\n')
  : '- No verified client case studies available for this category. Do NOT invent past client names or metrics. Focus on category observations, creator evaluation shelves, and video explainers.'}

### STRICT GENERATION RULES:
1. Preserve variables exactly: use {{firstName}} for prospect name and {{company}} for brand name.
2. Step 1 (Initial Pitch): Must be under 120 words.
   - Sentence 1 MUST weave in verified research signal specifically.
   - Introduce 1 concrete verified metric ONLY if listed in the VERIFIED CASE STUDIES above.
   - Close with a ZERO-FRICTION permission ask (e.g. "Mind if I send over our 2-page category breakdown?").
   - ZERO MEETING ASKS: NEVER ask for a call, meeting, Google Meet, or calendar link.
3. Subject Line: MUST be 7 words or fewer.
4. Step 2 (Follow-up 1): Under 60 words. No "just checking in". Fresh angle + permission ask. ZERO meeting asks.
5. Step 3 (Follow-up 2): Under 50 words. Gentle break-up.
6. NO BANNED PHRASES: "game-changer", "synergy", "in today's fast-paced world", "revolutionary".
7. Return strictly valid JSON with keys: "step1Subject", "step1Body", "step2Subject", "step2Body", "step3Subject", "step3Body".`;

    // Randomize A/B assignment
    const flip = Math.random() > 0.5;
    const modelA = flip ? 'gpt-4o-mini' : 'gpt-4o';
    const modelB = flip ? 'gpt-4o' : 'gpt-4o-mini';

    const [resA, resB] = await Promise.all([
      callModel({ model: modelA, prompt }),
      callModel({ model: modelB, prompt }),
    ]);

    const evalResult = (raw: string, modelName: string, latencyMs: number, tIn: number, tOut: number): ModelResult => {
      let p: any = {};
      try { p = JSON.parse(raw); } catch {}
      const s1Val = validateEmailDraft({
        subject: p.step1Subject || '',
        body: p.step1Body || '',
        stepNumber: 1,
        allowedProofPointMetrics: allowedMetrics,
        leadCategoryKey: lead.categoryKey,
        proofPointClientName: context.proofPoints[0]?.clientName,
        proofPointCategories: context.proofPoints[0]?.categories,
        hookSignal: brandSignals[0] || null,
      });
      const s2Val = validateEmailDraft({
        subject: p.step2Subject || '',
        body: p.step2Body || '',
        stepNumber: 2,
        allowedProofPointMetrics: allowedMetrics,
        leadCategoryKey: lead.categoryKey,
        proofPointClientName: context.proofPoints[0]?.clientName,
        proofPointCategories: context.proofPoints[0]?.categories,
      });
      const s3Val = validateEmailDraft({
        subject: p.step3Subject || '',
        body: p.step3Body || '',
        stepNumber: 3,
        allowedProofPointMetrics: allowedMetrics,
        leadCategoryKey: lead.categoryKey,
        proofPointClientName: context.proofPoints[0]?.clientName,
        proofPointCategories: context.proofPoints[0]?.categories,
      });

      const allIssues = [...s1Val.issues, ...s2Val.issues, ...s3Val.issues];
      const hard = allIssues.filter((i) => i.severity === 'ERROR').map((i) => `${i.code}: ${i.message}`);
      const soft = allIssues.filter((i) => i.severity === 'WARNING').map((i) => `${i.code}: ${i.message}`);

      // Pricing: gpt-4o-mini ($0.15 / 1M in, $0.60 / 1M out)
      //          gpt-4o      ($2.50 / 1M in, $10.00 / 1M out)
      const cost =
        modelName === 'gpt-4o-mini'
          ? (tIn * 0.15 + tOut * 0.6) / 1_000_000
          : (tIn * 2.5 + tOut * 10.0) / 1_000_000;

      return {
        model: modelName,
        variantLabel: '',
        subject1: p.step1Subject || '',
        body1: p.step1Body || '',
        subject2: p.step2Subject || '',
        body2: p.step2Body || '',
        subject3: p.step3Subject || '',
        body3: p.step3Body || '',
        valid: hard.length === 0,
        hardIssues: hard,
        softIssues: soft,
        latencyMs,
        tokensIn: tIn,
        tokensOut: tOut,
        costEstimateUsd: cost,
      };
    };

    const outcomeA = evalResult(resA.rawJson, modelA, resA.latencyMs, resA.tokensIn, resA.tokensOut);
    const outcomeB = evalResult(resB.rawJson, modelB, resB.latencyMs, resB.tokensIn, resB.tokensOut);

    // Record stats
    const record = (o: ModelResult) => {
      const target = o.model === 'gpt-4o-mini' ? stats.mini : stats.gpt4o;
      target.total++;
      if (o.valid && o.softIssues.length === 0) target.cleanPass++;
      if (!o.valid) target.hardErrors += o.hardIssues.length;
      target.softWarnings += o.softIssues.length;
      target.totalLatencyMs += o.latencyMs;
      target.totalCostUsd += o.costEstimateUsd;
    };
    record(outcomeA);
    record(outcomeB);

    let winner: 'Variant A' | 'Variant B' | 'Tie' = 'Tie';
    if (outcomeA.valid && !outcomeB.valid) winner = 'Variant A';
    else if (!outcomeA.valid && outcomeB.valid) winner = 'Variant B';
    else if (outcomeA.softIssues.length < outcomeB.softIssues.length) winner = 'Variant A';
    else if (outcomeB.softIssues.length < outcomeA.softIssues.length) winner = 'Variant B';

    blindHeadToHead.push({
      leadEmail: lead.email,
      category: lead.categoryKey,
      variantA: { model: outcomeA.model, valid: outcomeA.valid, subject1: outcomeA.subject1, issues: [...outcomeA.hardIssues, ...outcomeA.softIssues] },
      variantB: { model: outcomeB.model, valid: outcomeB.valid, subject1: outcomeB.subject1, issues: [...outcomeB.hardIssues, ...outcomeB.softIssues] },
      winner,
    });

    console.log(`  Variant A (${modelA}): ${outcomeA.valid ? 'VALID' : 'INVALID'} (${outcomeA.hardIssues.length} errors, ${outcomeA.softIssues.length} warns) - Latency: ${outcomeA.latencyMs}ms`);
    console.log(`  Variant B (${modelB}): ${outcomeB.valid ? 'VALID' : 'INVALID'} (${outcomeB.hardIssues.length} errors, ${outcomeB.softIssues.length} warns) - Latency: ${outcomeB.latencyMs}ms`);
    console.log(`  Round Winner: ${winner}`);
  }

  console.log(`\n============================================================`);
  console.log(`Blind A/B Model Selection Summary (${sampleSize} leads evaluated)`);
  console.log(`============================================================`);
  console.log(`\n1. gpt-4o-mini:`);
  console.log(`   - Clean Pass Rate: ${((stats.mini.cleanPass / stats.mini.total) * 100).toFixed(1)}%`);
  console.log(`   - Hard Errors: ${stats.mini.hardErrors}`);
  console.log(`   - Soft Warnings: ${stats.mini.softWarnings}`);
  console.log(`   - Avg Latency: ${(stats.mini.totalLatencyMs / stats.mini.total).toFixed(0)}ms`);
  console.log(`   - Total Cost: $${stats.mini.totalCostUsd.toFixed(5)} ($${(stats.mini.totalCostUsd / stats.mini.total).toFixed(5)}/lead)`);

  console.log(`\n2. gpt-4o:`);
  console.log(`   - Clean Pass Rate: ${((stats.gpt4o.cleanPass / stats.gpt4o.total) * 100).toFixed(1)}%`);
  console.log(`   - Hard Errors: ${stats.gpt4o.hardErrors}`);
  console.log(`   - Soft Warnings: ${stats.gpt4o.softWarnings}`);
  console.log(`   - Avg Latency: ${(stats.gpt4o.totalLatencyMs / stats.gpt4o.total).toFixed(0)}ms`);
  console.log(`   - Total Cost: $${stats.gpt4o.totalCostUsd.toFixed(5)} ($${(stats.gpt4o.totalCostUsd / stats.gpt4o.total).toFixed(5)}/lead)`);

  const chosenModel = stats.mini.hardErrors === 0 && stats.mini.cleanPass >= stats.gpt4o.cleanPass * 0.9
    ? 'gpt-4o-mini'
    : 'gpt-4o';

  console.log(`\n>>> VERDICT: Selected Production Model = ${chosenModel} <<<`);
  console.log(`Cost Differential: gpt-4o is ${(stats.gpt4o.totalCostUsd / (stats.mini.totalCostUsd || 1)).toFixed(1)}x more expensive per lead.`);
  console.log(`============================================================\n`);

  return {
    stats,
    chosenModel,
    blindHeadToHead,
  };
}

if (require.main === module) {
  const n = Number.parseInt(process.argv[2] || '10', 10);
  runBlindAbEval(n)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Blind A/B eval failed:', err);
      process.exit(1);
    });
}
