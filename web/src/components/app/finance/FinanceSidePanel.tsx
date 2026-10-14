// ==============================================================================
// Right-Side Finance & Tally Control Panel
// Ambient status pill & persistent slide-over flyout for live Tally sync telemetry
// ==============================================================================

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ActivityIcon,
    RefreshCwIcon,
    ServerIcon,
    AlertTriangleIcon,
    CheckCircle2Icon,
    XCircleIcon,
    ExternalLinkIcon,
    XIcon,
    ChevronRightIcon,
    SlidersIcon,
    ZapIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface TallyStatusData {
    status: "HEALTHY" | "DEGRADED" | "OFFLINE";
    lastSyncTimestamp?: string;
    minutesSinceLastSync: number;
    agent: {
        machineName: string;
        status: string;
        loadedCompany: string;
        tallyVersion: string;
    };
    backlog: {
        pendingTasks: number;
        unreconciledDiscrepancies: number;
        unclassifiedParties: number;
    };
    warningMessage?: string | null;
}

export function FinanceSidePanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [statusData, setStatusData] = useState<TallyStatusData>({
        status: "HEALTHY",
        minutesSinceLastSync: 2,
        agent: {
            machineName: "FINANCE-DESKTOP",
            status: "ONLINE_READY",
            loadedCompany: "The Brand Master Pvt Ltd",
            tallyVersion: "TallyPrime 4.1",
        },
        backlog: {
            pendingTasks: 0,
            unreconciledDiscrepancies: 1,
            unclassifiedParties: 0,
        },
    });

    const fetchStatus = async () => {
        try {
            const res = await fetch("/api/tally/status");
            if (res.ok) {
                const data = await res.json();
                setStatusData(data);
            }
        } catch {
            // Keep current status if API unavailable
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 20000);
        return () => clearInterval(interval);
    }, []);

    const handleManualSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch("/api/tally/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyGuid: "TBM-MUMBAI-2025-001" }),
            });
            if (res.ok) {
                toast.success("Tally sync cycle triggered successfully");
                await fetchStatus();
            } else {
                toast.error("Failed to trigger sync");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error");
        } finally {
            setIsSyncing(false);
        }
    };

    const isHealthy = statusData.status === "HEALTHY";
    const isDegraded = statusData.status === "DEGRADED";

    return (
        <>
            {/* Ambient Floating Tally Status Pill (Right Edge) */}
            <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    title="Open Tally Prime Sync Inspector"
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#18181B] hover:bg-stone-900 text-white rounded-full text-[12px] font-medium shadow-lg border border-slate-700/80 transition-all hover:scale-[1.02] cursor-pointer"
                >
                    <span className="relative flex h-2 w-2">
                        {isHealthy ? (
                            <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </>
                        ) : isDegraded ? (
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        ) : (
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        )}
                    </span>
                    <span className="text-slate-200">
                        {isHealthy ? "Tally Synced" : isDegraded ? "Tally Degraded" : "Tally Offline"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                        {statusData.minutesSinceLastSync === 0 ? "just now" : `${statusData.minutesSinceLastSync}m ago`}
                    </span>
                    {statusData.backlog.unreconciledDiscrepancies > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/40">
                            {statusData.backlog.unreconciledDiscrepancies}
                        </span>
                    )}
                </button>
            </div>

            {/* Slide-over Drawer Panel */}
            {isOpen && (
                <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-slate-200/80 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
                    {/* Drawer Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-[#FAF9F5]">
                        <div className="flex items-center gap-2">
                            <ServerIcon className="w-4 h-4 text-slate-700" />
                            <div>
                                <h3 className="text-[13.5px] font-semibold text-slate-900 leading-tight">
                                    Tally Prime Bridge
                                </h3>
                                <p className="text-[11px] text-slate-500">Continuous 24/7 Sync Layer</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                        >
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Drawer Body */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 text-[12.5px]">
                        {/* Live Status Card */}
                        <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/60 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 font-medium">Desktop Agent</span>
                                <div className="flex items-center gap-1.5">
                                    {isHealthy ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                            <CheckCircle2Icon className="w-3 h-3 text-emerald-600" /> Online Ready
                                        </span>
                                    ) : isDegraded ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                            <AlertTriangleIcon className="w-3 h-3 text-amber-600" /> Degraded
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                                            <XCircleIcon className="w-3 h-3 text-rose-600" /> Offline
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11.5px]">
                                <div>
                                    <span className="text-slate-400 block text-[10.5px]">Machine</span>
                                    <span className="font-medium text-slate-800 truncate block">
                                        {statusData.agent.machineName}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10.5px]">Port</span>
                                    <span className="font-mono text-slate-800">127.0.0.1:9000</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-slate-400 block text-[10.5px]">Active Company</span>
                                    <span className="font-semibold text-slate-900 block truncate">
                                        {statusData.agent.loadedCompany}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Warning Callout if any */}
                        {statusData.warningMessage && (
                            <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-800 text-[12px] flex items-start gap-2">
                                <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Sync Attention Required</p>
                                    <p className="text-[11.5px] text-amber-700 mt-0.5">{statusData.warningMessage}</p>
                                </div>
                            </div>
                        )}

                        {/* Quick Metrics */}
                        <div className="space-y-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Synchronization Backlog
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <span className="text-[11px] text-slate-500 block">Pending Queue</span>
                                    <span className="text-lg font-semibold text-slate-900">
                                        {statusData.backlog.pendingTasks}
                                    </span>
                                </div>
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <span className="text-[11px] text-slate-500 block">Discrepancies</span>
                                    <span className="text-lg font-semibold text-amber-600">
                                        {statusData.backlog.unreconciledDiscrepancies}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Navigation Links */}
                        <div className="space-y-1.5 pt-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Finance Shortcuts
                            </h4>
                            <Link
                                to="/app/finance/reconcile"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/60 transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <SlidersIcon className="w-3.5 h-3.5 text-slate-500" />
                                    Reconciliation Workbench
                                </span>
                                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />
                            </Link>
                            <Link
                                to="/app/finance/dashboard"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/60 transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <ActivityIcon className="w-3.5 h-3.5 text-slate-500" />
                                    CFO Analytics Overview
                                </span>
                                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />
                            </Link>
                        </div>
                    </div>

                    {/* Drawer Footer with Sync Trigger */}
                    <div className="p-4 border-t border-slate-100 bg-[#FAF9F5] space-y-2">
                        <button
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-[#18181B] hover:bg-stone-900 text-white text-[12.5px] font-medium transition-colors disabled:opacity-60 cursor-pointer"
                        >
                            <RefreshCwIcon className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                            {isSyncing ? "Running Incremental Sync..." : "Sync Tally Now"}
                        </button>
                        <p className="text-[10.5px] text-center text-slate-400">
                            Automated sync runs continuously every 15 minutes
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
