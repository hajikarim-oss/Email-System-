// ============================================================================
// PIE Layer 5 — Qualification & Prioritization (deterministic; no LLM, no DB)
// Scores a brand's valid, grounded gaps into fitScore -> tier -> motion, and
// ranks the gaps. A real BPM triages; LOW-tier brands are not pitched.
// ============================================================================

import type { GapChain, ThesisTier, ThesisMotion } from './types';

export interface QualifyInput {
  validGaps: GapChain[];     // ONLY gaps that passed the grounding validator
  hasContact: boolean;       // real contact / brandId / domain present
  opportunity?: number;      // 0..1 brand size/spend signal (ad-library volume, traffic)
}

export interface QualifyResult {
  fitScore: number;          // 0..1
  tier: ThesisTier;
  motion: ThesisMotion;
  rankedGapIds: string[];
  headlineGapId: string | null;
  components: { gapStrength: number; proofMatch: number; reachability: number; opportunity: number };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function qualifyBrand(input: QualifyInput): QualifyResult {
  const { validGaps, hasContact } = input;
  const opportunity = clamp01(input.opportunity ?? 0.5);

  // Rank gaps by severity * confidence (strongest first).
  const ranked = [...validGaps].sort(
    (a, b) => b.severity * b.confidence - a.severity * a.confidence
  );
  const rankedGapIds = ranked.map((g) => g.id).filter((x): x is string => !!x);
  const headlineGapId = rankedGapIds[0] ?? null;

  // gapStrength: saturating sum of the top gaps' severity*confidence.
  const rawStrength = ranked.slice(0, 3).reduce((s, g) => s + g.severity * g.confidence, 0);
  const gapStrength = clamp01(rawStrength / 2); // ~2.0 of combined strength saturates

  // proofMatch: average confidence across valid gaps (all already proof-matched).
  const proofMatch = ranked.length
    ? clamp01(ranked.reduce((s, g) => s + g.confidence, 0) / ranked.length)
    : 0;

  const reachability = hasContact ? 1 : 0;

  const fitScore = clamp01(
    0.45 * gapStrength + 0.25 * proofMatch + 0.15 * reachability + 0.15 * opportunity
  );

  let tier: ThesisTier;
  let motion: ThesisMotion;
  if (validGaps.length === 0) {
    tier = 'LOW';
    motion = 'skip';
  } else if (fitScore >= 0.75) {
    tier = 'HIGH';
    motion = 'custom_pitch';
  } else if (fitScore >= 0.45) {
    tier = 'MEDIUM';
    motion = 'templated';
  } else {
    tier = 'LOW';
    motion = 'skip';
  }

  return {
    fitScore: Number(fitScore.toFixed(4)),
    tier,
    motion,
    rankedGapIds,
    headlineGapId,
    components: {
      gapStrength: Number(gapStrength.toFixed(4)),
      proofMatch: Number(proofMatch.toFixed(4)),
      reachability,
      opportunity: Number(opportunity.toFixed(4)),
    },
  };
}
