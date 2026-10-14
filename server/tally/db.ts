// ==============================================================================
// Tally Prime Database Repository Layer (PostgreSQL)
// Idempotent upserts, transactional safety, and checkpoint management
// ==============================================================================

import { getPool } from '../pg';
import type {
    TallyParsedVoucher,
    TallyParsedLedger,
    TallyParsedTrialBalanceItem,
    TallyAgentStatus,
    TallySyncTask,
    TallyTaskType,
} from './types';

export class TallyDbRepository {
    /**
     * Executes the initial DDL migrations for all tally_* tables
     */
    static async runMigrations(ddlSql: string): Promise<void> {
        const pool = getPool();
        await pool.query(ddlSql);
    }

    /**
     * Updates or registers an agent's heartbeat and state
     */
    static async recordAgentHeartbeat(params: {
        agentId: string;
        machineName: string;
        status: TallyAgentStatus;
        companyName?: string;
        companyGuid?: string;
        tallyVersion?: string;
        tallyPort?: number;
    }): Promise<void> {
        const pool = getPool();
        const query = `
            INSERT INTO tally_sync_agents (
                id, machine_name, auth_token_hash, status, 
                active_company_name, active_company_guid, tally_version, tally_port, 
                last_heartbeat_at, updated_at
            )
            VALUES ($1, $2, 'managed_token', $3, $4, $5, $6, $7, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                machine_name = EXCLUDED.machine_name,
                status = EXCLUDED.status,
                active_company_name = EXCLUDED.active_company_name,
                active_company_guid = EXCLUDED.active_company_guid,
                tally_version = EXCLUDED.tally_version,
                tally_port = EXCLUDED.tally_port,
                last_heartbeat_at = NOW(),
                updated_at = NOW();
        `;
        await pool.query(query, [
            params.agentId,
            params.machineName,
            params.status,
            params.companyName || null,
            params.companyGuid || null,
            params.tallyVersion || null,
            params.tallyPort || 9000,
        ]);
    }

