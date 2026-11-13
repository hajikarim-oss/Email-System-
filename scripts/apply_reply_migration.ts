/**
 * apply_reply_migration.ts — apply (or roll back) the L7 ReplyClassification migration.
 * Runs the SQL through server/db.ts, which targets Replica 3 by default
 * (BRAIN_DB_TARGET=replica3). Primary is never touched unless explicitly set.
 *
 *   npx tsx scripts/apply_reply_migration.ts        # 20261113_reply_llm_up.sql
 *   npx tsx scripts/apply_reply_migration.ts down   # 20261113_reply_llm_down.sql
 */
import * as fs from 'fs';
import * as path from 'path';
import { getBrainPool, resolveBrainDatabaseUrl, closeBrainDb } from '../server/db';

async function main() {
  const dir = process.argv[2] === 'down' ? 'down' : 'up';
  const file = path.resolve(__dirname, '..', 'migrations', `20261113_reply_llm_${dir}.sql`);
  const sql = fs.readFileSync(file, 'utf8');

  const { target } = resolveBrainDatabaseUrl();
  if (target === 'primary') {
    console.error('[reply migrate] REFUSING: BRAIN_DB_TARGET=primary. L7 is Replica-3 only. Unset it to proceed.');
    process.exit(2);
  }
  console.log(`[reply migrate] target=${target}  direction=${dir}`);

  const t0 = Date.now();
  const client = await getBrainPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  console.log(`[reply migrate] ${dir.toUpperCase()} applied in ${Date.now() - t0}ms.`);

  const check = await getBrainPool().query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = 'ReplyClassification'`
  );
  console.log(`[reply migrate] ReplyClassification present now: ${check.rows.length > 0}`);
  await closeBrainDb();
}

main().catch(async (e) => {
  console.error('[reply migrate] FAILED:', e?.message || e);
  await closeBrainDb();
  process.exit(1);
});
