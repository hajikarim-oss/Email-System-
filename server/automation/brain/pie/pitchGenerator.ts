// ============================================================================
// PIE Layer 6 — Grounded Pitch Generator (L6 Email Writer)
// Implements the anti-fabrication contract:
//   1. Grounded in validated Gap & CapabilityProof from PostgreSQL (Replica 3).
//   2. Strict Category Gating (SUPER_MAP): only cites proof when category matches.
//   3. Numeric Whitelist: never hallucinates numbers outside approved metricRaw.
//   4. Role-Adaptive Framing: Founder/CEO (executive) vs CMO/Growth (tactical).
//   5. Deterministic Validation: passes Brain validator.ts before emission.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import { validateEmailDraft } from '../validator';

const SUPER_MAP: Record<string, string[]> = {
  luggage_travel: ['luggage_travel', 'travel'],
  food_beverages: ['food_beverages', 'fmcg'],
  fashion_apparel: ['fashion_apparel', 'apparel', 'fashion'],
  beauty_personal_care: ['beauty_personal_care', 'personal_care', 'cosmetics'],
  fitness_wellness: ['fitness_wellness', 'wellness', 'health'],
  healthcare_pharma: ['healthcare_pharma', 'health', 'pharma'],
  consumer_tech: ['consumer_tech', 'tech', 'electronics'],
  ecommerce_retail: ['ecommerce_retail', 'retail'],
  jewelry_accessories: ['jewelry_accessories', 'accessories'],
  general_b2c: ['general_b2c'],
};

function isCategoryCompatible(brandCat?: string | null, proofCat?: string | null): boolean {
  if (!brandCat || !proofCat) return false;
  const b = brandCat.trim().toLowerCase();
  const p = proofCat.trim().toLowerCase();
  if (b === p) return true;
  for (const cluster of Object.values(SUPER_MAP)) {
    if (cluster.includes(b) && cluster.includes(p)) return true;
  }
  return false;
}

// Human-readable category label for the "...brands like X" framing.
const CATEGORY_LABEL: Record<string, string> = {
  food_beverages: 'food and beverage',
  beauty_personal_care: 'personal care',
  consumer_tech: 'consumer tech',
  fashion_apparel: 'fashion',
  fitness_wellness: 'wellness',
  healthcare_pharma: 'healthcare',
  ecommerce_retail: 'retail',
  jewelry_accessories: 'jewellery',
  luggage_travel: 'travel',
  general_b2c: 'consumer',
};
const categoryLabelFor = (key?: string | null): string => (key && CATEGORY_LABEL[key]) || 'consumer';

// Category-specific pain framing (truthful, no fabricated specifics). The copy is
// dynamic per lead: category drives the opener + framing, designation drives the
// bullets + CTA below.
const CATEGORY_OPENER: Record<string, string> = {
  food_beverages: `Winning a new food and beverage buyer is hard when your content tastes like an ad, not a recommendation.`,
  beauty_personal_care: `In personal care, people buy what they trust, and that trust is built by voices that look and sound like them.`,
  consumer_tech: `In consumer tech, the brand with the strongest native creator voice usually wins the consideration battle.`,
  fashion_apparel: `Fashion moves on what feels authentic, which rarely comes from a polished studio ad.`,
  fitness_wellness: `In wellness, buyers want proof from real people before they believe a claim.`,
  healthcare_pharma: `In healthcare, credibility comes from relatable, trustworthy voices, not louder advertising.`,
  ecommerce_retail: `Online, the brands that convert are the ones whose content feels like a recommendation, not an ad.`,
  general_b2c: `Reaching the right buyers is hard when your content sounds like an ad instead of a recommendation.`,
};
const painOpenerFor = (key?: string | null): string =>
  (key && CATEGORY_OPENER[key]) || CATEGORY_OPENER.general_b2c;