    /**
     * Upserts a batch of parsed vouchers idempotently using tally_guid
     */
    static async upsertVouchers(
        companyGuid: string,
        vouchers: TallyParsedVoucher[]
    ): Promise<{ upserted: number; errors: number }> {
        if (!vouchers.length) return { upserted: 0, errors: 0 };
        const pool = getPool();
        const client = await pool.connect();

        let upserted = 0;
        let errors = 0;

        try {
            await client.query('BEGIN');

            for (const vch of vouchers) {
                try {
                    // 1. General voucher register
                    const vchQuery = `
                        INSERT INTO tally_vouchers (
                            company_guid, voucher_no, date, voucher_type, 
                            party_ledger, amount, narration, alter_id, tally_guid, raw_json
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (tally_guid) DO UPDATE SET
                            voucher_no = EXCLUDED.voucher_no,
                            date = EXCLUDED.date,
                            amount = EXCLUDED.amount,
                            narration = EXCLUDED.narration,
                            alter_id = EXCLUDED.alter_id,
                            party_ledger = EXCLUDED.party_ledger,
                            synced_at = NOW();
                    `;
                    await client.query(vchQuery, [
                        companyGuid,
                        vch.voucherNumber,
                        vch.date,
                        vch.voucherType,
                        vch.partyLedgerName,
                        vch.amount,
                        vch.narration || null,
                        vch.alterId,
                        vch.guid,
                        JSON.stringify(vch.ledgerEntries),
                    ]);

                    // 2. Specialized sub-tables
                    const typeLower = vch.voucherType.toLowerCase();
                    if (typeLower === 'sales') {
                        const salesQuery = `
                            INSERT INTO tally_sales_invoices (
                                company_guid, invoice_no, date, party_ledger,
                                taxable_value, cgst, sgst, igst, tds, total, tally_guid, alter_id
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                            ON CONFLICT (tally_guid) DO UPDATE SET
                                invoice_no = EXCLUDED.invoice_no,
                                date = EXCLUDED.date,
                                party_ledger = EXCLUDED.party_ledger,
                                taxable_value = EXCLUDED.taxable_value,
                                cgst = EXCLUDED.cgst,
                                sgst = EXCLUDED.sgst,
                                igst = EXCLUDED.igst,
                                tds = EXCLUDED.tds,
                                total = EXCLUDED.total,
                                alter_id = EXCLUDED.alter_id,
                                synced_at = NOW();
                        `;
                        await client.query(salesQuery, [
                            companyGuid,
                            vch.voucherNumber,
                            vch.date,
                            vch.partyLedgerName,
                            vch.taxableValue || 0,
                            vch.cgst || 0,
                            vch.sgst || 0,
                            vch.igst || 0,
                            vch.tds || 0,
                            vch.amount,
                            vch.guid,
                            vch.alterId,
                        ]);
                    } else if (typeLower === 'receipt') {
                        const receiptQuery = `
                            INSERT INTO tally_receipts (
                                company_guid, receipt_no, date, party_ledger,
                                amount, bank_ledger, instrument_no, tally_guid, alter_id
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT (tally_guid) DO UPDATE SET
                                receipt_no = EXCLUDED.receipt_no,
                                date = EXCLUDED.date,
                                party_ledger = EXCLUDED.party_ledger,
                                amount = EXCLUDED.amount,
                                bank_ledger = EXCLUDED.bank_ledger,
                                instrument_no = EXCLUDED.instrument_no,
                                alter_id = EXCLUDED.alter_id,
                                synced_at = NOW();
                        `;
                        await client.query(receiptQuery, [
                            companyGuid,
                            vch.voucherNumber,
                            vch.date,
                            vch.partyLedgerName,
                            vch.amount,
                            vch.bankLedger || null,
                            vch.instrumentNumber || null,
                            vch.guid,
                            vch.alterId,
                        ]);
                    } else if (typeLower === 'payment') {
                        const pmtQuery = `
                            INSERT INTO tally_payments (
                                company_guid, payment_no, date, party_ledger,
                                amount, bank_ledger, instrument_no, tally_guid, alter_id
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT (tally_guid) DO UPDATE SET
                                payment_no = EXCLUDED.payment_no,
                                date = EXCLUDED.date,
                                party_ledger = EXCLUDED.party_ledger,
                                amount = EXCLUDED.amount,
                                bank_ledger = EXCLUDED.bank_ledger,
                                instrument_no = EXCLUDED.instrument_no,
                                alter_id = EXCLUDED.alter_id,
                                synced_at = NOW();
                        `;
                        await client.query(pmtQuery, [
                            companyGuid,
                            vch.voucherNumber,
                            vch.date,
                            vch.partyLedgerName,
                            vch.amount,
                            vch.bankLedger || null,
                            vch.instrumentNumber || null,
                            vch.guid,
                            vch.alterId,
                        ]);
                    }

                    upserted++;
                } catch (rowErr) {
                    errors++;
                }
            }

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        return { upserted, errors };
    }

    /**
     * Gets the last committed AlterID checkpoint
     */
    static async getCheckpoint(companyGuid: string, entityType: string): Promise<number> {
        const pool = getPool();
        const res = await pool.query(
            `SELECT last_alter_id FROM tally_sync_checkpoints WHERE company_guid = $1 AND entity_type = $2`,
            [companyGuid, entityType]
        );
        return res.rows.length ? Number(res.rows[0].last_alter_id) : 0;
    }

    /**
     * Updates checkpoint to new monotonic AlterID watermark
     */
    static async updateCheckpoint(companyGuid: string, entityType: string, alterId: number): Promise<void> {
        const pool = getPool();
        const query = `
            INSERT INTO tally_sync_checkpoints (company_guid, entity_type, last_alter_id, last_sync_timestamp, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (company_guid, entity_type) DO UPDATE SET
                last_alter_id = GREATEST(tally_sync_checkpoints.last_alter_id, EXCLUDED.last_alter_id),
                last_sync_timestamp = NOW(),
                updated_at = NOW();
        `;
        await pool.query(query, [companyGuid, entityType, alterId]);
    }

    /**
     * Records bad payload to dead-letter queue
     */
    static async recordDeadLetter(params: {
        taskId?: number;
        entityType: string;
        companyGuid?: string;
        rawPayload: string;
        errorDetails: any;
    }): Promise<void> {
        const pool = getPool();
        await pool.query(
            `INSERT INTO tally_sync_dead_letter_queue (task_id, entity_type, company_guid, raw_payload, error_details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                params.taskId || null,
                params.entityType,
                params.companyGuid || null,
                params.rawPayload,
                JSON.stringify(params.errorDetails),
            ]
        );
    }
}
