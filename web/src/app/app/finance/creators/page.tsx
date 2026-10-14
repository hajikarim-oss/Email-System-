// ==============================================================================
// Creator Invoices & Payment Workflow (/app/finance/creators)
// Section 4.4 & 6.2 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    UsersIcon,
    SearchIcon,
    FilterIcon,
    CheckCircle2Icon,
    AlertCircleIcon,
    ClockIcon,
    ShieldCheckIcon,
    DownloadIcon,
    PlusIcon,
    FileTextIcon,
    ArrowUpRightIcon,
    SparklesIcon,
} from "lucide-react";
import { Page, PageTopbar, PageBody, TopbarAction } from "@/components/layout/Page";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export type CreatorPayStatus =
    | "Pending"
    | "Processing"
    | "Done"
    | "Hold"
    | "Payment Failed"
    | "Payment Refunded"
    | "Payment Reversed"
    | "Basic Paid — GST Pending"
    | "GST Released"
    | "Cancelled"
    | "Under Review"
    | "Approved";

interface CreatorInvoice {
    id: string;
    creatorName: string;
    brandName: string;
    category: string;
    team: string;
    basicAmount: number;
    gstAmount: number;
    tdsRate: number; // e.g., 10 for 194J, 1 or 2 for 194C
    tdsAmount: number;
    gstHold: number;
    payStatus: CreatorPayStatus;
    internalRemark: string;
    submittedBy: string;
    date: string;
    tallyVerified: boolean;
    tallyVoucherNo?: string;
}

const initialInvoices: CreatorInvoice[] = [
    {
        id: "CR-001",
        creatorName: "Kusha Kapila",
        brandName: "Nykaa E-Retail Pvt Ltd",
        category: "Existing Influencer Marketing",
        team: "Influencer Team Alpha",
        basicAmount: 250000,
        gstAmount: 45000,
        tdsRate: 10,
        tdsAmount: 25000,
        gstHold: 45000,
        payStatus: "Basic Paid — GST Pending",
        internalRemark: "Basic paid via bank transfer. GST held until GSTR-2B reflection.",
        submittedBy: "Snehal Maurya",
        date: "2025-05-14",
        tallyVerified: true,
        tallyVoucherNo: "PMT/2025-26/102",
    },
    {
        id: "CR-002",
        creatorName: "Ranveer Allahbadia",
        brandName: "Honasa Consumer (Mamaearth)",
        category: "New Business Growth",
        team: "Growth Outreach",
        basicAmount: 400000,
        gstAmount: 72000,
        tdsRate: 10,
        tdsAmount: 40000,
        gstHold: 0,
        payStatus: "Done",
        internalRemark: "Full fee + GST released. Verified in Tally bank payments.",
        submittedBy: "Monu",
        date: "2025-05-18",
        tallyVerified: true,
        tallyVoucherNo: "PMT/2025-26/109",
    },
    {
        id: "CR-003",
        creatorName: "Dolly Singh",
        brandName: "Imagine Marketing (boAt)",
        category: "Existing Studio Production",
        team: "Studio Operations",
        basicAmount: 180000,
        gstAmount: 32400,
        tdsRate: 10,
        tdsAmount: 18000,
        gstHold: 32400,
        payStatus: "Processing",
        internalRemark: "Included in Friday batch payout run.",
        submittedBy: "Preeti Karki",
        date: "2025-06-02",
        tallyVerified: false,
    },
    {
        id: "CR-004",
        creatorName: "Tanmay Bhat",
        brandName: "KiranaKart (Zepto)",
        category: "New Business Growth",
        team: "Growth Outreach",
        basicAmount: 500000,
        gstAmount: 90000,
        tdsRate: 10,
        tdsAmount: 50000,
        gstHold: 0,
        payStatus: "GST Released",
        internalRemark: "ITC matched in GSTR-2B. Withheld GST released to creator account.",
        submittedBy: "Vatsal Vadecha",
        date: "2025-06-10",
        tallyVerified: true,
        tallyVoucherNo: "PMT/2025-26/142",
    },
    {
        id: "CR-005",
        creatorName: "Prajakta Koli",
        brandName: "Flipkart Internet Pvt Ltd",
        category: "Talent Management",
        team: "Talent Roster",
        basicAmount: 350000,
        gstAmount: 63000,
        tdsRate: 10,
        tdsAmount: 35000,
        gstHold: 63000,
        payStatus: "Pending",
        internalRemark: "Awaiting campaign delivery sign-off from brand manager.",
        submittedBy: "Snehal Maurya",
        date: "2025-06-15",
        tallyVerified: false,
    },
    {
        id: "CR-006",
        creatorName: "Ankush Bahuguna",
        brandName: "Sugar Cosmetics",
        category: "Existing Influencer Marketing",
        team: "Influencer Team Alpha",
        basicAmount: 120000,
        gstAmount: 21600,
        tdsRate: 10,
        tdsAmount: 12000,
        gstHold: 21600,
        payStatus: "Hold",
        internalRemark: "PAN card mismatch on invoice; requested updated tax invoice.",
        submittedBy: "Preeti Karki",
        date: "2025-06-20",
        tallyVerified: false,
    },
];