// Designation-aware value bullets. bullets[1] (proof) is replaced with grounded
// proof copy by the caller; the rest frame to how that persona buys.
type Persona = 'FOUNDER' | 'MARKETING' | 'GENERAL';
function personaBullets(persona: Persona): { label: string; text: string }[] {
  if (persona === 'FOUNDER') {
    return [
      { label: 'Regional reach that compounds', text: 'native creators in local languages across Tier 2 and 3 markets, so growth reaches beyond metros.' },
      { label: 'Proof before the pitch', text: '' },
      { label: 'One shoot, two jobs', text: 'the best creator videos repurposed into paid, so organic and performance feed each other.' },
    ];
  }
  if (persona === 'MARKETING') {
    return [
      { label: 'Lower blended CPV', text: 'high-velocity native creator assets that cut ad fatigue instead of refreshing the same hooks.' },
      { label: 'Proof before the pitch', text: '' },
      { label: 'Winners into paid', text: 'your best-performing creator cuts pushed into paid, so one shoot feeds both organic and performance.' },
    ];
  }
  return [
    { label: 'Creators who speak like the audience', text: 'native, regional creator content that reads like a recommendation, not an ad.' },
    { label: 'Proof before the pitch', text: '' },
    { label: 'Content that keeps working', text: 'your best creator videos repurposed into paid, so one shoot feeds both organic and performance.' },
  ];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Plain text -> simple paragraph HTML (for follow-up steps).
const paraHtml = (plain: string): string =>
  '<p>' + plain.split(/\n\n+/).map((seg) => esc(seg).replace(/\n/g, '<br/>')).join('</p><p>') + '</p>';

export interface PitchContactInput {
  id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  brandId?: string;
}

export interface GeneratedPitchStep {
  stepNumber: number; // 1, 2, 3
  delayDays: number; // 0, 2, 3
  subject: string;
  body: string;
  bodyHtml?: string;
  valid: boolean;
  validationIssues: string[];
}

export interface GeneratedPitchResult {
  contactEmail: string;
  contactName: string;
  companyName: string;
  role: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  steps: GeneratedPitchStep[];
  hasGroundedThesis: boolean;
  benchmarkDim?: string;
  impliedProblem?: string;
  businessImpact?: string;
  citedProof?: {
    clientName: string;
    metricRaw: string;
    categoryKey: string;
  } | null;
  held?: boolean;          // routed to a human instead of drafted (guard tripped)
  holdReason?: string[];   // enterprise_tier | category_uncertain | data_inconsistency
  valid: boolean;
  validationIssues: string[];
}

/**
 * Generate a grounded, verified email pitch for a specific contact and brand.
 */
export async function generateGroundedPitchForContact(
  contact: PitchContactInput
): Promise<GeneratedPitchResult> {
  const firstName = (contact.firstName || '').trim() || 'there';
  const lastName = (contact.lastName || '').trim();
  const rawRole = (contact.role || '').trim();
  const rawCompany = (contact.company || '').trim() || 'your team';

  // 1. Resolve Brand from DB (Replica 3)
  let brandRow: any = null;
  if (contact.brandId) {
    const res = await db.query(
      `SELECT id, name, domain, "categoryKey", tier FROM "Brand" WHERE id = $1 LIMIT 1`,
      [contact.brandId]
    );
    brandRow = res.rows[0] || null;
  }

  if (!brandRow && contact.email.includes('@')) {
    const domain = contact.email.split('@')[1].toLowerCase().trim();
    if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
      const res = await db.query(
        `SELECT id, name, domain, "categoryKey", tier FROM "Brand" WHERE LOWER(domain) = $1 LIMIT 1`,
        [domain]
      );
      brandRow = res.rows[0] || null;
    }
  }

  if (!brandRow && rawCompany && rawCompany !== 'your team') {
    const res = await db.query(
      `SELECT id, name, domain, "categoryKey", tier FROM "Brand" WHERE LOWER(name) = $1 LIMIT 1`,
      [rawCompany.toLowerCase()]
    );
    brandRow = res.rows[0] || null;
  }

  const brandId = brandRow?.id || null;
  const brandName = brandRow?.name || rawCompany;
  const brandCategoryKey = brandRow?.categoryKey || 'general_b2c';

  // --- Pre-generation guards: route to a human HOLD instead of auto-drafting. ---
  // These catch problems the email validator cannot (it only checks the email, not
  // the inputs): large/enterprise brands, an unresolved category (classifier didn't
  // land a vertical), and lead data whose title names a different company.
  const holdReasons: string[] = [];
  const brandTier = String(brandRow?.tier || '').toUpperCase();
  if (brandTier === 'LARGE' || brandTier === 'ENTERPRISE') holdReasons.push('enterprise_tier');
  if (!brandRow?.categoryKey || brandCategoryKey === 'general_b2c') holdReasons.push('category_uncertain');
  const atMatch = rawRole.match(/\bat\s+(.{2,})$/i);
  if (atMatch) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const titleCo = norm(atMatch[1]);
    const brandNorm = norm(brandName || '');
    const overlap = !!titleCo && !!brandNorm &&
      (titleCo.includes(brandNorm) || brandNorm.includes(titleCo) || titleCo.split(' ')[0] === brandNorm.split(' ')[0]);
    if (!overlap) holdReasons.push('data_inconsistency');
  }
  if (holdReasons.length > 0) {
    return {
      contactEmail: contact.email,
      contactName: `${firstName} ${lastName}`.trim(),
      companyName: brandName,
      role: rawRole || 'Decision Maker',
      subject: '',
      body: '',
      steps: [],
      hasGroundedThesis: false,
      held: true,
      holdReason: holdReasons,
      valid: false,
      validationIssues: holdReasons.map((h) => `[HOLD:${h}]`),
    };
  }

  // 2. Fetch Grounded Gaps with Proof from PostgreSQL (top 3 for gap-derived copy)
  let gap: any = null;
  let gaps: any[] = [];
  if (brandId) {
    const gapRes = await db.query(
      `SELECT g.id, g.observation, g."benchmarkDim", g."benchmarkValue", g."impliedProblem",
              g."businessImpact", g.confidence, g.severity, g."rankInThesis",
              c.name as "capabilityName",
              p.id as "proofId", p."clientName", p."metricRaw", p."metricValue", p."categoryKey" as "proofCategory",
              p."approvedToMention"
       FROM "Gap" g
       LEFT JOIN "Capability" c ON c.id = g."capabilityId"
       LEFT JOIN "CapabilityProof" p ON p.id = g."proofId"
       WHERE g."brandId" = $1 AND g."isValid" = true
       ORDER BY g."rankInThesis" ASC NULLS LAST
       LIMIT 3`,
      [brandId]
    );
    gaps = gapRes.rows;
    gap = gaps[0] || null;
  }

  // The brand's own observed ad-library counts (from its dossier) are grounded facts
  // about the recipient — allow them so a gap observation can cite them back
  // (e.g. "you run 14 ads, 12 static") without tripping the proof numeric whitelist.
  const brandObserved: Record<string, number> = {};
  if (brandId) {
    const dres = await db.query(`SELECT "adLibrarySnapshot" AS snap FROM "BrandDossier" WHERE "brandId" = $1 LIMIT 1`, [brandId]);
    const snap = dres.rows[0]?.snap;
    if (snap && typeof snap === 'object') {
      for (const key of ['activeCount', 'staticCount', 'videoCount', 'longestRunningDays', 'monthlyOutput']) {
        if (typeof (snap as any)[key] === 'number') brandObserved[key] = (snap as any)[key];
      }
    }
  }

  // 3. Grounding Verification: Can we cite the proof?
  const isProofCategoryMatch = gap?.proofCategory
    ? isCategoryCompatible(brandCategoryKey, gap.proofCategory)
    : false;
  const canCiteProof = Boolean(
    gap?.clientName &&
    gap?.metricRaw &&
    gap?.approvedToMention &&
    isProofCategoryMatch
  );

  const citedProof = canCiteProof
    ? {
        clientName: gap.clientName,
        metricRaw: gap.metricRaw,
        categoryKey: gap.proofCategory,
      }
    : null;

  // 4. Role Persona Detection
  const lowerRole = rawRole.toLowerCase();
  const isFounder = lowerRole.includes('founder') || lowerRole.includes('ceo') || lowerRole.includes('owner') || lowerRole.includes('director') || lowerRole.includes('managing');
  const isMarketing = lowerRole.includes('marketing') || lowerRole.includes('growth') || lowerRole.includes('cmo') || lowerRole.includes('performance') || lowerRole.includes('media');

  // 5. Synthesize Subject Line (Strictly <= 6 words so Re: is <= 7 words)
  let subject = '';
  if (gap?.benchmarkDim) {
    // Humanize the raw dimension key (e.g. "channel_mix" -> "channel mix").
    const dimLabel = gap.benchmarkDim.replace(/_/g, ' ').trim().toLowerCase();
    subject = `${brandName} + ${dimLabel}`;
  } else if (isMarketing) {
    subject = `${brandName} + creator performance`;
  } else {
    subject = `${brandName} + creator growth`;
  }
  // Safety: trim to 6 words max so Re: subject stays <= 7 words
  const subjectWords = subject.split(/\s+/).filter(Boolean);
  if (subjectWords.length > 6) {
    subject = subjectWords.slice(0, 6).join(' ');
  }

  // 6. Synthesize Step 1 body. When the brand has a researched gap AND a citeable proof,
  //    the body is GAP-DERIVED: the opener states THIS brand's specific problem (from the
  //    gap's impliedProblem), and the lead bullet names that gap and the proof that
  //    resolves it. Otherwise it falls back to the category-framed persona template
  //    (withhold, never fabricate). The gap-derived body is only used if it passes the
  //    validator — so no ungrounded number from an LLM-written gap field can ship.
  const categoryLabel = categoryLabelFor(brandCategoryKey);
  const proofMetric = citedProof ? citedProof.metricRaw.replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
  const persona: Persona = isFounder ? 'FOUNDER' : isMarketing ? 'MARKETING' : 'GENERAL';
  const clean = (s?: string | null) => (s || '').replace(/\s*\.+\s*$/, '').trim();
  const lower1 = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const dimLabel = (d?: string | null) => (d || '').replace(/_/g, ' ').trim();

  const PLAYBOOK_URL = 'https://theboredmonkey.in';
  // Low-friction permission ask (never a meeting demand — the validator blocks those).
  const cta = isFounder
    ? `Worth a quick look at what this could mean for ${brandName}?`
    : `Open to seeing how this would work for ${brandName}?`;

  const assemble = (openerLine: string, leadIn: string, bl: { label: string; text: string }[]) => ({
    bl,
    body: [
      `Hi ${firstName},`, ``, openerLine, ``, leadIn, ``,
      ...bl.map((x) => `• ${x.label}: ${x.text}`), ``,
      `Our Growth Playbook has more: ${PLAYBOOK_URL}`, ``, cta,
    ].join('\n'),
    html:
      `<p>Hi ${esc(firstName)},</p><p>${esc(openerLine)}</p><p>${esc(leadIn)}</p>` +
      `<ul>` + bl.map((x) => `<li><strong>${esc(x.label)}</strong>: ${esc(x.text)}</li>`).join('') + `</ul>` +
      `<p>Our <a href="${PLAYBOOK_URL}">Growth Playbook</a> has more.</p><p>${esc(cta)}</p>`,
  });

  // Template fallback (category opener + persona bullets, proof withheld unless citeable).
  const tplBullets = personaBullets(persona);
  tplBullets[1] = citedProof
    ? { label: 'Proof before the pitch', text: `${citedProof.clientName} saw ${proofMetric}.` }
    : { label: 'Proof before the pitch', text: 'honest first-person creator reviews that answer the real buying question.' };
  const tpl = assemble(painOpenerFor(brandCategoryKey), `Here is what we do for ${categoryLabel} brands like ${brandName}:`, tplBullets);

  // Designation-framed lead-in (what this role is measured on).
  const roleFrame = isFounder
    ? `The lever we would pull first for ${brandName}:`
    : isMarketing
    ? `Where we would move ${brandName}'s blended CPV:`
    : `What we would change first for ${brandName}:`;

  let chosen = tpl;
  let gapDerivedUsed = false;
  if (gap && citedProof && clean(gap.impliedProblem)) {
    const gapBullets = [
      {
        label: dimLabel(gap.benchmarkDim) || 'The gap we would close first',
        text: `${lower1(clean(gap.observation)) || 'where the creative is going stale'} — we solved exactly this with ${citedProof.clientName}: ${proofMetric}.`,
      },
      gaps[1] && clean(gaps[1].impliedProblem)
        ? { label: dimLabel(gaps[1].benchmarkDim) || 'Next lever', text: lower1(clean(gaps[1].impliedProblem)) }
        : personaBullets(persona)[0],
      { label: 'Content that keeps working', text: 'your best creator videos repurposed into paid, so one shoot feeds both organic and performance.' },
    ];
    const gd = assemble(clean(gap.impliedProblem), roleFrame, gapBullets);
    const check = validateEmailDraft({
      subject, body: gd.body, stepNumber: 1,
      allowedProofPointMetrics: { [citedProof.clientName]: citedProof.metricRaw, brandObserved },
      leadCategoryKey: brandCategoryKey, proofPointClientName: citedProof.clientName,
      proofPointCategories: [citedProof.categoryKey], isSendTime: true, strictOverride: true,
    });
    if (check.valid) { chosen = gd; gapDerivedUsed = true; }
  }

  const bullets = chosen.bl;
  const body = chosen.body;
  const bodyHtml = chosen.html;
  void gapDerivedUsed;

  // 7. Synthesize Step 2 (Follow-up +48h, strictly <= 75 words)
  const step2Subject = `Re: ${subject}`.split(/\s+/).slice(0, 7).join(' ');
  let step2Body = '';
  if (gap && citedProof) {
    step2Body = `Hi ${firstName},

Following up briefly on my note regarding ${brandName}.

With ${citedProof.clientName}, testing localized creator angles cut ad fatigue before putting paid media behind winning cuts.

Open to seeing a 2-page teardown of how this structure maps to your category?`;
  } else if (gap && !citedProof) {
    step2Body = `Hi ${firstName},

Following up on my note regarding ${brandName}'s creator content.

We put together a short framework on how brands in ${brandCategoryKey.replace(/_/g, ' ')} eliminate creative fatigue through native creator assets.

Mind if I share our 2-page overview?`;
  } else if (isFounder) {
    step2Body = `Hi ${firstName},

Following up on my note below.

Most founders we partner with see the highest returns when regional creators speak natively in local languages rather than dubbed scripts.

Mind if I share a quick 2-page framework on this?`;
  } else {
    step2Body = `Hi ${firstName},

Following up on my previous note.

We compiled a short breakdown showing how performance teams turn creator partnerships into scalable paid assets.

Open to checking out the breakdown?`;
  }

  // 8. Synthesize Step 3 (Break-up Exit +72h, strictly <= 45 words)
  const step3Subject = `Re: ${subject}`.split(/\s+/).slice(0, 7).join(' ');
  const step3Body = `Hi ${firstName},

Assuming creator-led acquisition isn't a priority for ${brandName} this quarter.

No problem at all — I'll pause follow-ups here.

If priorities shift next quarter, feel free to reach out anytime.`;

  // 9. Deterministic Brain Validation Gates for All 3 Steps
  const allowedProofMetrics: Record<string, any> = { brandObserved };
  if (citedProof) {
    allowedProofMetrics[citedProof.clientName] = citedProof.metricRaw;
  }

  const val1 = validateEmailDraft({
    subject,
    body,
    stepNumber: 1,
    allowedProofPointMetrics: allowedProofMetrics,
    leadCategoryKey: brandCategoryKey,
    proofPointClientName: citedProof?.clientName || null,
    proofPointCategories: citedProof ? [citedProof.categoryKey] : [],
    isSendTime: true,
    strictOverride: true,
  });

  const val2 = validateEmailDraft({
    subject: step2Subject,
    body: step2Body,
    stepNumber: 2,
    allowedProofPointMetrics: allowedProofMetrics,
    leadCategoryKey: brandCategoryKey,
    proofPointClientName: citedProof?.clientName || null,
    proofPointCategories: citedProof ? [citedProof.categoryKey] : [],
    isSendTime: true,
    strictOverride: true,
  });

  const val3 = validateEmailDraft({
    subject: step3Subject,
    body: step3Body,
    stepNumber: 3,
    allowedProofPointMetrics: allowedProofMetrics,
    leadCategoryKey: brandCategoryKey,
    isSendTime: true,
    strictOverride: true,
  });

  const allIssues = [
    ...val1.issues.map((i) => `[Step 1: ${i.code}] ${i.message}`),
    ...val2.issues.map((i) => `[Step 2: ${i.code}] ${i.message}`),
    ...val3.issues.map((i) => `[Step 3: ${i.code}] ${i.message}`),
  ];

  const steps: GeneratedPitchStep[] = [
    {
      stepNumber: 1,
      delayDays: 0,
      subject,
      body,
      bodyHtml,
      valid: val1.valid,
      validationIssues: val1.issues.map((i) => `[${i.code}] ${i.message}`),
    },
    {
      stepNumber: 2,
      delayDays: 2,
      subject: step2Subject,
      body: step2Body,
      bodyHtml: paraHtml(step2Body),
      valid: val2.valid,
      validationIssues: val2.issues.map((i) => `[${i.code}] ${i.message}`),
    },
    {
      stepNumber: 3,
      delayDays: 3,
      subject: step3Subject,
      body: step3Body,
      bodyHtml: paraHtml(step3Body),
      valid: val3.valid,
      validationIssues: val3.issues.map((i) => `[${i.code}] ${i.message}`),
    },
  ];

  return {
    contactEmail: contact.email,
    contactName: `${firstName} ${lastName}`.trim(),
    companyName: brandName,
    role: rawRole || 'Decision Maker',
    subject,
    body,
    bodyHtml,
    steps,
    hasGroundedThesis: Boolean(gap),
    benchmarkDim: gap?.benchmarkDim,
    impliedProblem: gap?.impliedProblem,
    businessImpact: gap?.businessImpact,
    citedProof,
    valid: val1.valid && val2.valid && val3.valid,
    validationIssues: allIssues,
  };
}

