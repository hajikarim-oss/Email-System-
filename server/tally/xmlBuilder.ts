// ==============================================================================
// Tally Prime XML / TDL Request Generator
// Generates standards-compliant Tally XML Envelopes for Port 9000
// ==============================================================================

export class TallyXmlBuilder {
    /**
     * Builds lightweight request to probe Tally readiness and get loaded company
     */
    static buildCompanyDetailsRequest(): string {
        return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CompanyCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CompanyCollection">
            <TYPE>Company</TYPE>
            <FETCH>Name, Guid, BooksFrom, StartingFrom, StateName</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    }

    /**
     * Builds incremental voucher query using Tally's $ALTERID watermark
     */
    static buildIncrementalVouchersRequest(params: {
        lastAlterId: number;
        fromDate?: string; // YYYYMMDD
        toDate?: string;   // YYYYMMDD
        voucherType?: string;
    }): string {
        const fromDateTag = params.fromDate ? `<SVFROMDATE>${params.fromDate}</SVFROMDATE>` : '';
        const toDateTag = params.toDate ? `<SVTODATE>${params.toDate}</SVTODATE>` : '';
        const vchTypeTag = params.voucherType ? `<VOUCHERTYPENAME>${params.voucherType}</VOUCHERTYPENAME>` : '';
        const filterTag = params.lastAlterId > 0 ? `<FILTER>AlterIdFilter</FILTER>` : '';
        const formulaTag = params.lastAlterId > 0 
            ? `<SYSTEM TYPE="Formulae" NAME="AlterIdFilter">$ALTERID &gt; ${params.lastAlterId}</SYSTEM>` 
            : '';

        return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SyncVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${fromDateTag}
        ${toDateTag}
        ${vchTypeTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SyncVouchers">
            <TYPE>Voucher</TYPE>
            <FETCH>Date, VoucherNumber, VoucherTypeName, PartyLedgerName, Amount, AlterId, Narration, AllLedgerEntries.LedgerName, AllLedgerEntries.Amount</FETCH>
            ${filterTag}
          </COLLECTION>
          ${formulaTag}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    }

    /**
     * Builds request to export all master ledgers and opening/closing balances
     */
    static buildLedgersRequest(lastAlterId: number = 0): string {
        const filterBlock = lastAlterId > 0 ? `<FILTER>LedgerAlterIdFilter</FILTER>` : '';
        const formulaBlock = lastAlterId > 0 
            ? `<SYSTEM TYPE="Formulae" NAME="LedgerAlterIdFilter">$ALTERID &gt; ${lastAlterId}</SYSTEM>`
            : '';

        return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SyncLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SyncLedgers">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance, AlterId, TaxType, Guid</FETCH>
            ${filterBlock}
          </COLLECTION>
          ${formulaBlock}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    }

    /**
     * Builds request to export Trial Balance
     */
    static buildTrialBalanceRequest(fromDate?: string, toDate?: string): string {
        const fromDateTag = fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : '';
        const toDateTag = toDate ? `<SVTODATE>${toDate}</SVTODATE>` : '';

        return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          ${fromDateTag}
          ${toDateTag}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    }

    /**
     * Builds request to export GST Monthly Summary
     */
    static buildGstSummaryRequest(fromDate: string, toDate: string): string {
        return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>GSTR-1</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${fromDate}</SVFROMDATE>
          <SVTODATE>${toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    }
}
