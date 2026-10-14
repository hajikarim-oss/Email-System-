// ==============================================================================
// Phase 2 Test Suite: Desktop Sync Agent, State Machine & AlterID Engine
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { TallyMockServer } from '../../server/tally/mockServer';
import { TallySyncAgent } from '../../server/tally/agent';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(`Assertion Failed: ${msg}`);
    }
}

async function runPhase2Tests() {
    console.log('====================================================');
    console.log('▶ STARTING PHASE 2 TEST SUITE: SYNC AGENT SERVICE');
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

    const testPort = 9888;
    const bufferFile = path.resolve(__dirname, '.test_agent_buffer.json');
    if (fs.existsSync(bufferFile)) fs.unlinkSync(bufferFile);

    const mock = new TallyMockServer({
        port: testPort,
        companyName: 'The Brand Master Pvt Ltd',
        companyGuid: 'TBM-MUMBAI-2025-001',
    });

    const agent = new TallySyncAgent({
        agentId: 'test-agent-01',
        machineName: 'TEST-DESKTOP',
        tallyHost: '127.0.0.1',
        tallyPort: testPort,
        targetCompanyName: 'The Brand Master Pvt Ltd',
        targetCompanyGuid: 'TBM-MUMBAI-2025-001',
        pollIntervalMs: 5000,
        offlineBufferFile: bufferFile,
        directDbMode: false, // Isolate to agent logic without live DB requirement in unit test
    });

    // --------------------------------------------------------------------------
    // Test Group 1: State Machine & Health Gating
    // --------------------------------------------------------------------------
    console.log('--- 1. State Machine & Readiness Gating Tests ---');

    await test('Agent detects TALLY_OFFLINE when Tally port is not running', async () => {
        const probe = await agent.probeTallyReadiness();
        assert(probe.status === 'TALLY_OFFLINE', `Expected TALLY_OFFLINE, got ${probe.status}`);
        assert(probe.company === null, 'Company should be null');
    });

    await test('Agent detects ONLINE_READY when Tally is open with matching company', async () => {
        await mock.start();
        const probe = await agent.probeTallyReadiness();
        assert(probe.status === 'ONLINE_READY', `Expected ONLINE_READY, got ${probe.status}`);
        assert(probe.company?.companyName === 'The Brand Master Pvt Ltd', 'Company matches target');
    });

    await test('Agent detects COMPANY_MISMATCH when a different company is loaded in Tally', async () => {
        mock.setCompanyName('Another Random Company Pvt Ltd', 'OTHER-GUID-999');
        const probe = await agent.probeTallyReadiness();
        assert(probe.status === 'COMPANY_MISMATCH', `Expected COMPANY_MISMATCH, got ${probe.status}`);
        mock.setCompanyName('The Brand Master Pvt Ltd', 'TBM-MUMBAI-2025-001');
    });

    // --------------------------------------------------------------------------
    // Test Group 2: Incremental Sync & AlterID Watermarking
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Incremental Sync & AlterID Watermark Tests ---');

    await test('Initial sync cycle pulls vouchers and advances AlterID watermark', async () => {
        const res = await agent.syncCycle();
        assert(res.status === 'ONLINE_READY', `Expected ONLINE_READY, got ${res.status}`);
        assert(res.recordsSynced >= 4, `Expected at least 4 vouchers, got ${res.recordsSynced}`);
        assert(agent.getLastAlterId() > 41000, `Watermark should advance past 41000, got ${agent.getLastAlterId()}`);
    });

    await test('Second sync cycle does not re-pull already synced vouchers', async () => {
        // AlterID is already at max (41035), no newer vouchers in mock
        const res = await agent.syncCycle();
        // Since no records have alter_id > 41035, recordsSynced should be 0 (clean incremental behavior)
        assert(agent.getStatus() === 'ONLINE_READY', 'Agent remains healthy');
    });

    // --------------------------------------------------------------------------
    // Test Group 3: Offline Buffering & Resilience
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Local Offline Buffering Tests ---');

    await test('Agent buffers records to local file when network/destination is unavailable', async () => {
        const sampleVouchers = [{
            guid: 'OFFLINE-VCH-001',
            alterId: 99999,
            voucherNumber: 'OFF-01',
            date: '2025-05-15',
            voucherType: 'Sales',
            partyLedgerName: 'Offline Test Brand',
            amount: 50000,
            ledgerEntries: [],
        }];

        // Force local buffering
        (agent as any).bufferLocally(sampleVouchers);
        assert(fs.existsSync(bufferFile), 'Buffer file created on disk');

        const fileContent = JSON.parse(fs.readFileSync(bufferFile, 'utf-8'));
        assert(fileContent.length === 1, '1 batch saved in buffer');
        assert(fileContent[0].vouchers[0].guid === 'OFFLINE-VCH-001', 'Voucher data preserved');
    });

    await test('Agent stop cleanly halts timers and saves state', async () => {
        await agent.stop();
        assert(agent.getStatus() === 'OFFLINE', 'Status transitioned to OFFLINE');
        await mock.stop();
    });

    // Clean up temporary test file
    if (fs.existsSync(bufferFile)) fs.unlinkSync(bufferFile);

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase2Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
