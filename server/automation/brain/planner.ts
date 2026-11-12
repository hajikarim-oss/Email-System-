import * as crypto from 'crypto';
import { db } from '../../db';
import { researchBrand, researchLead } from './researcher';
import { retrieveContext } from './retrieval';
import { routeLead } from './router';
import { logProviderUsage } from './usage';
import { validateEmailDraft, ValidationResult } from './validator';
import { getLeadOutreachHistory, LeadOutreachHistory } from './history';

export interface PlannedDraftStep {
  stepNumber: number;
  subject: string;
  body: string;
  validation: ValidationResult;
}

export interface PlannedSequenceResult {
  leadId: string;
  brandId: string | null;
  categoryKey: string;
  designation: string;
  angleKey: string;
  proofPointIds: string[];
  history: LeadOutreachHistory;
  steps: PlannedDraftStep[];
  allValid: boolean;
  draftGenerationIds: string[];
}

function buildWriterPrompt(params: {
  companyName: string;
  categoryKey: string;
  designation: string;
  brandSignals: string[];
  history: LeadOutreachHistory;
  playbook: any;
  proofPoints: any[];
  knowledgeChunks: string[];
  exemplars: any[];
}): string {
  const {
    companyName,
    categoryKey,
    designation,
    brandSignals,
    history,
    playbook,
    proofPoints,
    knowledgeChunks,
    exemplars,
  } = params;

  return `You are an elite B2B partnerships director at TheBoredMonkey (TBM), a premier creator growth agency in India.
Write a high-converting, personalized 3-step cold email sequence to a decision maker at ${companyName}.

### RECIPIENT PROFILE:
- Target Company: ${companyName}
- Industry Category: ${categoryKey}
- Target Designation: ${designation}

### HISTORICAL OUTREACH AUDIT (PREVIOUS TOUCHPOINTS):
- History Status: ${history.hasHistory ? 'PREVIOUSLY CONTACTED' : 'FRESH PROSPECT (No prior emails)'}
- Engagement Tier: ${history.engagementTier}
- Historical Context: ${history.contextSummary}
- Strategic Writer Directive: ${history.recommendedWriterGuidance}
${history.pastSubjects.length > 0 ? `- Past Subjects Already Sent (DO NOT REPEAT): ${history.pastSubjects.join(' | ')}` : ''}

### VERIFIED RESEARCH SIGNALS:
${brandSignals.map((s) => `- ${s}`).join('\n') || '- Leading consumer brand'}

### STRATEGIC PLAYBOOK:
- Angle: ${playbook?.angleName || 'Vernacular Creator Growth & Video Production'}
- Core Framework: ${playbook?.description || 'Drive qualified buyer discovery through vernacular creators and high-velocity video.'}
- Mandatory DOs:
${(playbook?.dos || ['Highlight category buying moments', 'Cite verified past work', 'Keep CTA low-friction']).map((d: string) => `  * ${d}`).join('\n')}
- Strict DONTs:
${(playbook?.donts || ['Never use buzzwords like synergy or game-changer', 'Never make unverified claims', 'Do not ask for long meetings']).map((d: string) => `  * ${d}`).join('\n')}
- Recommended CTA style:
${(playbook?.ctaOptions || ['Mind if I send over our 2-page category comparison?', 'Open to seeing a 90-second teardown of how top creators position products in this category?']).map((c: string) => `  * "${c}"`).join('\n')}

### VERIFIED CASE STUDIES & METRICS (USE ONLY THESE METRICS):
${proofPoints.length > 0
  ? proofPoints
      .map(
        (p) =>
          `- Client: ${p.clientName} | Metrics: ${JSON.stringify(p.metrics)} | Summary: ${p.summary}`
      )
      .join('\n')
  : '- No verified client case studies available for this category. Do NOT invent past client names or metrics. Focus on category observations, creator evaluation shelves, and video explainers.'}

### AGENCY CAPABILITIES:
${knowledgeChunks.map((k) => `- ${k}`).join('\n')}

### PROVEN HIGH-CONVERTING EXEMPLARS (STYLE BENCHMARKS):
${exemplars
  .map((e) => `[Subject: ${e.subject}]\n${e.body.slice(0, 300)}...`)
  .join('\n\n')}

### STRICT GENERATION RULES:
1. Preserve variables exactly: use {{firstName}} for prospect name and {{company}} for brand name.
2. Step 1 (Initial Pitch): Must be under 120 words.
   - Sentence 1 MUST weave in the verified research signal specifically (e.g. mention their specific offering, products, or focus). Do NOT use generic praise like "deserve to reach more people".
   - Introduce 1 concrete verified metric ONLY if listed in the VERIFIED CASE STUDIES above. If no case study is listed, do NOT name past clients or invent statistics.
   - Close with a ZERO-FRICTION permission ask (e.g., "Mind if I send over our 2-page category breakdown?", "Open to seeing a 90-second teardown?").
   - ZERO MEETING ASKS: NEVER ask for a 15-minute call, 20-minute call, Google Meet, phone chat, or meeting in Step 1 or Step 2.
3. Subject Line: MUST be 7 words or fewer. Never exceed 7 words. Count carefully. (e.g., "{{company}} + Creator Evaluation Shelf" is 5 words).
4. Step 2 (Follow-up 1, 3 days later): Must be under 60 words. No "just checking in". Provide a fresh angle or asset highlight. Close with a low-friction permission question. NEVER ask for a call or meeting.
5. Step 3 (Follow-up 2, 5 days later): Must be under 50 words. Gentle break-up or final value drop.
6. NO BANNED PHRASES: Do NOT use "game-changer", "synergy", "in today's fast-paced world", "revolutionary", "hope this finds you well".
7. HISTORICAL CONTEXT ADHERENCE:
   - If History Status is PREVIOUSLY CONTACTED:
     * Honor the Strategic Writer Directive above.
     * If they engaged or opened previously, acknowledge the timeline gracefully (e.g. "Reaching back out with a fresh perspective for {{company}}...").
     * If they previously ignored an angle, PIVOT completely to a fresh angle without repeating the old pitch.
     * NEVER reuse past subject lines: ${history.pastSubjects.join(', ') || 'None'}.
8. Return strictly valid JSON with keys: "step1Subject", "step1Body", "step2Subject", "step2Body", "step3Subject", "step3Body".`;
}

