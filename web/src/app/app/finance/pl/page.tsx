// ==============================================================================
// Full Category Profit & Loss Statement (/app/finance/pl)
// Section 4.9 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    BarChart3Icon,
    LayersIcon,
    ArrowUpRightIcon,
    CheckCircle2Icon,
    DownloadIcon,
    Building2Icon,
    SlidersIcon,
    FileSpreadsheetIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | "new_business" | "influencer_marketing" | "studio" | "talent";

export default function ProfitAndLossPage() {
    const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
    const [selectedPeriod, setSelectedPeriod] = useState<string>("full");

    // Dynamic multipliers based on category
    const isFiltered = selectedCategory !== "all";

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="Management P&amp;L Statement · MD Section 4.9">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Category:</span>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value as CategoryFilter)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="all">All Business Verticals</option>
                        <option value="new_business">New Business (DC 48%)</option>
                        <option value="influencer_marketing">Existing Influencer Mkt (DC 58%)</option>
                        <option value="studio">Existing Studio (DC 52%)</option>
                        <option value="talent">Talent Management (DC 38%)</option>
                    </select>

                    <span className="text-[11.5px] text-slate-500 font-medium ml-2">Period:</span>
                    <select
                        value={selectedPeriod}
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="full">FY 2025-26 Full Year</option>
                        <option value="q1">Q1 (Apr - Jun)</option>
                        <option value="q2">Q2 (Jul - Sep)</option>
                        <option value="q3">Q3 (Oct - Dec)</option>
                        <option value="q4">Q4 (Jan - Mar)</option>
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
                                Executive Profit &amp; Loss Waterfall MIS
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Statement of Profit and Loss
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Category-level gross profit contribution margins, overhead allocation, and bottom-line PBT reconciled against Tally Prime Trial Balance.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-indigo-200/70 bg-indigo-50/50 text-right">
                            <span className="text-[10px] uppercase font-bold text-indigo-800 tracking-wider block">
                                Operating EBITDA
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-indigo-950">
                                ₹38,40,000 (25.8%)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-5 pb-16">
                {/* 4 Category Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {[
                        { title: "New Business Growth", rev: "₹42.50 Lakhs", dcRatio: "48%", gp: "₹22.10 Lakhs (52%)", ebitda: "₹11.90 Lakhs", color: "border-blue-500" },
                        { title: "Existing Influencer Mkt", rev: "₹58.20 Lakhs", dcRatio: "58%", gp: "₹24.44 Lakhs (42%)", ebitda: "₹10.47 Lakhs", color: "border-emerald-500" },
                        { title: "Existing Studio Production", rev: "₹26.80 Lakhs", dcRatio: "52%", gp: "₹12.86 Lakhs (48%)", ebitda: "₹6.43 Lakhs", color: "border-purple-500" },
                        { title: "Talent Management", rev: "₹21.00 Lakhs", dcRatio: "38%", gp: "₹13.02 Lakhs (62%)", ebitda: "₹7.98 Lakhs", color: "border-amber-500" },
                    ].map(card => (
                        <div
                            key={card.title}
                            className={cn(
                                "p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1.5 border-l-4",
                                card.color
                            )}
                        >
                            <span className="text-[12px] font-bold text-slate-900 block truncate">{card.title}</span>
                            <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                                <span>Revenue: <strong className="text-slate-800 font-mono">{card.rev}</strong></span>
                                <span className="font-mono">DC: {card.dcRatio}</span>
                            </div>
                            <div className="flex items-baseline justify-between text-[11px] pt-1 border-t border-slate-100">
                                <span className="text-emerald-700 font-semibold">GP: {card.gp}</span>
                                <span className="font-bold text-slate-900 font-mono">{card.ebitda}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Full Waterfall Statement Table */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-200/70 flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-900">
                                Detailed Management P&amp;L Statement
                            </h3>
                            <p className="text-[11.5px] text-slate-500">
                                All amounts in INR (₹) · Verified with Tally Prime Chart of Accounts
                            </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                            Fiscal Year: 2025-26
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-4">Line Item / Account Head</th>
                                    <th className="py-2.5 px-4">Source of Truth</th>
                                    <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                                    <th className="py-2.5 px-4 text-right">% of Revenue</th>
                                    <th className="py-2.5 px-4 text-center">Tally Match Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {/* SECTION: REVENUE */}
                                <tr className="bg-slate-50/40 font-bold text-slate-900">
                                    <td colSpan={5} className="py-2 px-4 uppercase text-[10.5px] tracking-wider text-slate-600">
                                        I. Revenue from Operations
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Existing Influencer Marketing</td>
                                    <td className="py-2 px-4 text-slate-500">Tax Invoices (Tally Sales)</td>
                                    <td className="py-2 px-4 text-right font-mono font-medium">₹58,20,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">39.2%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">Verified</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">New Business Growth</td>
                                    <td className="py-2 px-4 text-slate-500">Tax Invoices (Tally Sales)</td>
                                    <td className="py-2 px-4 text-right font-mono font-medium">₹42,50,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">28.6%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">Verified</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Existing Studio Production</td>
                                    <td className="py-2 px-4 text-slate-500">Tax Invoices (Tally Sales)</td>
                                    <td className="py-2 px-4 text-right font-mono font-medium">₹26,80,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">18.0%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">Verified</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Talent Management</td>
                                    <td className="py-2 px-4 text-slate-500">Tax Invoices (Tally Sales)</td>
                                    <td className="py-2 px-4 text-right font-mono font-medium">₹21,00,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">14.2%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">Verified</td>
                                </tr>
                                <tr className="bg-slate-100/60 font-bold text-slate-900">
                                    <td className="py-2.5 px-4">TOTAL REVENUE (A)</td>
                                    <td className="py-2.5 px-4 text-slate-500 font-normal">Tally Sales Register</td>
                                    <td className="py-2.5 px-4 text-right font-mono text-[12px]">₹1,48,50,000</td>
                                    <td className="py-2.5 px-4 text-right font-mono">100.0%</td>
                                    <td className="py-2.5 px-4 text-center text-emerald-700">Tally In Sync</td>
                                </tr>

                                {/* SECTION: DIRECT COSTS */}
                                <tr className="bg-slate-50/40 font-bold text-slate-900">
                                    <td colSpan={5} className="py-2 px-4 uppercase text-[10.5px] tracking-wider text-slate-600">
                                        II. Direct Costs &amp; Creator Fees
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Creator / Influencer Fees</td>
                                    <td className="py-2 px-4 text-slate-500">Creator Invoices (DC Ratios)</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹62,28,400</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">41.9%</td>
                                    <td className="py-2 px-4 text-center text-slate-400">Allocated</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Studio &amp; Direct Production Expenses</td>
                                    <td className="py-2 px-4 text-slate-500">Expenses Master (Production)</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹13,78,800</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">9.3%</td>
                                    <td className="py-2 px-4 text-center text-slate-400">Allocated</td>
                                </tr>
                                <tr className="bg-slate-100/60 font-bold text-slate-900">
                                    <td className="py-2.5 px-4">TOTAL DIRECT COSTS (B)</td>
                                    <td className="py-2.5 px-4 text-slate-500 font-normal">Direct Expenses Group</td>
                                    <td className="py-2.5 px-4 text-right font-mono text-rose-700 text-[12px]">-₹76,07,200</td>
                                    <td className="py-2.5 px-4 text-right font-mono">51.2%</td>
                                    <td className="py-2.5 px-4 text-center text-slate-500">Allocated</td>
                                </tr>

                                {/* GROSS PROFIT */}
                                <tr className="bg-emerald-50/50 font-bold text-emerald-950">
                                    <td className="py-3 px-4 text-[12px]">GROSS PROFIT (C = A - B)</td>
                                    <td className="py-3 px-4 font-normal text-emerald-800">Contribution Margin</td>
                                    <td className="py-3 px-4 text-right font-mono text-[13px] text-emerald-700">₹72,42,800</td>
                                    <td className="py-3 px-4 text-right font-mono text-emerald-800">48.8%</td>
                                    <td className="py-3 px-4 text-center text-emerald-700">48.8% Margin</td>
                                </tr>

                                {/* SECTION: OVERHEADS */}
                                <tr className="bg-slate-50/40 font-bold text-slate-900">
                                    <td colSpan={5} className="py-2 px-4 uppercase text-[10.5px] tracking-wider text-slate-600">
                                        III. Operating Overheads &amp; Employee Cost
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Employee Salaries &amp; Payroll</td>
                                    <td className="py-2 px-4 text-slate-500">Payroll Master (Tally Salary)</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹18,50,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">12.5%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">100% In Sync</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Corporate Overheads (Rent, Utilities, Upkeep)</td>
                                    <td className="py-2 px-4 text-slate-500">13 Expense Heads</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹8,88,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">6.0%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">100% In Sync</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Operating Expenses (SaaS, Travel, Consulting)</td>
                                    <td className="py-2 px-4 text-slate-500">13 Expense Heads</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹5,50,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">3.7%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">100% In Sync</td>
                                </tr>

                                {/* EBITDA */}
                                <tr className="bg-indigo-50/50 font-bold text-indigo-950">
                                    <td className="py-3 px-4 text-[12px]">OPERATING EBITDA (Core Earnings)</td>
                                    <td className="py-3 px-4 font-normal text-indigo-800">Pre-Depreciation &amp; Interest</td>
                                    <td className="py-3 px-4 text-right font-mono text-[13px] text-indigo-700">₹39,54,800</td>
                                    <td className="py-3 px-4 text-right font-mono text-indigo-800">26.6%</td>
                                    <td className="py-3 px-4 text-center text-indigo-700 font-bold">26.6% EBITDA</td>
                                </tr>

                                {/* BELOW EBITDA */}
                                <tr>
                                    <td className="py-2 px-4 pl-8">Depreciation &amp; Amortization</td>
                                    <td className="py-2 px-4 text-slate-500">Fixed Assets Schedule (WDV)</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹4,20,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">2.8%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">100% In Sync</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-4 pl-8">Finance Costs (Bank Charges &amp; Interest)</td>
                                    <td className="py-2 px-4 text-slate-500">Tally Bank Ledgers</td>
                                    <td className="py-2 px-4 text-right font-mono text-rose-600 font-medium">-₹1,50,000</td>
                                    <td className="py-2 px-4 text-right font-mono text-slate-500">1.0%</td>
                                    <td className="py-2 px-4 text-center text-emerald-600 font-medium">100% In Sync</td>
                                </tr>

                                {/* PBT */}
                                <tr className="bg-slate-900 text-white font-bold">
                                    <td className="py-3 px-4 text-[12.5px]">PROFIT BEFORE TAX (PBT)</td>
                                    <td className="py-3 px-4 text-slate-300 font-normal">Dashboard Computed</td>
                                    <td className="py-3 px-4 text-right font-mono text-[14px] text-[#FFE600]">₹33,84,800</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-200">22.8%</td>
                                    <td className="py-3 px-4 text-center text-emerald-400 font-medium">Tally Diff: ₹20k</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Statutory Cross-Check Bar */}
                    <div className="p-3.5 bg-[#FAF9F5] border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px]">
                        <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                                Statutory Trial Balance Cross-Check (MD Section 4.9)
                            </span>
                            <span className="text-slate-800">
                                Tally Trial Balance PBT: <strong className="font-mono text-slate-900">₹32,50,000</strong> &bull; Dashboard PBT: <strong className="font-mono text-slate-900">₹32,70,000</strong>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-amber-800 font-semibold text-[11.5px]">
                                Variance: ₹20,000 (0.61%)
                            </span>
                            <Link
                                to="/app/finance/reconcile"
                                className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-black text-white text-[11px] font-medium transition-colors"
                            >
                                Open Reconciliation
                            </Link>
                        </div>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