/**
 * Generate pitches for a batch of contacts.
 */
export async function generatePitchesForBatch(
  contacts: PitchContactInput[]
): Promise<GeneratedPitchResult[]> {
  const results: GeneratedPitchResult[] = [];
  for (const c of contacts) {
    try {
      const p = await generateGroundedPitchForContact(c);
      results.push(p);
    } catch (err: any) {
      console.warn(`[PitchGenerator] Error generating pitch for ${c.email}:`, err);
      // Fallback safe pitch: low-friction (no meeting ask) AND run through the Brain
      // validator, so `valid` reflects reality instead of being asserted true. A
      // fallback that fails validation surfaces as valid:false and cannot be
      // silently approved/sent.
      const fbFirstName = (c.firstName || '').trim() || 'there';
      const fbLastName = (c.lastName || '').trim();
      const fbCompany = (c.company || '').trim() || 'your brand';
      const fbSubject = `Creator growth: ${fbCompany}`.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
      const fbBody = `Hi ${fbFirstName},

Reaching out regarding ${fbCompany}'s growth and creator strategy.

We help brands turn creator partnerships into measurable performance assets across regional markets.

Open to seeing a quick example?`;
      const fbVal = validateEmailDraft({
        subject: fbSubject,
        body: fbBody,
        stepNumber: 1,
        isSendTime: true,
        strictOverride: true,
      });
      const fbIssues = fbVal.issues.map((i) => `[${i.code}] ${i.message}`);
      results.push({
        contactEmail: c.email,
        contactName: `${fbFirstName}${fbLastName ? ' ' + fbLastName : ''}`.trim(),
        companyName: fbCompany,
        role: (c.role || '').trim() || 'Decision Maker',
        subject: fbSubject,
        body: fbBody,
        steps: [
          { stepNumber: 1, delayDays: 0, subject: fbSubject, body: fbBody, valid: fbVal.valid, validationIssues: fbIssues },
        ],
        hasGroundedThesis: false,
        citedProof: null,
        valid: fbVal.valid,
        validationIssues: fbIssues,
      });
    }
  }
  return results;
}

