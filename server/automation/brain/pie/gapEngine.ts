// ============================================================================
// PIE Layer 4 — Gap Engine (orchestrator)
// Flow (spec Part 4.1): dossier + benchmarks + capability graph
//   -> deterministic deltas (NEVER invents an observation)
//   -> LLM writes impliedProblem/businessImpact (INTERPRETATION only, constrained)
//   -> grounding validator (HARD voids the gap -> withheld)
//   -> qualify -> persist Gap rows + PartnershipThesis (gated ownerApproved=false)
// Reuses the Brain spine: db (Replica 3), OpenAI fetch, logProviderUsage.
// Flag-guarded by PIE_ENABLED; writes only to Replica 3 via server/db.ts.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import { logProviderUsage } from '../usage';
import { getPieFlags } from './config';
import { validateGap } from './grounding';
import { qualifyBrand } from './qualify';
import type {
  BrandDossier,
  Capability,
  CapabilityProof,
  CategoryBenchmark,
  GapChain,
  PartnershipThesis,
} from './types';

const pieId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

export interface ThesisBuildResult {
  brandId: string;
  thesis: PartnershipThesis | null;
  validGaps: GapChain[];
  withheldCount: number;
  reason?: string;
}

// ---- data loaders (raw SQL, same style as retrieval.ts) --------------------
async function loadDossier(brandId: string): Promise<BrandDossier | null> {
  const r = await db.query(`SELECT * FROM "BrandDossier" WHERE "brandId" = $1 LIMIT 1`, [brandId]);
  return (r.rows[0] as BrandDossier) ?? null;
}
async function loadResearchUrls(brandId: string): Promise<string[]> {
  const r = await db.query(`SELECT url FROM "ResearchSource" WHERE "brandId" = $1`, [brandId]);
  return r.rows.map((x: any) => x.url);
}
async function loadBenchmarks(categoryKey: string): Promise<CategoryBenchmark[]> {
  const r = await db.query(
    `SELECT * FROM "CategoryBenchmark" WHERE "categoryKey" = $1 AND approved = true`,
    [categoryKey]
  );
  return r.rows as CategoryBenchmark[];
}
async function loadCapabilityAndProof(
  categoryKey: string
): Promise<{ capability: Capability; proof: CapabilityProof } | null> {
  // Active capability that fits the category + its best approved, category-matched proof.
  const r = await db.query(
    `
    SELECT c.*, p.id AS "proof_id", p."clientName", p."categoryKey" AS "proof_cat",
           p."metricType", p."metricValue", p."metricRaw", p."approvedToMention", p."capabilityId" AS "proof_capId"
    FROM "Capability" c
    JOIN "CapabilityProof" p ON p."capabilityId" = c.id
    WHERE c.active = true
      AND p."approvedToMention" = true
      AND p."categoryKey" = $1
      AND $1 = ANY(c."categoryKeys")
    ORDER BY p."metricValue" DESC NULLS LAST
    LIMIT 1
    `,
    [categoryKey]
  );
  if (r.rows.length === 0) return null;
  const row: any = r.rows[0];
  return {
    capability: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      problemSolved: row.problemSolved,
      categoryKeys: row.categoryKeys || [],
      outcomeType: row.outcomeType,
      active: row.active,
    },
    proof: {
      id: row.proof_id,
      capabilityId: row.proof_capId,
      clientName: row.clientName,
      categoryKey: row.proof_cat,
      metricType: row.metricType,
      metricValue: row.metricValue,
      metricRaw: row.metricRaw,
      approvedToMention: row.approvedToMention,
    },
  };
}

