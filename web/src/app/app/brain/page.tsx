import React, { useState, useEffect } from "react";
import {
    Page,
    PageTopbar,
    PageBody,
    StatStrip,
    Stat,
    TopbarAction,
    EmptyBlock,
} from "@/components/layout/Page";
import {
    CheckCircle2Icon,
    XCircleIcon,
    AlertCircleIcon,
    RefreshCwIcon,
    FilterIcon,
    SparklesIcon,
    ClockIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface DraftItem {
    id: string;
    leadId: string;
    leadEmail: string;
    sequenceStep: number;
    subject: string;
    body: string;
    categoryKey: string;
    designation: string;
    angleKey: string;
    validatorPass: boolean;
    routing: string;
    status: string;
    hardViolations: string[];
    softViolations: string[];
    createdAt: string;
    companyName: string | null;
    brandName: string | null;
    leadLastContactedAt?: string | null;
    pastEventCount?: number;
}

export default function BrainReviewPage() {
    const [drafts, setDrafts] = useState<DraftItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

    const fetchDrafts = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/brain/drafts?status=${statusFilter}&limit=100`);
            const data = await res.json();
            if (data.drafts) {
                setDrafts(data.drafts);
            }
        } catch {
            toast.error("Failed to load brain drafts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDrafts();
    }, [statusFilter]);

    const handleAction = async (draftId: string, action: "APPROVED" | "REJECTED") => {
        try {
            const res = await fetch("/api/brain/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftId, action }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Draft marked as ${action.toLowerCase()}`);
                setDrafts((prev) =>
                    prev.map((d) => (d.id === draftId ? { ...d, status: action } : d))
                );
            } else {
                toast.error(data.error || "Action failed");
            }
        } catch {
            toast.error("Network error while updating draft");
        }
    };

    const approvedCount = drafts.filter((d) => d.status === "APPROVED").length;
    const validatedCount = drafts.filter((d) => d.validatorPass).length;
    const totalCount = drafts.length;

    return (
        <Page>
            <PageTopbar
                eyebrow="AI Outreach Brain"
                subtitle="Deterministic Code Validation & Human Approval Queue"
            >
                <TopbarAction
                    onClick={fetchDrafts}
                    icon={<RefreshCwIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />}
                >
                    Refresh Queue
                </TopbarAction>
            </PageTopbar>

            <StatStrip cols={4}>
                <Stat label="Total Drafts" value={totalCount} />
                <Stat
                    label="Code Validated"
                    value={validatedCount}
                    accent={validatedCount === totalCount && totalCount > 0}
                    sub={`${totalCount - validatedCount} violations`}
                />
                <Stat
                    label="Approved for Send"
                    value={approvedCount}
                    sub={`${totalCount - approvedCount} pending/rejected`}
                />
                <Stat label="Database Target" value="Replica 3" sub="adlwwkqgexykuhkdkpfu" last />
            </StatStrip>

            <PageBody>
                {/* Filter Bar */}
                <div className="flex items-center justify-between border-b border-stone-200/90 px-5 py-2.5 bg-white">
                    <div className="flex items-center gap-2">
                        <FilterIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Filter Status:
                        </span>
                        {["ALL", "APPROVED", "REJECTED"].map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                                    statusFilter === s
                                        ? "bg-stone-900 text-white font-medium"
                                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className="text-xs text-slate-500">
                        The AI writes, the code validates, the human approves.
                    </div>
                </div>

                {/* Drafts List */}
                <div className="divide-y divide-stone-200/80 bg-white">
                    {drafts.length === 0 && !isLoading && (
                        <div className="py-16 text-center text-sm text-slate-500">
                            No drafts found matching the current filter.
                        </div>
                    )}

                    {drafts.map((d) => {
                        const isExpanded = expandedDraftId === d.id;
                        return (
                            <div key={d.id} className="transition-colors hover:bg-stone-50/60">
                                <div className="flex items-center justify-between px-5 py-3.5">
                                    <div
                                        className="flex-1 cursor-pointer pr-4"
                                        onClick={() => setExpandedDraftId(isExpanded ? null : d.id)}
                                    >
                                        <div className="flex items-center gap-2.5 mb-1">
                                            <span className="font-medium text-sm text-slate-900">
                                                {d.leadEmail}
                                            </span>
                                            {d.companyName && (
                                                <span className="text-xs text-slate-500 font-mono">
                                                    @{d.companyName}
                                                </span>
                                            )}
                                            <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono">
                                                Step {d.sequenceStep}
                                            </span>
                                            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                                {d.categoryKey}
                                            </span>
                                            <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                                                {d.designation}
                                            </span>
                                            {d.pastEventCount !== undefined && d.pastEventCount > 0 ? (
                                                <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded font-mono">
                                                    Re-engagement ({d.pastEventCount} past touches)
                                                </span>
                                            ) : (
                                                <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 rounded font-mono">
                                                    Fresh Lead
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-600 truncate max-w-2xl">
                                            <span className="font-semibold text-slate-800">
                                                Subject:
                                            </span>{" "}
                                            {d.subject}
                                        </div>
                                    </div>

                                    {/* Status & Actions */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="flex items-center gap-1.5">
                                            {d.validatorPass ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 font-medium">
                                                    <CheckCircle2Icon className="w-3.5 h-3.5" />
                                                    Validated
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 font-medium">
                                                    <AlertCircleIcon className="w-3.5 h-3.5" />
                                                    Violations
                                                </span>
                                            )}

                                            <span
                                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                    d.status === "APPROVED"
                                                        ? "bg-stone-900 text-white"
                                                        : d.status === "REJECTED"
                                                        ? "bg-rose-100 text-rose-800"
                                                        : "bg-stone-100 text-stone-700"
                                                }`}
                                            >
                                                {d.status}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 border-l border-stone-200 pl-3">
                                            <button
                                                onClick={() => handleAction(d.id, "APPROVED")}
                                                className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                                title="Approve for sending"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => handleAction(d.id, "REJECTED")}
                                                className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                                title="Reject draft"
                                            >
                                                Reject
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setExpandedDraftId(isExpanded ? null : d.id)
                                                }
                                                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUpIcon className="w-4 h-4" />
                                                ) : (
                                                    <ChevronDownIcon className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Body View */}
                                {isExpanded && (
                                    <div className="bg-stone-50/90 px-6 py-4 border-t border-stone-200/80">
                                        <div className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
                                            Email Content (Step {d.sequenceStep})
                                        </div>
                                        <div className="bg-white p-4 rounded border border-stone-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-w-3xl">
                                            {d.body}
                                        </div>
                                        {d.hardViolations && d.hardViolations.length > 0 && (
                                            <div className="mt-3 text-xs text-rose-700 bg-rose-50 p-2.5 rounded border border-rose-200/80">
                                                <span className="font-semibold">
                                                    Violations detected by Validator:
                                                </span>
                                                <ul className="list-disc list-inside mt-1">
                                                    {d.hardViolations.map((v, i) => (
                                                        <li key={i}>{v}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </PageBody>
        </Page>
    );
}

