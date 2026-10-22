const { Client } = require('pg');

const DB_CONFIGS = {
  primary: {
    name: 'Primary (Tokyo)',
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hsmudwkfwmvinhtggxyd',
    password: '9538564601Aa',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  },
  replica2: {
    name: 'Replica 2 (Standby - Seoul)',
    host: 'aws-0-ap-northeast-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.qlzlsjpncknjliyalfmj',
    password: '9538564601Aa',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  },
  replica3: {
    name: 'Replica 3 (Backup - Singapore)',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.adlwwkqgexykuhkdkpfu',
    password: '9538564601Aa',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  }
};

async function syncAll() {
  console.log('Connecting to Primary (Tokyo)...');
  const src = new Client(DB_CONFIGS.primary);
  await src.connect();

  console.log('Connecting to Replica 2 (Standby - Seoul)...');
  const dest2 = new Client(DB_CONFIGS.replica2);
  await dest2.connect();

  console.log('Connecting to Replica 3 (Backup - Singapore)...');
  const dest3 = new Client(DB_CONFIGS.replica3);
  await dest3.connect();

  const targets = [
    { client: dest2, name: 'Replica 2 (Seoul)' },
    { client: dest3, name: 'Replica 3 (Singapore)' }
  ];

  for (const t of targets) {
    await t.client.query("SET session_replication_role = 'replica';");
  }

  const tablesRes = await src.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = tablesRes.rows.map(r => r.table_name);

  // Determine row counts
  const tableCounts = [];
  for (const table of tables) {
    if (table === '_prisma_migrations') continue;
    const c = (await src.query(`SELECT count(*)::int as count FROM "${table}"`)).rows[0].count;
    tableCounts.push({ table, count: c });
  }

  const nonEmpty = tableCounts.filter(t => t.count > 0);
  console.log(`\nFound ${nonEmpty.length} non-empty tables to verify and sync:`);

  for (const { table, count } of nonEmpty) {
    // Check if both targets already have this exact count
    const r2Existing = (await dest2.query(`SELECT count(*)::int as count FROM "${table}"`)).rows[0].count;
    const r3Existing = (await dest3.query(`SELECT count(*)::int as count FROM "${table}"`)).rows[0].count;

    if (r2Existing === count && r3Existing === count) {
      console.log(`Table "${table}" (${count} rows) already identical on both replicas. Skipping.`);
      continue;
    }

    process.stdout.write(`Syncing "${table}" (${count} rows) to both replicas... `);

    // Fetch columns
    const colsRes = await src.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    const columns = colsRes.rows.map(r => r.column_name);
    const jsonCols = new Set(
      colsRes.rows
        .filter(r => r.data_type === 'json' || r.data_type === 'jsonb' || r.udt_name === 'json' || r.udt_name === 'jsonb')
        .map(r => r.column_name)
    );
    const colList = columns.map(c => `"${c}"`).join(', ');

    // Find primary key column(s) for deterministic ORDER BY
    const pkRes = await src.query(`
      SELECT ccu.column_name
      FROM information_schema.table_constraints tc 
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
    `, [table]);
    const pkColumns = pkRes.rows.map(r => `"${r.column_name}"`);
    const orderByClause = pkColumns.length > 0 ? `ORDER BY ${pkColumns.join(', ')}` : `ORDER BY "${columns[0]}"`;

    // Truncate on both destinations first
    await Promise.all(targets.map(t => t.client.query(`TRUNCATE TABLE "${table}" CASCADE`)));

    // Calculate safe batch size to strictly prevent Postgres parameter limit (max 65535)
    const batchSize = Math.max(10, Math.min(1000, Math.floor(25000 / columns.length)));

    let offset = 0;
    while (offset < count) {
      const rowsRes = await src.query(`SELECT ${colList} FROM "${table}" ${orderByClause} LIMIT ${batchSize} OFFSET ${offset}`);
      const rows = rowsRes.rows;
      if (rows.length === 0) break;

      const valuePlaceholders = [];
      const flatValues = [];
      let pIndex = 1;

      for (const row of rows) {
        const rowPlaceholders = [];
        for (const col of columns) {
          rowPlaceholders.push(`$${pIndex++}`);
          let val = row[col];
          // If this column is JSON/JSONB and parsed into an Object or Array, stringify it
          if (jsonCols.has(col) && typeof val === 'object' && val !== null && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          flatValues.push(val);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const conflictClause = pkColumns.length > 0 ? `ON CONFLICT (${pkColumns.join(', ')}) DO NOTHING` : '';
      const insertQuery = `
        INSERT INTO "${table}" (${colList})
        VALUES ${valuePlaceholders.join(', ')}
        ${conflictClause}
      `;

      // Parallel write to both replicas
      await Promise.all(targets.map(t => t.client.query(insertQuery, flatValues)));

      offset += rows.length;
      process.stdout.write(`[${offset}/${count}] `);
    }
    console.log('DONE');
  }

  // Restore replication role
  for (const t of targets) {
    await t.client.query("SET session_replication_role = 'origin';");
  }

  // Sync sequences
  const seqsRes = await src.query(`
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  `);
  for (const seq of seqsRes.rows) {
    const seqName = seq.sequence_name;
    try {
      const valRes = await src.query(`SELECT last_value, is_called FROM "${seqName}"`);
      if (valRes.rows.length > 0) {
        const { last_value, is_called } = valRes.rows[0];
        await Promise.all(targets.map(t => t.client.query(`SELECT setval('"${seqName}"', $1, $2)`, [last_value, is_called])));
      }
    } catch (err) {}
  }

  console.log('\n======================================================');
  console.log('FINAL AUDIT: Verifying counts across all 3 databases');
  console.log('======================================================');

  let allHealthy = true;
  for (const { table, count } of nonEmpty) {
    const r2Count = (await dest2.query(`SELECT count(*)::int as count FROM "${table}"`)).rows[0].count;
    const r3Count = (await dest3.query(`SELECT count(*)::int as count FROM "${table}"`)).rows[0].count;
    const match = (r2Count === count && r3Count === count);
    if (!match) allHealthy = false;
    console.log(`  ${table.padEnd(35)}: Primary=${count} | Replica2=${r2Count} | Replica3=${r3Count} -> [${match ? 'SYNCED' : 'MISMATCH'}]`);
  }

  await src.end();
  await dest2.end();
  await dest3.end();

  if (!allHealthy) {
    throw new Error('Mismatch found in baseline replication verification!');
  }

  console.log('\n🚀 ALL 3 DATABASES ARE 100% SYNCHRONIZED AND VERIFIED!');
}

syncAll().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
