// ============================================================================
// PIE Layer 3 — Category Benchmark helpers
// Seed/query "what good looks like" per category + dimension. Seeds land GATED
// (approved=false) and are invisible to the Gap Engine until the owner approves.
// Writes only to Replica 3 via server/db.ts.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import type { CategoryBenchmark } from './types';

const pieId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

export interface BenchmarkSeed {
  categoryKey: string;
  dimension: string;              // content_format_mix | cadence | channel_mix | funnel
  leaderPattern: string;
  benchmarkValue?: Record<string, unknown>;
  source: string;                 // client:<name> | adlib:<set> | owner
  confidence?: number;            // 0..1
}

/** Upsert a benchmark, GATED (approved=false). Returns its id. */
export async function upsertBenchmark(seed: BenchmarkSeed): Promise<string> {
  const id = pieId('cb');
  const r = await db.query(
    `INSERT INTO "CategoryBenchmark" (id,"categoryKey",dimension,"leaderPattern","benchmarkValue",source,confidence,approved,"updatedAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,NOW())
     ON CONFLICT ("categoryKey",dimension) DO UPDATE SET
       "leaderPattern"=EXCLUDED."leaderPattern","benchmarkValue"=EXCLUDED."benchmarkValue",
       source=EXCLUDED.source,confidence=EXCLUDED.confidence,"updatedAt"=NOW()
     RETURNING id`,
    [
      id, seed.categoryKey, seed.dimension, seed.leaderPattern,
      JSON.stringify(seed.benchmarkValue ?? {}), seed.source, seed.confidence ?? 0.5,
    ]
  );
  return r.rows[0]?.id ?? id;
}

/** Only APPROVED benchmarks for a category (what the Gap Engine reads). */
export async function getApprovedBenchmarks(categoryKey: string): Promise<CategoryBenchmark[]> {
  const r = await db.query(
    `SELECT * FROM "CategoryBenchmark" WHERE "categoryKey" = $1 AND approved = true ORDER BY dimension`,
    [categoryKey]
  );
  return r.rows as CategoryBenchmark[];
}

/** All benchmarks for a category incl. unapproved (for the owner review surface). */
export async function listBenchmarks(categoryKey: string): Promise<CategoryBenchmark[]> {
  const r = await db.query(
    `SELECT * FROM "CategoryBenchmark" WHERE "categoryKey" = $1 ORDER BY approved DESC, dimension`,
    [categoryKey]
  );
  return r.rows as CategoryBenchmark[];
}
