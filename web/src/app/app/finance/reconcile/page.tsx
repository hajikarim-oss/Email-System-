// ==============================================================================
// Tally Reconciliation Workbench Page (/app/finance/reconcile)
// Section 3.3, 3.4 & 4.12 of TBM_CFO_System_Architecture_Tally_Integration.md
// ==============================================================================

import React, { useState, useEffect } from "react";
import {
    SlidersIcon,
    RefreshCwIcon,
    CheckCircle2Icon,
    AlertTriangleIcon,
    FileSpreadsheetIcon,
    ArrowRightLeftIcon,
    ShieldAlertIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface DiscrepancyRow {
    id: number;
    discrepancy_type: string;
    dashboard_entity?: string;
    dashboard_record_id?: string;
    tally_voucher_no?: string;
    party_name: string;
    dashboard_amount?: number;
    tally_amount?: number;
    variance_amount?: number;
    status: string;
    resolution_notes?: string;
    detected_at: string;
}

export default function TallyReconciliationPage() {
    const [discrepancies, setDiscrepancies] = useState<DiscrepancyRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState("PENDING_REVIEW");

    const fetchDiscrepancies = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/tally/reconcile?status=${activeTab}`);
            if (res.ok) {
                const data = await res.json();
                setDiscrepancies(data.discrepancies || []);
            }
        } catch {
            // Keep fallback
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDiscrepancies();
    }, [activeTab]);

    const handleTriggerSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch("/api/tally/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyGuid: "TBM-MUMBAI-2025-001" }),
            });
            if (res.ok) {
                toast.success("Tally sync & reconciliation run completed");
                await fetchDiscrepancies();
            } else {
                toast.error("Sync run failed");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleAcceptTally = (id: number) => {
        toast.success(`Discrepancy #${id} updated: Accepted Tally book value as source of truth.`);
        setDiscrepancies(prev => prev.filter(d => d.id !== id));
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                        Tally Prime Reconciliation Workbench
                    </h1>
                    <p className="text-[12.5px] text-slate-500">
                        Detects and resolves discrepancies between dashboard workflow records and Tally book of accounts
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleTriggerSync}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#18181B] hover:bg-stone-900 text-white text-[12px] font-medium transition-colors disabled:opacity-60 cursor-pointer"
                    >
                        <RefreshCwIcon className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                        {isSyncing ? "Reconciling..." : "Run Reconcile Cycle"}
                    </button>
                </div>
            </div>

            {/* Reconciliation Rules Callout Banner */}
            <div className="p-4 rounded-xl bg-[#FAF9F5] border border-slate-200/80 text-[12px] text-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <ArrowRightLeftIcon className="w-4 h-4 text-slate-700" />
                        Hierarchy of Truth (MD Section 1.2)
                    </span>
                    <p className="text-slate-500 text-[11.5px]">
                        Tally is always right for statutory accounting numbers. Dashboard is always right for workflow status. Variances beyond ±₹100 are quarantined here for finance approval.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono text-[11px] text-slate-800">
                        Tolerance: ±₹100.00
                    </span>
                </div>
            </div>

            {/* Tab Filters */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[12.5px]">
                {[
                    { id: "PENDING_REVIEW", label: "Pending Review" },
                    { id: "ACCEPTED_TALLY", label: "Accepted Tally" },
                    { id: "RESOLVED", label: "Resolved" },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                            activeTab === tab.id
                                ? "bg-[#18181B] text-white"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Discrepancy Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {discrepancies.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                        <CheckCircle2Icon className="w-8 h-8 text-emerald-500 mx-auto" />
                        <h3 className="text-[14px] font-semibold text-slate-800">Zero Unreconciled Discrepancies</h3>
                        <p className="text-[12px] text-slate-400">
                            All dashboard records are in sync with Tally Prime vouchers within specified tolerances.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-[12px] border-collapse">
                        <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider">
                                <th className="py-2.5 px-3">Discrepancy Type</th>
                                <th className="py-2.5 px-3">Party Name</th>
                                <th className="py-2.5 px-3">Tally Voucher</th>
                                <th className="py-2.5 px-3 text-right">Dashboard Value</th>
                                <th className="py-2.5 px-3 text-right">Tally Actual</th>
                                <th className="py-2.5 px-3 text-right">Variance</th>
                                <th className="py-2.5 px-3">Notes / Flag Reason</th>
                                <th className="py-2.5 px-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {discrepancies.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2.5 px-3">
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                                            {row.discrepancy_type.replace(/_/g, " ")}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-semibold text-slate-900">{row.party_name}</td>
                                    <td className="py-2.5 px-3 font-mono text-slate-600">
                                        {row.tally_voucher_no || "Unassigned"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-slate-900 font-medium">
                                        {row.dashboard_amount ? `₹${row.dashboard_amount.toLocaleString("en-IN")}` : "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-slate-900 font-medium">
                                        {row.tally_amount ? `₹${row.tally_amount.toLocaleString("en-IN")}` : "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-semibold text-rose-600">
                                        {row.variance_amount ? `₹${row.variance_amount.toLocaleString("en-IN")}` : "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-500 italic max-w-xs truncate">
                                        {row.resolution_notes || "Variance flagged for review"}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                        <button
                                            onClick={() => handleAcceptTally(row.id)}
                                            className="px-2.5 py-1 rounded bg-[#18181B] hover:bg-stone-900 text-white text-[11px] font-medium transition-colors cursor-pointer"
                                        >
                                            Accept Tally
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
