// ============================================================================
// PIE Layer 7 — Learning loop (ChangeProposal tuning)
//
// Mines the reply store (ReplyClassification) joined to what was actually sent
// (DraftGeneration: angle/benchmarkDim, category, proof) and surfaces GATED,
// evidence-backed tuning proposals: which gap dimensions, proofs, and categories
// earn positive replies. It NEVER auto-applies — it writes to the Brain's
// existing ChangeProposal table (status=PROPOSED, rolloutPct=0) for a human to
// approve. Replica 3 only, via server/db.ts.
//
// Reuses the Brain's ChangeProposal schema as intended:
//   diffJson  = the proposed change (scopeKey, dimension, direction, …)
//   rationale = the human-readable observation
//   evidence  = the supporting stats (sampleSize, positiveRate, confidence, …)
//
// "Positive" = INTERESTED. "Engaged" = INTERESTED | NOT_NOW | WRONG_PERSON |
// UNSUBSCRIBE; OOO / AUTO_RESPONDER / NONE are excluded as non-signal. A group
// must reach minSample before it is judged.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';

export interface ComputeOpts {
  minSample?: number;
  promoteAt?: number;
  demoteAt?: number;
}

export interface ProposalRow {
  kind: 'BENCHMARK_DIM' | 'PROOF' | 'CATEGORY';
  scopeKey: string;
  categoryKey: string | null;
  benchmarkDim: string | null;
  proofId: string | null;
  observation: string;
  recommendation: string;
  direction: 'PROMOTE' | 'DEMOTE' | 'REVIEW';
  sampleSize: number;
  positiveRate: number;
  confidence: number;
  evidence: Record<string, any>;
}

const ENGAGED = ['INTERESTED', 'NOT_NOW', 'WRONG_PERSON', 'UNSUBSCRIBE'];

function judge(positive: number, engaged: number, promoteAt: number, demoteAt: number) {
  const rate = engaged > 0 ? positive / engaged : 0;
  const confidence = Math.min(1, engaged / 20);
  const direction: 'PROMOTE' | 'DEMOTE' | 'REVIEW' =
    rate >= promoteAt ? 'PROMOTE' : rate <= demoteAt ? 'DEMOTE' : 'REVIEW';
  return { rate: Number(rate.toFixed(3)), confidence: Number(confidence.toFixed(3)), direction };
}

