// ==============================================================================
// Tally Prime ↔ TBM CFO System Architecture — TypeScript Types
// ==============================================================================

export type TallyAgentStatus = 
    | 'ONLINE_READY'
    | 'TALLY_OFFLINE'
    | 'COMPANY_MISMATCH'
    | 'COMPANY_CLOSED'
    | 'DRAINING'
    | 'OFFLINE';

export type TallyTaskType = 
    | 'SYNC_VOUCHERS'
    | 'SYNC_MASTERS'
    | 'SYNC_TRIAL_BALANCE'
    | 'SYNC_GST_SUMMARY'
    | 'FULL_BOOTSTRAP';

export type TallyTaskStatus = 
    | 'PENDING'
    | 'LEASED'
    | 'COMPLETED'
    | 'FAILED'
    | 'DEAD_LETTER';

export interface TallyAgentInfo {
    id: string;
    machineName: string;
    status: TallyAgentStatus;
    activeCompanyName?: string;
    activeCompanyGuid?: string;
    tallyVersion?: string;
    tallyPort: number;
    lastHeartbeatAt?: Date;
}

export interface TallySyncTask {
    id: number;
    agentId?: string;
    taskType: TallyTaskType;
    idempotencyKey: string;
    payload: Record<string, any>;
    status: TallyTaskStatus;
    attempts: number;
    maxAttempts: number;
    leaseExpiresAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
    createdAt: Date;
}

export interface TallyLedgerEntry {
    ledgerName: string;
    amount: number; // positive = credit/debit depending on context
    isDeemedPositive: boolean;
}

export interface TallyParsedVoucher {
    guid: string;
    alterId: number;
    voucherNumber: string;
    date: string; // YYYY-MM-DD
    voucherType: string; // Sales, Purchase, Payment, Receipt, Journal, Contra
    partyLedgerName: string;
    amount: number;
    narration?: string;
    ledgerEntries: TallyLedgerEntry[];
    // Specialized breakdowns
    taxableValue?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    tds?: number;
    bankLedger?: string;
    instrumentNumber?: string;
    bankersDate?: string;
}

export interface TallyParsedLedger {
    guid: string;
    alterId: number;
    name: string;
    parentGroup: string;
    openingBalance: number;
    closingBalance: number;
}

export interface TallyParsedTrialBalanceItem {
    ledger: string;
    parentGroup: string;
    debit: number;
    credit: number;
    closingBalance: number;
}

export interface TallyCompanyDetails {
    companyName: string;
    companyGuid: string;
    startingFrom?: string;
    booksFrom?: string;
    formalName?: string;
}

export interface TallyReconciliationDiscrepancy {
    id?: number;
    companyGuid: string;
    discrepancyType: 
        | 'AMOUNT_MISMATCH'
        | 'UNMATCHED_TALLY_INVOICE'
        | 'UNMATCHED_RECEIPT'
        | 'PAYMENT_MISMATCH'
        | 'UNCLASSIFIED_PARTY';
    dashboardEntity?: 'proforma_invoices' | 'invoice_tracking' | 'creator_invoices' | 'expenses';
    dashboardRecordId?: string;
    tallyVoucherNo?: string;
    tallyGuid?: string;
    partyName?: string;
    dashboardAmount?: number;
    tallyAmount?: number;
    varianceAmount?: number;
    status: 'PENDING_REVIEW' | 'ACCEPTED_TALLY' | 'OVERRIDDEN_MANUAL' | 'RESOLVED';
    resolutionNotes?: string;
    resolvedBy?: string;
    detectedAt?: Date;
}

export interface TallySyncStatusResponse {
    status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
    lastSyncTimestamp?: string;
    minutesSinceLastSync?: number;
    agent: {
        machineName?: string;
        status: TallyAgentStatus;
        loadedCompany?: string;
        tallyVersion?: string;
    };
    backlog: {
        pendingTasks: number;
        unreconciledDiscrepancies: number;
        unclassifiedParties: number;
    };
    warningMessage?: string | null;
}
