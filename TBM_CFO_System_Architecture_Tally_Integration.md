# TBM CFO Finance System — End-to-End Architecture
## Tally Prime Integration + Frontend Logic Blueprint

**Version:** 1.0
**Date:** 14 October 2026
**Scope:** Complete data connection map — what comes from Tally, what stays in the dashboard, and how every page computes its numbers.

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### 1.1 Two Systems, Clear Boundaries

| Layer | System | Role |
|-------|--------|------|
| Book of Accounts | Tally Prime | Legal accounting truth — ledgers, vouchers, GST returns, statutory compliance, trial balance, balance sheet |
| CFO Control Panel | TBM Finance Dashboard | Workflow + MIS + Management reporting — PI/PO tracking, payment approvals, creator management, expense control, P&L analysis, receivables follow-up |

### 1.2 Source of Truth Hierarchy

```
Tally Prime (Level 1 — Accounting Truth)
  ↓ sync
TBM Dashboard Backend (Level 2 — Operational Data)
  ↓ API
TBM Dashboard Frontend (Level 3 — Display + Interaction)
```

**Rule:** Tally is always right for accounting numbers. The dashboard is always right for workflow status (payment remarks, follow-up dates, internal notes, approvals). When they disagree on amounts, Tally wins. When they disagree on operational status, the dashboard wins.

### 1.3 Integration Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌────────────────┐
│  Tally Prime  │────>│  Sync Service (Node) │────>│  PostgreSQL DB │
│  (Desktop)    │<────│  (Scheduled + API)   │     │  (Cloud)       │
└──────────────┘     └─────────────────────┘     └───────┬────────┘
                                                         │
                                                    REST API
                                                         │
                                                 ┌───────┴────────┐
                                                 │  React Frontend │
                                                 │  (Dashboard)    │
                                                 └────────────────┘
```

### 1.4 Tally Data Access Methods

| Method | Use Case | Frequency |
|--------|----------|-----------|
| Tally XML API (TDLX) | Real-time ledger queries, voucher fetch, outstanding reports | On-demand |
| Tally ODBC | Bulk data sync — all vouchers, ledgers, stock items for a date range | Scheduled (nightly / hourly) |
| CSV/Excel Export | Manual fallback for bank statements, payroll data Tally doesn't automate | Monthly |
| Webhook-style polling | Check for new vouchers since last sync timestamp | Every 15 minutes |

Tally Prime port: Default 9000 (HTTP), configurable. Tally must be running for API access.

---

## 2. DATABASE SCHEMA — WHAT LIVES WHERE

### 2.1 Tables That Sync FROM Tally

These tables are populated by the sync service reading Tally data. The dashboard reads them but never writes to them directly.

| Table | Tally Source | Key Fields | Sync Frequency |
|-------|-------------|------------|----------------|
| tally_ledgers | Ledger Master | name, group, opening_balance, closing_balance | Nightly |
| tally_vouchers | All voucher types | voucher_no, date, type, party, amount, narration | Every 15 min |
| tally_sales_invoices | Sales vouchers | invoice_no, date, party_ledger, taxable_value, cgst, sgst, igst, tds, total | Every 15 min |
| tally_purchase_invoices | Purchase vouchers | invoice_no, date, party_ledger, amount, gst, tds | Every 15 min |
| tally_receipts | Receipt vouchers | date, party, amount, bank_ledger, instrument_no | Every 15 min |
| tally_payments | Payment vouchers | date, party, amount, bank_ledger, instrument_no | Every 15 min |
| tally_bank_transactions | Bank ledger entries | date, description, debit, credit, balance, reconciled | Nightly |
| tally_gst_summary | GST reports | month, output_cgst, output_sgst, output_igst, input_cgst, input_sgst, input_igst | Monthly |
| tally_tds_summary | TDS reports | section, party, amount, deposited, certificate_no | Monthly |
| tally_trial_balance | Trial Balance | ledger, group, debit, credit, closing_balance | Nightly |

### 2.2 Tables That Live ONLY in the Dashboard

These are operational/workflow tables that Tally does not track.

| Table | Purpose | Key Fields |
|-------|---------|------------|
| brands | Brand Master with commercial terms | name, legal_entity, gstin, state, category, payment_terms, tds_applicable, tds_section, tds_rate |
| proforma_invoices | PI tracking before Tally invoice | pi_no, date, brand_id, category, team_id, value, gst, tds, status, commercial_remark |
| invoice_tracking | Extends Tally invoice with operational fields | tally_invoice_id, brand_id, category, team_id, due_date, expected_pay_date, timeline_remark |
| receivable_tracking | Follow-up and collection tracking | invoice_id, expected_pay_date, timeline_remark, follow_up_count, last_follow_up_date |
| creator_invoices | Creator payment workflow | creator_name, brand_id, category, team_id, amount, gst, tds, gst_hold, pay_status, internal_remark |
| creator_master | Creator profiles | name, pan, gstin, bank_details, category, default_tds |
| expenses | Office expense tracking | date, vendor, expense_head, description, basic, gst, total, pay_status, pay_date, team_id, remark |
| fixed_assets | Asset register with depreciation | name, asset_head, purchase_date, gross_value, gst, acc_depreciation, nbv, dep_rate, method, is_opening |
| teams | Team master | name, lead, members, active |
| users | System users and roles | name, email, role, team_id |
| payment_history | Payment status change log | entity_type, entity_id, old_status, new_status, changed_by, changed_at, remark |
| audit_trail | All data changes | table_name, record_id, field, old_value, new_value, changed_by, timestamp |

### 2.3 Mapping Tables (Connect Dashboard to Tally)

| Table | Purpose |
|-------|---------|
| brand_ledger_map | Maps dashboard brand_id to Tally party ledger name |
| expense_head_ledger_map | Maps dashboard expense_head to Tally expense ledger group |
| asset_head_ledger_map | Maps dashboard asset_head to Tally fixed asset group |
| team_cost_center_map | Maps dashboard team_id to Tally cost center (if used) |
| invoice_voucher_map | Maps dashboard PI/invoice to Tally sales voucher number |

---

## 3. SYNC SERVICE LOGIC

### 3.1 Sync Flow

```
1. Connect to Tally at http://localhost:9000
2. Send XML request for vouchers since last_sync_timestamp
3. Parse XML response
4. Upsert into tally_* tables
5. Run reconciliation:
   a. Match tally_sales_invoices to invoice_tracking (by invoice_no)
   b. Match tally_receipts to receivable_tracking (by party + amount)
   c. Match tally_payments to creator_invoices (by party + amount)
   d. Flag unmatched records for manual review
