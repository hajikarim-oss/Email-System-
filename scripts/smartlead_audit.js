const https = require('https');

const primaryKey = 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
const secondaryKey = 'e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt';

function callSmartlead(endpoint, key) {
  return new Promise((resolve) => {
    const url = `https://server.smartlead.ai/api/v1${endpoint}?api_key=${key}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });
}

async function run() {
  console.log('--- SMARTLEAD AUDIT ---');
  console.log('Primary Key Length:', primaryKey.length);
  console.log('Secondary Key Length:', secondaryKey.length);

  // 1. Email Accounts / Mailboxes
  const accountsPrimary = await callSmartlead('/email-accounts', primaryKey);
  console.log('Primary Key Email Accounts Status:', accountsPrimary.status);
  if (Array.isArray(accountsPrimary.data)) {
    console.log(`Primary Key Email Accounts Count: ${accountsPrimary.data.length}`);
    accountsPrimary.data.forEach(a => console.log(`  - [ID: ${a.id}] ${a.from_name} <${a.from_email}> | Status: ${a.status} | Warmup: ${a.warmup_status}`));
  }

  // 2. Campaigns
  const campaignsPrimary = await callSmartlead('/campaigns', primaryKey);
  console.log('Primary Key Campaigns Status:', campaignsPrimary.status);
  if (Array.isArray(campaignsPrimary.data)) {
    console.log(`Primary Key Campaigns Count: ${campaignsPrimary.data.length}`);
    campaignsPrimary.data.slice(0, 5).forEach(c => console.log(`  - [ID: ${c.id}] ${c.name} | Status: ${c.status} | Created: ${c.created_at}`));
  }

  // 3. Check Secondary Key
  const accountsSecondary = await callSmartlead('/email-accounts', secondaryKey);
  console.log('\nSecondary Key Email Accounts Status:', accountsSecondary.status);
  if (Array.isArray(accountsSecondary.data)) {
    console.log(`Secondary Key Email Accounts Count: ${accountsSecondary.data.length}`);
    accountsSecondary.data.forEach(a => console.log(`  - [ID: ${a.id}] ${a.from_name} <${a.from_email}> | Status: ${a.status}`));
  }
}

run();
