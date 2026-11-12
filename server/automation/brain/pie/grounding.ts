// ============================================================================
// PIE Layer 4 — Grounding Validator (deterministic, code; no LLM, no DB)
// Implements spec Part 4.2 (HARD/SOFT chain checks) + Part 4.4 controls:
//   V1 distorted-observation  -> structured-value check (not substring)
//   proof strength            -> named client + numeric metric, category match
//   template leak             -> no unresolved {{ }} anywhere
// A HARD (ERROR) violation voids the gap: isValid=false -> WITHHELD, never emitted.
// Mirrors the Brain validator.ts result shape intentionally.
// ============================================================================

import type {
  GapChain,
  Capability,
  CapabilityProof,
  BrandDossier,
  GroundingIssue,
  GroundingResult,
} from './types';

// Super-category map kept identical to validator.ts check 8 so category gating
// behaves the same at the gap layer as it does at the email layer.
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
};

const ABSOLUTE_WORDS =
  /\b(only|no|never|none|all|every|solely|exclusively|zero|entire|entirely|nothing but)\b/i;

// Generic / vague client names that violate the strength contract.
const GENERIC_CLIENT =
  /\b(?:our|a|an|some|several|multiple|various|many)\b[^.]*\b(?:client|clients|brand|brands|company|companies|customer|customers)\b/i;

function numbersIn(text: string): string[] {
  const m = text.match(/(?:₹|\$)?\b\d+(?:[.,]\d+)?(?:\s*(?:Cr|Lakh|M|K|x|%))?\+?\b/gi);
  return m ? Array.from(new Set(m.map((s) => s.toLowerCase().trim()))) : [];
}

function hasTemplateLeak(...texts: string[]): boolean {
  return texts.some((t) => /\{\{[^}]*\}\}/.test(t || ''));
}

function isHttpUrl(s: string): boolean {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface GroundInput {
  gap: GapChain;
  capability: Capability | null;   // resolved from gap.capabilityId
  proof: CapabilityProof | null;   // resolved from gap.proofId
  dossier: BrandDossier;
  researchSourceUrls: string[];    // every URL captured in ResearchSource for this brand
  brandCategoryKey: string | null;
  // Optional: all STRUCTURED values from the dossier (numbers + enum tokens) that
  // may back a quantitative/absolute claim. When omitted, falls back to the
  // ad-library snapshot counts (backward compatible with Layer-4 v1).
  structuredValues?: string[];
}

/**
 * Validate one candidate GapChain. Returns ERROR issues (HARD -> void the gap)
 * and WARNING issues (SOFT -> surfaced to owner, non-blocking).
 */
export function validateGap(input: GroundInput): GroundingResult {
  const { gap, capability, proof, dossier, researchSourceUrls, brandCategoryKey } = input;
  const issues: GroundingIssue[] = [];
  const err = (code: string, message: string) =>
    issues.push({ code, message, severity: 'ERROR' });
  const warn = (code: string, message: string) =>
    issues.push({ code, message, severity: 'WARNING' });

  // HARD 1 — Citation present and traceable to a captured research source.
  if (!isHttpUrl(gap.observationSource)) {
    err('CITATION_MISSING', 'observationSource is not a valid http(s) URL.');
  } else {
    const known = new Set(researchSourceUrls.map((u) => u.trim()));
    if (!known.has(gap.observationSource.trim())) {
      err(
        'CITATION_UNTRACED',
        `observationSource is not among this brand's ResearchSource URLs: ${gap.observationSource}`
      );
    }
  }

  // HARD 2 — Capability resolves and is active (gate).
  if (!capability) {
    err('CAPABILITY_UNRESOLVED', `capabilityId ${gap.capabilityId} did not resolve.`);
  } else if (!capability.active) {
    err('CAPABILITY_INACTIVE', `capability ${capability.slug} is not owner-approved (active=false).`);
  }

  // HARD 3 — Proof resolves and is approved to mention (gate).
  if (!proof) {
    err('PROOF_UNRESOLVED', `proofId ${gap.proofId} did not resolve.`);
  } else {
    if (!proof.approvedToMention) {
      err('PROOF_UNAPPROVED', `proof ${proof.id} is not approvedToMention.`);
    }
    // HARD 4 — Strength contract: named client + numeric metric.
    if (!proof.clientName || !proof.clientName.trim()) {
      err('PROOF_NO_CLIENT', 'proof is missing a named client.');
    } else if (GENERIC_CLIENT.test(proof.clientName)) {
      err('PROOF_GENERIC_CLIENT', `proof client name is generic/vague: "${proof.clientName}".`);
    }
    if (!(typeof proof.metricValue === 'number' && isFinite(proof.metricValue))) {
      err('PROOF_NO_METRIC', 'proof is missing a numeric metricValue.');
    }
    // HARD 5 — Category match (same rule as email validator check 8).
    const bcat = brandCategoryKey;
    if (bcat) {
      const allowed = new Set([bcat, ...(SUPER_MAP[bcat] || []), 'consumer_brand']);
      if (!allowed.has(proof.categoryKey)) {
        err(
          'PROOF_CATEGORY_MISMATCH',
          `proof category "${proof.categoryKey}" does not match brand category "${bcat}".`
        );
      }
    }
  }

  // HARD 6 — No unresolved template variables anywhere in the chain.
  if (hasTemplateLeak(gap.observation, gap.impliedProblem, gap.businessImpact)) {
    err('TEMPLATE_LEAK', 'unresolved {{...}} variable found in the gap chain.');
  }

  // HARD 7 (V1 control) — Quantitative / absolute observations must be backed by
  // STRUCTURED dossier values, never a prose substring.
  const obsNumbers = numbersIn(gap.observation);
  const usesAbsolute = ABSOLUTE_WORDS.test(gap.observation);
  if (obsNumbers.length > 0 || usesAbsolute) {
    // Prefer caller-provided structured values; else derive from the ad-lib snapshot.
    let structuredList = input.structuredValues;
    if (!structuredList) {
      const snap = dossier.adLibrarySnapshot;
      structuredList = snap
        ? [snap.activeCount, snap.staticCount, snap.videoCount, snap.longestRunningDays]
            .filter((n): n is number => typeof n === 'number')
            .map((n) => String(n))
        : [];
    }
    if (structuredList.length === 0) {
      err(
        'QUANT_UNSTRUCTURED',
        'observation makes a quantitative/absolute claim but the dossier has no structured value to ground it.'
      );
    } else {
      const structured = new Set(
        structuredList.flatMap((v) => [String(v), `${v}+`]).map((s) => s.toLowerCase().trim())
      );
      for (const num of obsNumbers) {
        if (!structured.has(num)) {
          err(
            'QUANT_UNGROUNDED',
            `numeric claim "${num}" in the observation is not present in structured dossier values.`
          );
        }
      }
    }
  }

  // SOFT 1 — Specificity: impliedProblem should reference the observation.
  const obsKeywords = gap.observation
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const problemLower = (gap.impliedProblem || '').toLowerCase();
  if (obsKeywords.length > 0 && !obsKeywords.some((k) => problemLower.includes(k))) {
    warn(
      'WEAK_SPECIFICITY',
      'impliedProblem does not reference any observation keyword (possible generic filler).'
    );
  }

  const valid = !issues.some((i) => i.severity === 'ERROR');
  return { valid, issues };
}