// ---- deterministic observation builder (never invents) ---------------------
interface CandidateDelta {
  benchmarkDim: string;
  observation: string;
  observationSource: string;
  benchmarkValue: string;
  severity: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Collect every STRUCTURED value from the dossier that may ground a claim.
export function dossierStructuredValues(dossier: BrandDossier): string[] {
  const vals: (string | number)[] = [];
  const snap = dossier.adLibrarySnapshot;
  if (snap) {
    for (const n of [snap.activeCount, snap.staticCount, snap.videoCount, snap.longestRunningDays, snap.monthlyOutput]) {
      if (typeof n === 'number') vals.push(n);
    }
    for (const ch of snap.channels || []) vals.push(ch);
  }
  return vals.map((v) => String(v));
}

export function buildDeltas(dossier: BrandDossier, benchmarks: CategoryBenchmark[]): CandidateDelta[] {
  const out: CandidateDelta[] = [];
  const snap = dossier.adLibrarySnapshot;

  for (const bm of benchmarks) {
    const bv = (bm.benchmarkValue as any) || {};

    // 1. content_format_mix — video share vs target (structured ad-lib counts).
    if (bm.dimension === 'content_format_mix') {
      if (!snap || typeof snap.activeCount !== 'number' || snap.activeCount <= 0) continue;
      const videoShare = snap.videoCount / snap.activeCount;
      const targetShare = Number(bv.videoShareTarget ?? 0.5);
      if (videoShare < targetShare) {
        out.push({
          benchmarkDim: bm.dimension,
          observation: `Runs ${snap.activeCount} active ads with ${snap.videoCount} video and ${snap.staticCount} static`,
          observationSource: snap.capturedFrom,
          benchmarkValue: bm.leaderPattern,
          severity: clamp01((targetShare - videoShare) / targetShare),
        });
      }
    }

    // 2. cadence — monthly creative output vs target (only if structurally known).
    else if (bm.dimension === 'cadence') {
      if (!snap || typeof snap.monthlyOutput !== 'number') continue; // never fabricate cadence
      const target = Number(bv.monthlyVideos ?? 10);
      if (snap.monthlyOutput < target) {
        out.push({
          benchmarkDim: bm.dimension,
          observation: `Produces about ${snap.monthlyOutput} creative videos per month`,
          observationSource: snap.capturedFrom,
          benchmarkValue: bm.leaderPattern,
          severity: clamp01((target - snap.monthlyOutput) / target),
        });
      }
    }

    // 3. channel_mix — expected channels not all present (structured channel list).
    else if (bm.dimension === 'channel_mix') {
      const present = (snap?.channels || []).map((c) => c.toLowerCase());
      const expected: string[] = Array.isArray(bv.channels) ? bv.channels.map((c: string) => c.toLowerCase()) : [];
      if (!snap || present.length === 0 || expected.length === 0) continue; // need structured channels
      const missing = expected.filter((c) => !present.includes(c));
      if (missing.length > 0) {
        out.push({
          benchmarkDim: bm.dimension,
          observation: `Active channels are ${present.join(', ')}; no presence on ${missing.join(', ')}`,
          observationSource: snap.capturedFrom,
          benchmarkValue: bm.leaderPattern,
          severity: clamp01(missing.length / expected.length),
        });
      }
    }
    // Any other dimension is emitted only when a structured dossier field backs it.
  }
  return out;
}

// ---- LLM interpretation (INTERPRETATION only; constrained) -----------------
async function interpret(
  companyObservation: string,
  benchmark: string,
  capabilityProblem: string,
  brandId: string
): Promise<{ impliedProblem: string; businessImpact: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt =
    `You are a B2B partnerships analyst. Given a CITED observation about a brand and ` +
    `the category benchmark it falls short of, state the implied problem and business impact. ` +
    `Rules: do NOT introduce any number, client name, or fact not present in the inputs. ` +
    `Keep each field to one sentence. Output strict JSON {"impliedProblem":"","businessImpact":""}.\n\n` +
    `OBSERVATION: ${companyObservation}\nBENCHMARK: ${benchmark}\nOUR CAPABILITY SOLVES: ${capabilityProblem}`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data: any = await res.json();
    await logProviderUsage({
      kind: 'WRITER',
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      tokensIn: data?.usage?.prompt_tokens ?? 0,
      tokensOut: data?.usage?.completion_tokens ?? 0,
      metadata: { stage: 'pie_gap_interpret', brandId },
    });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (typeof parsed.impliedProblem === 'string' && typeof parsed.businessImpact === 'string') {
      return { impliedProblem: parsed.impliedProblem, businessImpact: parsed.businessImpact };
    }
    return null;
  } catch (err) {
    console.error('[PIE gapEngine] interpret failed:', err);
    return null;
  }
}

// ---- persistence (gated: ownerApproved=false) ------------------------------
async function persistGap(gap: GapChain): Promise<string> {
  const id = gap.id || pieId('gap');
  await db.query(
    `INSERT INTO "Gap" (id,"brandId","dossierId",observation,"observationSource","benchmarkDim",
       "benchmarkValue","impliedProblem","businessImpact","capabilityId","proofId",confidence,severity,"isValid","rankInThesis")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO NOTHING`,
    [
      id, gap.brandId, gap.dossierId, gap.observation, gap.observationSource, gap.benchmarkDim,
      gap.benchmarkValue, gap.impliedProblem, gap.businessImpact, gap.capabilityId, gap.proofId,
      gap.confidence, gap.severity, gap.isValid, gap.rankInThesis ?? null,
    ]
  );
  return id;
}

