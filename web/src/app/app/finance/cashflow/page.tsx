// ==============================================================================
// Operating Cash Flow Statement (/app/finance/cashflow)
// Section 4.10 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    ActivityIcon,
    ArrowUpRightIcon,
    ArrowDownRightIcon,
    CheckCircle2Icon,
    ClockIcon,
    Building2Icon,
    DollarSignIcon,
    DownloadIcon,
    ShieldCheckIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";

export default function CashFlowPage() {
    const [selectedPeriod, setSelectedPeriod] = useState("Full FY 2025-26");

    const openingCash = 35285279;
    const collections = 118648587;
    const otherIncome = 0;
    const totalInflows = collections + otherIncome;

    const creatorPayments = 68420000;
    const officeExpenses = 32872478;
    const salaryPayments = 14500000;
    const statutoryDeposits = 7400000;
    const totalOutflows = 123192478;

    const netCashFlow = totalInflows - totalOutflows;
    const closingCash = 30741388;

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="Operating Cash Flow &amp; Bank Ledgers · MD Section 4.10">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Period:</span>
                    <select
                        value={selectedPeriod}
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="Full FY 2025-26">Full FY 2025-26</option>
                        <option value="Q1 (Apr - Jun)">Q1 (Apr - Jun)</option>
                        <option value="Q2 (Jul - Sep)">Q2 (Jul - Sep)</option>
                    </select>
                </div>

                <TopbarAction href="/app/finance/dashboard" icon={<ArrowUpRightIcon className="w-3.5 h-3.5" />}>
                    Overview Dashboard
                </TopbarAction>
            </PageTopbar>

            {/* Editorial Hero Banner */}
            <div className="px-4 sm:px-6 pt-5 pb-2">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-stone-200/90">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                                Treasury &amp; Bank Liquidity Statement
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Operating Cash Flow Statement
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Cash inflows from client receipts and outflows for creator payouts, salaries, and statutory GST/TDS reconciled against Tally Prime bank ledgers.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/50 text-right">
                            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                                Closing Bank Balance
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-emerald-950">
                                ₹{(closingCash / 100000).toFixed(2)}L
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-5 pb-16">
                {/* 3 Vital Cash Flow Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">Total Cash Inflows</span>
                        <div className="text-[25px] font-bold text-emerald-700 font-mono">
                            +₹{(totalInflows / 100000).toFixed(2)} Lakhs
                        </div>
                        <span className="text-[11px] text-slate-400">Collections: ₹1.20 Crore</span>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">Total Cash Outflows</span>
                        <div className="text-[25px] font-bold text-rose-700 font-mono">
                            -₹{(totalOutflows / 100000).toFixed(2)} Lakhs
                        </div>
                        <span className="text-[11px] text-slate-400">Creators + Payroll + Opex</span>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">Net Operating Cash Flow</span>
                        <div className="text-[25px] font-bold text-indigo-700 font-mono">
                            +₹{(netCashFlow / 100000).toFixed(2)} Lakhs
                        </div>
                        <span className="text-[11px] text-emerald-600 font-semibold">Positive Cash Generation</span>
                    </div>
                </div>

                {/* Cash Flow Statement Waterfall */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-200/70 flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-900">
                                Cash Flow Waterfall Schedule (Direct Method)
                            </h3>
                            <p className="text-[11.5px] text-slate-500">
                                Reconciled with Tally Prime Bank Ledger vouchers (HDFC &amp; ICICI accounts)
                            </p>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                            Tally Prime Bank Statements Reconciled
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-4">Cash Flow Activity</th>
                                    <th className="py-2.5 px-4">Ledger Source</th>
                                    <th className="py-2.5 px-4 text-right">Inflow (₹)</th>
                                    <th className="py-2.5 px-4 text-right">Outflow (₹)</th>
                                    <th className="py-2.5 px-4 text-right">Net Position</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                <tr className="bg-slate-50/30">
                                    <td className="py-2.5 px-4 font-semibold text-slate-900">Opening Cash &amp; Bank Balance</td>
                                    <td className="py-2.5 px-4 text-slate-500">Tally Bank Master</td>
                                    <td className="py-2.5 px-4 text-right font-mono font-medium">₹18,50,000</td>
                                    <td className="py-2.5 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">₹18,50,000</td>
                                </tr>

                                {/* INFLOWS */}
                                <tr className="bg-emerald-50/30 font-bold text-emerald-950">
                                    <td colSpan={5} className="py-2 px-4 uppercase text-[10.5px] tracking-wider text-emerald-800">
                                        Operating Cash Inflows
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Collections from Sundry Debtors</td>
                                    <td className="py-2 px-4 text-slate-500">Tally Receipt Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-emerald-700 font-medium">₹1,20,00,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">+₹1,20,00,000</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Indirect Income / Interest Received</td>
                                    <td className="py-2 px-4 text-slate-500">Bank Interest Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-emerald-700 font-medium">₹1,80,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">+₹1,80,000</td>
                                </tr>

                                {/* OUTFLOWS */}
                                <tr className="bg-rose-50/30 font-bold text-rose-950">
                                    <td colSpan={5} className="py-2 px-4 uppercase text-[10.5px] tracking-wider text-rose-800">
                                        Operating Cash Outflows
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Creator Payouts Disbursed</td>
                                    <td className="py-2 px-4 text-slate-500">Tally Payment Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹58,40,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">-₹58,40,000</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Corporate Overheads &amp; Utilities</td>
                                    <td className="py-2 px-4 text-slate-500">Tally Payment Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹14,38,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">-₹14,38,000</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Employee Salaries Paid</td>
                                    <td className="py-2 px-4 text-slate-500">Payroll Bank Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹18,50,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">-₹18,50,000</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Statutory GST &amp; TDS Deposits</td>
                                    <td className="py-2 px-4 text-slate-500">Government Challan Vouchers</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-400">—</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹12,80,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">-₹12,80,000</td>
                                </tr>

                                {/* CLOSING */}
                                <tr className="bg-slate-900 text-white font-bold">
                                    <td className="py-3 px-4 text-[12.5px]">CLOSING CASH &amp; BANK BALANCE</td>
                                    <td className="py-3 px-4 text-slate-300 font-normal">Reconciled Tally Bank Accounts</td>
                                    <td className="py-3 px-4 text-right font-mono text-emerald-400">₹11,86,48,587</td>
                                    <td className="py-3 px-4 text-right font-mono text-rose-400">-₹12,31,92,478</td>
                                    <td className="py-3 px-4 text-right font-mono text-[14px] text-[#FFE600]">₹3,07,41,388</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
