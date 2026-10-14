// ==============================================================================
// Tally Prime XML Response Parser
// Handles Tally XML Envelopes, Error Isolation, and Data Extraction
// ==============================================================================

import type {
    TallyParsedVoucher,
    TallyParsedLedger,
    TallyParsedTrialBalanceItem,
    TallyCompanyDetails,
    TallyLedgerEntry,
} from './types';

export interface ParseResult<T> {
    success: boolean;
    data: T[];
    errors: Array<{ message: string; rawSnippet?: string }>;
    rawTruncated?: boolean;
}

export class TallyXmlParser {
    /**
     * Normalizes Tally dates (YYYYMMDD or D-Mon-YYYY) to ISO YYYY-MM-DD
     */
    static normalizeDate(dateStr: string): string {
        if (!dateStr) return new Date().toISOString().slice(0, 10);
        const trimmed = dateStr.trim();

        // Format: YYYYMMDD (e.g., 20250415)
        if (/^\d{8}$/.test(trimmed)) {
            const y = trimmed.slice(0, 4);
            const m = trimmed.slice(4, 6);
            const d = trimmed.slice(6, 8);
            return `${y}-${m}-${d}`;
        }

        // Format: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }

        // Format: DD-Mon-YYYY or DD-MM-YYYY
        const parts = trimmed.split(/[-/]/);
        if (parts.length === 3) {
            let [day, month, year] = parts;
            if (day.length === 1) day = '0' + day;
            const months: Record<string, string> = {
                jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
            };
            const lowerMonth = month.toLowerCase().slice(0, 3);
            const normalizedMonth = months[lowerMonth] || month.padStart(2, '0');
            return `${year}-${normalizedMonth}-${day}`;
        }

        return trimmed;
    }