export async function computeChangeProposals(
  opts: ComputeOpts = {}
): Promise<{ proposals: ProposalRow[]; persisted: number; sampledReplies: number }> {
  const minSample = opts.minSample ?? 5;
  const promoteAt = opts.promoteAt ?? 0.3;
  const demoteAt = opts.demoteAt ?? 0.1;

  const rows = (await db.query(
    `SELECT rc."dbClassification" AS cls,
            dg."angleKey"       AS "benchmarkDim",
            dg."categoryKey"    AS "categoryKey",
            dg."primaryProofId" AS "proofId"
     FROM "ReplyClassification" rc
     JOIN "DraftGeneration" dg
       ON dg."leadId" = rc."leadId" AND dg.routing = 'PIE_CAMPAIGN'
     WHERE rc."dbClassification" = ANY($1::text[])`,
    [ENGAGED]
  )).rows as any[];

  const sampledReplies = rows.length;

  type Agg = { positive: number; engaged: number; byCls: Record<string, number>; categoryKey?: string | null; benchmarkDim?: string | null; proofId?: string | null };
  const dims = new Map<string, Agg>(), cats = new Map<string, Agg>(), proofs = new Map<string, Agg>();
  const bump = (m: Map<string, Agg>, key: string, cls: string, meta: Partial<Agg>) => {
    if (!key) return;
    const a = m.get(key) || { positive: 0, engaged: 0, byCls: {}, ...meta };
    a.engaged++; a.byCls[cls] = (a.byCls[cls] || 0) + 1;
    if (cls === 'INTERESTED') a.positive++;
    m.set(key, a);
  };
  for (const r of rows) {
    if (r.benchmarkDim) bump(dims, r.benchmarkDim, r.cls, { benchmarkDim: r.benchmarkDim });
    if (r.categoryKey) bump(cats, r.categoryKey, r.cls, { categoryKey: r.categoryKey });
    if (r.proofId) bump(proofs, r.proofId, r.cls, { proofId: r.proofId });
  }

  const proposals: ProposalRow[] = [];
  const mk = (kind: ProposalRow['kind'], scopeKey: string, a: Agg): ProposalRow | null => {
    if (a.engaged < minSample) return null;
    const j = judge(a.positive, a.engaged, promoteAt, demoteAt);
    const label = kind === 'BENCHMARK_DIM' ? `gap dimension "${scopeKey}"`
      : kind === 'CATEGORY' ? `category "${scopeKey}"` : `proof ${scopeKey}`;
    const rec = j.direction === 'PROMOTE'
      ? `Prioritise ${label}: converts above target (${(j.rate * 100).toFixed(0)}% interested).`
      : j.direction === 'DEMOTE'
      ? `De-prioritise or rework ${label}: under-converts (${(j.rate * 100).toFixed(0)}% interested).`
      : `Keep watching ${label}: ${(j.rate * 100).toFixed(0)}% interested, not yet decisive.`;
    return {
      kind, scopeKey,
      categoryKey: a.categoryKey ?? (kind === 'CATEGORY' ? scopeKey : null),
      benchmarkDim: a.benchmarkDim ?? (kind === 'BENCHMARK_DIM' ? scopeKey : null),
      proofId: a.proofId ?? (kind === 'PROOF' ? scopeKey : null),
      observation: `${a.positive}/${a.engaged} engaged replies to ${label} were INTERESTED.`,
      recommendation: rec,
      direction: j.direction,
      sampleSize: a.engaged,
      positiveRate: j.rate,
      confidence: j.confidence,
      evidence: { byClassification: a.byCls },
    };
  };
  for (const [key, a] of dims) { const p = mk('BENCHMARK_DIM', key, a); if (p) proposals.push(p); }
  for (const [key, a] of cats) { const p = mk('CATEGORY', key, a); if (p) proposals.push(p); }
  for (const [key, a] of proofs) { const p = mk('PROOF', key, a); if (p) proposals.push(p); }

  // Persist into the Brain's existing ChangeProposal table. Idempotent on
  // (kind, diffJson->>'scopeKey'): refresh a PROPOSED row, never overwrite a
  // human-set APPROVED/DISMISSED/APPLIED verdict.
  let persisted = 0;
  for (const p of proposals) {
    const diffJson = JSON.stringify({
      scopeKey: p.scopeKey, categoryKey: p.categoryKey, benchmarkDim: p.benchmarkDim,
      proofId: p.proofId, direction: p.direction, recommendation: p.recommendation,
    });
    const evidence = JSON.stringify({
      sampleSize: p.sampleSize, positiveRate: p.positiveRate, confidence: p.confidence,
      byClassification: p.evidence.byClassification,
    });
    const upd = await db.query(
      `UPDATE "ChangeProposal" SET "diffJson"=$3::jsonb, rationale=$4, evidence=$5::jsonb
       WHERE kind=$1 AND "diffJson"->>'scopeKey'=$2 AND status='PROPOSED' RETURNING id`,
      [p.kind, p.scopeKey, diffJson, p.observation, evidence]
    );
    if (upd.rows.length === 0) {
      const id = `cp_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
      await db.query(
        `INSERT INTO "ChangeProposal" (id,kind,"diffJson",rationale,evidence,status,"rolloutPct","createdAt")
         VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,'PROPOSED',0,NOW())`,
        [id, p.kind, diffJson, p.observation, evidence]
      );
    }
    persisted++;
  }
  return { proposals, persisted, sampledReplies };
}

export async function listChangeProposals(status?: string, limit = 100): Promise<any[]> {
  const params: any[] = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  params.push(Math.min(limit, 200));
  const r = await db.query(
    `SELECT id, kind, "diffJson", rationale, evidence, status, "rolloutPct", "createdAt"
     FROM "ChangeProposal" ${where}
     ORDER BY (evidence->>'confidence')::float DESC NULLS LAST, "createdAt" DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    rolloutPct: row.rolloutPct,
    scopeKey: row.diffJson?.scopeKey ?? null,
    categoryKey: row.diffJson?.categoryKey ?? null,
    benchmarkDim: row.diffJson?.benchmarkDim ?? null,
    proofId: row.diffJson?.proofId ?? null,
    direction: row.diffJson?.direction ?? null,
    recommendation: row.diffJson?.recommendation ?? null,
    observation: row.rationale,
    sampleSize: row.evidence?.sampleSize ?? null,
    positiveRate: row.evidence?.positiveRate ?? null,
    confidence: row.evidence?.confidence ?? null,
    createdAt: row.createdAt,
  }));
}

export async function setChangeProposalStatus(
  id: string,
  status: 'APPROVED' | 'DISMISSED' | 'APPLIED' | 'PROPOSED'
): Promise<boolean> {
  const r = await db.query(`UPDATE "ChangeProposal" SET status=$2 WHERE id=$1 RETURNING id`, [id, status]);
  return r.rows.length > 0;
}
