/**
 * Smartlead Webhook Test Utility (Local & Live)
 *
 * Usage:
 *   node scripts/test_webhooks.js --live
 *   node scripts/test_webhooks.js --local-vite
 *   node scripts/test_webhooks.js --local-next
 *   node scripts/test_webhooks.js --target=http://localhost:5173/api/webhooks/smartlead
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET = 'nexus_wh_sec_9538564601_smartlead';

function computeSignature(payloadString, secret) {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

function sendRequest(targetUrl, payload, signature = null) {
    return new Promise((resolve) => {
        const u = new URL(targetUrl);
        const isHttps = u.protocol === 'https:';
        const client = isHttps ? https : http;
        const bodyStr = JSON.stringify(payload);

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
        };
        if (signature) {
            headers['x-smartlead-signature'] = signature;
        }

        const req = client.request({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + (u.search || ''),
            method: 'POST',
            headers,
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', (err) => {
            resolve({ status: 0, error: err.message });
        });

        req.write(bodyStr);
        req.end();
    });
}

async function runTests(targetUrl) {
    console.log(`\n======================================================`);
    console.log(` Testing Webhooks against: ${targetUrl}`);
    console.log(`======================================================\n`);

    const testEvents = [
        {
            name: "1. Client Email Open (Valid Signature)",
            payload: {
                event_type: "EMAIL_OPEN",
                email: "prospect_ceo@acme-corp.com",
                email_campaign_id: 3891854,
                from_email: "monu@theboredmonkey.com",
                event_id: `test_open_${Date.now()}`
            },
            sign: true
        },
        {
            name: "2. Client Reply (Positive / Meeting Request)",
            payload: {
                event_type: "EMAIL_REPLY",
                email: "partner@globaltech.com",
                email_campaign_id: 3891854,
                from_email: "monu@theboredmonkey.com",
                reply_text: "Sounds great Monu, let's connect on Thursday at 2 PM.",
                event_id: `test_reply_${Date.now()}`
            },
            sign: true
        },
        {
            name: "3. Hard Bounce (Auto-Suppression Trigger)",
            payload: {
                event_type: "EMAIL_BOUNCE",
                email: "invalid_mailbox_998@nonexistent-domain.xyz",
                email_campaign_id: 3891854,
                from_email: "monu@theboredmonkey.com",
                bounce_type: "HARD_BOUNCE",
                event_id: `test_bounce_${Date.now()}`
            },
            sign: true
        },
        {
            name: "4. Internal Team Open Filter (Should be ignored)",
            payload: {
                event_type: "EMAIL_OPEN",
                email: "monu@theboredmonkey.com",
                email_campaign_id: 3891854,
                from_email: "monu@theboredmonkey.com",
                event_id: `test_internal_${Date.now()}`
            },
            sign: true
        },
        {
            name: "5. Invalid HMAC Signature (Security Reject Test)",
            payload: {
                event_type: "EMAIL_OPEN",
                email: "hacker@malicious.com",
                email_campaign_id: 3891854,
            },
            customSig: "invalid_tampered_signature_hex"
        }
    ];

    for (const test of testEvents) {
        let sig = null;
        if (test.sign) {
            sig = computeSignature(JSON.stringify(test.payload), SECRET);
        } else if (test.customSig) {
            sig = test.customSig;
        }

        const res = await sendRequest(targetUrl, test.payload, sig);
        console.log(`[TEST] ${test.name}`);
        console.log(`  Status: ${res.status}`);
        console.log(`  Response:`, JSON.stringify(res.data || res.error));
        console.log('------------------------------------------------------');
    }
}

async function main() {
    const args = process.argv.slice(2);
    let target = 'https://email-system-omega.vercel.app/api/webhooks/smartlead';

    if (args.includes('--local-vite')) {
        target = 'http://localhost:5173/api/webhooks/smartlead';
    } else if (args.includes('--local-next')) {
        target = 'http://localhost:3000/api/webhooks/smartlead';
    } else {
        const custom = args.find(a => a.startsWith('--target='));
        if (custom) target = custom.split('=')[1];
    }

    await runTests(target);
}

main();
