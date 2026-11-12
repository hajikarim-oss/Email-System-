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
    RefreshCwIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PlayIcon,
    ShieldCheckIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface Proof {
    id: string;
    clientName: string;
    categoryKey: string;
    metricRaw: string;
    approvedToMention: boolean;
}
interface Capability {
    id: string;
    name: string;
    slug: string;
    problemSolved: string;
    categoryKeys: string[];
    active: boolean;
    proofs: Proof[];
}
interface Benchmark {
    id: string;
    categoryKey: string;
    dimension: string;
    leaderPattern: string;
    source: string;
    confidence: number;
    approved: boolean;
}

function Toggle({ on, onClick, labelOn = "Approved", labelOff = "Approve" }: { on: boolean; onClick: () => void; labelOn?: string; labelOff?: string }) {
    return (
        <button
            onClick={onClick}
            className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                on
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
        >
            {on ? labelOn : labelOff}
        </button>
    );
}

export default function Phase0ApprovalsPage() {
    const [capabilities, setCapabilities] = useState<Capability[]>([]);
    const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [runBrandId, setRunBrandId] = useState("");
    const [running, setRunning] = useState(false);

    const fetchPending = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/brain/pie/pending");
            const data = await res.json();
            setCapabilities(data.capabilities || []);
            setBenchmarks(data.benchmarks || []);
        } catch {
            toast.error("Failed to load Phase-0 queue");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPending();
    }, []);

    const approve = async (kind: "capability" | "proof" | "benchmark", id: string, approve: boolean) => {
        try {
            const res = await fetch("/api/brain/pie/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, id, approve }),
            });
            const data = await res.json();
            if (!data.success) {
                toast.error(data.error || "Action failed");
                return;
            }
            if (kind === "capability") {
                setCapabilities((prev) => prev.map((c) => (c.id === id ? { ...c, active: approve } : c)));
            } else if (kind === "proof") {
                setCapabilities((prev) =>
                    prev.map((c) => ({ ...c, proofs: c.proofs.map((p) => (p.id === id ? { ...p, approvedToMention: approve } : p)) }))
                );
            } else {
                setBenchmarks((prev) => prev.map((b) => (b.id === id ? { ...b, approved: approve } : b)));
            }
        } catch {
            toast.error("Network error");
        }
    };

    const runGapEngine = async () => {
        if (!runBrandId.trim()) {
            toast.error("Enter a brandId to generate a thesis");
            return;
        }
        setRunning(true);
        try {
            const res = await fetch("/api/brain/pie/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brandId: runBrandId.trim() }),
            });
            const data = await res.json();
            const r = data.results?.[0];
            if (r?.error) toast.error(`Run failed: ${r.error}`);
            else if (r?.reason) toast(`No thesis: ${r.reason} (${r.withheld} withheld)`);
            else toast.success(`Thesis built: ${r?.tier} · ${r?.validGaps} gaps · fit ${r?.fitScore}`);
        } catch {
            toast.error("Network error running Gap Engine");
        } finally {
            setRunning(false);
        }
    };

    const activeCaps = capabilities.filter((c) => c.active).length;
    const approvedProofs = capabilities.reduce((n, c) => n + c.proofs.filter((p) => p.approvedToMention).length, 0);
    const totalProofs = capabilities.reduce((n, c) => n + c.proofs.length, 0);
    const approvedBms = benchmarks.filter((b) => b.approved).length;

    // group benchmarks by category
    const bmByCat: Record<string, Benchmark[]> = {};
    for (const b of benchmarks) (bmByCat[b.categoryKey] ||= []).push(b);

    return (
        <Page>
            <PageTopbar
                eyebrow="PIE · Phase-0 Approvals"
                subtitle="Owner gate — approve mined capabilities, proofs & benchmarks before the Gap Engine can use them"
            >
                <TopbarAction
                    onClick={fetchPending}
                    icon={<RefreshCwIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />}
                >
                    Refresh
                </TopbarAction>
            </PageTopbar>

            <StatStrip cols={4}>
                <Stat label="Active Capabilities" value={`${activeCaps}/${capabilities.length}`} accent={activeCaps > 0} />
                <Stat label="Approved Proofs" value={`${approvedProofs}/${totalProofs}`} sub="named client + numeric metric" />
                <Stat label="Approved Benchmarks" value={`${approvedBms}/${benchmarks.length}`} />
                <Stat label="Database Target" value="Replica 3" sub="adlwwkqgexykuhkdkpfu" last />
            </StatStrip>

            <PageBody>
                {/* Run bar */}
                <div className="flex items-center justify-between border-b border-stone-200/90 px-5 py-2.5 bg-white">
                    <div className="flex items-center gap-2">
                        <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs text-slate-500">
                            Nothing here is visible to the Gap Engine until you approve it.
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            value={runBrandId}
                            onChange={(e) => setRunBrandId(e.target.value)}
                            placeholder="brandId to diagnose…"
                            className="text-xs px-2.5 py-1 rounded border border-stone-200 bg-white w-48 focus:outline-none focus:ring-1 focus:ring-stone-300"
                        />
                        <button
                            onClick={runGapEngine}
                            disabled={running}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-stone-900 text-white font-medium hover:bg-stone-800 disabled:opacity-50"
                        >
                            <PlayIcon className={`w-3.5 h-3.5 ${running ? "animate-pulse" : ""}`} />
                            Run Gap Engine
                        </button>
                    </div>
                </div>

                {/* Capabilities */}
                <div className="px-5 py-3 bg-stone-50/70 border-b border-stone-200/80">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Layer 1 — Capability Graph
                    </span>
                </div>
                <div className="divide-y divide-stone-200/80 bg-white">
                    {capabilities.length === 0 && !isLoading && (
                        <div className="py-10 text-center text-sm text-slate-500">
                            No capabilities seeded. Run scripts/seed_pie_capabilities.ts on Replica 3.
                        </div>
                    )}
                    {capabilities.map((c) => {
                        const isOpen = expanded === c.id;
                        const approvedN = c.proofs.filter((p) => p.approvedToMention).length;
                        return (
                            <div key={c.id} className="hover:bg-stone-50/60">
                                <div className="flex items-center justify-between px-5 py-3.5">
                                    <div className="flex-1 cursor-pointer pr-4" onClick={() => setExpanded(isOpen ? null : c.id)}>
                                        <div className="flex items-center gap-2.5 mb-1">
                                            <span className="font-medium text-sm text-slate-900">{c.name}</span>
                                            <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono">
                                                {c.slug}
                                            </span>
                                            <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                                {approvedN}/{c.proofs.length} proofs approved
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-600 max-w-2xl">{c.problemSolved}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Toggle on={c.active} onClick={() => approve("capability", c.id, !c.active)} labelOn="Active" labelOff="Activate" />
                                        <button onClick={() => setExpanded(isOpen ? null : c.id)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                                            {isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                {isOpen && (
                                    <div className="bg-stone-50/90 px-6 py-3 border-t border-stone-200/80 space-y-2">
                                        {c.proofs.length === 0 && <div className="text-xs text-slate-500">No proofs.</div>}
                                        {c.proofs.map((p) => (
                                            <div key={p.id} className="flex items-center justify-between bg-white rounded border border-stone-200 px-3 py-2">
                                                <div className="text-xs text-slate-700">
                                                    <span className="font-semibold text-slate-900">{p.clientName}</span>
                                                    <span className="text-slate-500"> — {p.metricRaw}</span>
                                                    <span className="ml-2 text-[11px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                        {p.categoryKey}
                                                    </span>
                                                </div>
                                                <Toggle on={p.approvedToMention} onClick={() => approve("proof", p.id, !p.approvedToMention)} labelOn="Approved to mention" labelOff="Approve to mention" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Benchmarks */}
                <div className="px-5 py-3 bg-stone-50/70 border-y border-stone-200/80">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Layer 3 — Category Benchmarks
                    </span>
                </div>
                <div className="bg-white">
                    {benchmarks.length === 0 && !isLoading && (
                        <div className="py-10 text-center text-sm text-slate-500">
                            No benchmarks seeded. Run scripts/seed_pie_benchmarks.ts on Replica 3.
                        </div>
                    )}
                    {Object.entries(bmByCat).map(([cat, list]) => (
                        <div key={cat} className="border-b border-stone-200/60">
                            <div className="px-5 py-2 text-[11px] font-mono text-slate-500 bg-stone-50/50">{cat}</div>
                            {list.map((b) => (
                                <div key={b.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-stone-50/60">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{b.dimension}</span>
                                            <span className="text-[11px] text-slate-400 font-mono">
                                                {b.source} · conf {Number(b.confidence).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-700 max-w-2xl">{b.leaderPattern}</div>
                                    </div>
                                    <Toggle on={b.approved} onClick={() => approve("benchmark", b.id, !b.approved)} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </PageBody>
        </Page>
    );
}
