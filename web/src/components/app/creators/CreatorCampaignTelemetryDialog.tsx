import React, { useEffect, useState } from "react";
import {
    XIcon,
    ExternalLinkIcon,
    CopyIcon,
    CheckIcon,
    RefreshCwIcon,
    SparklesIcon,
    ClockIcon,
    MailIcon,
    SmartphoneIcon,
    ArrowUpRightIcon,
} from "lucide-react";
import { authHeaders } from "@/lib/api/standaloneMock";
import toast from "react-hot-toast";

interface CreatorCampaignTelemetryDialogProps {
    campaignId: string | null;
    campaignName?: string;
    onClose: () => void;
}

export function CreatorCampaignTelemetryDialog({
    campaignId,
    campaignName,
    onClose,
}: CreatorCampaignTelemetryDialogProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    const loadDetails = () => {
        if (!campaignId) return;
        setLoading(true);
        fetch(`/api/creators/campaigns/${campaignId}`, { headers: authHeaders() })
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to load campaign telemetry");
                return res.json();
            })
            .then((res) => {
                setData(res);
                setLoading(false);
            })
            .catch((err) => {
                toast.error(err.message || "Failed to load details");
                setLoading(false);
            });
    };

    useEffect(() => {
        loadDetails();
        // Live poll every 8 seconds while drawer is open
        const timer = setInterval(loadDetails, 8000);
        return () => clearInterval(timer);
    }, [campaignId]);

    if (!campaignId) return null;

    const enrollments = data?.enrollments || [];
    const sentCount = data?.sentCount || enrollments.length || 0;
    const openedCount = data?.formsOpenedCount || enrollments.filter((e: any) => ["FORM_OPENED", "PARTIALLY_FILLED", "COMPLETED"].includes(e.status)).length;
    const filledCount = data?.partiallyFilledCount || enrollments.filter((e: any) => ["PARTIALLY_FILLED", "COMPLETED"].includes(e.status)).length;
    const completedCount = data?.completedCount || enrollments.filter((e: any) => e.status === "COMPLETED").length;

    const copyLink = (link: string, id: string) => {
        navigator.clipboard.writeText(link);
        setCopiedToken(id);
        toast.success("Unique creator intake link copied!");
        setTimeout(() => setCopiedToken(null), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-stone-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-bold">
                                Real-time Creator Telemetry
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <h2 className="text-[18px] font-semibold text-slate-900 tracking-tight">
                            {data?.name || campaignName || "Creator Campaign Telemetry"}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={loadDetails}
                            disabled={loading}
                            className="h-8 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-stone-50 text-[12px] font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <RefreshCwIcon className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
                            <span>Refresh</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="size-8 rounded-md text-slate-400 hover:text-slate-800 hover:bg-stone-200/60 flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Conversion Funnel Strip */}
                <div className="grid grid-cols-4 divide-x divide-stone-200 border-b border-stone-200 bg-white">
                    <div className="px-5 py-3">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">1. Enrolled & Sent</div>
                        <div className="text-[20px] font-mono font-bold text-slate-900">{sentCount}</div>
                        <div className="text-[11px] text-slate-400 font-medium">100% outreach</div>
                    </div>
                    <div className="px-5 py-3 bg-sky-50/30">
                        <div className="text-[11px] font-medium text-sky-800 uppercase tracking-wider mb-0.5">2. Link Opened</div>
                        <div className="text-[20px] font-mono font-bold text-sky-950">{openedCount}</div>
                        <div className="text-[11px] text-sky-700 font-medium">
                            {sentCount > 0 ? ((openedCount / sentCount) * 100).toFixed(1) : 0}% open rate
                        </div>
                    </div>
                    <div className="px-5 py-3 bg-amber-50/30">
                        <div className="text-[11px] font-medium text-amber-800 uppercase tracking-wider mb-0.5">3. Partially Filled</div>
                        <div className="text-[20px] font-mono font-bold text-amber-950">{filledCount}</div>
                        <div className="text-[11px] text-amber-700 font-medium">
                            {openedCount > 0 ? ((filledCount / openedCount) * 100).toFixed(1) : 0}% fill rate
                        </div>
                    </div>
                    <div className="px-5 py-3 bg-emerald-50/40">
                        <div className="text-[11px] font-medium text-emerald-800 uppercase tracking-wider mb-0.5">4. 100% Enriched</div>
                        <div className="text-[20px] font-mono font-bold text-emerald-950">{completedCount}</div>
                        <div className="text-[11px] text-emerald-700 font-medium">
                            {sentCount > 0 ? ((completedCount / sentCount) * 100).toFixed(1) : 0}% confirmed
                        </div>
                    </div>
                </div>

                {/* Creator Roster List */}
                <div className="flex-1 overflow-y-auto divide-y divide-stone-100 p-2">
                    {loading && enrollments.length === 0 ? (
                        <div className="py-16 text-center text-[13px] text-slate-500">
                            Loading live telemetry...
                        </div>
                    ) : enrollments.length === 0 ? (
                        <div className="py-16 text-center text-[13px] text-slate-500">
                            No creators enrolled in this campaign yet.
                        </div>
                    ) : (
                        enrollments.map((enr: any) => {
                            const isCompleted = enr.status === "COMPLETED";
                            const isPartial = enr.status === "PARTIALLY_FILLED";
                            const isOpened = enr.status === "FORM_OPENED";
                            const formLink = enr.formLink || `https://theboredmonkey.com/creator/intake/${enr.intakeToken || enr.handle}`;

                            return (
                                <div
                                    key={enr.id}
                                    className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-stone-50/80 rounded-xl transition-colors"
                                >
                                    {/* Creator Info */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="size-9 rounded-full bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-600 text-xs">
                                            {enr.avatarUrl ? (
                                                <img src={enr.avatarUrl} alt="" className="size-full object-cover" />
                                            ) : (
                                                (enr.fullName?.[0] || enr.handle?.[0] || "?").toUpperCase()
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[13px] font-semibold text-slate-900 truncate">
                                                    {enr.fullName || enr.handle}
                                                </span>
                                                <span className="text-[11.5px] text-slate-400 truncate">
                                                    @{enr.handle?.replace(/^@/, "")}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                                                {enr.email && (
                                                    <span className="flex items-center gap-1 truncate">
                                                        <MailIcon className="w-3 h-3 text-slate-400" />
                                                        {enr.email}
                                                    </span>
                                                )}
                                                {enr.whatsappNumber && (
                                                    <span className="flex items-center gap-1 text-emerald-700 font-medium truncate">
                                                        <SmartphoneIcon className="w-3 h-3" />
                                                        +91 {enr.whatsappNumber}
                                                    </span>
                                                )}
                                                {enr.city && <span>• {enr.city}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Real-time Status Gauge */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <span
                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                                    isCompleted
                                                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                        : isPartial
                                                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                                                        : isOpened
                                                        ? "bg-sky-100 text-sky-900 border border-sky-300"
                                                        : "bg-slate-100 text-slate-700 border border-slate-200"
                                                }`}
                                            >
                                                {isCompleted ? "100% Enriched" : isPartial ? `${enr.completionPct || 65}% Filled` : isOpened ? "Form Opened" : "Sent (45%)"}
                                            </span>
                                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-end gap-1">
                                                <ClockIcon className="w-2.5 h-2.5" />
                                                {enr.lastActiveAt
                                                    ? new Date(enr.lastActiveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                                    : enr.sentAt
                                                    ? "Sent"
                                                    : "Pending"}
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => copyLink(formLink, enr.id)}
                                                className="size-7 rounded-md border border-stone-200 bg-white hover:bg-stone-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                                                title="Copy unique creator link"
                                            >
                                                {copiedToken === enr.id ? (
                                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <CopyIcon className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <a
                                                href={formLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="size-7 rounded-md border border-stone-200 bg-white hover:bg-stone-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                                                title="Open live creator intake form"
                                            >
                                                <ArrowUpRightIcon className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-[12px] text-slate-500">
                    <div>
                        Tracking live link opens &amp; partial intake steps via PostgreSQL engine.
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-[12px] transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

