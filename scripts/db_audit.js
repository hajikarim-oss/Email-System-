const { Client } = require('pg');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const connectionString = 'postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log('--- DATABASE AUDIT ---');
    
    // 1. Version
    const v = await client.query('SELECT version();');
    console.log('PostgreSQL Version:', v.rows[0].version);

    // 2. Tables list
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables in public schema:', tables.rows.map(r => r.table_name).join(', '));

    // 3. Campaign Count
    const count = await client.query('SELECT COUNT(*) FROM "Campaign";');
    console.log('Total Campaigns Count:', count.rows[0].count);

    // 4. Recent Campaigns
    const camps = await client.query('SELECT id, name, "createdAt", "providerCampaignId", status FROM "Campaign" ORDER BY "createdAt" DESC LIMIT 5;');
    console.log('Recent 5 Campaigns:', JSON.stringify(camps.rows, null, 2));

    // 5. Other table counts
    const users = await client.query('SELECT COUNT(*) FROM "User";');
    const leads = await client.query('SELECT COUNT(*) FROM "Lead";');
    const mailboxes = await client.query('SELECT COUNT(*) FROM "Mailbox";');
    const brands = await client.query('SELECT COUNT(*) FROM "Brand";');
    console.log('User count:', users.rows[0].count);
    console.log('Lead count:', leads.rows[0].count);
    console.log('Mailbox count:', mailboxes.rows[0].count);
    console.log('Brand count:', brands.rows[0].count);

    const userList = await client.query('SELECT id, email, name, role FROM "User" LIMIT 5;');
    console.log('Users sample:', userList.rows);

  } catch (err) {
    console.error('Audit DB error:', err.message);
  } finally {
    await client.end();
  }
}

run();