    /**
     * Extracts text content of an XML tag
     */
    static extractTag(xml: string, tagName: string): string {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Parses numeric amount, handling negative signs and debit/credit notations
     */
    static parseAmount(str: string): number {
        if (!str) return 0;
        const cleaned = str.replace(/,/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : Math.abs(num);
    }

    /**
     * Validates that XML is not truncated and checks for top-level line errors
     */
    static validateEnvelope(xml: string): { isValid: boolean; error?: string } {
        if (!xml || typeof xml !== 'string') {
            return { isValid: false, error: 'Empty or non-string XML input' };
        }

        if (!xml.includes('</ENVELOPE>')) {
            return { isValid: false, error: 'Truncated XML stream: missing </ENVELOPE>' };
        }

        const lineErrorMatch = xml.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i);
        if (lineErrorMatch) {
            return { isValid: false, error: `Tally reported error: ${lineErrorMatch[1].trim()}` };
        }

        return { isValid: true };
    }

    /**
     * Parses Company Details response from Tally
     */
    static parseCompanyDetails(xml: string): TallyCompanyDetails | null {
        const validation = this.validateEnvelope(xml);
        if (!validation.isValid) return null;

        const companyName = this.extractTag(xml, 'COMPANYNAME') || 
                            this.extractTag(xml, 'SVCURRENTCOMPANY') || 
                            this.extractTag(xml, 'NAME');
        const companyGuid = this.extractTag(xml, 'GUID') || 
                            this.extractTag(xml, 'COMPANYNUMBER') || 
                            'tally-company-default';
        const startingFrom = this.extractTag(xml, 'STARTINGFROM');
        const booksFrom = this.extractTag(xml, 'BOOKSFROM');
        const formalName = this.extractTag(xml, 'FORMALNAME');

        if (!companyName) return null;

        return {
            companyName,
            companyGuid,
            startingFrom: startingFrom ? this.normalizeDate(startingFrom) : undefined,
            booksFrom: booksFrom ? this.normalizeDate(booksFrom) : undefined,
            formalName: formalName || companyName,
        };
    }

    /**
     * Parses Voucher Register XML collection
     */
    static parseVouchers(xml: string): ParseResult<TallyParsedVoucher> {
        const result: ParseResult<TallyParsedVoucher> = {
            success: true,
            data: [],
            errors: []
        };

        const validation = this.validateEnvelope(xml);
        if (!validation.isValid) {
            result.success = false;
            result.errors.push({ message: validation.error || 'Invalid envelope' });
            if (validation.error?.includes('Truncated')) {
                result.rawTruncated = true;
            }
            return result;
        }

        // Split by <VOUCHER ...> blocks
        const voucherRegex = /<VOUCHER[\s\S]*?<\/VOUCHER>/gi;
        const voucherMatches = xml.match(voucherRegex) || [];

        for (const vchXml of voucherMatches) {
            try {
                // Check if individual voucher contains an error
                const lineError = this.extractTag(vchXml, 'LINEERROR');
                if (lineError) {
                    result.errors.push({ message: lineError, rawSnippet: vchXml.slice(0, 200) });
                    continue;
                }

                const guid = this.extractTag(vchXml, 'GUID');
                const alterIdStr = this.extractTag(vchXml, 'ALTERID');
                const alterId = parseInt(alterIdStr, 10) || 0;
                const voucherNumber = this.extractTag(vchXml, 'VOUCHERNUMBER') || this.extractTag(vchXml, 'REFERENCE');
                const dateRaw = this.extractTag(vchXml, 'DATE');
                const date = this.normalizeDate(dateRaw);
                const voucherType = this.extractTag(vchXml, 'VOUCHERTYPENAME');
                const partyLedgerName = this.extractTag(vchXml, 'PARTYLEDGERNAME');
                const amountRaw = this.extractTag(vchXml, 'AMOUNT');
                const amount = this.parseAmount(amountRaw);
                const narration = this.extractTag(vchXml, 'NARRATION');

                // Parse ledger entries
                const ledgerEntries: TallyLedgerEntry[] = [];
                const entryRegex = /<(ALLLEDGERENTRIES\.LIST|LEDGERENTRIES\.LIST)[\s\S]*?<\/\1>/gi;
                const entryMatches = vchXml.match(entryRegex) || [];

                let taxableValue = 0;
                let cgst = 0;
                let sgst = 0;
                let igst = 0;
                let tds = 0;
                let bankLedger: string | undefined;
                let instrumentNumber: string | undefined;
                let bankersDate: string | undefined;

                for (const entryXml of entryMatches) {
                    const lName = this.extractTag(entryXml, 'LEDGERNAME');
                    const lAmtRaw = this.extractTag(entryXml, 'AMOUNT');
                    const lAmt = this.parseAmount(lAmtRaw);
                    const isDeemedPos = this.extractTag(entryXml, 'ISDEEMEDPOSITIVE').toLowerCase() === 'yes';

                    ledgerEntries.push({
                        ledgerName: lName,
                        amount: lAmt,
                        isDeemedPositive: isDeemedPos,
                    });

                    // Duty and tax detection
                    const lUpper = lName.toUpperCase();
                    if (lUpper.includes('CGST')) {
                        cgst += lAmt;
                    } else if (lUpper.includes('SGST')) {
                        sgst += lAmt;
                    } else if (lUpper.includes('IGST')) {
                        igst += lAmt;
                    } else if (lUpper.includes('TDS')) {
                        tds += lAmt;
                    } else if (lUpper.includes('BANK') || lUpper.includes('HDFC') || lUpper.includes('ICICI') || lUpper.includes('SBI') || lUpper.includes('KOTAK')) {
                        bankLedger = lName;
                    } else if (lUpper.includes('SALES') || lUpper.includes('SERVICE') || lUpper.includes('REVENUE')) {
                        taxableValue += lAmt;
                    }

                    // Bank allocations (Cheque/UTR & Banker's Date)
                    const instNo = this.extractTag(entryXml, 'INSTRUMENTNUMBER') || this.extractTag(entryXml, 'CHEQUENUMBER') || this.extractTag(entryXml, 'TRANSACTIONNUMBER');
                    if (instNo) instrumentNumber = instNo;
                    const bDate = this.extractTag(entryXml, 'BANKERSDATE');
                    if (bDate) bankersDate = this.normalizeDate(bDate);
                }

                // If taxableValue wasn't explicitly isolated, estimate it from Gross - GST
                if (taxableValue === 0 && (voucherType.toLowerCase() === 'sales' || voucherType.toLowerCase() === 'purchase')) {
                    const gstTotal = cgst + sgst + igst;
                    taxableValue = Math.max(0, amount - gstTotal);
                }

                // Ensure a stable fallback GUID if missing
                const safeGuid = guid || `${voucherType}-${voucherNumber}-${date}`;

                result.data.push({
                    guid: safeGuid,
                    alterId,
                    voucherNumber: voucherNumber || 'UNASSIGNED',
                    date,
                    voucherType,
                    partyLedgerName: partyLedgerName || (ledgerEntries[0]?.ledgerName ?? 'Unknown Party'),
                    amount,
                    narration,
                    ledgerEntries,
                    taxableValue,
                    cgst,
                    sgst,
                    igst,
                    tds,
                    bankLedger,
                    instrumentNumber,
                    bankersDate,
                });
            } catch (err: any) {
                result.errors.push({
                    message: `Failed to parse individual voucher: ${err.message}`,
                    rawSnippet: vchXml.slice(0, 200)
                });
            }
        }

        return result;
    }

    /**
     * Parses Ledger Master XML collection
     */
    static parseLedgers(xml: string): ParseResult<TallyParsedLedger> {
        const result: ParseResult<TallyParsedLedger> = {
            success: true,
            data: [],
            errors: []
        };

        const validation = this.validateEnvelope(xml);
        if (!validation.isValid) {
            result.success = false;
            result.errors.push({ message: validation.error || 'Invalid envelope' });
            return result;
        }

        const ledgerRegex = /<LEDGER[\s\S]*?<\/LEDGER>/gi;
        const matches = xml.match(ledgerRegex) || [];

        for (const lXml of matches) {
            try {
                const name = this.extractTag(lXml, 'NAME');
                const parentGroup = this.extractTag(lXml, 'PARENT');
                const openingBalance = this.parseAmount(this.extractTag(lXml, 'OPENINGBALANCE'));
                const closingBalance = this.parseAmount(this.extractTag(lXml, 'CLOSINGBALANCE'));
                const guid = this.extractTag(lXml, 'GUID') || `ledger-${name}`;
                const alterId = parseInt(this.extractTag(lXml, 'ALTERID'), 10) || 0;

                if (name) {
                    result.data.push({
                        name,
                        parentGroup: parentGroup || 'Primary',
                        openingBalance,
                        closingBalance,
                        guid,
                        alterId,
                    });
                }
            } catch (err: any) {
                result.errors.push({ message: `Ledger parse error: ${err.message}` });
            }
        }

        return result;
    }

    /**
     * Parses Trial Balance XML items
     */
    static parseTrialBalance(xml: string): ParseResult<TallyParsedTrialBalanceItem> {
        const result: ParseResult<TallyParsedTrialBalanceItem> = {
            success: true,
            data: [],
            errors: []
        };

        const validation = this.validateEnvelope(xml);
        if (!validation.isValid) {
            result.success = false;
            result.errors.push({ message: validation.error || 'Invalid envelope' });
            return result;
        }

        // Match DSPACCNAME / LEDGER lines in Trial Balance reports
        const itemRegex = /<DSPRECORD[\s\S]*?<\/DSPRECORD>|<DSPACCNAME[\s\S]*?<\/DSPACCNAME>/gi;
        const matches = xml.match(itemRegex) || [];

        // Fallback: match any ledger entries inside trial balance
        const ledgerMatches = xml.match(/<LEDGER[\s\S]*?<\/LEDGER>/gi) || [];
        for (const lXml of ledgerMatches) {
            const name = this.extractTag(lXml, 'NAME');
            const parent = this.extractTag(lXml, 'PARENT') || 'Indirect Expenses';
            const closing = this.parseAmount(this.extractTag(lXml, 'CLOSINGBALANCE'));
            const isDeemedPos = this.extractTag(lXml, 'ISDEEMEDPOSITIVE').toLowerCase() === 'yes';

            result.data.push({
                ledger: name,
                parentGroup: parent,
                debit: isDeemedPos ? closing : 0,
                credit: !isDeemedPos ? closing : 0,
                closingBalance: closing,
            });
        }

        return result;
    }
}