6. Update last_sync_timestamp
7. Log sync results
```

### 3.2 Tally XML Request Example (Sales Vouchers)

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher Register</REPORTNAME>
        <STATICVARIABLES>
          <SVFROMDATE>20250401</SVFROMDATE>
          <SVTODATE>20260331</SVTODATE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
```

### 3.3 Reconciliation Rules

| Dashboard Record | Tally Record | Match On | Action |
|-----------------|-------------|----------|--------|
| PI status = "Tax Invoice Raised" | Sales voucher exists | Party ledger + Amount (plus/minus 100 tolerance) | Link PI to Tally voucher, mark reconciled |
| Receivable status = "Unpaid" | Receipt voucher exists for party | Party + Amount | Update received_amount, recalculate outstanding |
| Creator invoice status = "Done" | Payment voucher to party | Party + Amount | Mark as verified in Tally |
| Expense entry | Purchase/Payment voucher | Vendor + Amount + Date (plus/minus 3 days) | Link expense to Tally voucher |

### 3.4 Conflict Handling

| Scenario | Resolution |
|----------|------------|
| Amount in dashboard differs from Tally | Flag for review. Show Tally amount with variance indicator. Finance user decides. |
| Invoice exists in Tally but not in dashboard | Auto-create invoice_tracking record. Flag as "Tally-origin — needs classification". |
| Invoice exists in dashboard but not in Tally | Normal for PIs not yet converted. Flag if status = "Tax Invoice Raised" but no Tally match after 7 days. |
| Payment in Tally but creator status still "Pending" | Auto-update creator invoice status to "Done". Log in audit trail. |

---

## 4. PAGE-BY-PAGE DATA LOGIC

### 4.1 CFO DASHBOARD

**Page:** /dashboard
**Access:** Founder, Finance

#### Data Sources

| Widget | Primary Source | Tally Cross-check | Calculation |
|--------|---------------|-------------------|-------------|
| Revenue KPI | invoice_tracking (sum of value where invoiced) | tally_sales_invoices (sum of taxable_value) | Sum of taxable values. Tally figure shown if variance > 1% |
| Gross Profit KPI | Computed | N/A | Revenue minus Direct Costs |
| EBITDA KPI | Computed | N/A | GP minus Employee minus Opex minus Overheads |
| Receivables KPI | receivable_tracking (sum of outstanding) | tally_ledgers (sundry debtors closing balance) | Sum of outstanding. Tally debtors balance for cross-check |
| Active Brands | brands (count where status = Active) | N/A | Count |
| Output GST | invoice_tracking (sum of gst) | tally_gst_summary (output totals) | Sum of GST on invoices |
| GST Hold | creator_invoices (sum of gst_hold where > 0) | N/A | Dashboard-only metric |
| TDS Receivable | invoice_tracking (sum of tds) | tally_tds_summary | Sum of TDS on sales invoices |
| Depreciation | fixed_assets (computed current FY depreciation) | tally_trial_balance (depreciation ledger balance) | Opening assets: NBV times rate. Additions: value times rate times 0.5 |

#### P&L Dropdown Logic

**Dropdown 1: Financial Metric**

| Selection | Metric Shown |
|-----------|-------------|
| Revenue Overall | SUM(value) from invoice_tracking where invoiceNo IS NOT NULL |
| Gross Profit Overall | Revenue minus Direct Costs |
| EBITDA Overall | GP minus Employee Cost minus Opex minus Overheads |
| Profit and Loss Overall | EBITDA minus Depreciation minus Finance Costs plus Other Income |

**Dropdown 2: Business Category**

| Selection | Filter Applied |
|-----------|---------------|
| All | No filter |
| New Business | WHERE category = 'New Business' |
| Existing Influencer Marketing | WHERE category = 'Existing Influencer Marketing' |
| Existing Studio | WHERE category = 'Existing Studio' |
| Talent Management | WHERE category = 'Talent Management' |

**Dropdown 3: Period**

