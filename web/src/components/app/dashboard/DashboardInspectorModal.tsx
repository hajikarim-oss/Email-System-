// Dashboard Inspector Modal Popup System
// Award-winning UI/UX Craftsmanship:
//   - Transforms every dashboard element into an interactive, deep-dive intelligence popup
//   - Synthesizes Emil Kowalski spring timing, Jakub Krehel blur-fade, and Taste-Skill anti-slop tokens
//   - Strict dual-mode (Light/Dark) support with hairline borders and rich telemetry

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ActivityIcon,
    AlertCircleIcon,
    ArrowUpRightIcon,
    BarChart3Icon,
    Building2Icon,
    CheckCircle2Icon,
    CheckIcon,
    ClockIcon,
    CopyIcon,
    ExternalLinkIcon,
    FlameIcon,
    GlobeIcon,
    LayersIcon,
    MailCheckIcon,
    MailIcon,
    MousePointerClickIcon,
    RefreshCwIcon,
    SendIcon,
    ServerIcon,
    ShieldAlertIcon,
    ShieldCheckIcon,
    SparklesIcon,
    TrendingDownIcon,
    TrendingUpIcon,
    UsersIcon,
    XIcon,
    ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

export type InspectorType =
    | "metric"
    | "category"
    | "campaign"
    | "mailbox"
    | "sentiment"
    | "heatmap"
    | "kpi";

export interface InspectorPayload {
    type: InspectorType;
    title: string;
    subtitle: string;
    badge?: string;
    badgeColor?: "blue" | "emerald" | "amber" | "rose" | "indigo" | "zinc";
    primaryMetric: {
        label: string;
        value: string | number;
        sub?: string;
        trend?: { delta: string; isPositive: boolean };
    };
    breakdown: Array<{
        label: string;
        value: string | number;
        detail?: string;
        pct?: number;
        color?: string;
    }>;
    telemetryLogs?: Array<{
        timestamp: string;
        event: string;
        detail: string;
        status: "success" | "warning" | "error" | "info";
    }>;
    insights?: string[];
    actionLabel?: string;
    onAction?: () => void;
}

export interface DashboardInspectorModalProps {
    payload: InspectorPayload | null;
    onClose: () => void;
}

