const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true';
const SMARTLEAD_KEY = 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';

async function main() {
    const parsed = new URL(DATABASE_URL);
    parsed.searchParams.delete('sslmode');
    const client = new Client({ connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } });
    await client.connect();

    console.log('--- DB USERS ---');
    const users = await client.query('SELECT id, email, role FROM "User"');
    console.log(users.rows);

    const evCounts = await client.query('SELECT count(*), "eventType" FROM "EmailEvent" GROUP BY "eventType"');
    console.log('EmailEvent counts:', evCounts.rows);
    const sample = await client.query('SELECT * FROM "EmailEvent" ORDER BY "createdAt" DESC LIMIT 5');
    console.log('Recent EmailEvents:', sample.rows);

    console.log('--- DB LEADS COUNT ---');
    const leads = await client.query('SELECT "campaignId", count(*) FROM "Lead" GROUP BY "campaignId"');
    console.log(leads.rows);

    await client.end();

    console.log('--- SMARTLEAD CAMPAIGN 4103333 ---');
    const res = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333?api_key=${SMARTLEAD_KEY}`);
    const data = await res.json();
    console.log('Smartlead campaign:', data);

    console.log('--- SMARTLEAD CAMPAIGN 4103333 WEBHOOKS ---');
    const whRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/webhooks?api_key=${SMARTLEAD_KEY}`);
    const whData = await whRes.json();
    console.log('Webhooks:', whData);

    console.log('--- SMARTLEAD CAMPAIGN 4103333 ANALYTICS ---');
    const stRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/analytics?api_key=${SMARTLEAD_KEY}`);
    const stData = await stRes.json();
    console.log('Analytics:', stData);

    console.log('--- SMARTLEAD ALL CAMPAIGNS ---');
    const allRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${SMARTLEAD_KEY}`);
    const allData = await allRes.json();
    console.log('All campaigns:', allData.map(c => ({ id: c.id, name: c.name, status: c.status, user_id: c.user_id, created_at: c.created_at })));
}

main().catch(console.error);
