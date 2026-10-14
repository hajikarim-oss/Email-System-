// ==============================================================================
// Phase 1 Test Suite: Database Schemas, XML Engine & Tally Mock Harness
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { TallyXmlBuilder } from '../../server/tally/xmlBuilder';
import { TallyXmlParser } from '../../server/tally/xmlParser';
import { TallyMockServer } from '../../server/tally/mockServer';

async function postXml(url: string, xmlBody: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = http.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': Buffer.byteLength(xmlBody),
            },
            timeout: 3000,
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('HTTP request timed out'));
        });
        req.write(xmlBody);
        req.end();
    });
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(`Assertion Failed: ${msg}`);
    }
}

async function runPhase1Tests() {
    console.log('====================================================');
    console.log('▶ STARTING PHASE 1 TEST SUITE: TALLY INTEGRATION');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    const test = async (name: string, fn: () => Promise<void> | void) => {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`  ✗ ${name}`);
            console.error(`    Error: ${err.message}\n`);
            failed++;
        }
    };

    // --------------------------------------------------------------------------
    // Test Group 1: XML Builder Verification
    // --------------------------------------------------------------------------
    console.log('--- 1. XML Builder Unit Tests ---');

    await test('TallyXmlBuilder generates valid Company Details request', () => {
        const xml = TallyXmlBuilder.buildCompanyDetailsRequest();
        assert(xml.includes('<REPORTNAME>Company Details</REPORTNAME>'), 'Contains Company Details report');
        assert(xml.includes('<TALLYREQUEST>Export Data</TALLYREQUEST>'), 'Contains Tally export request');
    });

    await test('TallyXmlBuilder generates Incremental Voucher query with AlterID filter', () => {
        const xml = TallyXmlBuilder.buildIncrementalVouchersRequest({
            lastAlterId: 40900,
            voucherType: 'Sales',
        });
        assert(xml.includes('$ALTERID &gt; 40900'), 'Contains AlterID formula filter');
        assert(xml.includes('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>'), 'Contains voucher type filter');
    });

    await test('TallyXmlBuilder generates Trial Balance & Ledger requests', () => {
        const tbXml = TallyXmlBuilder.buildTrialBalanceRequest('20250401', '20260331');
        assert(tbXml.includes('<REPORTNAME>Trial Balance</REPORTNAME>'), 'Contains Trial Balance');
        const lXml = TallyXmlBuilder.buildLedgersRequest(100);
        assert(lXml.includes('$ALTERID &gt; 100'), 'Contains ledger alterId filter');
    });

    // --------------------------------------------------------------------------
    // Test Group 2: XML Parser & Fixture Verification
    // --------------------------------------------------------------------------
    console.log('\n--- 2. XML Parser & Fixture Tests ---');

    const fixturesDir = path.resolve(__dirname, '../../server/tally/fixtures');

    await test('Parser correctly extracts Company Details fixture', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'company_details.xml'), 'utf-8');
        const company = TallyXmlParser.parseCompanyDetails(xml);
        assert(company !== null, 'Company parsed successfully');
        assert(company?.companyName === 'The Brand Master Pvt Ltd', `Expected TBM, got: ${company?.companyName}`);
        assert(company?.companyGuid === 'TBM-MUMBAI-2025-001', 'GUID matches');
    });

    await test('Parser extracts Sales Vouchers with GST and Taxable value breakdowns', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'vouchers_sales.xml'), 'utf-8');
        const res = TallyXmlParser.parseVouchers(xml);
        assert(res.success === true, 'Parse successful');
        assert(res.data.length === 2, `Expected 2 vouchers, found ${res.data.length}`);

        const vch1 = res.data[0];
        assert(vch1.voucherNumber === 'INV/2025-26/042', 'Voucher number matches');
        assert(vch1.partyLedgerName === 'Nykaa E-Retail Pvt Ltd', 'Party ledger matches');
        assert(vch1.amount === 236000, `Expected 236000, got ${vch1.amount}`);
        assert(vch1.taxableValue === 200000, `Expected 200000 taxable, got ${vch1.taxableValue}`);
        assert(vch1.cgst === 18000, `Expected 18000 CGST, got ${vch1.cgst}`);
        assert(vch1.sgst === 18000, `Expected 18000 SGST, got ${vch1.sgst}`);
        assert(vch1.alterId === 41001, 'AlterID matches');
    });

    await test('Parser extracts Receipt Vouchers and bank allocations', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'vouchers_receipts.xml'), 'utf-8');
        const res = TallyXmlParser.parseVouchers(xml);
        assert(res.data.length === 1, 'Expected 1 receipt voucher');
        const rct = res.data[0];
        assert(rct.voucherNumber === 'RCT/2025/088', 'Receipt number matches');
        assert(rct.amount === 236000, 'Receipt amount matches');
        assert(rct.bankLedger === 'HDFC Current A/c - 50200012345', 'Bank ledger extracted');
        assert(rct.instrumentNumber === 'HDFCR52025052812', 'UTR/Cheque extracted');
        assert(rct.bankersDate === '2025-05-28', 'Bankers date normalized');
    });

    await test('Parser extracts Payment Vouchers and TDS deductions', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'vouchers_payments.xml'), 'utf-8');
        const res = TallyXmlParser.parseVouchers(xml);
        assert(res.data.length === 1, 'Expected 1 payment voucher');
        const pmt = res.data[0];
        assert(pmt.partyLedgerName === 'Kusha Kapila', 'Creator party matches');
        assert(pmt.amount === 90000, 'Net payment amount matches');
        assert(pmt.tds === 10000, `TDS extracted, got ${pmt.tds}`);
    });

    await test('Parser extracts Trial Balance ledger groups and balances', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'trial_balance.xml'), 'utf-8');
        const res = TallyXmlParser.parseTrialBalance(xml);
        assert(res.data.length >= 5, 'Found trial balance items');
        const debtors = res.data.find(d => d.ledger === 'Sundry Debtors');
        assert(debtors !== undefined, 'Sundry Debtors found');
        assert(debtors?.closingBalance === 1250000, 'Sundry Debtors balance matches');
        const dep = res.data.find(d => d.ledger === 'Depreciation');
        assert(dep?.closingBalance === 62500, 'Depreciation ledger matches');
    });

    // --------------------------------------------------------------------------
    // Test Group 3: Fault Injection & Edge Cases
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Fault Injection & Edge Case Tests ---');

    await test('Parser isolates LINEERROR from Tally without crashing', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'error_response.xml'), 'utf-8');
        const validation = TallyXmlParser.validateEnvelope(xml);
        assert(validation.isValid === false, 'Envelope marked invalid');
        assert(validation.error?.includes('Cannot find collection') ?? false, 'Error message captured');
    });

    await test('Parser identifies Truncated XML and sets rawTruncated flag', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'truncated_response.xml'), 'utf-8');
        const res = TallyXmlParser.parseVouchers(xml);
        assert(res.success === false, 'Vouchers parsing failed');
        assert(res.rawTruncated === true, 'rawTruncated flag set');
    });

    await test('Date normalizer handles YYYYMMDD, DD-Mon-YYYY, and ISO formats', () => {
        assert(TallyXmlParser.normalizeDate('20250415') === '2025-04-15', 'YYYYMMDD');
        assert(TallyXmlParser.normalizeDate('15-Apr-2025') === '2025-04-15', 'DD-Mon-YYYY');
        assert(TallyXmlParser.normalizeDate('2025-04-15') === '2025-04-15', 'ISO string');
    });

    // --------------------------------------------------------------------------
    // Test Group 4: Live Mock Server HTTP Integration
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Live Mock Server HTTP Integration Tests ---');

    const testPort = 9876;
    const mock = new TallyMockServer({ port: testPort });

    await test('Mock Server starts and handles HTTP requests on test port', async () => {
        const port = await mock.start();
        assert(port === testPort, `Mock started on port ${port}`);

        const reqXml = TallyXmlBuilder.buildCompanyDetailsRequest();
        const resXml = await postXml(`http://127.0.0.1:${port}/`, reqXml);
        const company = TallyXmlParser.parseCompanyDetails(resXml);
        assert(company?.companyName === 'The Brand Master Pvt Ltd', 'Live mock returns company details');
    });

    await test('Mock Server responds to Voucher Register queries', async () => {
        const reqXml = TallyXmlBuilder.buildIncrementalVouchersRequest({
            lastAlterId: 0,
            voucherType: 'Sales',
        });
        const resXml = await postXml(`http://127.0.0.1:${testPort}/`, reqXml);
        const res = TallyXmlParser.parseVouchers(resXml);
        assert(res.data.length === 2, 'Live mock returned sales vouchers');
    });

    await test('Mock Server simulates error mode transitions', async () => {
        mock.setSimulateError('LINE_ERROR');
        const reqXml = TallyXmlBuilder.buildCompanyDetailsRequest();
        const resXml = await postXml(`http://127.0.0.1:${testPort}/`, reqXml);
        const validation = TallyXmlParser.validateEnvelope(resXml);
        assert(validation.isValid === false, 'Mock correctly simulated LINE_ERROR');
        mock.setSimulateError('NONE');
    });

    // Clean up mock server
    await mock.stop();
    console.log('  ✓ Mock Server stopped cleanly');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase1Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