// ============================================================================
// Persist an APPROVED pitch into DraftGeneration (Replica 3).
// DraftGeneration is the Brain's draft-of-record: the webhook already attaches
// inbound replies + ReplyClassification to it by (leadId/leadEmail, sequenceStep),
// so storing approved pitches here closes the generation -> send -> reply loop.
// Grounding (gapId / thesisId / proofId / category) is resolved server-side from
// the brand so the stored record is authoritative, not client-supplied.
// ============================================================================
export interface ApprovePitchInput {
  contact: PitchContactInput & { leadId?: string | null };
  subject: string;
  body: string;
  steps?: { stepNumber: number; delayDays: number; subject: string; body: string }[];
  valid?: boolean;
  validationIssues?: string[];
  humanEdited?: boolean;
  campaignId?: string | null;
}

export interface ApprovePitchResult {
  persisted: boolean;
  draftId?: string;
  grounded: boolean;
  reason?: string;
}

export async function persistApprovedPitch(input: ApprovePitchInput): Promise<ApprovePitchResult> {
  const c = input.contact;
  const email = (c.email || '').toLowerCase().trim();

  // 1. Resolve brandId (explicit, else by domain, else by company name).
  let brandId = c.brandId || null;
  if (!brandId && email.includes('@')) {
    const domain = email.split('@')[1];
    if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
      const r = await db.query(`SELECT id FROM "Brand" WHERE LOWER(domain) = $1 LIMIT 1`, [domain]);
      brandId = r.rows[0]?.id || null;
    }
  }
  if (!brandId && c.company) {
    const r = await db.query(`SELECT id FROM "Brand" WHERE LOWER(name) = $1 LIMIT 1`, [c.company.toLowerCase().trim()]);
    brandId = r.rows[0]?.id || null;
  }

  // 2. Resolve leadId (DraftGeneration.leadId is NOT NULL). Best-effort: skip
  //    persistence rather than fabricate a Lead if none matches.
  let leadId = c.leadId || null;
  if (leadId) {
    const chk = await db.query(`SELECT id FROM "Lead" WHERE id = $1 LIMIT 1`, [leadId]);
    if (chk.rows.length === 0) leadId = null;
  }
  if (!leadId && email) {
    const r = await db.query(
      `SELECT id FROM "Lead" WHERE lower(email) = $1
       ORDER BY (CASE WHEN "brandId" IS NOT NULL THEN 0 ELSE 1 END), "createdAt" DESC LIMIT 1`,
      [email]
    );
    leadId = r.rows[0]?.id || null;
  }
  if (!leadId) {
    return { persisted: false, grounded: false, reason: 'no_lead_match' };
  }

  // 3. Resolve grounding from the brand's top valid gap + thesis.
  let gapId: string | null = null, proofId: string | null = null, thesisId: string | null = null;
  let benchmarkDim: string | null = null, categoryKey: string | null = null;
  if (brandId) {
    const g = await db.query(
      `SELECT g.id, g."proofId", g."benchmarkDim", b."categoryKey"
       FROM "Gap" g LEFT JOIN "Brand" b ON b.id = g."brandId"
       WHERE g."brandId" = $1 AND g."isValid" = true
       ORDER BY g."rankInThesis" ASC NULLS LAST LIMIT 1`,
      [brandId]
    );
    if (g.rows[0]) {
      gapId = g.rows[0].id;
      proofId = g.rows[0].proofId;
      benchmarkDim = g.rows[0].benchmarkDim;
      categoryKey = g.rows[0].categoryKey;
    }
    const t = await db.query(`SELECT id FROM "PartnershipThesis" WHERE "brandId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [brandId]);
    thesisId = t.rows[0]?.id || null;
  }
  const grounded = Boolean(gapId && proofId);

  // 4. Shape the follow-up steps (step 2..n) as jsonb.
  const followups = (input.steps || []).slice(1).map((s) => ({
    stepNumber: s.stepNumber, delayDays: s.delayDays, subject: s.subject, body: s.body,
  }));
  const softViolations = input.validationIssues && input.validationIssues.length
    ? JSON.stringify(input.validationIssues) : null;
  const validatorPass = input.valid !== false;
  const humanEdited = Boolean(input.humanEdited);

  // 5. Idempotent upsert: one approved PIE pitch row per lead (sequenceStep 1).
  const existing = await db.query(
    `SELECT id FROM "DraftGeneration" WHERE "leadId" = $1 AND routing = 'PIE_CAMPAIGN' AND "sequenceStep" = 1 LIMIT 1`,
    [leadId]
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await db.query(
      `UPDATE "DraftGeneration" SET
         subject=$2, body=$3, "finalSubject"=$2, "finalBody"=$3, followups=$4::jsonb,
         status='APPROVED', "validatorPass"=$5, "humanEdited"=$6, "softViolations"=$7::jsonb,
         "gapId"=$8, "thesisId"=$9, "primaryProofId"=$10, "categoryKey"=$11, "campaignId"=COALESCE($12,"campaignId"),
         "leadEmail"=COALESCE("leadEmail",$13), "writerModel"='pie-l6', "angleKey"=$14
       WHERE id=$1`,
      [id, input.subject, input.body, JSON.stringify(followups), validatorPass, humanEdited, softViolations,
       gapId, thesisId, proofId, categoryKey, input.campaignId || null, email, benchmarkDim]
    );
    return { persisted: true, draftId: id, grounded };
  }

  const id = `dg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await db.query(
    `INSERT INTO "DraftGeneration"
       (id,"leadId","leadEmail","campaignId","sequenceStep",subject,body,"finalSubject","finalBody",
        followups,status,routing,"validatorPass","humanEdited","softViolations",
        "gapId","thesisId","primaryProofId","categoryKey","angleKey","writerModel","createdAt")
     VALUES ($1,$2,$3,$4,1,$5,$6,$5,$6,$7::jsonb,'APPROVED','PIE_CAMPAIGN',$8,$9,$10::jsonb,
             $11,$12,$13,$14,$15,'pie-l6',NOW())`,
    [id, leadId, email, input.campaignId || null, input.subject, input.body,
     JSON.stringify(followups), validatorPass, humanEdited, softViolations,
     gapId, thesisId, proofId, categoryKey, benchmarkDim]
  );
  return { persisted: true, draftId: id, grounded };
}
