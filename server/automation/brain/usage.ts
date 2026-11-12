import * as crypto from 'crypto';
import { db } from '../../db';

export interface LogProviderUsageParams {
  kind: 'RESEARCH' | 'WRITER' | 'VALIDATOR' | 'REPLY_CLASSIFICATION' | 'WEBHOOK';
  provider: 'OPENAI' | 'FIRECRAWL' | 'SMARTLEAD' | 'ANTHROPIC' | 'GEMINI';
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  units?: number;
  costUsd?: number;
  leadId?: string | null;
  draftId?: string | null;
  metadata?: Record<string, any>;
}

// Pricing table (USD per 1M tokens or per request)
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10.0 },
  'claude-3-5-sonnet-20241022': { inputPerM: 3.0, outputPerM: 15.0 },
  'gemini-1.5-flash': { inputPerM: 0.075, outputPerM: 0.3 },
};

export function estimateCostUsd(
  model: string | undefined | null,
  tokensIn = 0,
  tokensOut = 0
): number {
  if (!model) return 0;
  const rates = PRICING[model.toLowerCase().trim()];
  if (!rates) return 0;
  const inCost = (tokensIn / 1_000_000) * rates.inputPerM;
  const outCost = (tokensOut / 1_000_000) * rates.outputPerM;
  return Number((inCost + outCost).toFixed(6));
}

/**
 * Logs provider call metrics directly to the ProviderUsage table.
 * Non-blocking: catches internal errors so caller flows never break.
 */
export async function logProviderUsage(params: LogProviderUsageParams): Promise<string | null> {
  try {
    const id = `pu_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const cost =
      params.costUsd !== undefined
        ? params.costUsd
        : estimateCostUsd(params.model, params.tokensIn, params.tokensOut);

    await db.query(
      `
      INSERT INTO "ProviderUsage" (
        id, kind, provider, model, "tokensIn", "tokensOut", units, "costUsd", "leadId", "draftId", at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `,
      [
        id,
        params.kind,
        params.provider,
        params.model || null,
        params.tokensIn || 0,
        params.tokensOut || 0,
        params.units || 1,
        cost,
        params.leadId || null,
        params.draftId || null,
      ]
    );

    return id;
  } catch (err) {
    console.error('[ProviderUsage] Failed to log usage:', err);
    return null;
  }
}
