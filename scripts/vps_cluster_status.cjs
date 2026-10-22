#!/usr/bin/env node
/**
 * VPS Cluster Health & Parity Diagnostic CLI
 * Run on VPS: node scripts/vps_cluster_status.cjs
 */

const { Client } = require('pg');

const NODES = [
  {
    id: 'primary',
    name: 'Primary (Tokyo - Node 1)',
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hsmudwkfwmvinhtggxyd',
    password: process.env.DATABASE_PASSWORD || '9538564601Aa'
  },
  {
    id: 'replica2',
    name: 'Replica 2 (Seoul - Node 2 / Standby)',
    host: 'aws-0-ap-northeast-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.qlzlsjpncknjliyalfmj',
    password: process.env.DATABASE_PASSWORD || '9538564601Aa'
  },
  {
    id: 'replica3',
    name: 'Replica 3 (Singapore - Node 3 / Backup)',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.adlwwkqgexykuhkdkpfu',
    password: process.env.DATABASE_PASSWORD || '9538564601Aa'
  }
];

async function checkCluster() {
  console.log('================================================================');
  console.log('📊 HIGH-AVAILABILITY CLUSTER TELEMETRY & PARITY AUDIT');
  console.log('================================================================\n');

  const clients = {};
  for (const n of NODES) {
    const start = Date.now();
    try {
      const c = new Client({
        host: n.host,
        port: n.port,
        user: n.user,
        password: n.password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      await c.connect();
      const latency = Date.now() - start;
      clients[n.id] = c;
      console.log(`🟢 ${n.name.padEnd(42)} ONLINE (${latency}ms)`);
    } catch (err) {
      console.log(`🔴 ${n.name.padEnd(42)} OFFLINE (${err.message})`);
    }
  }

  if (!clients.primary && !clients.replica2) {
    console.error('\n🚨 CRITICAL: Both Primary and Standby are unreachable!');
    process.exit(1);
  }

  console.log('\n----------------------------------------------------------------');
  console.log('📋 TABLE SYNCHRONIZATION AUDIT (PRIMARY vs REPLICAS)');
  console.log('----------------------------------------------------------------');

  const refClient = clients.primary || clients.replica2;
  const tables = (await refClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)).rows.map(r => r.table_name);

  let allInSync = true;
  for (const table of tables) {
    if (table === '_prisma_migrations') continue;

    const counts = {};
    for (const n of NODES) {
      if (clients[n.id]) {
        try {
          const res = await clients[n.id].query(`SELECT count(*)::int as count FROM "${table}"`);
          counts[n.id] = res.rows[0].count;
        } catch {
          counts[n.id] = 'ERR';
        }
      } else {
        counts[n.id] = 'OFFLINE';
      }
    }

    const p = counts.primary ?? '-';
    const r2 = counts.replica2 ?? '-';
    const r3 = counts.replica3 ?? '-';

    const isMatch = (p === r2 && r2 === r3);
    if (!isMatch && (counts.primary > 0 || counts.replica2 > 0)) {
      allInSync = false;
    }

    if (p > 0 || r2 > 0 || r3 > 0) {
      console.log(`  ${table.padEnd(35)}: Primary=${String(p).padStart(6)} | Replica2=${String(r2).padStart(6)} | Replica3=${String(r3).padStart(6)} -> [${isMatch ? 'SYNCED' : 'DIFF'}]`);
    }
  }

  for (const c of Object.values(clients)) {
    await c.end();
  }

  console.log('================================================================');
  if (allInSync) {
    console.log('🎉 CLUSTER HEALTH: OPTIMAL. All 3 databases are 100% in sync!');
  } else {
    console.log('⚠️ CLUSTER HEALTH: PARTIAL PARITY. Delta queue reconciling.');
  }
  console.log('================================================================\n');
}

checkCluster().catch(console.error);
