/**
 * apply_pie_notification_migration.ts — apply/rollback the PieNotification table.
 *   npx tsx scripts/apply_pie_notification_migration.ts [down]
 * Replica-3 only (refuses if BRAIN_DB_TARGET=primary).
 */
import * as fs from 'fs';
import * as path from 'path';
import { getBrainPool, resolveBrainDatabaseUrl, closeBrainDb } from '../server/db';

async function main() {
  const dir = process.argv[2] === 'down' ? 'down' : 'up';
  const file = path.resolve(__dirname, '..', 'migrations', `20261113_pie_notification_${dir}.sql`);
  const sql = fs.readFileSync(file, 'utf8');
  const { target } = resolveBrainDatabaseUrl();
  if (target === 'primary') {
    console.error('[pien migrate] REFUSING: BRAIN_DB_TARGET=primary. Replica-3 only.');
    process.exit(2);
  }
  console.log(`[pien migrate] target=${target} direction=${dir}`);
  const client = await getBrainPool().connect();
  try { await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT'); }
  catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
  const chk = await getBrainPool().query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='PieNotification'`
  );
  console.log(`[pien migrate] ${dir.toUpperCase()} done. PieNotification present: ${chk.rows.length > 0}`);
  await closeBrainDb();
}
main().catch(async (e) => { console.error('[pien migrate] FAILED:', e?.message || e); await closeBrainDb(); process.exit(1); });