| Selection | Filter Applied |
|-----------|---------------|
| Full Year | WHERE date BETWEEN '2025-04-01' AND '2026-03-31' |
| Apr | WHERE month(date) = 4 AND year(date) = 2025 |
| Q1 | WHERE date BETWEEN '2025-04-01' AND '2025-06-30' |
| (and so on for each month and quarter) |

**Full P&L Computation Chain:**
```
1. Filter invoices by category + period
2. Revenue = SUM(filtered invoices.value)
3. Direct Costs = Revenue x category_dc_ratio
   New Business: 0.48
   Existing IM: 0.58
   Existing Studio: 0.52
   Talent Management: 0.38
   (Phase 2: replace with actual creator_invoices mapped to same category)
4. GP = Revenue minus Direct Costs
5. Employee Cost = Annual employee cost x (category revenue share) x (period fraction)
   Annual cost from: tally_trial_balance WHERE group = 'Indirect Expenses' AND ledger LIKE 'Salary%'
   OR from: payroll table SUM(gross) x 12
6. Opex = Similar allocation
7. Overheads = Similar allocation
8. EBITDA = GP minus Employee minus Opex minus Overheads
9. Depreciation = fixed_assets computed depreciation x period fraction
10. Finance Costs = tally_trial_balance WHERE ledger = 'Bank Charges' or 'Interest'
11. Other Income = tally_trial_balance WHERE group = 'Indirect Income'
12. PBT = EBITDA minus Depreciation minus Finance Costs plus Other Income
```

#### Drill-down Navigation

| Click Target | Navigates To | Filter Applied |
|-------------|-------------|----------------|
| Revenue KPI | Receivables page | status = All |
| Receivables KPI | Receivables page | status = Overdue |
| GP / EBITDA KPI | P&L page | category from dropdown |
| Output GST | Taxes page | none |
| GST Hold | Creator Invoices | status = any GST-related |
| Depreciation | Asset Schedule | none |
| P&L line item | Category Analysis | none |
| Alert item | Relevant page | based on alert type |

---

### 4.2 SALES MODULE

#### 4.2.1 Proforma Invoices

**Page:** /sales/proforma-invoices
**Source:** proforma_invoices table (dashboard-only, not in Tally)

| Column | Source | Editable |
|--------|--------|----------|
| PI Number | Auto-generated (PI-001, PI-002...) | No |
| Date | User input | At creation only |
| Brand | brands table dropdown | At creation only |
| Category | brands.category default, overridable via BC dropdown | Yes |
| Team | teams table dropdown | Yes |
| Value | User input | Until invoiced |
| GST | Auto: value x 18% (IGST for inter-state, CGST+SGST for intra-state) | No |
| TDS | Auto: value x brand.tds_rate (if brand.tds = true) | No |
| Gross | Auto: value + GST | No |
| Due Date | Auto: date + brand.terms. Editable override. | Yes |
| Status | Workflow: Draft, PI Raised, PO Pending, PO Received, Tax Invoice Raised | Yes (forward only, unless Founder) |
| Invoice No | Linked from Tally when status = Tax Invoice Raised | Auto |
| Commercial Remark | User input | Yes (always) |
| Expected Pay Date | User input | Yes (always) |
| Timeline Remark | User input | Yes (always) |

**GST Logic (Inter-state vs Intra-state):**
```
IF brand.state_code == company_state_code (27 for Maharashtra):
  CGST = value x 9%
  SGST = value x 9%
  IGST = 0
ELSE:
  CGST = 0
  SGST = 0
  IGST = value x 18%
```

**Add PI Form — Auto-fill chain:**
```
User selects Brand
  -> Auto-fill: Legal Entity, GSTIN, State, Payment Terms, TDS config
  -> Auto-fill: Business Category (from brand.category, editable)
User enters Value
  -> Auto-calculate: GST (18%), TDS (if applicable), Gross
User enters Date
  -> Auto-calculate: Due Date (date + brand.terms)
```

#### 4.2.2 Tax Invoices

**Page:** /sales/tax-invoices
**Source:** invoice_tracking joined with tally_sales_invoices

| Column | Source |
|--------|--------|
| Invoice No | tally_sales_invoices.invoice_no OR proforma_invoices.invoiceNo |
| Date | Tally voucher date |
| Brand | brands via brand_ledger_map |
| Category | invoice_tracking.category |
| Taxable Value | Tally voucher taxable amount |
| GST | Tally voucher GST components |
| TDS | invoice_tracking.tds |
| Due Date | invoice_tracking.due_date |
| Expected Pay | invoice_tracking.expected_pay_date |
| Commercial Remark | invoice_tracking.commercial_remark |

**Tally cross-check:** Dashboard invoice value vs Tally voucher amount. If mismatch > 100, show warning icon with both values.

#### 4.2.3 Receivables

**Page:** /sales/receivables
**Source:** receivable_tracking joined with invoice_tracking and tally_receipts

| Column | Source | Calculation |
|--------|--------|-------------|
| Brand | brands.name | direct |
| Invoice | invoice_tracking.invoice_no | direct |
| Category | invoice_tracking.category | direct |
| Date | invoice_tracking.date | direct |
| Terms | invoice_tracking.terms (from brand or override) | direct |
| Due Date | invoice_tracking.due_date | direct |
| Expected Pay | receivable_tracking.expected_pay_date | direct |
| Amount | invoice_tracking.gross | direct |
| GST | invoice_tracking.gst | direct |
| Received | SUM(tally_receipts.amount) matched to invoice | Running total |
| Outstanding | Amount minus Received | Auto-calculated |
| TDS | invoice_tracking.tds | direct |
| Ageing | daysBetween(due_date, today) | Bucketed |
| Status | Derived from outstanding + due_date | See rules below |
| Timeline Remark | receivable_tracking.timeline_remark | direct |

