// ============================================================================
// PIE Layer 7 — Reply Classifier (LLM refinement + learning-loop store)
//
// Builds ON TOP of the existing deterministic classifier
// (server/automation/pipeline/replyClassifier.ts): the deterministic pass runs
// first and settles the clear cases (auto-reply, OOO, unsubscribe, explicit
// interest / decline) with ZERO model spend. Only genuinely ambiguous human
// replies (deterministic = "other"/"neutral" with a real body) are escalated to
// gpt-4o-mini — and only when REPLY_LLM_CLASSIFIER_ENABLED is on. Output is
// constrained to the SAME enums as the deterministic classifier; an off-enum or
// failed model response falls back to the deterministic verdict (never fabricated).
//
// Persists to Replica 3 ("ReplyClassification") for the learning loop. Writes
// only via server/db.ts — Primary is never touched.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import { getReplyLlmMode } from '../config';
import { logProviderUsage } from '../usage';
import {
  classifyReplyDeterministic,
  extractLatestReplySegment,
  type AuditReplyLabel,
  type DbReplyClassification,
} from '../../pipeline/replyClassifier';

export type ObjectionType = 'PRICE' | 'TIMING' | 'AUTHORITY' | 'FIT' | 'TRUST' | 'NONE';

const AUDIT_LABELS: AuditReplyLabel[] = [
  'positive', 'neutral', 'negative', 'OOO', 'auto_reply', 'unsubscribe', 'hostile', 'other',
];
const DB_CLASSES: DbReplyClassification[] = [
  'INTERESTED', 'NOT_NOW', 'WRONG_PERSON', 'OOO', 'AUTO_RESPONDER', 'UNSUBSCRIBE', 'NONE',
];
const OBJECTION_TYPES: ObjectionType[] = ['PRICE', 'TIMING', 'AUTHORITY', 'FIT', 'TRUST', 'NONE'];

export interface ClassifyReplyInput {
  text?: string | null;
  subject?: string | null;
  contactEmail?: string | null;
  brandDomain?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  sequenceStep?: number | null;
  repliedEventId?: string | null;
}

export interface EnrichedClassification {
  auditLabel: AuditReplyLabel;
  dbClassification: DbReplyClassification;
  objectionType: ObjectionType;
  method: 'DETERMINISTIC' | 'LLM';
  confidence: number;
  reason: string;
  llmModel?: string | null;
  rawModelOutput?: Record<string, any> | null;
}

// Deterministic verdicts we trust outright — never worth spending a model call on.
function isDeterministicConfident(dbClass: DbReplyClassification): boolean {
  return dbClass !== 'NONE';
}

function baseConfidence(dbClass: DbReplyClassification): number {
  switch (dbClass) {
    case 'AUTO_RESPONDER':
    case 'OOO':
    case 'UNSUBSCRIBE':
      return 0.98;
    case 'INTERESTED':
    case 'WRONG_PERSON':
      return 0.9;
    case 'NOT_NOW':
      return 0.85;
    default:
      return 0.4;
  }
}

// Map the LLM's dbClassification to an objection subtype only where it makes sense.
function defaultObjection(dbClass: DbReplyClassification): ObjectionType {
  return dbClass === 'NOT_NOW' ? 'TIMING' : 'NONE';
}

const LLM_MODEL = 'gpt-4o-mini';

function buildPrompt(replyText: string, subject: string): string {
  return [
    'Classify this inbound reply to a B2B cold outreach email. Return ONLY JSON.',
    '',
    'Allowed values:',
    `  auditLabel: ${AUDIT_LABELS.join(' | ')}`,
    `  dbClassification: ${DB_CLASSES.join(' | ')}`,
    `  objectionType: ${OBJECTION_TYPES.join(' | ')}  (the reason they are not moving forward, else NONE)`,
    '',
    'Rules:',
    '- INTERESTED = wants details, a call, a deck, shares a number, or asks to continue.',
    '- NOT_NOW = polite decline, no budget, bad timing, "maybe later".',
    '- WRONG_PERSON = not their remit, left the company, redirects to someone else.',
    '- OOO / AUTO_RESPONDER / UNSUBSCRIBE only for clearly automated or opt-out messages.',
    '- NONE = no actionable signal.',
    '- objectionType: PRICE (too expensive), TIMING (later/busy), AUTHORITY (not decision maker),',
    '  FIT (not relevant to them), TRUST (skeptical/needs proof), else NONE.',
    '- confidence: a number 0..1.',
    '',
    `Subject: ${subject || '(none)'}`,
    `Reply: """${replyText.slice(0, 1500)}"""`,
    '',
    'JSON shape: {"auditLabel":"...","dbClassification":"...","objectionType":"...","confidence":0.0,"reason":"short"}',
  ].join('\n');
}

