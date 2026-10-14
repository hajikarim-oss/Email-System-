// ==============================================================================
// Statutory Taxes, GST Reconciliation & TDS Summary (/app/finance/taxes)
// Section 4.8 & 9.3 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    ShieldCheckIcon,
    AlertCircleIcon,
    CheckCircle2Icon,
    FileSpreadsheetIcon,
    ArrowUpRightIcon,
    ClockIcon,
    Building2Icon,
    CalendarIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";

export default function TaxesPage() {
    const [selectedMonth, setSelectedMonth] = useState("Jun 2025");

    const statutoryData = {
        outputCgst: 1336500,
        outputSgst: 1336500,
        outputIgst: 0,
        totalOutputGst: 2673000,
        eligibleInputItc: 1188000,
        netGstPayable: 1485000,
        tallyOutputGst: 2670000,
        tallyInputItc: 1185000,
        tdsReceivable: 297000, // 2% on sales
        tdsPayable: 760720, // 10% on creator payouts under 194J
        gstHold: 185000,
    };

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="Statutory Taxes, GSTR-1 &amp; TDS Filings · MD Section 4.8">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Filing Month:</span>
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="Apr 2025">Apr 2025</option>
                        <option value="May 2025">May 2025</option>
                        <option value="Jun 2025">Jun 2025 (Current)</option>
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
                                Statutory GST &amp; TDS Tax Compliance
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Statutory Taxes &amp; GST Reconciliation
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Output GST liability on sales, eligible Input Tax Credit (ITC) from expenses, and TDS receivable/payable reconciled with Tally Prime and GSTR-2B.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/50 text-right">
                            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                                Net GST Liability
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-emerald-950">
                                ₹{(statutoryData.netGstPayable / 100000).toFixed(2)}L
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-5 pb-16">
                {/* 4 Core Tax Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">Gross Output GST</span>
                        <div className="text-[24px] font-bold text-slate-900">
                            ₹{(statutoryData.totalOutputGst / 100000).toFixed(2)} Lakhs
                        </div>
                        <div className="text-[11px] text-slate-400">
                            CGST: ₹13.36 Lakhs · SGST: ₹13.36 Lakhs (State 27)
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">Eligible Input ITC</span>
                        <div className="text-[24px] font-bold text-emerald-700">
                            ₹{(statutoryData.eligibleInputItc / 100000).toFixed(2)} Lakhs
                        </div>
                        <div className="text-[11px] text-emerald-600 font-medium">
                            Matched with GSTR-2B Portal
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">TDS Receivable</span>
                        <div className="text-[24px] font-bold text-blue-700">
                            ₹{(statutoryData.tdsReceivable / 1000).toFixed(1)}k
                        </div>
                        <div className="text-[11px] text-slate-400">
                            Deducted by clients under 194J / 194C
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
                        <span className="text-[11.5px] font-medium text-slate-500 block">TDS Payable (Section 194J)</span>
                        <div className="text-[24px] font-bold text-rose-700">
                            ₹{(statutoryData.tdsPayable / 1000).toFixed(1)}k
                        </div>
                        <div className="text-[11px] text-rose-600 font-medium">
                            Due on 7th of next month
                        </div>
                    </div>
                </div>

                {/* GST Reconciliation Table (Dashboard vs Tally) */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs space-y-0">
                    <div className="p-4 border-b border-slate-200/70 flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-900">
                                GST Reconciliation: Operational Book vs Tally Prime
                            </h3>
                            <p className="text-[11.5px] text-slate-500">
                                Output tax on sales vouchers vs Input tax credit on purchase &amp; creator vouchers
                            </p>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            Tally Prime Match &lt; 0.15% Var
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Statutory Head</th>
                                    <th className="py-2.5 px-3 text-right">Dashboard Computed</th>
                                    <th className="py-2.5 px-3 text-right">Tally GST Register</th>
                                    <th className="py-2.5 px-3 text-right">Variance</th>
                                    <th className="py-2.5 px-3 text-center">Reconciliation Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                <tr className="hover:bg-slate-50/50">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900">Output CGST (9%)</td>
                                    <td className="py-2.5 px-3 text-right font-mono">₹13,36,500</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹13,35,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-medium">₹1,500</td>
                                    <td className="py-2.5 px-3 text-center text-emerald-600 font-semibold">Matched</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900">Output SGST (9%)</td>
                                    <td className="py-2.5 px-3 text-right font-mono">₹13,36,500</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹13,35,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-medium">₹1,500</td>
                                    <td className="py-2.5 px-3 text-center text-emerald-600 font-semibold">Matched</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900">Input Tax Credit (ITC)</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">₹11,88,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹11,85,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-medium">₹3,000</td>
                                    <td className="py-2.5 px-3 text-center text-emerald-600 font-semibold">GSTR-2B Verified</td>
                                </tr>
                                <tr className="bg-slate-50/50 font-bold">
                                    <td className="py-2.5 px-3 text-slate-900">Net GST Payable via Cash Ledger</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-900">₹14,85,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-900">₹14,85,000</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">₹0</td>
                                    <td className="py-2.5 px-3 text-center text-emerald-700 font-bold">100% In Agreement</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
