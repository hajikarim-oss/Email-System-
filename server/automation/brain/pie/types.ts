// ============================================================================
// Partnership Intelligence Engine (PIE) — shared types
// Contracts for Layers 1-7. Mirrors the 20261112_pie_v1_up.sql schema.
// No runtime side effects. Consumed by the dossier researcher, gap engine,
// grounding validator, qualifier, and the (reused) Brain validate/route spine.
// ============================================================================

// ---- Layer 1: Capability Graph ---------------------------------------------
export interface Capability {
  id: string;
  name: string;
  slug: string;
  problemSolved: string;
  categoryKeys: string[];
  outcomeType?: string | null; // ROAS|CPV|SOV|reach|engagement
  active: boolean;             // gate: false until owner approves
}

export interface CapabilityProof {
  id: string;
  capabilityId: string;
  clientName: string;          // REQUIRED, named (never "a beauty brand")
  categoryKey: string;         // REQUIRED, for match gating
  metricType: string;
  metricValue: number;         // REQUIRED numeric
  metricRaw: string;           // "7.58x ROAS"
  sourceUrl?: string | null;
  approvedToMention: boolean;  // gate
}

// ---- Layer 3: Category Benchmark -------------------------------------------
export interface CategoryBenchmark {
  id: string;
  categoryKey: string;
  dimension: string;           // content_format_mix|cadence|channel_mix|funnel
  leaderPattern: string;
  benchmarkValue?: Record<string, unknown> | null;
  source: string;
  confidence: number;
  approved: boolean;           // gate
}

// ---- Layer 2: Brand Intelligence -------------------------------------------
export interface BrandDossier {
  id: string;
  brandId: string;
  categoryKey?: string | null;
  lifecycleStage?: string | null;
  positioning?: string | null;
  channelMix?: Record<string, unknown> | null;
  contentFormats?: Record<string, unknown> | null;
  hiringSignals?: Record<string, unknown> | null;
  recentLaunches?: Record<string, unknown> | null;
  competitorSet?: Record<string, unknown> | null;
  visibleWeaknesses?: Record<string, unknown> | null;
  adLibrarySnapshot?: AdLibrarySnapshot | null;
  fieldCitations: Record<string, string>; // field -> sourceUrl (grounding ledger)
  completeness: number;                    // 0..1
  refreshDueAt?: string | null;
}

export interface AdLibrarySnapshot {
  activeCount: number;
  staticCount: number;   // structured counts — V1 control: quantitative claims
  videoCount: number;    // must derive from THESE, never a prose substring
  longestRunningDays?: number | null;
  monthlyOutput?: number | null; // structured cadence signal, if known
  channels?: string[];           // structured channel presence, e.g. ['paid_social']
  capturedFrom: string;  // ad-library permalink
}

// ---- Layer 4: Gap Engine ---------------------------------------------------
export interface GapChain {
  id?: string;
  brandId: string;
  dossierId: string;
  observation: string;
  observationSource: string;   // REQUIRED citation url
  benchmarkDim: string;
  benchmarkValue: string;
  impliedProblem: string;      // INTERPRETATION (model inference) — UI must mark as such
  businessImpact: string;      // INTERPRETATION (model inference)
  capabilityId: string;
  proofId: string;
  confidence: number;
  severity: number;
  isValid: boolean;            // set ONLY by the grounding validator
  rankInThesis?: number | null;
}

// Grounding validator output — mirrors Brain validator.ts ValidationResult shape.
export type GroundingSeverity = 'ERROR' | 'WARNING'; // ERROR = HARD, WARNING = SOFT
export interface GroundingIssue {
  code: string;
  message: string;
  severity: GroundingSeverity;
}
export interface GroundingResult {
  valid: boolean;              // false if any HARD (ERROR) violation -> gap withheld
  issues: GroundingIssue[];
}

// ---- Layer 5/7: Thesis -----------------------------------------------------
export type ThesisTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type ThesisMotion = 'custom_pitch' | 'templated' | 'skip';

export interface PartnershipThesis {
  id?: string;
  brandId: string;
  headlineGapId?: string | null;
  rankedGapIds: string[];
  fitScore: number;
  tier: ThesisTier;
  recommendedMotion: ThesisMotion;
  ownerApproved: boolean;      // gate
  sharpnessRating?: number | null; // owner 1..5 (Phase-3 gate metric)
}