**Status Derivation:**
```
IF outstanding == 0 -> "Paid"
ELSE IF received > 0 AND outstanding > 0 -> "Partially Paid"
ELSE IF today > due_date -> "Overdue"
ELSE IF today > due_date - 7 -> "Due Soon"
ELSE -> "Unpaid"
```

**Ageing Buckets:**
```
days_overdue = daysBetween(due_date, today)
IF days_overdue <= 0 -> "Current" (not yet due)
ELSE IF days_overdue <= 30 -> "0-30"
ELSE IF days_overdue <= 60 -> "31-60"
ELSE IF days_overdue <= 90 -> "61-90"
ELSE -> "90+"
```

**Tally Reconciliation Flow:**
```
1. For each invoice in receivable_tracking
2. Query tally_receipts WHERE party matches brand_ledger_map
3. SUM receipt amounts = received_from_tally
4. IF received_from_tally != dashboard.received:
   -> Update dashboard.received = received_from_tally
   -> Recalculate outstanding
   -> Log change in audit_trail
```

**Filter Options:**
- All: No filter
- Overdue: status = Overdue
- Unpaid: outstanding > 0 AND status != Overdue
- Partially Paid: status = Partially Paid
- Paid: outstanding = 0
- Due Soon: due_date between today and today+7
- 0-30 / 31-60 / 61-90 / 90+: ageing bucket filter

---

### 4.3 BRANDS

**Page:** /brands
**Source:** brands table (dashboard-only)
**Tally link:** brand_ledger_map maps each brand to its Tally party ledger

| Field | Source | Notes |
|-------|--------|-------|
| Brand Name | Dashboard | Must match Tally party ledger via mapping table |
| Legal Entity | Dashboard | For invoice generation reference |
| GSTIN | Dashboard | Validated against Tally party GSTIN |
| State | Dashboard | Determines CGST+SGST vs IGST |
| Category | Dashboard | Business classification — not in Tally |
| Payment Terms | Dashboard | Default days for due date calculation |
| TDS Config | Dashboard | Section + Rate for auto-calculation |
| Status | Dashboard | Active / Inactive |

**Tally sync:** When a new party ledger appears in Tally that doesn't map to any dashboard brand, flag it as "Unclassified Brand — needs mapping."

---

### 4.4 CREATORS

**Page:** /creators/invoices
**Source:** creator_invoices (dashboard) + tally_payments (Tally)

| Column | Source | Logic |
|--------|--------|-------|
| Creator | creator_invoices.creator_name | direct |
| Brand | brands via brand_id | direct |
| Category | creator_invoices.category | Inherited from brand/campaign |
| Team | teams via team_id | direct |
| Basic Amount | creator_invoices.amount | direct |
| GST | creator_invoices.gst | direct |
| TDS | creator_invoices.tds | Auto: amount x applicable TDS rate |
| GST Hold | creator_invoices.gst_hold | Tracks unreleased GST amount |
| Net Payable | Computed | amount minus tds (when GST held) OR amount + gst minus tds (when GST released) |
| Payment Status | creator_invoices.pay_status | 12-status dropdown, always editable |
| Internal Remark | creator_invoices.internal_remark | Free text, always editable |
| Submitted By | creator_invoices.submitted_by | User who created entry |

**Payment Status Workflow:**
```
Pending -> Processing -> Done
              |
           Hold <-> Pending (reversible)
              |
       Payment Failed -> Pending (retry)
              |
    Payment Refunded -> Pending (re-process)
              |
     Payment Reversed -> Pending (re-process)

Special statuses:
  Basic Paid — GST Pending:
    Basic amount is paid (not payable)
    GST amount remains in gst_hold
    Payable dashboard shows GST pending separately

  GST Released:
    GST hold cleared
    Full payment complete
```

**GST Hold Logic:**
```
When status = "Basic Paid — GST Pending":
  basic_payable = 0 (already paid)
  gst_payable = gst_hold amount
  total_outstanding = gst_hold only

When status = "GST Released":
  basic_payable = 0
  gst_payable = 0
  gst_hold = 0
```

**Tally Payment Verification:**
```
For each creator_invoice WHERE pay_status = "Done":
  Check tally_payments for matching:
    Party (creator name / ledger)
    Amount (plus/minus 100)
    Date (plus/minus 7 days of dashboard pay_date)
  IF match found -> Mark as "Tally Verified"
  IF no match -> Flag "Payment recorded but not found in Tally"
```

**Role-based Data Filtering:**
```
Founder / Finance -> All creator invoices, can edit status + remark
Influencer Manager -> Only invoices WHERE team = user's team. View only.
Team Member -> Only invoices WHERE submitted_by = current_user. View only.
HR -> No access to this page
```

---

### 4.5 PAYMENTS

**Page:** /payments/control
**Source:** creator_invoices + expenses (dashboard) + tally_payments (Tally)

**KPI Calculations:**
```
Pending = COUNT(creator_invoices WHERE pay_status = 'Pending')
Processing = COUNT(WHERE pay_status = 'Processing')
Done = COUNT(WHERE pay_status = 'Done')
GST Pending = COUNT(WHERE pay_status LIKE '%GST Pending%')
Hold = COUNT(WHERE pay_status = 'Hold')
```

