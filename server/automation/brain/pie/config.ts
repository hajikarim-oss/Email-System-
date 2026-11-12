// ============================================================================
// PIE flags — all default OFF. Reuses the Brain's BRAIN_DB_TARGET so PIE writes
// to Replica 3 by default, never Primary, until the Phase-5 promotion.
// ============================================================================

import { getBrainFlags } from '../config';

export interface PieFlags {
  DB_TARGET: 'replica3' | 'primary'; // inherited from BRAIN_DB_TARGET
  PIE_ENABLED: boolean;
  PIE_AUTOSEND_ENABLED: boolean;      // stays OFF in v1 — HIGH-tier is always human-gated
  AD_LIBRARY_SCRAPE_ENABLED: boolean;
  GAP_ENGINE_STRICT: boolean;         // HARD grounding voids gaps (default true)
}

function bool(key: string, def = false): boolean {
  const raw = process.env[key];
  if (!raw) return def;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

export function getPieFlags(): PieFlags {
  return {
    DB_TARGET: getBrainFlags().BRAIN_DB_TARGET,
    PIE_ENABLED: bool('PIE_ENABLED', false),
    PIE_AUTOSEND_ENABLED: bool('PIE_AUTOSEND_ENABLED', false),
    AD_LIBRARY_SCRAPE_ENABLED: bool('AD_LIBRARY_SCRAPE_ENABLED', false),
    GAP_ENGINE_STRICT: bool('GAP_ENGINE_STRICT', true),
  };
}