async function refineWithLLM(
  replyText: string,
  subject: string,
  leadId?: string | null
): Promise<EnrichedClassification | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'You are a precise B2B sales reply classifier. Return only valid JSON.' },
          { role: 'user', content: buildPrompt(replyText, subject) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.warn('[replyClassifierLLM] OpenAI error', res.status, data?.error?.message);
      return null;
    }
    if (data.usage) {
      await logProviderUsage({
        kind: 'REPLY_CLASSIFICATION',
        provider: 'OPENAI',
        model: LLM_MODEL,
        tokensIn: data.usage.prompt_tokens,
        tokensOut: data.usage.completion_tokens,
        leadId: leadId || null,
      });
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);

    // Constrain to the allowed enums; reject off-enum output (fall back to deterministic).
    const auditLabel = AUDIT_LABELS.includes(parsed.auditLabel) ? parsed.auditLabel : null;
    const dbClassification = DB_CLASSES.includes(parsed.dbClassification) ? parsed.dbClassification : null;
    if (!auditLabel || !dbClassification) return null;
    const objectionType: ObjectionType = OBJECTION_TYPES.includes(parsed.objectionType)
      ? parsed.objectionType
      : defaultObjection(dbClassification);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.6;

    return {
      auditLabel,
      dbClassification,
      objectionType,
      method: 'LLM',
      confidence,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : 'LLM classification',
      llmModel: LLM_MODEL,
      rawModelOutput: parsed,
    };
  } catch (err: any) {
    console.warn('[replyClassifierLLM] refine failed:', err?.message || err);
    return null;
  }
}

/**
 * Classify one reply. Deterministic first; LLM refinement only for ambiguous
 * human replies and only when the flag (or opts.forceLLM) is set. Never spends
 * a model call on a clear deterministic verdict.
 */
export async function classifyReply(
  input: ClassifyReplyInput,
  opts: { forceLLM?: boolean; noLLM?: boolean } = {}
): Promise<EnrichedClassification> {
  const det = classifyReplyDeterministic({
    text: input.text,
    subject: input.subject,
    contactEmail: input.contactEmail,
    brandDomain: input.brandDomain,
  });

  const deterministic: EnrichedClassification = {
    auditLabel: det.auditLabel,
    dbClassification: det.dbClassification,
    objectionType: defaultObjection(det.dbClassification),
    method: 'DETERMINISTIC',
    confidence: baseConfidence(det.dbClassification),
    reason: det.reason,
    llmModel: null,
    rawModelOutput: null,
  };

  // Hard skips — free + certain, never worth a model call: internal/support noise,
  // explicit unsubscribe, and empty bodies.
  const latest = extractLatestReplySegment(input.text || '');
  if (det.isInternalOrSupportNoise || det.dbClassification === 'UNSUBSCRIBE' || latest.length < 3) {
    return deterministic;
  }

  // Mode decides how aggressively the LLM reads replies:
  //   off       -> deterministic only (no spend)
  //   ambiguous -> LLM only when deterministic is unsure (cheap, catches the gaps)
  //   every     -> LLM reads EVERY real reply (most accurate; e.g. catches an
  //                auto-responder the deterministic layer mislabels as INTERESTED)
  // noLLM forces off (webhook hot path); forceLLM forces every.
  const mode: 'off' | 'ambiguous' | 'every' = opts.noLLM
    ? 'off'
    : opts.forceLLM
    ? 'every'
    : getReplyLlmMode();

  const wantLLM =
    mode === 'every' ? true : mode === 'ambiguous' ? !isDeterministicConfident(det.dbClassification) : false;
  if (!wantLLM) return deterministic;

  const refined = await refineWithLLM(latest, input.subject || '', input.leadId);
  return refined ?? deterministic;
}

/**
 * Persist a classification to Replica 3 for the L7 learning loop.
 */
export async function persistClassification(
  input: ClassifyReplyInput,
  result: EnrichedClassification
): Promise<string> {
  const id = `rc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const replyText = extractLatestReplySegment(input.text || '').slice(0, 4000);
  await db.query(
    `INSERT INTO "ReplyClassification"
       (id,"leadId","leadEmail","campaignId","sequenceStep",subject,"replyText",
        "auditLabel","dbClassification","objectionType",method,confidence,"llmModel",reason,"rawModelOutput","repliedEventId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)`,
    [
      id,
      input.leadId || null,
      (input.contactEmail || '').toLowerCase().trim() || null,
      input.campaignId || null,
      input.sequenceStep ?? null,
      (input.subject || '').slice(0, 500) || null,
      replyText,
      result.auditLabel,
      result.dbClassification,
      result.objectionType,
      result.method,
      result.confidence,
      result.llmModel || null,
      result.reason,
      result.rawModelOutput ? JSON.stringify(result.rawModelOutput) : null,
      input.repliedEventId || null,
    ]
  );
  return id;
}

/** Classify and persist in one call. */
export async function classifyAndPersist(
  input: ClassifyReplyInput,
  opts: { forceLLM?: boolean; noLLM?: boolean } = {}
): Promise<EnrichedClassification & { id: string }> {
  const result = await classifyReply(input, opts);
  const id = await persistClassification(input, result);
  return { ...result, id };
}

/** Batch classify (+persist) a list of replies. */
export async function classifyReplies(
  inputs: ClassifyReplyInput[],
  opts: { forceLLM?: boolean; noLLM?: boolean; persist?: boolean } = {}
): Promise<Array<EnrichedClassification & { id?: string }>> {
  const out: Array<EnrichedClassification & { id?: string }> = [];
  for (const input of inputs) {
    if (opts.persist) out.push(await classifyAndPersist(input, opts));
    else out.push(await classifyReply(input, opts));
  }
  return out;
}