**Payables Ageing:**
```
For all creator_invoices WHERE pay_status NOT IN ('Done', 'GST Released', 'Cancelled'):
  days_pending = daysBetween(invoice_date, today)
  Bucket into: 0-30, 31-60, 61-90, 90+
  SUM amounts per bucket
```

---

### 4.6 EXPENSES

**Page:** /expenses
**Source:** expenses (dashboard) + tally_purchase_invoices / tally_payments (Tally)

#### Expense Entry Fields

| Field | Type | Notes |
|-------|------|-------|
| Date | Date | User input |
| Vendor / Paid To | Text | User input |
| Expense Head | Dropdown | From expense_heads master |
| Description | Text | User input |
| Basic Amount | Number | User input |
| GST | Number | User input |
| Total | Computed | basic + gst |
| Payment Status | Dropdown | Pending/Done/Processing/Hold |
| Payment Date | Date | User input |
| Invoice/Bill Ref | Text | User input |
| Team | Dropdown | From teams master |
| Remark | Text | User input |
| Created By | System | Auto: current user |

#### Monthly Analysis Computation

```sql
SELECT
  expense_head,
  SUM(CASE WHEN month = 'Apr' THEN total ELSE 0 END) as apr,
  SUM(CASE WHEN month = 'May' THEN total ELSE 0 END) as may,
  -- ... for all 12 months
  SUM(total) as total
FROM expenses
WHERE fy = '2025-26'
GROUP BY expense_head
ORDER BY total DESC
```

#### MoM Change Calculation (Alert Cards)
```
For each expense_head:
  current_month_total = SUM(expenses WHERE head = X AND month = current)
  previous_month_total = SUM(expenses WHERE head = X AND month = previous)

  IF previous_month_total > 0:
    change_pct = ((current - previous) / previous) x 100
    IF ABS(change_pct) > 10%:
      Generate alert card showing: head, current value, previous value, change percentage

Sort alerts by ABS(change_pct) DESC
Show top 5 as alert-style cards above monthly table
```

#### Tally Ledger Mapping

| Dashboard Expense Head | Tally Ledger(s) |
|----------------------|-----------------|
| Grocery | Office Maintenance |
| Office Utilities | Electricity Charges + Internet Charges |
| Audit + Tax Filings | Audit Fees + Professional Charges |
| Travel and Conveyance | Travelling Expenses + Conveyance |
| Rent | Rent |
| Staff Welfare | Staff Welfare Expenses |
| Stationery | Printing and Stationery |
| Maintenance and Repairs | Repairs and Maintenance |
| Consulting Charges | Consultancy Charges |
| Software and SaaS | Computer Expenses |
| Professional Fees | Professional Fees |
| Bank Charges | Bank Charges |
| Misc. Expenses | Miscellaneous Expenses |

#### Expense to P&L Flow
```
Total expenses by head -> Mapped to P&L line items:

P&L Line: "Operating Expenses"
  <- Travel and Conveyance
  <- Software and SaaS
  <- Professional Fees
  <- Stationery
  <- Consulting Charges

P&L Line: "Corporate Overheads"
  <- Rent
  <- Office Utilities
  <- Maintenance and Repairs
  <- Bank Charges
  <- Grocery
  <- Staff Welfare
  <- Misc. Expenses

P&L Line: "Audit + Compliance"
  <- Audit + Tax Filings

P&L Line: "Employee Cost" (NOT from expenses table)
  <- payroll table OR tally_trial_balance salary ledgers
```

---

### 4.7 FIXED ASSETS

**Page:** /assets
**Source:** fixed_assets (dashboard) + tally_trial_balance (Tally for cross-check)

#### Asset Register Columns

| Column | Source | Notes |
|--------|--------|-------|
| Asset Name | User input | Descriptive name |
| Category | Auto-classified from name, editable | Dropdown from asset_heads |
| Purchase Date | User input | Date |
| Gross Value | User input (excl GST) | Number |
| GST | User input | Captured separately, not added to asset value |
| Acc. Depreciation | Opening: user input. Additions: computed. | Number |
| NBV | gross_value minus acc_depreciation | Computed |
| Dep Rate | User input or category default | Percentage |
| Method | WDV (default) or SLM | Dropdown |
| Type | Opening / Addition | System-set |

#### Auto-Classification Logic
```
Asset name keyword -> Category mapping:
  laptop, desktop, monitor, macbook, imac -> Computer and Equipment
  printer, scanner -> Office Equipment
  table, chair, desk, sofa, cabinet -> Furniture and Fixtures
  ac, fan, inverter -> Electrical Equipment
  camera, tripod, lens -> Other Fixed Assets

If no keyword match -> User must select manually
```

#### Depreciation Calculation
```
For Opening Assets (is_opening = true):
  current_fy_depreciation = nbv x dep_rate / 100
  (Full year depreciation on opening WDV)

For Current FY Additions (is_opening = false):
  current_fy_depreciation = gross_value x dep_rate / 100 x 0.5
  (Half-year convention for assets added during the year)

Total FY Depreciation = SUM(all assets current_fy_depreciation)
  -> This value flows directly into P&L under "Depreciation and Amortization"
```