export default function CreatorInvoicesPage() {
    const [invoices, setInvoices] = useState<CreatorInvoice[]>(initialInvoices);
    const [statusFilter, setStatusFilter] = useState<string>("All");
    const [searchQuery, setSearchQuery] = useState("");

    const handleStatusChange = (id: string, newStatus: CreatorPayStatus) => {
        setInvoices(prev =>
            prev.map(inv => {
                if (inv.id !== id) return inv;

                let updatedHold = inv.gstHold;
                if (newStatus === "GST Released") {
                    updatedHold = 0;
                } else if (newStatus === "Basic Paid — GST Pending") {
                    updatedHold = inv.gstAmount;
                }

                return {
                    ...inv,
                    payStatus: newStatus,
                    gstHold: updatedHold,
                };
            })
        );
        toast.success(`Invoice ${id} updated to "${newStatus}"`);
    };

    const handleRemarkChange = (id: string, newRemark: string) => {
        setInvoices(prev =>
            prev.map(inv => (inv.id === id ? { ...inv, internalRemark: newRemark } : inv))
        );
    };

    // Filtered invoices
    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (statusFilter !== "All" && inv.payStatus !== statusFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return (
                    inv.creatorName.toLowerCase().includes(q) ||
                    inv.brandName.toLowerCase().includes(q) ||
                    inv.id.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [invoices, statusFilter, searchQuery]);

    // KPI Aggregations per MD Section 4.5
    const totalPending = invoices.filter(i => i.payStatus === "Pending").length;
    const totalProcessing = invoices.filter(i => i.payStatus === "Processing").length;
    const totalGstPending = invoices.filter(i => i.payStatus === "Basic Paid — GST Pending").length;
    const totalDone = invoices.filter(i => i.payStatus === "Done" || i.payStatus === "GST Released").length;
    const totalGstHoldAmount = invoices.reduce((sum, i) => sum + i.gstHold, 0);

    return (
        <Page>
            <PageTopbar eyebrow="Finance & Accounts" subtitle="Creator Invoices &amp; Payment Lifecycle · MD Section 4.4">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-slate-500 font-medium">Status Scope:</span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 shadow-2xs cursor-pointer focus:outline-none"
                    >
                        <option value="All">All Invoices ({invoices.length})</option>
                        <option value="Pending">Pending ({totalPending})</option>
                        <option value="Processing">Processing ({totalProcessing})</option>
                        <option value="Basic Paid — GST Pending">Basic Paid — GST Pending ({totalGstPending})</option>
                        <option value="Done">Done</option>
                        <option value="GST Released">GST Released</option>
                        <option value="Hold">Hold</option>
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
                                Payables &amp; Statutory GST Hold Engine
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Creator Invoices &amp; Payout Control
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            12-status progression workflow with automated TDS deduction, GST holdback management, and continuous Tally Prime payment voucher verification.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-xl border border-amber-200/70 bg-amber-50/50 text-right">
                            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                                Withheld GST Holdback
                            </span>
                            <span className="font-mono text-[16px] font-extrabold text-amber-950">
                                ₹{(totalGstHoldAmount / 1000).toFixed(1)}k
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick KPI Cards */}
            <div className="px-4 sm:px-6 pt-3 pb-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1 font-medium">
                            <span>Pending Invoices</span>
                            <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div className="text-[22px] font-bold text-slate-900">{totalPending}</div>
                        <span className="text-[10.5px] text-slate-400">Awaiting finance approval</span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1 font-medium">
                            <span>Processing In Batch</span>
                            <ClockIcon className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <div className="text-[22px] font-bold text-slate-900">{totalProcessing}</div>
                        <span className="text-[10.5px] text-slate-400">In bank execution batch</span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 shadow-2xs">
                        <div className="flex items-center justify-between text-amber-800 text-[11px] mb-1 font-bold">
                            <span>GST Hold (Awaiting 2B)</span>
                            <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="text-[22px] font-bold text-amber-950">{totalGstPending}</div>
                        <span className="text-[10.5px] text-amber-800">Basic paid; GST held</span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1 font-medium">
                            <span>Settled (Tally Done)</span>
                            <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="text-[22px] font-bold text-emerald-700">{totalDone}</div>
                        <span className="text-[10.5px] text-slate-400">Tally vouchers matched</span>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-4 pb-16">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                    <div className="relative flex-1 max-w-md">
                        <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search creator name, brand, or invoice ID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 h-8 text-[12px] rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-slate-400 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
                        <span>Showing {filteredInvoices.length} of {invoices.length} creator invoices</span>
                    </div>
                </div>

                {/* Main Invoices Table */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11.5px] border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Creator / Brand</th>
                                    <th className="py-2.5 px-3">Category &amp; Team</th>
                                    <th className="py-2.5 px-3 text-right">Basic</th>
                                    <th className="py-2.5 px-3 text-right">GST (18%)</th>
                                    <th className="py-2.5 px-3 text-right">TDS (10%)</th>
                                    <th className="py-2.5 px-3 text-right">Net Payable</th>
                                    <th className="py-2.5 px-3 text-right">GST Hold</th>
                                    <th className="py-2.5 px-3 text-center">Status</th>
                                    <th className="py-2.5 px-3">Tally Match</th>
                                    <th className="py-2.5 px-3">Internal Remark</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filteredInvoices.map(inv => {
                                    // Net payable calculation per MD Section 4.4:
                                    // When GST held: Basic - TDS
                                    // When GST released / normal: Basic + GST - TDS
                                    const netPayable =
                                        inv.payStatus === "Basic Paid — GST Pending"
                                            ? inv.gstHold // only pending GST is left to pay
                                            : inv.gstHold > 0
                                            ? inv.basicAmount - inv.tdsAmount // GST held
                                            : inv.basicAmount + inv.gstAmount - inv.tdsAmount;

                                    return (
                                        <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="py-2.5 px-3">
                                                <div className="font-semibold text-slate-900">{inv.creatorName}</div>
                                                <div className="text-[10.5px] text-slate-500">{inv.brandName}</div>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <div className="text-slate-800">{inv.category}</div>
                                                <div className="text-[10px] text-slate-400">{inv.team}</div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-medium">
                                                ₹{inv.basicAmount.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                                ₹{inv.gstAmount.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                                                -₹{inv.tdsAmount.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                                ₹{netPayable.toLocaleString("en-IN")}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono">
                                                {inv.gstHold > 0 ? (
                                                    <span className="font-bold text-amber-700">
                                                        ₹{inv.gstHold.toLocaleString("en-IN")}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <select
                                                    value={inv.payStatus}
                                                    onChange={e => handleStatusChange(inv.id, e.target.value as CreatorPayStatus)}
                                                    className={cn(
                                                        "h-6 px-1.5 rounded text-[10.5px] font-semibold border cursor-pointer focus:outline-none",
                                                        inv.payStatus === "Done" || inv.payStatus === "GST Released"
                                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                            : inv.payStatus === "Processing"
                                                            ? "bg-blue-50 text-blue-800 border-blue-200"
                                                            : inv.payStatus === "Basic Paid — GST Pending"
                                                            ? "bg-amber-50 text-amber-800 border-amber-200 font-bold"
                                                            : inv.payStatus === "Hold"
                                                            ? "bg-rose-50 text-rose-800 border-rose-200"
                                                            : "bg-slate-100 text-slate-700 border-slate-200"
                                                    )}
                                                >
                                                    <option value="Pending">Pending</option>
                                                    <option value="Processing">Processing</option>
                                                    <option value="Basic Paid — GST Pending">Basic Paid — GST Pending</option>
                                                    <option value="GST Released">GST Released</option>
                                                    <option value="Done">Done</option>
                                                    <option value="Hold">Hold</option>
                                                    <option value="Payment Failed">Payment Failed</option>
                                                    <option value="Payment Refunded">Payment Refunded</option>
                                                    <option value="Payment Reversed">Payment Reversed</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                {inv.tallyVerified ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                        <ShieldCheckIcon className="w-3 h-3" />
                                                        {inv.tallyVoucherNo || "Verified"}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">Unmatched</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 min-w-[220px]">
                                                <input
                                                    type="text"
                                                    value={inv.internalRemark}
                                                    onChange={e => handleRemarkChange(inv.id, e.target.value)}
                                                    placeholder="Add internal workflow note..."
                                                    className="w-full text-[11px] px-2 py-1 rounded border border-transparent hover:border-slate-200 focus:border-slate-400 focus:outline-none transition-colors"
                                                />
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