export async function planAndGenerateSequence(params: {
  leadId: string;
  strictValidation?: boolean;
}): Promise<PlannedSequenceResult> {
  const { leadId, strictValidation = false } = params;

  // 1. Safety & Fatigue Route check
  const route = await routeLead({ leadId });
  if (route.decision !== 'PROCEED') {
    throw new Error(`Routing halted: ${route.decision} - ${route.reason}`);
  }

  // 2. Fetch Lead & Brand Details
  const leadRes = await db.query(
    `
    SELECT
      l.id, l.email, l."brandId", l."categoryKey", l.designation,
      b.name as "companyName", b.tier as "brandTier"
    FROM "Lead" l
    LEFT JOIN "Brand" b ON b.id = l."brandId"
    WHERE l.id = $1
    `,
    [leadId]
  );
  const lead = leadRes.rows[0];
  const companyName = lead.companyName || 'the brand';
  const categoryKey = lead.categoryKey || 'general_b2c';
  const designation = lead.designation || 'FOUNDER_CEO';

  // 3. Gather Research Signals & Historical Outreach Touchpoints
  const history = await getLeadOutreachHistory({ leadId, email: lead.email });
  let brandSignals: string[] = [];
  if (lead.brandId) {
    const br = await researchBrand(lead.brandId);
    brandSignals = br.signals.map((s) => s.claim);
  }
  const lr = await researchLead(leadId);
  if (lr.signals.length > 0) {
    brandSignals.push(...lr.signals.map((s) => s.claim));
  }

  // 4. Retrieve Context (Playbook, ProofPoints, Knowledge, Exemplars)
  const context = await retrieveContext({
    categoryKey,
    designation,
    brandTier: lead.brandTier,
  });

  const allowedMetrics: Record<string, any> = {};
  for (const pp of context.proofPoints) {
    Object.assign(allowedMetrics, pp.metrics);
  }

  // 5. Call Frontier LLM via API
  const prompt = buildWriterPrompt({
    companyName,
    categoryKey,
    designation,
    brandSignals,
    history,
    playbook: context.playbook,
    proofPoints: context.proofPoints,
    knowledgeChunks: context.knowledgeChunks,
    exemplars: context.positiveExemplars,
  });

  const apiKey = process.env.OPENAI_API_KEY;
  let rawJson = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;

  if (apiKey) {
    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert cold email writer. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    latencyMs = Date.now() - start;
    const data = (await res.json()) as any;

    if (!res.ok) {
      console.error('[OpenAI API Error]', res.status, data?.error?.message || data);
      throw new Error(`OpenAI API failed (${res.status}): ${data?.error?.message || 'Unknown error'}`);
    }

    if (data.usage) {
      tokensIn = data.usage.prompt_tokens;
      tokensOut = data.usage.completion_tokens;
      await logProviderUsage({
        kind: 'WRITER',
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        tokensIn,
        tokensOut,
        leadId,
      });
    }

    rawJson = data.choices?.[0]?.message?.content || '{}';
  } else {
    rawJson = JSON.stringify({
      step1Subject: `${companyName} + Creator Evaluation Shelf`,
      step1Body: `Hi {{firstName}},\n\nMost buyers in {{company}}'s category compare 3-5 options before purchasing, and whoever owns the evaluation shelf wins the cart.\n\nMind if I send over our 2-page category comparison for {{company}}?\n\nKind Regards,\nBrand Partnerships | TheBoredMonkey`,
      step2Subject: `Re: ${companyName} + Creator Evaluation Shelf`,
      step2Body: `Hi {{firstName}},\n\nQuick follow-up. Retailers often stock brands based on what creators demonstrate in-store.\n\nOpen to seeing a 90-second teardown of how top creators position products in this category?\n\nKind Regards,\nBrand Partnerships`,
      step3Subject: `Closing the loop - {{company}}`,
      step3Body: `Hi {{firstName}},\n\nI’ll close the loop for now. If {{company}} has an upcoming launch where video explainers or creator seeding would help, happy to share our category breakdown.\n\nBest,\nBrand Partnerships`,
    });
  }

  const parsed = JSON.parse(rawJson);

  const primaryProof = context.proofPoints[0];
  const primaryHook = brandSignals[0] || null;

  // 6. Validate Every Step Deterministically with Code
  const step1Val = validateEmailDraft({
    subject: parsed.step1Subject || 'Outreach',
    body: parsed.step1Body || '',
    stepNumber: 1,
    allowedProofPointMetrics: allowedMetrics,
    strictOverride: strictValidation,
    leadCategoryKey: categoryKey,
    proofPointClientName: primaryProof?.clientName,
    proofPointCategories: primaryProof?.categories,
    hookSignal: primaryHook,
  });

  const step2Val = validateEmailDraft({
    subject: parsed.step2Subject || parsed.step1Subject || '',
    body: parsed.step2Body || '',
    stepNumber: 2,
    allowedProofPointMetrics: allowedMetrics,
    strictOverride: strictValidation,
    leadCategoryKey: categoryKey,
    proofPointClientName: primaryProof?.clientName,
    proofPointCategories: primaryProof?.categories,
  });

  const step3Val = validateEmailDraft({
    subject: parsed.step3Subject || parsed.step1Subject || '',
    body: parsed.step3Body || '',
    stepNumber: 3,
    allowedProofPointMetrics: allowedMetrics,
    strictOverride: strictValidation,
    leadCategoryKey: categoryKey,
    proofPointClientName: primaryProof?.clientName,
    proofPointCategories: primaryProof?.categories,
  });

  const steps: PlannedDraftStep[] = [
    {
      stepNumber: 1,
      subject: parsed.step1Subject,
      body: parsed.step1Body,
      validation: step1Val,
    },
    {
      stepNumber: 2,
      subject: parsed.step2Subject,
      body: parsed.step2Body,
      validation: step2Val,
    },
    {
      stepNumber: 3,
      subject: parsed.step3Subject,
      body: parsed.step3Body,
      validation: step3Val,
    },
  ];

  const allValid = steps.every((s) => s.validation.valid);
  const draftGenerationIds: string[] = [];

  // 7. Persist to DraftGeneration on Replica 3
  for (const s of steps) {
    const draftId = `dg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const hardViolations = s.validation.issues
      .filter((i) => i.severity === 'ERROR')
      .map((i) => i.message);
    const softViolations = s.validation.issues
      .filter((i) => i.severity === 'WARNING')
      .map((i) => i.message);

    await db.query(
      `
      INSERT INTO "DraftGeneration" (
        id, "leadId", "leadEmail", "sequenceStep", "playbookId", "angleKey",
        "primaryProofId", "categoryKey", designation, subject, body,
        "finalSubject", "finalBody", "hardViolations", "softViolations",
        "validatorPass", routing, status, "tokensIn", "tokensOut", "latencyMs", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
      `,
      [
        draftId,
        leadId,
        lead.email,
        s.stepNumber,
        context.playbook?.id || null,
        context.playbook?.angleKey || 'default_vernacular',
        context.proofPoints[0]?.id || null,
        categoryKey,
        designation,
        s.subject,
        s.body,
        s.subject,
        s.body,
        JSON.stringify(hardViolations),
        JSON.stringify(softViolations),
        s.validation.valid,
        s.validation.valid ? 'PROCEED' : 'HOLD_VALIDATION_FAILED',
        s.validation.valid ? 'PENDING_REVIEW' : 'REJECTED',
        tokensIn,
        tokensOut,
        latencyMs,
      ]
    );
    draftGenerationIds.push(draftId);
  }

  return {
    leadId,
    brandId: lead.brandId,
    categoryKey,
    designation,
    angleKey: context.playbook?.angleKey || 'default_vernacular',
    proofPointIds: context.proofPoints.map((p) => p.id),
    history,
    steps,
    allValid,
    draftGenerationIds,
  };
}