#### Asset Schedule Structure
```
For each asset_head:
  Opening Gross Block = SUM(gross_value WHERE is_opening = true AND head = X)
  Additions = SUM(gross_value WHERE is_opening = false AND head = X)
  Disposals = 0 (Phase 2)
  Closing Gross Block = Opening + Additions minus Disposals

  Opening Acc Depreciation = SUM(acc_dep WHERE is_opening = true AND head = X)
  Current FY Depreciation = SUM(current_fy_dep for all assets WHERE head = X)
  Closing Acc Depreciation = Opening Dep + Current FY Dep

  Closing NBV = Closing Gross Block minus Closing Acc Depreciation
```

#### Drill-down: Click asset head in schedule -> navigate to Asset Register filtered by that head

#### Tally Cross-check
```
Dashboard total depreciation vs tally_trial_balance WHERE ledger = 'Depreciation'
Dashboard total fixed assets NBV vs tally_trial_balance WHERE group = 'Fixed Assets'
IF variance > 5%: show reconciliation warning
```

---

### 4.8 TAXES

**Page:** /taxes
**Source:** Mixed (dashboard computed + Tally actuals)

| Metric | Dashboard Source | Tally Source | Reconciliation |
|--------|----------------|-------------|----------------|
| Output GST | SUM(invoice_tracking.gst) | tally_gst_summary.output_total | Compare monthly. Flag if > 1% variance. |
| Input GST | SUM(expenses.gst) + SUM(creator_invoices.gst) | tally_gst_summary.input_total | Compare monthly. |
| Net GST Liability | Output minus Input | Tally GST report | Show both. |
| TDS Receivable | SUM(invoice_tracking.tds) | tally_tds_summary | Compare. |
| TDS Payable | SUM(creator_invoices.tds) | tally_tds_summary | Compare. |
| GST Hold | SUM(creator_invoices.gst_hold) | N/A | Dashboard-only. |

---

### 4.9 PROFIT AND LOSS

**Page:** /finance/pl
**Source:** Computed from all modules

| P&L Line | Data Source | Calculation |
|----------|------------|-------------|
| **REVENUE** | | |
| New Business | invoice_tracking WHERE category = 'New Business' | SUM(value) |
| Existing IM | invoice_tracking WHERE category = 'Existing Influencer Marketing' | SUM(value) |
| Existing Studio | invoice_tracking WHERE category = 'Existing Studio' | SUM(value) |
| Talent Management | invoice_tracking WHERE category = 'Talent Management' | SUM(value) |
| **TOTAL REVENUE** | | SUM of above |
| **DIRECT COSTS** | | |
| Creator/Influencer Costs | creator_invoices matched to category | SUM(amount) by category |
| Production Costs | expenses WHERE head IN production heads | SUM(total) |
| **GROSS PROFIT** | | Revenue minus Direct Costs |
| **EMPLOYEE COST** | payroll table OR tally salary ledgers | SUM(gross) |
| **OPERATING EXPENSES** | expenses WHERE head IN opex heads | SUM(total) |
| **CORPORATE OVERHEADS** | expenses WHERE head IN overhead heads | SUM(total) |
| **EBITDA** | | GP minus Employee minus Opex minus Overheads |
| Depreciation | fixed_assets computed | Total FY depreciation |
| Finance Costs | tally_trial_balance bank charges | Actual from Tally |
| Other Income | tally_trial_balance indirect income | Actual from Tally |
| **PBT** | | EBITDA minus Dep minus Finance plus Other Income |

**Category filter:** When a business category is selected, each line item is filtered/allocated to that category. Revenue is filtered directly. Costs are either directly mapped (creator costs by category) or allocated by revenue share (overheads, employee cost).

**Period filter:** All SUMs are restricted to the selected period (month, quarter, or full year).

**Tally cross-check row at bottom:**
```
Tally Trial Balance PBT: (amount)
Dashboard Computed PBT: (amount)
Variance: (amount and percentage)
```

---

### 4.10 CASH FLOW

**Page:** /finance/cashflow
**Source:** Tally bank ledgers + dashboard receipts/payments

```
Opening Cash = tally_bank_transactions opening balance (or manual)

INFLOWS:
  Collections = SUM(tally_receipts for the period)
  Other Income = tally_trial_balance indirect income

OUTFLOWS:
  Creator Payments = SUM(tally_payments to creator parties)
  Expenses = SUM(tally_payments to expense parties)
  Salaries = SUM(tally_payments to salary ledger)
  TDS/GST Deposits = SUM(tally_payments to government ledgers)

Net Cash Flow = Total Inflows minus Total Outflows
Closing Cash = Opening + Net Cash Flow
```

---

### 4.11 HR PAYROLL

**Page:** /hr
**Source:** payroll table (dashboard) + Tally salary vouchers

| Field | Source |
|-------|--------|
| Employee | payroll.name |
| Department | payroll.dept |
| Team | teams.name via team_id |
| Gross | payroll.gross |
| PT | payroll.pt (Professional Tax) |
| Net | gross minus pt minus deductions |
| Status | payroll.status |

**Tally link:** Monthly salary vouchers in Tally should match SUM(payroll.gross). Cross-check and flag variance.

---

### 4.12 ADMINISTRATION

#### 4.12.1 Teams Master

**Page:** /admin/teams
**Source:** teams table
**Impact:** Team dropdown across all modules reads from this table. Adding/editing a team here immediately updates all dropdowns system-wide.

