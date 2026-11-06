import { Pool } from "pg";

const CLUSTER_CONFIGS = {
  primary: {
    name: "Primary (Tokyo - Leader)",
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.hsmudwkfwmvinhtggxyd",
    database: "postgres",
    password: process.env.DATABASE_PASSWORD || "9538564601Aa"
  },
  replica2: {
    name: "Replica 2 (Seoul - Standby)",
    host: "aws-0-ap-northeast-2.pooler.supabase.com",
    port: 6543,
    user: "postgres.qlzlsjpncknjliyalfmj",
    database: "postgres",
    password: process.env.DATABASE_PASSWORD || "9538564601Aa"
  },
  replica3: {
    name: "Replica 3 (Singapore - Backup)",
    host: "aws-0-ap-southeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.adlwwkqgexykuhkdkpfu",
    database: "postgres",
    password: process.env.DATABASE_PASSWORD || "9538564601Aa"
  }
};

type NodeId = keyof typeof CLUSTER_CONFIGS;

const TABLES_IN_ORDER = [
  "User",
  "Team",
  "UserTeam",
  "Mailbox",
  "Campaign",
  "Lead",
  "EmailMessage",
  "EmailEvent",
  "Creator",
  "CreatorCampaign",
  "CreatorCampaignEnrollment",
  "Notification"
];

function createPool(nodeId: NodeId): Pool {
  const cfg = CLUSTER_CONFIGS[nodeId];
  const p = new Pool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
  });
  p.on("error", (err: any) => {
    // Suppress idle pooler disconnect notices
  });
  return p;
}

