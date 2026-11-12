/**
 * apply_pie_migration.ts — apply (or roll back) the PIE v1 additive migration.
 * No psql required; runs the SQL file through server/db.ts, which targets
 * Replica 3 by default (BRAIN_DB_TARGET=replica3). Primary is never touched
 * unless BRAIN_DB_TARGET=primary is explicitly set.
 *
 *   npx tsx scripts/apply_pie_migration.ts        # applies 20261112_pie_v1_up.sql
 *   npx tsx scripts/apply_pie_migration.ts down   # applies 20261112_pie_v1_down.sql
 *
 * Both files are additive/reversible (CREATE TABLE IF NOT EXISTS / DROP IF EXISTS).
 */
import * as fs from 'fs';
import * as path from 'path';
import { getBrainPool, resolveBrainDatabaseUrl, closeBrainDb } from '../server/db';

async function main() {
  const dir = process.argv[2] === 'down' ? 'down' : 'up';
  const file = path.resolve(__dirname, '..', 'migrations', `20261112_pie_v1_${dir}.sql`);
  const sql = fs.readFileSync(file, 'utf8');

  const { target } = resolveBrainDatabaseUrl();
  if (target === 'primary') {
    console.error('[PIE migrate] REFUSING: BRAIN_DB_TARGET=primary. PIE v1 is Replica-3 only. Unset it to proceed.');
    process.exit(2);
  }
  console.log(`[PIE migrate] target=${target}  direction=${dir}`);

  const t0 = Date.now();
  const client = await getBrainPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(sql); // multi-statement DDL runs in one simple query
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  console.log(`[PIE migrate] ${dir.toUpperCase()} applied in ${Date.now() - t0}ms.`);

  // Confirm tables exist (up) or are gone (down).
  const check = await getBrainPool().query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN
     ('Capability','CapabilityProof','CategoryBenchmark','BrandDossier','Gap','PartnershipThesis','ResearchSource','EvalCaseV2')
     ORDER BY table_name`
  );
  console.log(`[PIE migrate] PIE tables present now: ${check.rows.map((r: any) => r.table_name).join(', ') || '(none)'}`);
  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('[PIE migrate] FAILED:', e?.message || e);
  await closeBrainDb();
  process.exit(1);
});
