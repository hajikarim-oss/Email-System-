const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const SMARTLEAD_KEY = 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
const WEBHOOK_URL = 'https://tbmoutreach.tech/api/webhooks/smartlead';

async function main() {
    const parsed = new URL(DATABASE_URL);
    parsed.searchParams.delete('sslmode');
    const client = new Client({ connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } });
    await client.connect();

    console.log('--- 1. FETCHING CAMPAIGN 4103333 FROM SMARTLEAD ---');
    const campRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333?api_key=${SMARTLEAD_KEY}`);
    const slCamp = await campRes.json();
    console.log('Smartlead Campaign Details:', { id: slCamp.id, name: slCamp.name, status: slCamp.status });

    const enumRes = await client.query(`
        SELECT t.typname, e.enumlabel 
        FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname IN ('LeadStatus', 'LeadCategory', 'CampaignStatus')
    `);
    console.log('Enum values:', enumRes.rows);

    // 3. UPSERT CAMPAIGN IN DATABASE
    console.log('--- 2. UPSERTING CAMPAIGN IN DATABASE ---');
    const checkCamp = await client.query('SELECT id FROM "Campaign" WHERE "providerCampaignId" = $1', ['4103333']);
    let dbCampId = checkCamp.rows[0]?.id;

    if (!dbCampId) {
        const insCamp = await client.query(`
            INSERT INTO "Campaign" (
                id, "userId", name, status, "providerCampaignId", 
                "sendTimezone", "preferredSendHour", "preferredSendDays", 
                "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, $1, $2, $3, $4, 
                $5, $6, $7, 
                NOW(), NOW()
            ) RETURNING id
        `, [
            userId,
            slCamp.name || 'Health Outreach Campaign',
            slCamp.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
            '4103333',
            slCamp.scheduler_cron_value?.tz || 'Asia/Kolkata',
            slCamp.scheduler_cron_value?.startHour ? parseInt(slCamp.scheduler_cron_value.startHour.split(':')[0]) : 9,
            slCamp.scheduler_cron_value?.days || [1, 2, 3, 4, 5]
        ]);
        dbCampId = insCamp.rows[0].id;
        console.log(`Created new campaign in DB: ${dbCampId}`);
    } else {
        await client.query(`
            UPDATE "Campaign" 
            SET name = $1, status = $2, "updatedAt" = NOW() 
            WHERE id = $3
        `, [slCamp.name, slCamp.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT', dbCampId]);
        console.log(`Updated existing campaign in DB: ${dbCampId}`);
    }

    // 4. REGISTER WEBHOOK IN SMARTLEAD
    console.log('--- 3. REGISTERING WEBHOOK IN SMARTLEAD ---');
    const whCheck = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/webhooks?api_key=${SMARTLEAD_KEY}`);
    const existingWhs = await whCheck.json();
    const hasWh = Array.isArray(existingWhs) && existingWhs.some(w => w.webhook_url === WEBHOOK_URL);

    if (!hasWh) {
        const whCreate = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/webhooks?api_key=${SMARTLEAD_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'TBM Outreach Production Webhook',
                webhook_url: WEBHOOK_URL,
                event_types: [
                    'EMAIL_OPEN',
                    'EMAIL_SENT',
                    'EMAIL_REPLY',
                    'EMAIL_BOUNCE',
                    'EMAIL_LINK_CLICK',
                    'LEAD_UNSUBSCRIBED'
                ]
            })
        });
        const whCreated = await whCreate.json();
        console.log('Webhook registered response:', whCreated);
    } else {
        console.log('Webhook already registered in Smartlead.');
    }

    // 5. FETCH ALL LEADS FROM SMARTLEAD AND SYNC TO DATABASE
    console.log('--- 4. FETCHING & SYNCING ALL 381 LEADS FROM SMARTLEAD ---');
    let offset = 0;
    const limit = 100;
    let allLeads = [];

    while (true) {
        console.log(`Fetching leads offset ${offset}...`);
        const leadsRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/leads?limit=${limit}&offset=${offset}&api_key=${SMARTLEAD_KEY}`);
        const data = await leadsRes.json();
        const batch = data.data || [];
        if (batch.length === 0) break;
        allLeads = allLeads.concat(batch);
        offset += limit;
        if (allLeads.length >= parseInt(data.total_leads || '381')) break;
    }

    console.log(`Fetched ${allLeads.length} leads from Smartlead. Inserting/updating in DB...`);

    let inserted = 0;
    let updated = 0;

    for (const item of allLeads) {
        const lead = item.lead;
        if (!lead || !lead.email) continue;

        const email = lead.email.toLowerCase().trim();
        const firstName = lead.first_name || '';
        const lastName = lead.last_name || '';
        const providerLeadId = String(lead.id);
        const customData = lead.custom_fields || {};
        
        let leadStatus = 'ACTIVE';
        if (item.status === 'BOUNCED') leadStatus = 'BOUNCED';
        else if (item.status === 'UNSUBSCRIBED') leadStatus = 'UNSUBSCRIBED';
        else if (item.status === 'REPLIED') leadStatus = 'REPLIED';
        else leadStatus = 'ACTIVE';

        // Check if lead exists by email and campaignId
        const existing = await client.query('SELECT id FROM "Lead" WHERE email = $1 AND "campaignId" = $2', [email, dbCampId]);

        if (existing.rows.length === 0) {
            await client.query(`
                INSERT INTO "Lead" (
                    id, "campaignId", email, "firstName", "lastName", 
                    "providerLeadId", "customData", status, "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid()::text, $1, $2, $3, $4, 
                    $5, $6, $7, NOW(), NOW()
                )
            `, [
                dbCampId,
                email,
                firstName,
                lastName,
                providerLeadId,
                JSON.stringify(customData),
                leadStatus
            ]);
            inserted++;
        } else {
            await client.query(`
                UPDATE "Lead" 
                SET "providerLeadId" = $1, "customData" = $2, status = $3, "updatedAt" = NOW()
                WHERE id = $4
            `, [providerLeadId, JSON.stringify(customData), leadStatus, existing.rows[0].id]);
            updated++;
        }
    }

    console.log(`Leads sync finished: ${inserted} inserted, ${updated} updated.`);

    // 6. SYNC CAMPAIGN STATISTICS FROM SMARTLEAD
    console.log('--- 5. SYNCING ANALYTICS / STATS ---');
    const statRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/4103333/analytics?api_key=${SMARTLEAD_KEY}`);
    const stats = await statRes.json();
    console.log('Campaign Analytics:', {
        sent: stats.sent_count,
        opened: stats.open_count,
        clicked: stats.click_count,
        bounced: stats.bounce_count,
        total: stats.total_count
    });

    // Verify lead count in DB
    const dbLeadCount = await client.query('SELECT count(*) FROM "Lead" WHERE "campaignId" = $1', [dbCampId]);
    console.log(`Total Leads in DB for Campaign ${dbCampId}:`, dbLeadCount.rows[0].count);

    await client.end();
    console.log('--- SYNC COMPLETED SUCCESSFULLY ---');
}

main().catch(console.error);
