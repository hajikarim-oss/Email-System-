// ==============================================================================
// Receivables Page (/app/finance/receivables)
// Section 4.2.3 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    CircleDollarSignIcon,
    AlertCircleIcon,
    CheckCircle2Icon,
    ClockIcon,
    FilterIcon,
    DownloadIcon,
    SearchIcon,
} from "lucide-react";

interface ReceivableItem {
    id: string;
    brandName: string;
    invoiceNo: string;
    category: string;
    date: string;
    dueDate: string;
    grossAmount: number;
    receivedAmount: number;
    outstandingAmount: number;
    ageingBucket: "Current" | "0-30" | "31-60" | "61-90" | "90+";
    status: "Paid" | "Partially Paid" | "Overdue" | "Due Soon" | "Unpaid";
    timelineRemark: string;
}

const mockReceivables: ReceivableItem[] = [
    {
        id: "REC-001",
        brandName: "Amani B.V.",
        invoiceNo: "EXP/2023-24/001",
        category: "Export Client",
        date: "2023-04-10",
        dueDate: "2023-06-10",
        grossAmount: 15906664,
        receivedAmount: 14200000,
        outstandingAmount: 1706664,
        ageingBucket: "0-30",
        status: "Partially Paid",
        timelineRemark: "Bill-by-bill allocated; part receipt of €15,000 cleared in EEFC account",
    },
    {
        id: "REC-002",
        brandName: "RNA Resources Group Ltd.",
        invoiceNo: "EXP/2023-24/004",
        category: "Export Client",
        date: "2023-04-18",
        dueDate: "2023-05-18",
        grossAmount: 2582434,
        receivedAmount: 2200000,
        outstandingAmount: 382434,
        ageingBucket: "31-60",
        status: "Partially Paid",
        timelineRemark: "Balance scheduled for clearance via standard TT transfer",
    },
    {
        id: "REC-003",
        brandName: "Melluso Calzature",
        invoiceNo: "EXP/2023-24/007",
        category: "Direct Client",
        date: "2023-05-02",
        dueDate: "2023-06-02",
        grossAmount: 2119973,
        receivedAmount: 2119973,
        outstandingAmount: 0,
        ageingBucket: "Current",
        status: "Paid",
        timelineRemark: "100% Settled via Tally Receipt Voucher #RCT/23-24/18",
    },
    {
        id: "REC-004",
        brandName: "Chaussure Maniet S.A., Belgium",
        invoiceNo: "EXP/2023-24/011",
        category: "Export Client",
        date: "2023-05-15",
        dueDate: "2023-06-15",
        grossAmount: 1666180,
        receivedAmount: 1200000,
        outstandingAmount: 466180,
        ageingBucket: "0-30",
        status: "Partially Paid",
        timelineRemark: "Confirmed with client accounts; remittance in transit",
    },
    {
        id: "REC-005",
        brandName: "S.A. Chaussures Maniet",
        invoiceNo: "EXP/2023-24/014",
        category: "Direct Client",
        date: "2023-05-22",
        dueDate: "2023-06-22",
        grossAmount: 1638490,
        receivedAmount: 1638490,
        outstandingAmount: 0,
        ageingBucket: "Current",
        status: "Paid",
        timelineRemark: "Settled in full via Union Bank transfer",
    },
    {
        id: "REC-006",
        brandName: "Telstra Telecommunications Pvt. Ltd",
        invoiceNo: "DOM/2023-24/082",
        category: "Domestic Corporate",
        date: "2023-06-01",
        dueDate: "2023-07-01",
        grossAmount: 1303259,
        receivedAmount: 0,
        outstandingAmount: 1303259,
        ageingBucket: "61-90",
        status: "Overdue",
        timelineRemark: "Overdue follow-up logged in Tally bill allocations",
    },
];

export default function ReceivablesPage() {
    const [filterStatus, setFilterStatus] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");

    const filtered = mockReceivables.filter(item => {
        if (filterStatus !== "All" && item.status !== filterStatus) return false;
        if (searchQuery && !item.brandName.toLowerCase().includes(searchQuery.toLowerCase()) && !item.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        return true;
    });

    const totalOutstanding = mockReceivables.reduce((acc, curr) => acc + curr.outstandingAmount, 0);
    const totalOverdue = mockReceivables.filter(i => i.status === "Overdue").reduce((acc, curr) => acc + curr.outstandingAmount, 0);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Accounts Receivable &amp; Collections</h1>
                    <p className="text-[12.5px] text-slate-500">
                        Tracks client invoice dues with automatic Tally receipt voucher matching &amp; ageing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <span className="text-[11px] text-slate-500 block">Total Outstanding</span>
                        <span className="text-lg font-bold text-slate-900">₹{(totalOutstanding / 100000).toFixed(2)} Lakhs</span>
                    </div>
                </div>
            </div>

            {/* Ageing Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 block">Current (Not Due)</span>
                    <span className="text-base font-semibold text-slate-800">₹1.77 Lakhs</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 block">0 - 30 Days</span>
                    <span className="text-base font-semibold text-slate-800">₹2.72 Lakhs</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 block">31 - 60 Days</span>
                    <span className="text-base font-semibold text-amber-600">₹1.18 Lakhs</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 block">61 - 90 Days</span>
                    <span className="text-base font-semibold text-slate-400">₹0.00</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 block">90+ Days</span>
                    <span className="text-base font-semibold text-slate-400">₹0.00</span>
                </div>
            </div>

            {/* Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    {["All", "Overdue", "Unpaid", "Partially Paid", "Due Soon", "Paid"].map(pill => (
                        <button
                            key={pill}
                            onClick={() => setFilterStatus(pill)}
                            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                                filterStatus === pill
                                    ? "bg-[#18181B] text-white font-medium"
                                    : "bg-slate-100 hover:bg-slate-200/70 text-slate-600"
                            }`}
                        >
                            {pill}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                        type="text"
                        placeholder="Search brand or invoice..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 pr-3 text-[12px] rounded-md border border-slate-200 bg-white w-64 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                </div>
            </div>

            {/* Receivables Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-[12px] border-collapse">
                    <thead>
                        <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider">
                            <th className="py-2.5 px-3">Brand Name</th>
                            <th className="py-2.5 px-3">Invoice No</th>
                            <th className="py-2.5 px-3">Due Date</th>
                            <th className="py-2.5 px-3 text-right">Gross Amount</th>
                            <th className="py-2.5 px-3 text-right">Tally Received</th>
                            <th className="py-2.5 px-3 text-right">Outstanding</th>
                            <th className="py-2.5 px-3">Ageing</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3">Follow-up / Timeline Remark</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filtered.map(row => (
                            <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-3 font-semibold text-slate-900">{row.brandName}</td>
                                <td className="py-2.5 px-3 font-mono text-[11.5px] text-slate-600">{row.invoiceNo}</td>
                                <td className="py-2.5 px-3 text-slate-600">{row.dueDate}</td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                                    ₹{row.grossAmount.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                                    ₹{row.receivedAmount.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                                    ₹{row.outstandingAmount.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-700">
                                        {row.ageingBucket}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                    {row.status === "Paid" && (
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            Paid
                                        </span>
                                    )}
                                    {row.status === "Overdue" && (
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                            Overdue
                                        </span>
                                    )}
                                    {row.status === "Partially Paid" && (
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                            Partially Paid
                                        </span>
                                    )}
                                    {row.status === "Due Soon" && (
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                            Due Soon
                                        </span>
                                    )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 italic text-[11.5px] max-w-xs truncate">
                                    {row.timelineRemark}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