async function persistThesis(t: PartnershipThesis): Promise<string> {
  const id = t.id || pieId('pth');
  await db.query(
    `INSERT INTO "PartnershipThesis" (id,"brandId","headlineGapId","rankedGapIds","fitScore",tier,"recommendedMotion","ownerApproved")
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,false)
     ON CONFLICT ("brandId") DO UPDATE SET
       "headlineGapId"=EXCLUDED."headlineGapId","rankedGapIds"=EXCLUDED."rankedGapIds",
       "fitScore"=EXCLUDED."fitScore",tier=EXCLUDED.tier,"recommendedMotion"=EXCLUDED."recommendedMotion"`,
    [id, t.brandId, t.headlineGapId ?? null, JSON.stringify(t.rankedGapIds), t.fitScore, t.tier, t.recommendedMotion]
  );
  return id;
}

/**
 * Build (or refresh) the partnership thesis for one brand. Owner-gated: the
 * resulting thesis and gaps are persisted with ownerApproved=false and are
 * never acted on until approved in /app/brain.
 */
export async function generateThesisForBrand(
  brandId: string,
  opts: { hasContact?: boolean; opportunity?: number } = {}
): Promise<ThesisBuildResult> {
  const flags = getPieFlags();
  if (!flags.PIE_ENABLED) {
    return { brandId, thesis: null, validGaps: [], withheldCount: 0, reason: 'PIE_DISABLED' };
  }

  const dossier = await loadDossier(brandId);
  if (!dossier || !dossier.categoryKey) {
    return { brandId, thesis: null, validGaps: [], withheldCount: 0, reason: 'NO_DOSSIER_OR_CATEGORY' };
  }

  const [benchmarks, researchUrls, match] = await Promise.all([
    loadBenchmarks(dossier.categoryKey),
    loadResearchUrls(brandId),
    loadCapabilityAndProof(dossier.categoryKey),
  ]);
  if (!match) {
    // No category-matched capability+proof -> WITHHOLD (never fabricate a fit).
    return { brandId, thesis: null, validGaps: [], withheldCount: 0, reason: 'NO_CATEGORY_MATCHED_PROOF' };
  }

  const deltas = buildDeltas(dossier, benchmarks);
  const structuredVals = dossierStructuredValues(dossier);
  const validGaps: GapChain[] = [];
  let withheld = 0;

  for (const d of deltas) {
    const interp = await interpret(d.observation, d.benchmarkValue, match.capability.problemSolved, brandId);
    if (!interp) { withheld++; continue; }

    const candidate: GapChain = {
      brandId,
      dossierId: dossier.id,
      observation: d.observation,
      observationSource: d.observationSource,
      benchmarkDim: d.benchmarkDim,
      benchmarkValue: d.benchmarkValue,
      impliedProblem: interp.impliedProblem,
      businessImpact: interp.businessImpact,
      capabilityId: match.capability.id,
      proofId: match.proof.id,
      confidence: Math.min(1, 0.5 + d.severity / 2),
      severity: d.severity,
      isValid: false,
    };

    const g = validateGap({
      gap: candidate,
      capability: match.capability,
      proof: match.proof,
      dossier,
      researchSourceUrls: researchUrls,
      brandCategoryKey: dossier.categoryKey,
      structuredValues: structuredVals,
    });
    if (!g.valid) { withheld++; continue; }
    candidate.isValid = true;
    validGaps.push(candidate);
  }

  if (validGaps.length === 0) {
    return { brandId, thesis: null, validGaps: [], withheldCount: withheld, reason: 'NO_VALID_GAPS' };
  }

  const q = qualifyBrand({ validGaps, hasContact: opts.hasContact ?? true, opportunity: opts.opportunity });

  // Persist gaps (rank them), then the gated thesis.
  for (let i = 0; i < validGaps.length; i++) {
    validGaps[i].rankInThesis = i + 1;
    validGaps[i].id = await persistGap(validGaps[i]);
  }
  const rankedIds = q.rankedGapIds.length ? q.rankedGapIds : validGaps.map((g) => g.id!).filter(Boolean);

  const thesis: PartnershipThesis = {
    brandId,
    headlineGapId: validGaps[0].id ?? null,
    rankedGapIds: rankedIds,
    fitScore: q.fitScore,
    tier: q.tier,
    recommendedMotion: q.motion,
    ownerApproved: false,
  };
  thesis.id = await persistThesis(thesis);

  return { brandId, thesis, validGaps, withheldCount: withheld };
}
