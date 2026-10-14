// ==============================================================================
// Tally Prime Cloud API Handler
// Exposes Observability, Ingestion, and Reconciliation Endpoints for Dashboard
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPool } from '../pg';
import { TallyDbRepository } from './db';
import { TallyReconciliationEngine } from './reconciliation';
import type { TallySyncStatusResponse } from './types';

function sendJson(res: ServerResponse, statusCode: number, data: any) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

export async function handleTallyApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
        return;
    }

    try {
        const pool = getPool();

        // ----------------------------------------------------------------------
        // 1. GET /api/tally/status (Dashboard Observability)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/status' && req.method === 'GET') {
            const agentRes = await pool.query(`
                SELECT id, machine_name, status, active_company_name, tally_version, last_heartbeat_at
                FROM tally_sync_agents
                ORDER BY last_heartbeat_at DESC NULLS LAST
                LIMIT 1;
            `);

            const checkpointRes = await pool.query(`
                SELECT last_sync_timestamp 
                FROM tally_sync_checkpoints 
                WHERE entity_type = 'VOUCHERS'
                ORDER BY updated_at DESC LIMIT 1;
            `);

            const discrepanciesCount = await pool.query(`
                SELECT COUNT(*) as count 
                FROM tally_reconciliation_discrepancies 
                WHERE status = 'PENDING_REVIEW';
            `);

            const agent = agentRes.rows[0];
            const lastSync = checkpointRes.rows[0]?.last_sync_timestamp || agent?.last_heartbeat_at;

            let minutesSinceLastSync = 0;
            if (lastSync) {
                minutesSinceLastSync = Math.max(0, Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000));
            }

            let systemStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' = 'HEALTHY';
            let warningMessage: string | null = null;

            if (!agent || agent.status === 'OFFLINE' || minutesSinceLastSync > 60) {
                systemStatus = 'OFFLINE';
                warningMessage = 'Tally sync agent is offline. Last sync was over an hour ago.';
            } else if (agent.status === 'COMPANY_MISMATCH') {
                systemStatus = 'DEGRADED';
                warningMessage = `Company mismatch in Tally. Active: ${agent.active_company_name}`;
            } else if (agent.status === 'TALLY_OFFLINE') {
                systemStatus = 'DEGRADED';
                warningMessage = 'Tally application is closed on office desktop.';
            } else if (Number(discrepanciesCount.rows[0]?.count || 0) > 10) {
                systemStatus = 'DEGRADED';
                warningMessage = 'High volume of unresolved reconciliation discrepancies.';
            }

            const response: TallySyncStatusResponse = {
                status: systemStatus,
                lastSyncTimestamp: lastSync ? new Date(lastSync).toISOString() : undefined,
                minutesSinceLastSync,
                agent: {
                    machineName: agent?.machine_name || 'Not Registered',
                    status: agent?.status || 'OFFLINE',
                    loadedCompany: agent?.active_company_name || 'None',
                    tallyVersion: agent?.tally_version || 'TallyPrime',
                },
                backlog: {
                    pendingTasks: 0,
                    unreconciledDiscrepancies: Number(discrepanciesCount.rows[0]?.count || 0),
                    unclassifiedParties: 0,
                },
                warningMessage,
            };

            sendJson(res, 200, response);
            return;
        }

        // ----------------------------------------------------------------------
        // 2. GET /api/tally/health (Uptime Monitor)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/health' && req.method === 'GET') {
            sendJson(res, 200, {
                status: 'ok',
                service: 'tally-sync-cloud-gateway',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // ----------------------------------------------------------------------
        // 3. GET /api/tally/reconcile (Reconciliation Report)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/reconcile' && req.method === 'GET') {
            const statusFilter = url.searchParams.get('status') || 'PENDING_REVIEW';
            const discrepancies = await pool.query(`
                SELECT id, company_guid, discrepancy_type, dashboard_entity, dashboard_record_id,
                       tally_voucher_no, party_name, dashboard_amount, tally_amount, variance_amount,
                       status, resolution_notes, detected_at
                FROM tally_reconciliation_discrepancies
                WHERE status = $1
                ORDER BY detected_at DESC
                LIMIT 100;
            `, [statusFilter]);

            sendJson(res, 200, {
                status: 'success',
                count: discrepancies.rows.length,
                discrepancies: discrepancies.rows,
            });
            return;
        }

        // ----------------------------------------------------------------------
        // 4. POST /api/tally/sync (Trigger Manual Sync & Reconciliation)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/sync' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const companyGuid = body.companyGuid || 'TBM-MUMBAI-2025-001';

            const summary = await TallyReconciliationEngine.runReconciliation(companyGuid);

            sendJson(res, 200, {
                status: 'success',
                message: 'Manual sync & reconciliation triggered successfully',
                reconciliationSummary: summary,
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // ----------------------------------------------------------------------
        // 5. POST /api/tally/agent/heartbeat (Agent Heartbeat)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/agent/heartbeat' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            if (!body.agentId || !body.status) {
                sendJson(res, 400, { error: 'Missing agentId or status' });
                return;
            }

            await TallyDbRepository.recordAgentHeartbeat({
                agentId: body.agentId,
                machineName: body.machineName || 'Unknown Desktop',
                status: body.status,
                companyName: body.companyName,
                companyGuid: body.companyGuid,
                tallyVersion: body.tallyVersion,
                tallyPort: body.tallyPort || 9000,
            });

            sendJson(res, 200, { status: 'acknowledged' });
            return;
        }

        // ----------------------------------------------------------------------
        // 6. POST /api/tally/agent/vouchers (Batch Voucher Ingestion)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/agent/vouchers' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const companyGuid = body.companyGuid || 'TBM-MUMBAI-2025-001';
            const vouchers = body.vouchers || [];

            const result = await TallyDbRepository.upsertVouchers(companyGuid, vouchers);

            // Trigger immediate incremental reconciliation pass
            if (result.upserted > 0) {
                TallyReconciliationEngine.runReconciliation(companyGuid).catch(err => {
                    console.error('[TallyApi] Post-ingestion reconciliation error:', err);
                });
            }

            sendJson(res, 200, {
                status: 'success',
                upserted: result.upserted,
                errors: result.errors,
            });
            return;
        }

        // ----------------------------------------------------------------------
        // 7. GET /api/tally/cross-check (Cross-check numbers for Dashboard widgets)
        // ----------------------------------------------------------------------
        if (pathname === '/api/tally/cross-check' && req.method === 'GET') {
            // Revenue cross-check: tally_sales_invoices taxable sum
            const revenueRes = await pool.query(`
                SELECT COALESCE(SUM(taxable_value), 0) as tally_taxable_revenue
                FROM tally_sales_invoices;
            `);

            // Receivables cross-check: sundry debtors closing balance
            const debtorsRes = await pool.query(`
                SELECT COALESCE(SUM(closing_balance), 0) as tally_debtors_balance
                FROM tally_ledgers
                WHERE parent_group = 'Sundry Debtors';
            `);

            // Trial Balance Depreciation
            const depRes = await pool.query(`
                SELECT closing_balance as tally_depreciation
                FROM tally_trial_balance
                WHERE ledger = 'Depreciation'
                LIMIT 1;
            `);

            sendJson(res, 200, {
                tallyRevenue: Number(revenueRes.rows[0]?.tally_taxable_revenue || 0),
                tallyDebtors: Number(debtorsRes.rows[0]?.tally_debtors_balance || 0),
                tallyDepreciation: Number(depRes.rows[0]?.tally_depreciation || 0),
            });
            return;
        }

        sendJson(res, 404, { error: `Endpoint ${pathname} not found` });
    } catch (err: any) {
        console.error('[TallyApi] Handler error:', err);
        sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
}
