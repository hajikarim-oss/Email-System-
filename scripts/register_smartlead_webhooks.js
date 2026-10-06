const https = require('https');
const fs = require('fs');
const path = require('path');

// Read environment
function getEnv(key) {
    if (process.env[key]) return process.env[key];
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', 'nexus-outbound', '.env')
    ];
    for (const p of envPaths) {
        if (fs.existsSync(p)) {
            const lines = fs.readFileSync(p, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith(`${key}=`)) {
                    return trimmed.split('=')[1].replace(/^["']|["']$/g, '').trim();
                }
            }
        }
    }
    return null;
}

const API_KEY = getEnv('SMARTLEAD_API_KEY') || 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
const WEBHOOK_URL = 'https://tbmoutreach.tech/api/webhooks/smartlead';
const BASE_URL = 'https://server.smartlead.ai/api/v1';

function request(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const sep = endpoint.includes('?') ? '&' : '?';
        const urlStr = `${BASE_URL}${endpoint}${sep}api_key=${API_KEY}`;
        const parsed = new URL(urlStr);

        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method,
            headers: { 'Content-Type': 'application/json' },
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsedData = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, data: parsedData });
                } catch {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function registerAllWebhooks() {
    console.log('====================================================');
    console.log('📡 SMARTLEAD WEBHOOK SYNCHRONIZATION & REGISTRATION');
    console.log(`🎯 Target Webhook URL: ${WEBHOOK_URL}`);
    console.log('====================================================\n');

    try {
        console.log('1. Fetching all active campaigns from Smartlead...');
        const res = await request('/campaigns');
        if (res.status !== 200 || !Array.isArray(res.data)) {
            console.error('❌ Failed to fetch campaigns:', res);
            return;
        }

        const campaigns = res.data;
        console.log(`✅ Found ${campaigns.length} campaigns in Smartlead.\n`);

        for (const camp of campaigns) {
            console.log(`🔍 Campaign #${camp.id} (${camp.name || 'Unnamed'}): Checking webhooks...`);
            const whRes = await request(`/campaigns/${camp.id}/webhooks`);
            const existing = Array.isArray(whRes.data) ? whRes.data : [];

            const isRegistered = existing.some(w => w.webhook_url && w.webhook_url.includes('tbmoutreach.tech'));

            if (isRegistered) {
                console.log(`   ✨ Webhook already active for Campaign #${camp.id}`);
            } else {
                console.log(`   ➕ Registering ${WEBHOOK_URL} for Campaign #${camp.id}...`);
                const createRes = await request(`/campaigns/${camp.id}/webhooks`, 'POST', {
                    name: 'TBM Outreach Production Webhook',
                    webhook_url: WEBHOOK_URL,
                    event_types: [
                        'EMAIL_OPEN',
                        'EMAIL_SENT',
                        'EMAIL_REPLY',
                        'EMAIL_BOUNCE',
                        'EMAIL_LINK_CLICK',
                        'LEAD_UNSUBSCRIBED',
                    ],
                });

                if (createRes.status >= 200 && createRes.status < 300) {
                    console.log(`   ✅ Successfully registered webhook for Campaign #${camp.id}`);
                } else {
                    console.warn(`   ⚠️ Registration response:`, createRes);
                }
            }
        }

        console.log('\n====================================================');
        console.log('🎉 ALL SMARTLEAD CAMPAIGN WEBHOOKS CONFIGURED!');
        console.log('====================================================');
    } catch (err) {
        console.error('❌ Error during webhook registration:', err.message);
    }
}

registerAllWebhooks();