#### 4.12.2 Roles

**Page:** /admin/roles
**Source:** roles table (5 default + user-added)
**Impact:** Controls nav filtering and data access. New roles can be added. Permission matrix assignment needed for new roles.

#### 4.12.3 Chart of Accounts

**Page:** /admin/coa
**Source:** chart_of_accounts table mapped to Tally ledger groups

| Code Range | Group | Purpose |
|-----------|-------|---------|
| 1000-1040 | Revenue | Revenue by business category |
| 2000-2050 | Direct Costs | Creator, Production, Studio, Freelancer |
| 3000-3040 | Employee Cost | Salaries, Bonuses, PT |
| 4000-4030 | Operating Expenses | Marketing, Travel, Software |
| 5000-5070 | Corporate Overheads | Rent, Electricity, Internet, Bank Charges |
| 6000-6050 | Depreciation | Dep per asset head |

#### 4.12.4 Expense Heads

**Page:** /admin/expense-heads
**Source:** expense_heads master (13 heads)
**Impact:** Dropdown source for expense entry form. Clicking a head navigates to Expense Entries filtered by that head.

#### 4.12.5 Business Categories

**Page:** /admin/categories
**Source:** business_categories master (4 fixed values)
**Impact:** Dropdown source for invoice forms, P&L filters, dashboard filters.

---

## 5. ROLE-BASED ACCESS MATRIX

### 5.1 Current Roles

| Module | Founder | Finance | HR | Influencer Manager | Team Member |
|--------|---------|---------|----|--------------------|-------------|
| Dashboard | Full | Full | No | Limited (no P&L) | No |
| Sales (all tabs) | Full | Full | No | No | No |
| Add PI Form | Create + Edit | Create + Edit | No | No | No |
| Brands | Full | Full | No | No | No |
| Creators | All data, Edit | All data, Edit | No | Own team, View | Own submissions, View |
| Payments | Full | Full | No | No | No |
| Expenses | Full | Full | No | No | No |
| Fixed Assets | Full | Full | No | No | No |
| Taxes | Full | Full | No | No | No |
| P&L | Full | Full | No | No | No |
| Cash Flow | Full | Full | No | No | No |
| Category Analysis | Full | Full | No | No | No |
| HR Payroll | View | View | Full | No | No |
| Administration | Full | Full | No | No | No |

### 5.2 Data Scope Rules

```
Founder: sees all data, can edit everything, can add/delete
Finance: same as Founder (operational co-owner)
HR: sees only payroll module, can edit payroll status
Influencer Manager:
  Dashboard: sees revenue KPIs but not P&L/EBITDA
  Creators: sees only invoices WHERE team = their_team
  Cannot edit payment status or remarks
Team Member:
  Creators only: sees only invoices WHERE submitted_by = their_user_id
  Cannot edit anything
```

### 5.3 Phase 2 Roles (Backend Required)

| Role | Access | Notes |
|------|--------|-------|
| Campaign Manager | Dashboard + Sales + Creators (own campaigns) | Needs campaign-to-team mapping |
| Creator (External) | Own invoices, payment status, GST certificate upload | Portal with separate auth |
| Vendor (External) | Own invoices, payment status | Portal with separate auth |
| Auditor | Full read-only across all modules + Tally reconciliation | Time-limited access |

---

## 6. DATA FLOW DIAGRAMS

### 6.1 Invoice Lifecycle

```
1. Sales team creates PI in dashboard
   -> proforma_invoices table
   -> Status: PI Raised

2. Brand sends PO
   -> Status: PO Received

3. Campaign executes, invoice raised in Tally
   -> Tally creates sales voucher
   -> Sync service picks up voucher
   -> Matches to PI via brand + amount
   -> Creates invoice_tracking record
   -> PI status: Tax Invoice Raised
   -> invoice_voucher_map links PI to Tally voucher

4. Due date arrives
   -> Receivables dashboard shows ageing
   -> Expected payment date tracked separately

5. Brand makes payment
   -> Tally records receipt voucher
   -> Sync service matches receipt to invoice
   -> receivable_tracking.received updated
   -> Outstanding recalculated
   -> Status: Paid / Partially Paid

6. Revenue flows to P&L
   -> invoice_tracking.value aggregated by category
   -> P&L dashboard shows revenue by business category
```

### 6.2 Creator Payment Lifecycle

```
1. Manager submits creator invoice in dashboard
   -> creator_invoices table
   -> Status: Pending

2. Finance reviews
   -> Status: Processing
   -> Internal Remark: "In current payment cycle"

3a. Full payment:
   -> Finance pays via bank
   -> Status: Done
   -> Tally records payment voucher
   -> Sync verifies match

3b. Partial payment (GST Hold):
   -> Finance pays basic amount only
   -> Status: Basic Paid — GST Pending
   -> gst_hold = GST amount
   -> Basic not in payable. GST in pending.

4. GST release:
   -> ITC reflects in Tally
   -> Finance releases GST payment
   -> Status: GST Released
   -> gst_hold = 0

5. Exception handling:
   -> Payment fails / bounces
   -> Status: Payment Failed
   -> Status back to: Pending (for retry)
   -> All status changes logged in payment_history
```

### 6.3 Expense to P&L Flow