export default function DashboardInspectorModal({
    payload,
    onClose,
}: DashboardInspectorModalProps) {
    const [copied, setCopied] = React.useState<boolean>(false);

    // Keyboard support: Esc closes modal
    React.useEffect(() => {
        if (!payload) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [payload, onClose]);

    if (!payload) return null;

    const copyDataToClipboard = () => {
        const text = `${payload.title} - ${payload.primaryMetric.label}: ${payload.primaryMetric.value}\n${payload.breakdown.map((b) => `${b.label}: ${b.value}`).join("\n")}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Inspector telemetry copied to clipboard");
    };

    const getBadgeStyle = (color?: string) => {
        switch (color) {
            case "emerald":
                return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            case "amber":
                return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
            case "rose":
                return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
            case "indigo":
                return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
            default:
                return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
        }
    };

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
                role="dialog"
                aria-modal="true"
            >
                {/* Backdrop with Jakub Krehel smooth blur */}
                <motion.div
                    className="fixed inset-0 bg-zinc-950/60 backdrop-blur-[6px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    onClick={onClose}
                />

                {/* Modal Container */}
                <motion.div
                    className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh] text-zinc-900 dark:text-zinc-100 z-10"
                    initial={{ opacity: 0, scale: 0.97, y: 12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.985, y: -6, filter: "blur(2px)" }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                >
                    {/* Header Ribbon */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-900/50">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                                <ZapIcon className="w-3 h-3 fill-current" />
                            </div>
                            <span className="font-semibold text-xs tracking-tight text-zinc-800 dark:text-zinc-200">
                                Telemetry Inspector
                            </span>
                            {payload.badge && (
                                <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${getBadgeStyle(payload.badgeColor)}`}
                                >
                                    {payload.badge}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={copyDataToClipboard}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                                title="Copy snapshot"
                            >
                                {copied ? (
                                    <>
                                        <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-emerald-600 text-[11px]">Copied</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-3.5 h-3.5" />
                                        <span className="text-[11px]">Copy</span>
                                    </>
                                )}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                                aria-label="Close"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Hero Title & Primary Metric */}
                    <div className="p-5 sm:p-6 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-white dark:bg-zinc-950">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                                    {payload.title}
                                </h2>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                                    {payload.subtitle}
                                </p>
                            </div>

                            {/* Primary Metric Tile */}
                            <div className="px-4 py-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0 min-w-[160px] text-right">
                                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                                    {payload.primaryMetric.label}
                                </span>
                                <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 flex items-baseline justify-end gap-1.5">
                                    <span>{payload.primaryMetric.value}</span>
                                    {payload.primaryMetric.trend && (
                                        <span
                                            className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                                                payload.primaryMetric.trend.isPositive
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-rose-600 dark:text-rose-400"
                                            }`}
                                        >
                                            {payload.primaryMetric.trend.isPositive ? (
                                                <TrendingUpIcon className="w-3 h-3" />
                                            ) : (
                                                <TrendingDownIcon className="w-3 h-3" />
                                            )}
                                            {payload.primaryMetric.trend.delta}
                                        </span>
                                    )}
                                </div>
                                {payload.primaryMetric.sub && (
                                    <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono truncate">
                                        {payload.primaryMetric.sub}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Breakdown & Telemetry Content */}
                    <div className="p-5 sm:p-6 overflow-y-auto space-y-6 max-h-[50vh]">
                        {/* Breakdown Grid */}
                        <div className="space-y-3">
                            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                                Detailed Signal Distribution
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {payload.breakdown.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/40 dark:bg-zinc-900/30 flex flex-col justify-between space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-600 dark:text-zinc-400 font-medium truncate pr-2">
                                                {item.label}
                                            </span>
                                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                                                {item.value}
                                            </span>
                                        </div>
                                        {item.pct !== undefined && (
                                            <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${Math.min(100, Math.max(2, item.pct))}%`,
                                                        backgroundColor: item.color || "#2563eb",
                                                    }}
                                                />
                                            </div>
                                        )}
                                        {item.detail && (
                                            <span className="text-[10px] text-zinc-400 font-mono truncate block">
                                                {item.detail}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Telemetry Event Stream (If Present) */}
                        {payload.telemetryLogs && payload.telemetryLogs.length > 0 && (
                            <div className="space-y-2.5">
                                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                                    Recent Telemetry Handshakes & Events
                                </span>
                                <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl overflow-hidden divide-y divide-zinc-200/70 dark:divide-zinc-800/70 text-xs">
                                    {payload.telemetryLogs.map((log, i) => (
                                        <div
                                            key={i}
                                            className="px-3.5 py-2.5 bg-white dark:bg-zinc-900/50 flex items-center justify-between gap-3"
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                        log.status === "success"
                                                            ? "bg-emerald-500"
                                                            : log.status === "warning"
                                                              ? "bg-amber-500"
                                                              : log.status === "error"
                                                                ? "bg-rose-500"
                                                                : "bg-blue-500"
                                                    }`}
                                                />
                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                                    {log.event}
                                                </span>
                                                <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
                                                    {log.detail}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                                                {log.timestamp}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI / System Insights */}
                        {payload.insights && payload.insights.length > 0 && (
                            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                                    <SparklesIcon className="w-3.5 h-3.5" />
                                    <span>Outreach Intelligence Diagnostic</span>
                                </div>
                                <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                                    {payload.insights.map((ins, i) => (
                                        <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed">
                                            <span className="text-blue-500 font-bold">•</span>
                                            <span>{ins}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-900/50 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-zinc-400 font-mono">
                            Press <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px]">Esc</kbd> to dismiss
                        </span>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                            {payload.actionLabel && (
                                <button
                                    onClick={() => {
                                        if (payload.onAction) payload.onAction();
                                        onClose();
                                    }}
                                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-xs transition-colors cursor-pointer"
                                >
                                    {payload.actionLabel}
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
