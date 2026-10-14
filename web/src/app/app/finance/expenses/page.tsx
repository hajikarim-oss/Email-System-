// ==============================================================================
// Office Expenses & 13 Expense Heads Analysis (/app/finance/expenses)
// Section 4.6 & 6.3 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    FlameIcon,
    AlertCircleIcon,
    CheckCircle2Icon,
    Building2Icon,
    TrendingUpIcon,
    ArrowUpRightIcon,
    PlusIcon,
    FilterIcon,
    FileSpreadsheetIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";

interface ExpenseHeadData {
    head: string;
    category: "Opex" | "Corporate Overheads" | "Audit & Compliance";
    tallyLedger: string;
    currentMonth: number;
    prevMonth: number;
    fullYear: number;
}

const expenseHeadsMaster: ExpenseHeadData[] = [
    { head: "Software and SaaS", category: "Opex", tallyLedger: "Computer Expenses", currentMonth: 185000, prevMonth: 145000, fullYear: 1850000 },
    { head: "Travel and Conveyance", category: "Opex", tallyLedger: "Travelling & Conveyance", currentMonth: 210000, prevMonth: 175000, fullYear: 2200000 },
    { head: "Professional Fees", category: "Opex", tallyLedger: "Professional Fees", currentMonth: 140000, prevMonth: 135000, fullYear: 1550000 },
    { head: "Consulting Charges", category: "Opex", tallyLedger: "Consultancy Charges", currentMonth: 120000, prevMonth: 95000, fullYear: 1100000 },
    { head: "Stationery", category: "Opex", tallyLedger: "Printing and Stationery", currentMonth: 18000, prevMonth: 17500, fullYear: 210000 },
    { head: "Rent", category: "Corporate Overheads", tallyLedger: "Office Rent", currentMonth: 250000, prevMonth: 250000, fullYear: 3000000 },
    { head: "Office Utilities", category: "Corporate Overheads", tallyLedger: "Electricity & Internet", currentMonth: 65000, prevMonth: 62000, fullYear: 780000 },
    { head: "Maintenance and Repairs", category: "Corporate Overheads", tallyLedger: "Repairs & Maintenance", currentMonth: 38000, prevMonth: 35000, fullYear: 420000 },
    { head: "Staff Welfare", category: "Corporate Overheads", tallyLedger: "Staff Welfare Expenses", currentMonth: 45000, prevMonth: 48000, fullYear: 520000 },
    { head: "Grocery", category: "Corporate Overheads", tallyLedger: "Office Maintenance", currentMonth: 22000, prevMonth: 21000, fullYear: 260000 },
    { head: "Bank Charges", category: "Corporate Overheads", tallyLedger: "Bank Charges", currentMonth: 12500, prevMonth: 13000, fullYear: 150000 },
    { head: "Misc. Expenses", category: "Corporate Overheads", tallyLedger: "Miscellaneous Expenses", currentMonth: 15000, prevMonth: 16000, fullYear: 180000 },
    { head: "Audit + Tax Filings", category: "Audit & Compliance", tallyLedger: "Audit Fees & Legal", currentMonth: 85000, prevMonth: 85000, fullYear: 450000 },
];

export default function ExpensesPage() {
    const [selectedCategory, setSelectedCategory] = useState<string>("All");

    // MoM Spikes (>10% shift)
    const anomalySpikes = expenseHeadsMaster
        .map(h => {
            const diff = h.currentMonth - h.prevMonth;
            const pct = Math.round((diff / h.prevMonth) * 1000) / 10;
            return { ...h, pct };
        })
        .filter(h => Math.abs(h.pct) > 10)
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    const filteredHeads = expenseHeadsMaster.filter(h => {
        if (selectedCategory !== "All" && h.category !== selectedCategory) return false;
        return true;
    });

    const totalCurrentMonth = filteredHeads.reduce((s, h) => s + h.currentMonth, 0);
    const totalFullYear = filteredHeads.reduce((s, h) => s + h.fullYear, 0);

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="13 Corporate Expense Heads &amp; P&L Mapping · MD Section 4.6">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Filter Group:</span>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="All">All 13 Expense Heads</option>
                        <option value="Opex">Operating Expenses (Opex)</option>
                        <option value="Corporate Overheads">Corporate Overheads</option>
                        <option value="Audit & Compliance">Audit &amp; Compliance</option>
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
                                Corporate Overhead &amp; P&L Mapping
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Office Expenses &amp; Cost Control
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Continuous monitoring of all 13 expense heads mapped to Tally Prime ledger groups with automated Month-over-Month (&gt;10%) anomaly detection.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-white text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                FYTD Total Spend
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-slate-900">
                                ₹{(totalFullYear / 100000).toFixed(2)}L
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-5 pb-16">
                {/* MoM Expense Spikes Anomaly Strip (MD Section 4.6) */}
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FlameIcon className="w-4 h-4 text-amber-600" />
                            <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">
                                Month-over-Month Anomaly Alerts (&gt;10% Shift)
                            </h3>
                        </div>
                        <span className="text-[11px] font-semibold text-amber-800">
                            {anomalySpikes.length} Heads Flagged for Review
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {anomalySpikes.map(spike => (
                            <div
                                key={spike.head}
                                className="p-3 rounded-lg border border-amber-200/80 bg-white shadow-2xs space-y-1.5"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-bold text-slate-900">{spike.head}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-900">
                                        +{spike.pct}% ⚠️
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                    <span>Current: ₹{(spike.currentMonth / 1000).toFixed(1)}k</span>
                                    <span>Prior: ₹{(spike.prevMonth / 1000).toFixed(1)}k</span>
                                </div>
                                <span className="text-[10px] text-slate-400 block pt-1 border-t border-slate-100">
                                    Tally: {spike.tallyLedger}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 13 Expense Heads Master Table */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-200/70 flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-900">
                                13 Expense Heads Master Schedule
                            </h3>
                            <p className="text-[11.5px] text-slate-500">
                                Grouped per P&amp;L allocation rules (Opex vs Corporate Overheads vs Compliance)
                            </p>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                            Current Month Total: ₹{(totalCurrentMonth / 100000).toFixed(2)}L
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Expense Head</th>
                                    <th className="py-2.5 px-3">P&amp;L Classification</th>
                                    <th className="py-2.5 px-3">Tally Prime Ledger Mapping</th>
                                    <th className="py-2.5 px-3 text-right">Current Month</th>
                                    <th className="py-2.5 px-3 text-right">Prior Month</th>
                                    <th className="py-2.5 px-3 text-center">MoM Variance</th>
                                    <th className="py-2.5 px-3 text-right">Full FY Projection</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filteredHeads.map(item => {
                                    const diff = item.currentMonth - item.prevMonth;
                                    const pct = Math.round((diff / item.prevMonth) * 1000) / 10;
                                    const isSpike = Math.abs(pct) > 10;

                                    return (
                                        <tr key={item.head} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                                                {item.head}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <span
                                                    className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium",
                                                        item.category === "Opex"
                                                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                                                            : item.category === "Corporate Overheads"
                                                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                                                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                    )}
                                                >
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                                {item.tallyLedger}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                                ₹{item.currentMonth.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                                ₹{item.prevMonth.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span
                                                    className={cn(
                                                        "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                                        isSpike
                                                            ? "bg-amber-100 text-amber-800"
                                                            : pct > 0
                                                            ? "bg-slate-100 text-slate-700"
                                                            : "bg-emerald-50 text-emerald-700"
                                                    )}
                                                >
                                                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                                                ₹{item.fullYear.toLocaleString("en-IN")}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
