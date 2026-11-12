import React, { useState, useEffect } from "react";
import {
    Page,
    PageTopbar,
    PageBody,
    StatStrip,
    Stat,
    TopbarAction,
} from "@/components/layout/Page";
import {
    CheckCircle2Icon,
    RefreshCwIcon,
    FilterIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ExternalLinkIcon,
    TargetIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface ThesisItem {
    id: string;
    brandId: string;
    brandName: string | null;
    brandDomain: string | null;
    fitScore: number;
    tier: "HIGH" | "MEDIUM" | "LOW";
    recommendedMotion: string;
    ownerApproved: boolean;
    sharpnessRating: number | null;
    gapCount: number;
    createdAt: string;
}

interface GapItem {
    id: string;
    observation: string;
    observationSource: string;
    benchmarkDim: string;
    benchmarkValue: string;
    impliedProblem: string;
    businessImpact: string;
    confidence: number;
    severity: number;
    rankInThesis: number | null;
    capabilityName: string | null;
    proofClient: string | null;
    proofMetric: string | null;
    proofCategory: string | null;
}

const TIER_STYLES: Record<string, string> = {
    HIGH: "bg-emerald-50 text-emerald-800 border border-emerald-200/60",
    MEDIUM: "bg-blue-50 text-blue-700 border border-blue-200/60",
    LOW: "bg-stone-100 text-stone-600 border border-stone-200/60",
};

export default function ThesisReviewPage() {
    const [theses, setTheses] = useState<ThesisItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tierFilter, setTierFilter] = useState<string>("ALL");
    const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
    const [gapsByBrand, setGapsByBrand] = useState<Record<string, GapItem[]>>({});

    const fetchTheses = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/brain/theses?limit=200`);
            const data = await res.json();
            setTheses(data.theses || []);
        } catch {
            toast.error("Failed to load partnership theses");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTheses();
    }, []);

    const toggleExpand = async (brandId: string) => {
        if (expandedBrandId === brandId) {
            setExpandedBrandId(null);
            return;
        }
        setExpandedBrandId(brandId);
        if (!gapsByBrand[brandId]) {
            try {
                const res = await fetch(`/api/brain/thesis?brandId=${encodeURIComponent(brandId)}`);
                const data = await res.json();
                setGapsByBrand((prev) => ({ ...prev, [brandId]: data.gaps || [] }));
            } catch {
                toast.error("Failed to load thesis detail");
            }
        }
    };

    const handleApprove = async (brandId: string, action: "APPROVED" | "REJECTED", sharpnessRating?: number) => {
        try {
            const res = await fetch("/api/brain/thesis/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brandId, action, sharpnessRating }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Thesis ${action.toLowerCase()}`);
                setTheses((prev) =>
                    prev.map((t) =>
                        t.brandId === brandId
                            ? { ...t, ownerApproved: action === "APPROVED", sharpnessRating: sharpnessRating ?? t.sharpnessRating }
                            : t
                    )
                );
            } else {
                toast.error(data.error || "Action failed");
            }
        } catch {
            toast.error("Network error while updating thesis");
        }
    };

    const visible = theses.filter((t) => tierFilter === "ALL" || t.tier === tierFilter);
    const approvedCount = theses.filter((t) => t.ownerApproved).length;
    const highCount = theses.filter((t) => t.tier === "HIGH").length;

    return (
        <Page>
            <PageTopbar
                eyebrow="Partnership Intelligence Engine"
                subtitle="Brand Diagnosis Review — the AI diagnoses, the code grounds, the human approves"
            >
                <TopbarAction
                    onClick={fetchTheses}
                    icon={<RefreshCwIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />}
                >
                    Refresh Theses
                </TopbarAction>
            </PageTopbar>

            <StatStrip cols={4}>
                <Stat label="Total Theses" value={theses.length} />
                <Stat label="HIGH Tier" value={highCount} accent={highCount > 0} sub="custom-pitch candidates" />
                <Stat label="Owner Approved" value={approvedCount} sub={`${theses.length - approvedCount} pending`} />
                <Stat label="Database Target" value="Replica 3" sub="adlwwkqgexykuhkdkpfu" last />
            </StatStrip>

            <PageBody>
                {/* Filter Bar */}
                <div className="flex items-center justify-between border-b border-stone-200/90 px-5 py-2.5 bg-white">
                    <div className="flex items-center gap-2">
                        <FilterIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Filter Tier:
                        </span>
                        {["ALL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                            <button
                                key={s}
                                onClick={() => setTierFilter(s)}
                                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                                    tierFilter === s
                                        ? "bg-stone-900 text-white font-medium"
                                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className="text-xs text-slate-500">
                        A gap is a cited observation → problem → impact → named proof. No proof, no gap.
                    </div>
                </div>

                <div className="divide-y divide-stone-200/80 bg-white">
                    {visible.length === 0 && !isLoading && (
                        <div className="py-16 text-center text-sm text-slate-500">
                            No theses yet. Run the Gap Engine once dossiers, benchmarks and approved proofs exist on Replica 3.
                        </div>
                    )}

                    {visible.map((t) => {
                        const isExpanded = expandedBrandId === t.brandId;
                        const gaps = gapsByBrand[t.brandId] || [];
                        return (
                            <div key={t.id} className="transition-colors hover:bg-stone-50/60">
                                <div className="flex items-center justify-between px-5 py-3.5">
                                    <div className="flex-1 cursor-pointer pr-4" onClick={() => toggleExpand(t.brandId)}>
                                        <div className="flex items-center gap-2.5 mb-1">
                                            <span className="font-medium text-sm text-slate-900">
                                                {t.brandName || t.brandId}
                                            </span>
                                            {t.brandDomain && (
                                                <span className="text-xs text-slate-500 font-mono">{t.brandDomain}</span>
                                            )}
                                            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${TIER_STYLES[t.tier] || TIER_STYLES.LOW}`}>
                                                {t.tier}
                                            </span>
                                            <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono">
                                                {t.recommendedMotion}
                                            </span>
                                            <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono inline-flex items-center gap-1">
                                                <TargetIcon className="w-3 h-3" /> {t.gapCount} gap{t.gapCount === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-600">
                                            <span className="font-semibold text-slate-800">Fit score:</span>{" "}
                                            {Number(t.fitScore).toFixed(2)}
                                            {t.sharpnessRating ? (
                                                <span className="ml-3 text-slate-500">Sharpness: {t.sharpnessRating}/5</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                t.ownerApproved ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"
                                            }`}
                                        >
                                            {t.ownerApproved ? "APPROVED" : "PENDING"}
                                        </span>

                                        <div className="flex items-center gap-1 border-l border-stone-200 pl-3">
                                            <div className="flex items-center gap-0.5 mr-1" title="Rate thesis sharpness 1-5">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <button
                                                        key={n}
                                                        onClick={() => handleApprove(t.brandId, "APPROVED", n)}
                                                        className={`w-5 h-5 text-[11px] rounded ${
                                                            t.sharpnessRating && n <= t.sharpnessRating
                                                                ? "bg-amber-400 text-white"
                                                                : "bg-stone-100 text-stone-500 hover:bg-amber-100"
                                                        }`}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => handleApprove(t.brandId, "APPROVED")}
                                                className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => handleApprove(t.brandId, "REJECTED")}
                                                className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                            >
                                                Reject
                                            </button>
                                            <button
                                                onClick={() => toggleExpand(t.brandId)}
                                                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                            >
                                                {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="bg-stone-50/90 px-6 py-4 border-t border-stone-200/80 space-y-3">
                                        {gaps.length === 0 && (
                                            <div className="text-xs text-slate-500">Loading grounded gaps…</div>
                                        )}
                                        {gaps.map((g, idx) => (
                                            <div key={g.id} className="bg-white rounded border border-stone-200 p-4 max-w-3xl">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-[11px] bg-stone-900 text-white px-2 py-0.5 rounded font-mono">
                                                        #{g.rankInThesis ?? idx + 1}
                                                    </span>
                                                    <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                                        {g.benchmarkDim}
                                                    </span>
                                                    <span className="text-[11px] text-slate-500 font-mono">
                                                        sev {g.severity.toFixed(2)} · conf {g.confidence.toFixed(2)}
                                                    </span>
                                                </div>

                                                <div className="text-xs text-slate-800 mb-1">
                                                    <span className="font-semibold">Observation:</span> {g.observation}{" "}
                                                    <a
                                                        href={g.observationSource}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                                                    >
                                                        source <ExternalLinkIcon className="w-3 h-3" />
                                                    </a>
                                                </div>
                                                <div className="text-xs text-slate-600 mb-1">
                                                    <span className="font-semibold text-slate-800">Benchmark:</span> {g.benchmarkValue}
                                                </div>

                                                {/* V3 control: AI inference is visibly marked, not presented as fact */}
                                                <div className="mt-2 rounded border border-amber-200/70 bg-amber-50/70 p-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                                                        Interpretation (AI inference — not a grounded fact)
                                                    </div>
                                                    <div className="text-xs text-slate-700">
                                                        <span className="font-semibold">Problem:</span> {g.impliedProblem}
                                                    </div>
                                                    <div className="text-xs text-slate-700">
                                                        <span className="font-semibold">Impact:</span> {g.businessImpact}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded p-2 inline-flex items-center gap-1.5">
                                                    <CheckCircle2Icon className="w-3.5 h-3.5" />
                                                    <span>
                                                        <span className="font-semibold">{g.capabilityName}</span> — proof:{" "}
                                                        {g.proofClient} ({g.proofMetric})
                                                        {g.proofCategory ? <span className="text-slate-500 font-mono"> · {g.proofCategory}</span> : null}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
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
