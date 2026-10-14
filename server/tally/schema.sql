-- ==============================================================================
-- Tally Prime ↔ TBM CFO System Architecture Database Schema
-- Version: 1.0 (Phase 1)
-- Strictly adhering to TBM_CFO_System_Architecture_Tally_Integration.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TALLY SYNC INFRASTRUCTURE TABLES
-- ------------------------------------------------------------------------------

-- Tracks registered Tally Sync Agents running on client desktop machines
CREATE TABLE IF NOT EXISTS tally_sync_agents (
    id VARCHAR(64) PRIMARY KEY,
    machine_name VARCHAR(128) NOT NULL,
    auth_token_hash VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OFFLINE', -- ONLINE_READY, TALLY_OFFLINE, COMPANY_MISMATCH, COMPANY_CLOSED, OFFLINE
    active_company_name VARCHAR(256),
    active_company_guid VARCHAR(128),
    tally_version VARCHAR(64),
    tally_port INT DEFAULT 9000,
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactional work queue for scheduling and leasing sync operations
CREATE TABLE IF NOT EXISTS tally_sync_tasks (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(64) REFERENCES tally_sync_agents(id) ON DELETE SET NULL,
    task_type VARCHAR(64) NOT NULL, -- SYNC_VOUCHERS, SYNC_MASTERS, SYNC_TRIAL_BALANCE, FULL_BOOTSTRAP
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, LEASED, COMPLETED, FAILED, DEAD_LETTER
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    lease_expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tally_sync_tasks_dispatch ON tally_sync_tasks(status, lease_expires_at) WHERE status = 'PENDING';

-- Monotonic watermark checkpoints per company and entity type
CREATE TABLE IF NOT EXISTS tally_sync_checkpoints (
    company_guid VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL, -- VOUCHERS, LEDGERS, TRIAL_BALANCE, GST
    last_alter_id BIGINT NOT NULL DEFAULT 0,
    last_sync_timestamp TIMESTAMPTZ,
    last_voucher_date DATE,
    sync_hash VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_guid, entity_type)
);

-- Dead-Letter Queue for partially succeeded or schema-corrupted voucher payloads
CREATE TABLE IF NOT EXISTS tally_sync_dead_letter_queue (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES tally_sync_tasks(id) ON DELETE SET NULL,
    entity_type VARCHAR(64) NOT NULL,
    company_guid VARCHAR(128),
    raw_payload TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Structured audit logs of sync runs for complete operational visibility
CREATE TABLE IF NOT EXISTS tally_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES tally_sync_tasks(id) ON DELETE SET NULL,
    agent_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL, -- POLL, BATCH_PROCESSED, ERROR, RECONCILIATION_RUN
    records_received INT DEFAULT 0,
    records_upserted INT DEFAULT 0,
    records_errored INT DEFAULT 0,
    duration_ms INT DEFAULT 0,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. TABLES THAT SYNC FROM TALLY (MD Section 2.1)
-- ------------------------------------------------------------------------------

-- Ledger Master from Tally
CREATE TABLE IF NOT EXISTS tally_ledgers (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    name VARCHAR(256) NOT NULL,
    parent_group VARCHAR(256) NOT NULL,
    opening_balance NUMERIC(15, 2) DEFAULT 0.00,
    closing_balance NUMERIC(15, 2) DEFAULT 0.00,
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    alter_id BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_guid, name)
);
CREATE INDEX IF NOT EXISTS idx_tally_ledgers_group ON tally_ledgers(parent_group);

-- All Voucher Types from Tally (General register)
CREATE TABLE IF NOT EXISTS tally_vouchers (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    voucher_no VARCHAR(128) NOT NULL,
    date DATE NOT NULL,
    voucher_type VARCHAR(64) NOT NULL, -- Sales, Purchase, Payment, Receipt, Journal, Contra
    party_ledger VARCHAR(256),
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    narration TEXT,
    alter_id BIGINT NOT NULL DEFAULT 0,
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    raw_json JSONB,
    is_deleted BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tally_vouchers_date_type ON tally_vouchers(date, voucher_type);
CREATE INDEX IF NOT EXISTS idx_tally_vouchers_party ON tally_vouchers(party_ledger);
CREATE INDEX IF NOT EXISTS idx_tally_vouchers_alter_id ON tally_vouchers(alter_id);

-- Sales Vouchers (Invoices) from Tally
CREATE TABLE IF NOT EXISTS tally_sales_invoices (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    invoice_no VARCHAR(128) NOT NULL,
    date DATE NOT NULL,
    party_ledger VARCHAR(256) NOT NULL,
    taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tds NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    alter_id BIGINT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tally_sales_invoices_no ON tally_sales_invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_tally_sales_invoices_party ON tally_sales_invoices(party_ledger);

-- Purchase Vouchers from Tally
CREATE TABLE IF NOT EXISTS tally_purchase_invoices (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    invoice_no VARCHAR(128) NOT NULL,
    date DATE NOT NULL,
    party_ledger VARCHAR(256) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    gst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tds NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    alter_id BIGINT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipt Vouchers from Tally (Collections)
CREATE TABLE IF NOT EXISTS tally_receipts (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    receipt_no VARCHAR(128),
    date DATE NOT NULL,
    party_ledger VARCHAR(256) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    bank_ledger VARCHAR(256),
    instrument_no VARCHAR(128),
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    alter_id BIGINT DEFAULT 0,
    reconciled BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tally_receipts_party ON tally_receipts(party_ledger);
CREATE INDEX IF NOT EXISTS idx_tally_receipts_date ON tally_receipts(date);

-- Payment Vouchers from Tally (Disbursements)
CREATE TABLE IF NOT EXISTS tally_payments (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    payment_no VARCHAR(128),
    date DATE NOT NULL,
    party_ledger VARCHAR(256) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    bank_ledger VARCHAR(256),
    instrument_no VARCHAR(128),
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    alter_id BIGINT DEFAULT 0,
    reconciled BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tally_payments_party ON tally_payments(party_ledger);
CREATE INDEX IF NOT EXISTS idx_tally_payments_date ON tally_payments(date);

-- Bank Ledger Entries & Reconciliation from Tally
CREATE TABLE IF NOT EXISTS tally_bank_transactions (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    bank_ledger VARCHAR(256) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    debit NUMERIC(15, 2) DEFAULT 0.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    balance NUMERIC(15, 2) DEFAULT 0.00,
    instrument_no VARCHAR(128),
    bankers_date DATE,
    reconciled BOOLEAN DEFAULT FALSE,
    tally_guid VARCHAR(128) UNIQUE NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- GST Summary from Tally Reports
CREATE TABLE IF NOT EXISTS tally_gst_summary (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    fy VARCHAR(16) NOT NULL,
    month VARCHAR(16) NOT NULL,
    output_cgst NUMERIC(15, 2) DEFAULT 0.00,
    output_sgst NUMERIC(15, 2) DEFAULT 0.00,
    output_igst NUMERIC(15, 2) DEFAULT 0.00,
    output_total NUMERIC(15, 2) GENERATED ALWAYS AS (output_cgst + output_sgst + output_igst) STORED,
    input_cgst NUMERIC(15, 2) DEFAULT 0.00,
    input_sgst NUMERIC(15, 2) DEFAULT 0.00,
    input_igst NUMERIC(15, 2) DEFAULT 0.00,
    input_total NUMERIC(15, 2) GENERATED ALWAYS AS (input_cgst + input_sgst + input_igst) STORED,
    net_gst_liability NUMERIC(15, 2) GENERATED ALWAYS AS ((output_cgst + output_sgst + output_igst) - (input_cgst + input_sgst + input_igst)) STORED,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_guid, fy, month)
);

-- TDS Summary from Tally Reports
CREATE TABLE IF NOT EXISTS tally_tds_summary (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    fy VARCHAR(16) NOT NULL,
    section VARCHAR(32) NOT NULL, -- 194C, 194J, etc.
    party_ledger VARCHAR(256) NOT NULL,
    amount NUMERIC(15, 2) DEFAULT 0.00,
    deposited NUMERIC(15, 2) DEFAULT 0.00,
    certificate_no VARCHAR(128),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trial Balance Ledger Balances from Tally
CREATE TABLE IF NOT EXISTS tally_trial_balance (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    ledger VARCHAR(256) NOT NULL,
    parent_group VARCHAR(256) NOT NULL,
    debit NUMERIC(15, 2) DEFAULT 0.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    closing_balance NUMERIC(15, 2) DEFAULT 0.00,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_guid, ledger)
);
CREATE INDEX IF NOT EXISTS idx_tally_trial_balance_group ON tally_trial_balance(parent_group);

-- ------------------------------------------------------------------------------
-- 3. MAPPING TABLES (Connect Dashboard to Tally - MD Section 2.3)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brand_ledger_map (
    id BIGSERIAL PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL,
    tally_ledger_name VARCHAR(256) NOT NULL,
    company_guid VARCHAR(128) NOT NULL,
    is_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (brand_id, company_guid),
    UNIQUE (tally_ledger_name, company_guid)
);

CREATE TABLE IF NOT EXISTS expense_head_ledger_map (
    id BIGSERIAL PRIMARY KEY,
    expense_head VARCHAR(128) NOT NULL,
    tally_ledger_name VARCHAR(256) NOT NULL,
    company_guid VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (expense_head, tally_ledger_name, company_guid)
);

CREATE TABLE IF NOT EXISTS asset_head_ledger_map (
    id BIGSERIAL PRIMARY KEY,
    asset_head VARCHAR(128) NOT NULL,
    tally_ledger_name VARCHAR(256) NOT NULL,
    company_guid VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (asset_head, tally_ledger_name, company_guid)
);

CREATE TABLE IF NOT EXISTS team_cost_center_map (
    id BIGSERIAL PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL,
    tally_cost_center VARCHAR(128) NOT NULL,
    company_guid VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, company_guid)
);

CREATE TABLE IF NOT EXISTS invoice_voucher_map (
    id BIGSERIAL PRIMARY KEY,
    dashboard_invoice_id VARCHAR(64) NOT NULL,
    tally_voucher_no VARCHAR(128) NOT NULL,
    tally_guid VARCHAR(128) NOT NULL,
    company_guid VARCHAR(128) NOT NULL,
    matched_by VARCHAR(64) DEFAULT 'AUTO_SYNC', -- AUTO_SYNC, MANUAL_OVERRIDE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (dashboard_invoice_id, company_guid),
    UNIQUE (tally_guid)
);

-- ------------------------------------------------------------------------------
-- 4. RECONCILIATION & DISCREPANCY TABLES (MD Section 3.3 & 3.4)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tally_reconciliation_discrepancies (
    id BIGSERIAL PRIMARY KEY,
    company_guid VARCHAR(128) NOT NULL,
    discrepancy_type VARCHAR(64) NOT NULL, -- AMOUNT_MISMATCH, UNMATCHED_TALLY_INVOICE, UNMATCHED_RECEIPT, PAYMENT_MISMATCH, UNCLASSIFIED_PARTY
    dashboard_entity VARCHAR(64),          -- proforma_invoices, invoice_tracking, creator_invoices, expenses
    dashboard_record_id VARCHAR(64),
    tally_voucher_no VARCHAR(128),
    tally_guid VARCHAR(128),
    party_name VARCHAR(256),
    dashboard_amount NUMERIC(15, 2),
    tally_amount NUMERIC(15, 2),
    variance_amount NUMERIC(15, 2),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, ACCEPTED_TALLY, OVERRIDDEN_MANUAL, RESOLVED
    resolution_notes TEXT,
    resolved_by VARCHAR(64),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON tally_reconciliation_discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_company ON tally_reconciliation_discrepancies(company_guid);