```
1. Team member / finance enters expense
   -> expenses table
   -> Expense head assigned

2. Tally verification (scheduled):
   -> Sync checks for matching purchase/payment voucher
   -> Links expense to Tally voucher if found

3. Monthly aggregation:
   -> Expenses grouped by head x month
   -> MoM change computed
   -> Alert cards generated for significant changes (>10%)

4. P&L mapping:
   -> Expense heads mapped to P&L line items
   -> Operating Expenses = SUM of mapped opex heads
   -> Corporate Overheads = SUM of mapped overhead heads
```

### 6.4 Fixed Asset to Depreciation to P&L Flow

```
1. Asset added to dashboard
   -> fixed_assets table
   -> Auto-classified to asset head
   -> If current FY: is_opening = false, acc_dep = 0

2. Depreciation computed:
   -> Opening assets: NBV x rate (full year)
   -> Additions: value x rate x 0.5 (half year)

3. Asset schedule generated:
   -> Per asset head: Opening / Additions / Depreciation / Closing NBV

4. P&L impact:
   -> Total depreciation -> P&L "Depreciation and Amortization" line
   -> Same number should match Tally

5. Tally cross-check:
   -> Dashboard depreciation vs Tally depreciation ledger
   -> Dashboard fixed asset NBV vs Tally fixed asset group balance
```

---

## 7. API ENDPOINTS (Backend — Phase 2)

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| /api/auth/login | POST | Login, return JWT | Public |
| /api/brands | GET/POST/PUT | Brand CRUD | Founder, Finance |
| /api/invoices/pi | GET/POST/PUT | Proforma Invoice CRUD | Founder, Finance |
| /api/invoices/tax | GET | Tax invoices (from Tally sync) | Founder, Finance |
| /api/receivables | GET/PUT | Receivables + tracking | Founder, Finance |
| /api/creators/invoices | GET/POST/PUT | Creator invoice CRUD | Role-filtered |
| /api/payments | GET | Payment control view | Founder, Finance |
| /api/expenses | GET/POST/PUT | Expense CRUD | Founder, Finance |
| /api/assets | GET/POST/PUT | Fixed asset CRUD | Founder, Finance |
| /api/payroll | GET/PUT | Payroll data | Founder, Finance, HR |
| /api/teams | GET/POST/PUT | Team CRUD | Founder, Finance |
| /api/roles | GET/POST | Role CRUD | Founder |
| /api/pl | GET | Computed P&L | Founder, Finance |
| /api/cashflow | GET | Computed cash flow | Founder, Finance |
| /api/taxes | GET | Tax summary | Founder, Finance |
| /api/tally/sync | POST | Trigger manual sync | Founder |
| /api/tally/status | GET | Last sync time + status | Founder, Finance |
| /api/tally/reconcile | GET | Reconciliation report | Founder, Finance |

---

## 8. IMPLEMENTATION PHASES

### Phase 1 (Current — React + Local Storage)
- All dashboard pages functional with dummy data
- All forms, dropdowns, filters, drill-downs working
- Role-based nav and data filtering
- No Tally connection
- No multi-user auth

### Phase 2 (Node.js + PostgreSQL Backend)
- All dashboard tables migrated to PostgreSQL
- REST API for all CRUD operations
- JWT authentication with role enforcement
- Tally sync service (scheduled + on-demand)
- Reconciliation engine
- Audit trail on all writes

### Phase 3 (Tally Integration Live)
- Tally XML API connection
- Real-time voucher sync
- Automated invoice matching
- Automated receipt matching
- GST/TDS report exports (GSTR-1, 26Q format)
- Reconciliation dashboard

### Phase 4 (Advanced)
- Creator/Vendor portals (external access)
- OCR for invoice upload
- WhatsApp notifications
- E-invoicing
- Bank statement import + auto-reconciliation
- Budget vs Actual module
- Opening balance import wizard

---

## 9. TALLY PRIME DATA REFERENCE

### 9.1 Key Tally Ledger Groups

| Tally Group | Dashboard Mapping |
|------------|-------------------|
| Sundry Debtors | Receivables (outstanding by party) |
| Sundry Creditors | Payables (creator/vendor outstanding) |
| Sales Accounts | Revenue |
| Direct Expenses | Direct Costs (creator payments) |
| Indirect Expenses | Employee Cost + Opex + Overheads |
| Fixed Assets | Asset Register NBV cross-check |
| Bank Accounts | Cash Flow, Bank Reconciliation |
| Duties and Taxes | GST, TDS balances |
| Current Liabilities | TDS/GST payable |
| Current Assets | TDS receivable, advances |

### 9.2 Key Tally Voucher Types

| Voucher Type | Dashboard Module |
|-------------|------------------|
| Sales | Tax Invoices, Revenue |
| Purchase | Expenses (if vendor invoice) |
| Payment | Creator payments, Expense payments, Salary payments |
| Receipt | Collections / Receivables |
| Journal | Provisions, adjustments (Phase 2) |
| Contra | Bank transfers (Cash Flow) |

### 9.3 Tally GSTIN Configuration

TBM GSTIN: Single registration (Maharashtra, State Code 27)
- Intra-state (brand in MH): CGST 9% + SGST 9%
- Inter-state (brand outside MH): IGST 18%
- Dashboard auto-determines based on brand.state vs company state

---

This document is the complete specification. Every page, every calculation, every data flow, every Tally mapping point is covered. Use it to build the backend, write the sync service, and verify that the frontend logic matches what Tally will eventually provide.
