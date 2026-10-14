// ==============================================================================
// Phase 3 & 4 Test Suite: Cloud Ingestion, Queue, APIs & Reconciliation Engine
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { handleTallyApi } from '../../server/tally/apiHandler';
import { TallyReconciliationEngine } from '../../server/tally/reconciliation';
import { TallyDbRepository } from '../../server/tally/db';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(`Assertion Failed: ${msg}`);
    }
}

async function requestApi(
    serverPort: number,
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: '127.0.0.1',
            port: serverPort,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 5000,
        }, res => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode || 500,
                        data: resBody ? JSON.parse(resBody) : {},
                    });
                } catch {
                    resolve({
                        status: res.statusCode || 500,
                        data: resBody,
                    });
                }
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function runPhase3And4Tests() {
    console.log('================================================================');
    console.log('▶ STARTING PHASE 3 & 4 TEST SUITE: CLOUD APIS & RECONCILIATION');
    console.log('================================================================\n');

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

    // Spin up a test HTTP server hosting handleTallyApi
    const apiServer = http.createServer((req, res) => {
        handleTallyApi(req, res);
    });

    const port = await new Promise<number>(resolve => {
        apiServer.listen(0, '127.0.0.1', () => {
            const addr = apiServer.address() as any;
            resolve(addr.port);
        });
    });

    console.log(`--- Test Server running on port ${port} ---\n`);

    // Run database migrations for tally_* schema
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../server/tally/schema.sql'), 'utf-8');
    await TallyDbRepository.runMigrations(schemaSql);
    console.log('✓ Applied Tally PostgreSQL schema migrations.\n');

    // --------------------------------------------------------------------------
    // Test Group 1: Observability & Health Endpoints
    // --------------------------------------------------------------------------
    console.log('--- 1. Observability & Health Endpoints ---');

    await test('GET /api/tally/health returns 200 OK', async () => {
        const res = await requestApi(port, '/api/tally/health');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.status === 'ok', 'Health status is ok');
    });

    await test('GET /api/tally/status returns structured dashboard health contract', async () => {
        const res = await requestApi(port, '/api/tally/status');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.status !== undefined, 'Contains status field');
        assert(res.data.agent !== undefined, 'Contains agent metadata');
        assert(res.data.backlog !== undefined, 'Contains backlog counters');
    });

    await test('GET /api/tally/reconcile returns discrepancies list', async () => {
        const res = await requestApi(port, '/api/tally/reconcile?status=PENDING_REVIEW');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.data.discrepancies), 'Discrepancies is an array');
    });

    // --------------------------------------------------------------------------
    // Test Group 2: Agent Ingestion Endpoints
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Agent Heartbeat & Ingestion Endpoints ---');

    await test('POST /api/tally/agent/heartbeat accepts agent telemetry', async () => {
        const payload = {
            agentId: 'ci-agent-01',
            machineName: 'ACCOUNTS-PC-DESKTOP',
            status: 'ONLINE_READY',
            companyName: 'The Brand Master Pvt Ltd',
            companyGuid: 'TBM-MUMBAI-2025-001',
            tallyVersion: 'TallyPrime 4.1',
            tallyPort: 9000,
        };
        const res = await requestApi(port, '/api/tally/agent/heartbeat', 'POST', payload);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.status === 'acknowledged', 'Heartbeat acknowledged');
    });

    await test('POST /api/tally/agent/vouchers ingests parsed voucher bundle', async () => {
        const sampleVouchers = [
            {
                guid: 'VCH-SALES-TEST-001',
                alterId: 50001,
                voucherNumber: 'INV/TEST/001',
                date: '2025-05-15',
                voucherType: 'Sales',
                partyLedgerName: 'Nykaa E-Retail Pvt Ltd',
                amount: 118000,
                taxableValue: 100000,
                cgst: 9000,
                sgst: 9000,
                ledgerEntries: [],
            },
            {
                guid: 'VCH-RECEIPT-TEST-001',
                alterId: 50002,
                voucherNumber: 'RCT/TEST/001',
                date: '2025-05-20',
                voucherType: 'Receipt',
                partyLedgerName: 'Nykaa E-Retail Pvt Ltd',
                amount: 118000,
                bankLedger: 'HDFC Current A/c - 50200012345',
                instrumentNumber: 'RTGSTEST12345',
                ledgerEntries: [],
            }
        ];

        const res = await requestApi(port, '/api/tally/agent/vouchers', 'POST', {
            companyGuid: 'TBM-MUMBAI-2025-001',
            vouchers: sampleVouchers,
        });

        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.status === 'success', 'Voucher ingestion succeeded');
    });

    // --------------------------------------------------------------------------
    // Test Group 3: Reconciliation Engine Rules (MD 3.3 & 3.4)
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Reconciliation Engine Business Logic Tests ---');

    await test('Reconciliation records discrepancy for amount mismatch', async () => {
        await TallyReconciliationEngine.recordDiscrepancy({
            companyGuid: 'TBM-MUMBAI-2025-001',
            discrepancyType: 'AMOUNT_MISMATCH',
            dashboardEntity: 'proforma_invoices',
            dashboardRecordId: 'PI-099',
            tallyVoucherNo: 'INV/2025-26/042',
            tallyGuid: 'VCH-SALES-2025-001',
            partyName: 'Nykaa E-Retail Pvt Ltd',
            dashboardAmount: 200000,
            tallyAmount: 200050,
            varianceAmount: 50,
            status: 'PENDING_REVIEW',
            resolutionNotes: 'Tolerance warning: variance ₹50',
        });

        const res = await requestApi(port, '/api/tally/reconcile?status=PENDING_REVIEW');
        assert(res.data.discrepancies.length > 0, 'Discrepancy registered and retrievable via API');
        const d = res.data.discrepancies[0];
        assert(d.discrepancy_type === 'AMOUNT_MISMATCH', 'Type matches');
        assert(Number(d.variance_amount) === 50, 'Variance amount ₹50');
    });

    await test('POST /api/tally/sync executes reconciliation run and returns summary', async () => {
        const res = await requestApi(port, '/api/tally/sync', 'POST', {
            companyGuid: 'TBM-MUMBAI-2025-001',
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.reconciliationSummary !== undefined, 'Returns reconciliation summary');
    });

    // Clean up test server
    apiServer.close();
    console.log('  ✓ Test API server stopped cleanly');

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase3And4Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