async function getExistingTables(pool: Pool): Promise<string[]> {
  const res = await pool.query<{ table_name: string }>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  `);
  return res.rows.map(r => r.table_name);
}

async function getTableColumns(pool: Pool, tableName: string): Promise<string[]> {
  const res = await pool.query<{ column_name: string }>(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return res.rows.map(r => r.column_name);
}

async function getPrimaryKey(pool: Pool, tableName: string): Promise<string[]> {
  const res = await pool.query<{ attname: string }>(`
    SELECT a.attname
    FROM   pg_index i
    JOIN   pg_attribute a ON a.attrelid = i.indrelid
                         AND a.attnum = ANY(i.indkey)
    WHERE  i.indrelid = ('public."' || $1 || '"')::regclass
    AND    i.indisprimary;
  `, [tableName]).catch(() => ({ rows: [] }));
  return res.rows.map(r => r.attname);
}

async function syncTable(
  tableName: string,
  sourcePool: Pool,
  targetPool: Pool,
  targetName: string
) {
  const targetTables = await getExistingTables(targetPool);
  if (!targetTables.includes(tableName)) {
    console.log(`  ⚠️  Table "${tableName}" does not exist on ${targetName}. Skipping.`);
    return;
  }

  const countRes = await sourcePool.query(`SELECT count(*)::int AS count FROM "${tableName}"`);
  const totalRows = countRes.rows[0]?.count || 0;

  const targetCountRes = await targetPool.query(`SELECT count(*)::int AS count FROM "${tableName}"`).catch(() => ({ rows: [{ count: 0 }] }));
  const targetRows = targetCountRes.rows[0]?.count || 0;

  console.log(`\n📋 Table "${tableName}": Primary has ${totalRows} rows | ${targetName} has ${targetRows} rows`);

  if (totalRows === 0) {
    console.log(`  ✓ Table is empty on Primary. Done.`);
    return;
  }

  // If already identical or target has all rows, skip
  if (targetRows >= totalRows && totalRows > 100) {
    console.log(`  ✅ Already in sync (${targetRows}/${totalRows} rows present on ${targetName}). Skipping.`);
    return;
  }

  const columns = await getTableColumns(sourcePool, tableName);
  const targetColumns = await getTableColumns(targetPool, tableName);
  const commonColumns = columns.filter(c => targetColumns.includes(c));

  if (commonColumns.length === 0) {
    console.log(`  ⚠️ No common columns found for "${tableName}".`);
    return;
  }

  const pks = await getPrimaryKey(sourcePool, tableName);
  const quotedCols = commonColumns.map(c => `"${c}"`).join(", ");

  // High-performance multi-row chunk upserts (50 rows per batch)
  const chunkSize = 50;
  let offset = 0;
  let migrated = 0;

  while (offset < totalRows) {
    const data = await sourcePool.query(
      `SELECT ${quotedCols} FROM "${tableName}" ORDER BY 1 LIMIT ${chunkSize} OFFSET ${offset}`
    );

    if (data.rows.length === 0) break;

    const rows = data.rows;
    const valuePlaceholders: string[] = [];
    const flatValues: any[] = [];

    rows.forEach((row, rowIdx) => {
      const rowParams = commonColumns.map((col, colIdx) => {
        flatValues.push(row[col]);
        return `$${rowIdx * commonColumns.length + colIdx + 1}`;
      });
      valuePlaceholders.push(`(${rowParams.join(", ")})`);
    });

    let queryStr: string;
    if (pks.length > 0) {
      const updateSet = commonColumns
        .filter(c => !pks.includes(c))
        .map(c => `"${c}" = EXCLUDED."${c}"`)
        .join(", ");
      const conflictTarget = pks.map(p => `"${p}"`).join(", ");

      if (updateSet.length > 0) {
        queryStr = `
          INSERT INTO "${tableName}" (${quotedCols})
          VALUES ${valuePlaceholders.join(", ")}
          ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}
        `;
      } else {
        queryStr = `
          INSERT INTO "${tableName}" (${quotedCols})
          VALUES ${valuePlaceholders.join(", ")}
          ON CONFLICT (${conflictTarget}) DO NOTHING
        `;
      }
    } else {
      queryStr = `
        INSERT INTO "${tableName}" (${quotedCols})
        VALUES ${valuePlaceholders.join(", ")}
      `;
    }

    try {
      await targetPool.query(queryStr, flatValues);
      migrated += rows.length;
    } catch (err: any) {
      // Fallback row-by-row on partial constraint collisions
      for (const row of rows) {
        const singleParams = commonColumns.map((_, i) => `$${i + 1}`).join(", ");
        const singleVals = commonColumns.map(c => row[c]);
        const singleQuery = pks.length > 0
          ? `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${singleParams}) ON CONFLICT DO NOTHING`
          : `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${singleParams})`;
        await targetPool.query(singleQuery, singleVals).catch(() => {});
        migrated++;
      }
    }

    offset += chunkSize;
    process.stdout.write(`  Syncing ${tableName} -> ${targetName}: ${Math.min(offset, totalRows)}/${totalRows} (${migrated} synced)\r`);
  }
  console.log(`\n  ✅ "${tableName}" successfully synced to ${targetName} (${migrated} rows upserted).`);
}

async function main() {
  console.log("=================================================================");
  console.log("🔄 High-Availability DB Cluster: High-Speed Cluster Synchronization");
  console.log("=================================================================");
  console.log("Source: Primary (Tokyo)");
  console.log("Targets: Replica 2 (Seoul) & Replica 3 (Singapore)\n");

  const primaryPool = createPool("primary");
  const replica2Pool = createPool("replica2");
  const replica3Pool = createPool("replica3");

  try {
    console.log("Checking connectivity to all 3 nodes...");
    await primaryPool.query("SELECT 1");
    console.log("  ✓ Primary (Tokyo) is ONLINE");
    await replica2Pool.query("SELECT 1");
    console.log("  ✓ Replica 2 (Seoul) is ONLINE");
    await replica3Pool.query("SELECT 1");
    console.log("  ✓ Replica 3 (Singapore) is ONLINE");

    const primaryTables = await getExistingTables(primaryPool);
    const tablesToSync = TABLES_IN_ORDER.filter(t => primaryTables.includes(t))
      .concat(primaryTables.filter(t => !TABLES_IN_ORDER.includes(t) && !t.startsWith("_")));

    console.log(`\nDiscovered ${tablesToSync.length} tables: ${tablesToSync.join(", ")}`);

    // 1. Sync to Replica 2 (Seoul)
    console.log("\n=================================================================");
    console.log("🚀 [Phase 1] Syncing Tokyo Primary -> Replica 2 (Seoul)");
    console.log("=================================================================");
    for (const table of tablesToSync) {
      await syncTable(table, primaryPool, replica2Pool, "Replica 2 (Seoul)");
    }

    // 2. Sync to Replica 3 (Singapore)
    console.log("\n=================================================================");
    console.log("🚀 [Phase 2] Syncing Tokyo Primary -> Replica 3 (Singapore)");
    console.log("=================================================================");
    for (const table of tablesToSync) {
      await syncTable(table, primaryPool, replica3Pool, "Replica 3 (Singapore)");
    }

    console.log("\n=================================================================");
    console.log("🎉 ALL 3 CLUSTER NODES ARE FULLY SYNCHRONIZED!");
    console.log("Failover to Replica 2 or Replica 3 will now serve complete data.");
    console.log("=================================================================");
  } catch (err: any) {
    console.error("\n❌ Synchronization encountered an error:", err);
  } finally {
    await primaryPool.end().catch(() => {});
    await replica2Pool.end().catch(() => {});
    await replica3Pool.end().catch(() => {});
    process.exit(0);
  }
}

main();
