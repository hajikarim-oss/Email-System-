// ==============================================================================
// Tally Prime Live Connectivity Probe
// Diagnoses local Tally Prime installation, port 9000, and active company
// ==============================================================================

import http from 'node:http';
import { TallyXmlBuilder } from './xmlBuilder';
import { TallyXmlParser } from './xmlParser';

const TALLY_HOST = process.env.TALLY_HOST || '127.0.0.1';
const TALLY_PORT = parseInt(process.env.TALLY_PORT || '9000', 10);

async function probeTally() {
    console.log('========================================================');
    console.log(`🔍 PROBING TALLY PRIME ON ${TALLY_HOST}:${TALLY_PORT}`);
    console.log('========================================================\n');

    const reqXml = TallyXmlBuilder.buildCompanyDetailsRequest();

    const result = await new Promise<{ ok: boolean; data?: string; error?: string }>((resolve) => {
        const req = http.request({
            hostname: TALLY_HOST,
            port: TALLY_PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': Buffer.byteLength(reqXml),
            },
            timeout: 4000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ ok: res.statusCode === 200, data }));
        });

        req.on('error', (err: any) => {
            resolve({ ok: false, error: err.message });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, error: 'Connection timed out (no response on port 9000)' });
        });

        req.write(reqXml);
        req.end();
    });

    if (!result.ok) {
        console.log(`❌ STATUS: TALLY NOT RESPONDING ON PORT ${TALLY_PORT}`);
        console.log(`   Reason: ${result.error || 'HTTP Error'}\n`);
        console.log('📋 HOW TO CONNECT TALLY PRIME ON THIS DESKTOP:');
        console.log('   1. Ensure Tally Prime is open with your Company loaded.');
        console.log('   2. Enable XML/ODBC Server in Tally:');
        console.log('      - Press F1 (Help) in Tally Prime');
        console.log('      - Navigate to: Settings > Connectivity');
        console.log('      - Under "Client/Server configuration":');
        console.log('        • Set "TallyPrime acts as" -> Both (or Server)');
        console.log('        • Set "Port" -> 9000');
        console.log('      - Accept and restart Tally Prime if prompted.');
        console.log('   3. Re-run this probe command: npx tsx server/tally/probe.ts\n');
        return;
    }

    console.log(`✅ SUCCESS: Tally Prime is OPEN and RESPONDING on port ${TALLY_PORT}!\n`);

    const company = TallyXmlParser.parseCompanyDetails(result.data || '');
    if (company) {
        console.log('🏢 ACTIVE TALLY COMPANY DETAILS:');
        console.log(`   • Company Name : ${company.companyName}`);
        console.log(`   • Company GUID : ${company.companyGuid}`);
        console.log(`   • Formal Name  : ${company.formalName}`);
        console.log(`   • Financial Yr : Books starting from ${company.booksFrom || company.startingFrom}`);
        console.log('\n🟢 Live sync agent is ready to pull real vouchers from this desktop.');
    } else {
        console.log('⚠️ Tally responded, but no company appears to be open.');
        console.log('   Please select and load a company in Tally Prime (Alt + F3).');
    }
    console.log('========================================================\n');
}

probeTally().catch(err => {
    console.error('Probe failed:', err);
});
