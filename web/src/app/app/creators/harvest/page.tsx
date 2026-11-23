import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    GitForkIcon,
    PlayIcon,
    PauseIcon,
    RefreshCcwIcon,
    DownloadIcon,
    SendIcon,
    ExternalLinkIcon,
    CopyIcon,
    MailIcon,
    PhoneIcon,
    GlobeIcon,
    SparklesIcon,
    CheckCircle2Icon,
    ClockIcon,
    AlertCircleIcon,
    ArrowRightIcon,
    SearchIcon,
    EyeIcon,
    RotateCcwIcon,
    Link2Icon,
    Building2Icon,
    CheckIcon,
    VideoIcon,
    MapPinIcon,
    MessageSquareIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { authHeaders } from "@/lib/api/standaloneMock";
import CreatorDetailDrawer from "@/components/app/creators/CreatorDetailDrawer";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Skincare: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800" },
    Beauty: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" },
    Fashion: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
    "Fashion & Styling": { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
    "Food Blogger": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
    "Chef / Home Chef": { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
    Tech: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
    Finance: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
    Fitness: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
    Education: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
    Lifestyle: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800" },
    Infotainment: { bg: "bg-cyan-50 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-800" },
};

const TARGET_CATEGORIES = [
    "All Categories",
    "Skincare",
    "Beauty",
    "Fashion",
    "Lifestyle",
    "Tech",
    "Food Blogger",
    "Fitness",
    "Finance",
    "Health",
    "Traveller",
    "Comedy",
    "Gaming",
    "Education",
    "Business & Startup",
    "Family & Parenting",
    "Automotive (Cars)",
    "Infotainment",
];

interface HarvestStatus {
    pending: number;
    processing: number;
    completed: number;
    skipped: number;
    failed: number;
    completedWithEmail: number;
    expandedSeeds: number;
    dbTotalCreators: number;
    dbVerifiedIndian: number;
    dbEmailReady: number;
    activeMetaTokens: number;
    dailyFreeCapacity: number;
    lookalikeProvider: string;
}

interface TreeBranch {
    seedHandle: string;
    minDepth: number;
    maxDepth: number;
    totalQueued: number;
    completed: number;
    pending: number;
    processing: number;
    withEmail: number;
    skipped: number;
    failed: number;
    provider: string;
    expandedAt: string;
}

interface HarvestItem {
    queueId: string;
    id: string;
    creatorId: string | null;
    handle: string;
    cleanHandle: string;
    seedHandle: string;
    depth: number;
    queueStatus: string;
    errorMsg: string | null;
    name: string;
    avatarUrl: string | null;
    profileUrl: string;
    followersCount: number;
    followingCount?: number;
    postsCount?: number;
    engagementRatePct?: number;
    latestReelUrl?: string | null;
    recentReelsCount?: number;
    isVerified?: boolean;
    collabHandle?: string | null;
    tier: string | null;
    category: string;
    subGenres: string[];
    languages: string[];
    indiaSignal: boolean | null;
    city: string | null;
    primaryEmail: string | null;
    secondaryEmails: string[];
    whatsappNumber: string | null;
    phoneNumber: string | null;
    intakeToken: string | null;
    intakeUrl: string | null;
    status: string;
    bio: string | null;
    website: string | null;
    avgLikes: number;
    avgComments: number;
    agencyName: string | null;
    fitScore: number;
    instagramInsights: any;
    queuedAt: string;
    updatedAt: string;
}

function formatNumber(n: number): string {
    if (!n || n <= 0) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
}

function getCategoryStyle(cat?: string) {
    if (!cat) return { bg: "bg-slate-100 dark:bg-zinc-800", text: "text-slate-700 dark:text-zinc-300", border: "border-slate-200 dark:border-zinc-700" };
    return (
        CATEGORY_COLORS[cat] || {
            bg: "bg-slate-100 dark:bg-zinc-800",
            text: "text-slate-700 dark:text-zinc-300",
            border: "border-slate-200 dark:border-zinc-700",
        }
    );
}

export default function CreatorTreeHarvestPage() {
    const navigate = useNavigate();

    // Seed & Run Config
    const [seedInput, setSeedInput] = useState("");
    const [targetCategory, setTargetCategory] = useState("All Categories");
    const [targetLimitInput, setTargetLimitInput] = useState("500");
    const targetLimit = Math.max(1, parseInt(targetLimitInput, 10) || 500);

    // Live Tree Data
    const [status, setStatus] = useState<HarvestStatus | null>(null);
    const [branches, setBranches] = useState<TreeBranch[]>([]);
    const [items, setItems] = useState<HarvestItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Interactive Auto-Runner State
    const [isRunning, setIsRunning] = useState(false);
    const [activeStage, setActiveStage] = useState<"idle" | "seed" | "expand" | "hydrate" | "done">("idle");
    const [liveMessage, setLiveMessage] = useState("Paste any Instagram URL or @username above to start a 500-creator BFS tree run.");
    const runningRef = useRef(false);

    // Table Filters & Selection
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "hydrated" | "email" | "pending" | "skipped">("all");
    const [tableSearch, setTableSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(50);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedCreator, setSelectedCreator] = useState<any | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [expandingHandle, setExpandingHandle] = useState<string | null>(null);

    useEffect(() => {
        setVisibleCount(50);
    }, [selectedBranch, statusFilter, tableSearch]);

    const fetchTreeData = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const res = await fetch("/api/creators/harvest/tree?limit=500", { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setStatus(data.status || null);
                setBranches(data.branches || []);
                setItems(data.items || []);
                return data;
            }
        } catch {} finally {
            if (!silent) setIsLoading(false);
        }
        return null;
    }, []);

    useEffect(() => {
        fetchTreeData();
        return () => {
            runningRef.current = false;
        };
    }, [fetchTreeData]);

    const copyText = (text: string, key: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`Copied ${label}`);
        setTimeout(() => setCopiedKey(null), 1500);
    };

    // Core Auto-Harvest Loop (up to targetLimit, max 500)
    const runHarvestLoop = useCallback(
        async (limitCap: number, categoryOpt?: string) => {
            runningRef.current = true;
            setIsRunning(true);

            let consecutiveEmpty = 0;

            while (runningRef.current) {
                // 1. Check current status
                const latest = await fetchTreeData(true);
                const st: HarvestStatus | null = latest?.status || null;
                const completedCount = st?.completed || 0;
                const pendingCount = st?.pending || 0;

                if (completedCount >= limitCap) {
                    setActiveStage("done");
                    setLiveMessage(`Target reached: ${completedCount} / ${limitCap} creators hydrated with ${st?.completedWithEmail || 0} emails!`);
                    toast.success(`Tree harvest reached target of ${limitCap} creators!`);
                    break;
                }

                // 2. If pending queue is empty, auto-expand the next verified seed branch in the BFS tree
                if (pendingCount === 0) {
                    setActiveStage("expand");
                    setLiveMessage("Pending queue empty — expanding next verified creator branch in the BFS tree...");
                    try {
                        const expRes = await fetch("/api/creators/harvest/expand-next", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", ...authHeaders() },
                            body: JSON.stringify({
                                category: categoryOpt && categoryOpt !== "All Categories" ? categoryOpt : undefined,
                            }),
                        });
                        const expData = await expRes.json();
                        if (!expRes.ok || !expData.expanded || (expData.newlyQueued || 0) === 0) {
                            consecutiveEmpty++;
                            if (consecutiveEmpty >= 2) {
                                setActiveStage("done");
                                setLiveMessage("No more expandable seeds available. Paste a new seed handle to grow another branch.");
                                break;
                            }
                        } else {
                            consecutiveEmpty = 0;
                            setLiveMessage(
                                `Expanded branch @${expData.seedHandle} → queued ${expData.newlyQueued} new lookalikes via ${expData.provider || "provider"}.`
                            );
                            await fetchTreeData(true);
                        }
                    } catch {
                        consecutiveEmpty++;
                        if (consecutiveEmpty >= 2) break;
                    }
                    continue;
                }

                // 3. Hydrate next batch of 4 via free Meta Graph + 4-Layer Email Waterfall + gpt-4o-mini
                const remaining = Math.max(1, limitCap - completedCount);
                const batchSize = Math.min(4, remaining);
                setActiveStage("hydrate");
                setLiveMessage(
                    `Hydrating next ${batchSize} queued creators via Meta Graph ($0) + Email Waterfall + AI Classifier (${completedCount}/${limitCap})...`
                );

                try {
                    const tickRes = await fetch("/api/creators/harvest/tick", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...authHeaders() },
                        body: JSON.stringify({ batchSize }),
                    });
                    const tickData = await tickRes.json();
                    if (!tickRes.ok) {
                        setLiveMessage(tickData.message || "Batch hydration paused due to API response.");
                        break;
                    }
                    if ((tickData.processed || 0) === 0) {
                        consecutiveEmpty++;
                        if (consecutiveEmpty >= 2) break;
                    } else {
                        consecutiveEmpty = 0;
                        setLiveMessage(
                            `Hydrated +${tickData.stored || 0} creators (${tickData.withEmail || 0} with email, ${tickData.skipped || 0} filtered out).`
                        );
                    }
                    await fetchTreeData(true);
                } catch {
                    setLiveMessage("Network hiccup during hydration — paused safely. Click Resume to continue.");
                    break;
                }

                // Small breather so UI stays snappy and Meta rate limit stays safe
                await new Promise((r) => setTimeout(r, 900));
            }

            runningRef.current = false;
            setIsRunning(false);
        },
        [fetchTreeData]
    );

    const handleStartTree = async () => {
        const cleanLimit = Math.max(1, parseInt(targetLimitInput, 10) || 500);
        setTargetLimitInput(String(cleanLimit));

        const rawSeed = seedInput.trim();
        if (rawSeed) {
            setActiveStage("seed");
            setLiveMessage(`Seeding root ${rawSeed} and fetching ~55 lookalikes...`);
            const toastId = toast.loading(`Seeding BFS tree from ${rawSeed}...`);
            try {
                const res = await fetch("/api/creators/harvest/seed", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({
                        seed: rawSeed,
                        category: targetCategory !== "All Categories" ? targetCategory : undefined,
                        depth: 1,
                        limit: 55,
                    }),
                });
                const data = await res.json();
                if (!res.ok) {
                    toast.error(data.message || "Failed to seed tree", { id: toastId });
                    setActiveStage("idle");
                    return;
                }
                toast.success(
                    `Seeded @${data.seedHandle}: +${data.newlyQueued || 0} lookalikes queued via ${data.provider || "provider"}`,
                    { id: toastId }
                );
                setSeedInput("");
                await fetchTreeData(true);
            } catch {
                toast.error("Could not reach harvest API", { id: toastId });
                setActiveStage("idle");
                return;
            }
        } else if (!status || (status.pending === 0 && status.completed === 0)) {
            toast.error("Paste an Instagram URL or @username to start the tree");
            return;
        }

        runHarvestLoop(cleanLimit, targetCategory);
    };

    const handlePause = () => {
        runningRef.current = false;
        setIsRunning(false);
        setLiveMessage("Paused safely — all progress is saved in PostgreSQL. Click Resume anytime.");
        toast("Tree harvester paused");
    };

    const handleResetQueue = async () => {
        if (isRunning) handlePause();
        const toastId = toast.loading("Clearing harvest queue (saved DB creators stay safe)...");
        try {
            const res = await fetch("/api/creators/harvest/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                setSelectedBranch("all");
                setSelectedIds(new Set());
                setActiveStage("idle");
                setLiveMessage("Queue cleared. Paste any Instagram URL or @username to launch a fresh 500-creator tree.");
                await fetchTreeData(true);
                toast.success("Harvest queue cleared", { id: toastId });
            } else {
                toast.error("Failed to reset queue", { id: toastId });
            }
        } catch {
            toast.error("Reset request failed", { id: toastId });
        }
    };

    const handleExpandSingleBranch = async (handle: string, currentDepth: number) => {
        setExpandingHandle(handle);
        const toastId = toast.loading(`Expanding lookalike branch from @${handle}...`);
        try {
            const res = await fetch("/api/creators/harvest/seed", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    seed: handle,
                    depth: currentDepth + 1,
                    limit: 55,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.message || "Failed to expand branch", { id: toastId });
                return;
            }
            toast.success(`Expanded @${data.seedHandle} → +${data.newlyQueued || 0} new lookalikes queued`, { id: toastId });
            await fetchTreeData(true);
        } catch {
            toast.error("Branch expansion failed", { id: toastId });
        } finally {
            setExpandingHandle(null);
        }
    };

    // Filtered items for table
    const filteredItems = items.filter((item) => {
        if (selectedBranch !== "all" && item.seedHandle !== selectedBranch) return false;
        if (statusFilter === "hydrated" && item.queueStatus !== "COMPLETED") return false;
        if (statusFilter === "email" && !item.primaryEmail) return false;
        if (statusFilter === "pending" && item.queueStatus !== "PENDING" && item.queueStatus !== "PROCESSING") return false;
        if (statusFilter === "skipped" && !item.queueStatus.startsWith("SKIPPED") && item.queueStatus !== "FAILED") return false;
        if (tableSearch.trim()) {
            const q = tableSearch.toLowerCase();
            const hay = [
                item.name,
                item.handle,
                item.seedHandle,
                item.category,
                item.primaryEmail,
                item.agencyName,
                item.bio,
                ...(item.subGenres || []),
                ...(item.languages || []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        const selectable = filteredItems.filter((i) => i.creatorId).map((i) => i.creatorId!);
        if (selectedIds.size === selectable.length && selectable.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(selectable));
        }
    };

    const launchCampaign = () => {
        const ids = Array.from(selectedIds);
        if (ids.length > 0) {
            sessionStorage.setItem("tbm_campaign_creator_ids", JSON.stringify(ids));
        } else {
            const emailReadyIds = filteredItems.filter((i) => i.creatorId && i.primaryEmail).map((i) => i.creatorId!);
            if (emailReadyIds.length > 0) {
                sessionStorage.setItem("tbm_campaign_creator_ids", JSON.stringify(emailReadyIds));
            }
        }
        navigate("/app/creators/campaigns?enroll=1");
    };

    const exportCsv = () => {
        const headers = [
            "Name",
            "Handle",
            "Instagram URL",
            "Tree Depth",
            "Parent Seed",
            "Queue Status",
            "Followers",
            "Tier",
            "Avg Likes",
            "Avg Comments",
            "Category",
            "Sub-Genres",
            "Languages",
            "India Verified",
            "Primary Email",
            "Secondary Emails",
            "WhatsApp",
            "Phone",
            "Agency",
            "Website / Linktree",
            "Bio",
            "Intake Form Link",
        ];
        const rows = filteredItems.map((c) => [
            c.name,
            c.handle,
            c.profileUrl,
            `L${c.depth}`,
            `@${c.seedHandle}`,
            c.queueStatus,
            c.followersCount || "",
            c.tier || "",
            c.avgLikes || "",
            c.avgComments || "",
            c.category || "",
            (c.subGenres || []).join(" | "),
            (c.languages || []).join(" | "),
            c.indiaSignal ? "Yes" : "No",
            c.primaryEmail || "",
            (c.secondaryEmails || []).join(" | "),
            c.whatsappNumber || "",
            c.phoneNumber || "",
            c.agencyName || "",
            c.website || "",
            (c.bio || "").replace(/[\r\n]+/g, " "),
            c.intakeUrl || "",
        ]);
        const csv = [headers, ...rows]
            .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tbm_tree_harvest_${filteredItems.length}_creators.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${filteredItems.length} rows with all fields & links`);
    };

    const completedCount = status?.completed || 0;
    const progressPct = Math.min(100, Math.round((completedCount / Math.max(1, targetLimit)) * 100));
    const emailHitRate = completedCount > 0 ? Math.round(((status?.completedWithEmail || 0) / completedCount) * 100) : 0;

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#121212]">
            {/* Topbar matching CreatorsTable & SearchCreator exact UI */}
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-zinc-800 flex flex-col gap-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <span>BFS Tree Harvester</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FFE600] text-slate-900">
                                Lookalike Tree · Custom Limit
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 pt-0.5">
                            Drop 1 Instagram URL or @username to recursively discover lookalikes, hydrate full profiles for $0 via Meta Graph, extract emails &amp; auto-generate intake links.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => fetchTreeData()}
                            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                            <RefreshCcwIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                            <span>Refresh</span>
                        </button>

                        <button
                            onClick={handleResetQueue}
                            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                            title="Clear queue for a fresh tree test (saved creators in DB are never deleted)"
                        >
                            <RotateCcwIcon className="w-3.5 h-3.5" />
                            <span>Reset Queue</span>
                        </button>

                        <button
                            onClick={exportCsv}
                            disabled={filteredItems.length === 0}
                            className="h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            <span>Export CSV ({filteredItems.length})</span>
                        </button>

                        <button
                            onClick={launchCampaign}
                            className="h-8 px-3 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                            <SendIcon className="w-3.5 h-3.5" />
                            <span>{selectedIds.size > 0 ? `Campaign (${selectedIds.size})` : "Launch Campaign"}</span>
                        </button>
                    </div>
                </div>

                {/* Seed Command Card in Website's Native #FAF9F5 Stone Card Style */}
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                        <div className="md:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                                Seed Instagram URL or @Username
                            </label>
                            <input
                                type="text"
                                value={seedInput}
                                onChange={(e) => setSeedInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isRunning) handleStartTree();
                                }}
                                placeholder="https://www.instagram.com/navyaaaaa_____/ or @aww_diti_"
                                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                                Category Hint (Optional)
                            </label>
                            <select
                                value={targetCategory}
                                onChange={(e) => setTargetCategory(e.target.value)}
                                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none"
                            >
                                {TARGET_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                                Tree Target Limit
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={targetLimitInput}
                                onChange={(e) => {
                                    const digitsOnly = e.target.value.replace(/[^0-9]/g, "");
                                    setTargetLimitInput(digitsOnly);
                                }}
                                onBlur={() => {
                                    if (!targetLimitInput || Number(targetLimitInput) < 1) {
                                        setTargetLimitInput("500");
                                    }
                                }}
                                placeholder="e.g. 200, 500, 2000"
                                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                            />
                        </div>

                        <div className="md:col-span-3 flex items-center gap-2">
                            {!isRunning ? (
                                <button
                                    type="button"
                                    onClick={handleStartTree}
                                    className="flex-1 h-9 px-4 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                                >
                                    <PlayIcon className="w-3.5 h-3.5 fill-current" />
                                    <span>{completedCount > 0 && !seedInput.trim() ? "Resume Tree" : "Start Tree Harvest"}</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handlePause}
                                    className="flex-1 h-9 px-4 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                                >
                                    <PauseIcon className="w-3.5 h-3.5 fill-current" />
                                    <span>Pause Safely</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Smart 4-Stage Visual Flow Showcase */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-1">
                        {[
                            {
                                step: "1",
                                key: "seed",
                                title: "Seed Root",
                                subtitle: branches.length > 0 ? `@${branches[0].seedHandle} (+${Math.max(0, branches.length - 1)} branches)` : "Paste 1 IG URL / @handle",
                                badge: `${status?.expandedSeeds || branches.length} seeds`,
                                detail: "Entry point into the creator graph",
                            },
                            {
                                step: "2",
                                key: "expand",
                                title: "Lookalike Tree",
                                subtitle: `~55 similar creators / seed · ${(status?.lookalikeProvider || "socialcrawl").toUpperCase()}`,
                                badge: `${(status?.pending || 0) + (status?.completed || 0) + (status?.skipped || 0)} discovered`,
                                detail: "Auto-expands L1 → L2 → L3 branches",
                            },
                            {
                                step: "3",
                                key: "hydrate",
                                title: "Meta Graph ($0)",
                                subtitle: `${status?.activeMetaTokens || 1} token · ${(status?.dailyFreeCapacity || 4320).toLocaleString()}/day free`,
                                badge: `${completedCount} / ${targetLimit} hydrated`,
                                detail: "5K–50M + Indian Human gate + 8 Reels",
                            },
                            {
                                step: "4",
                                key: "done",
                                title: "Email + AI + Form Link",
                                subtitle: "Bio → Linktree → 60 Agencies → gpt-4o-mini",
                                badge: `${status?.completedWithEmail || 0} emails (${emailHitRate}%)`,
                                detail: "Auto-stored in DB with {{form_link}}",
                            },
                        ].map((stage, idx) => {
                            const isActive = isRunning && activeStage === stage.key;
                            return (
                                <div
                                    key={stage.key}
                                    className={`relative p-2.5 rounded-lg border transition-all ${
                                        isActive
                                            ? "bg-[#FFE600]/20 border-[#18181B] dark:border-[#FFE600] shadow-xs"
                                            : "bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-900 dark:text-white">
                                            <span
                                                className={`w-4 h-4 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                                                    isActive
                                                        ? "bg-slate-900 text-[#FFE600] animate-pulse"
                                                        : "bg-slate-900 text-white dark:bg-zinc-700"
                                                }`}
                                            >
                                                {stage.step}
                                            </span>
                                            {stage.title}
                                        </span>
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                            {stage.badge}
                                        </span>
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-700 dark:text-zinc-300 truncate">{stage.subtitle}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">{stage.detail}</div>
                                    {idx < 3 && (
                                        <ArrowRightIcon className="hidden md:block w-3.5 h-3.5 text-slate-400 absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 bg-[#FAF9F5] dark:bg-zinc-900 rounded-full" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Live Progress Bar & Status Line */}
                    <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-700 dark:text-zinc-300 font-medium flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                                {liveMessage}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                                {completedCount} / {targetLimit} ({progressPct}%)
                            </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                            <div
                                className="h-full bg-slate-900 dark:bg-[#FFE600] transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Interactive Tree Branch Explorer (Parent Seed -> Children Lineage) */}
                {branches.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0 flex items-center gap-1 mr-1">
                            <GitForkIcon className="w-3.5 h-3.5" />
                            Tree Branches:
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedBranch("all")}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border transition-colors cursor-pointer ${
                                selectedBranch === "all"
                                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                                    : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50"
                            }`}
                        >
                            All Branches ({items.length})
                        </button>
                        {branches.map((b) => {
                            const active = selectedBranch === b.seedHandle;
                            return (
                                <button
                                    key={b.seedHandle}
                                    type="button"
                                    onClick={() => setSelectedBranch(active ? "all" : b.seedHandle)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border transition-colors flex items-center gap-1.5 cursor-pointer ${
                                        active
                                            ? "bg-[#FFE600] text-slate-950 border-black/15 font-semibold"
                                            : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50"
                                    }`}
                                >
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold">
                                        L{b.minDepth}
                                    </span>
                                    <span>@{b.seedHandle}</span>
                                    <span className="text-[10px] opacity-75">
                                        {b.completed}/{b.totalQueued}
                                        {b.withEmail > 0 ? ` · ${b.withEmail}📧` : ""}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Table Filter Toolbar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                            { id: "all" as const, label: `All (${items.length})` },
                            { id: "hydrated" as const, label: `Hydrated (${status?.completed || 0})` },
                            { id: "email" as const, label: `With Email (${status?.completedWithEmail || 0})` },
                            { id: "pending" as const, label: `Queued (${status?.pending || 0})` },
                            { id: "skipped" as const, label: `Filtered Out (${(status?.skipped || 0) + (status?.failed || 0)})` },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setStatusFilter(tab.id)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                    statusFilter === tab.id
                                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200/70"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-64">
                        <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            placeholder="Filter by @handle, email, niche, bio..."
                            className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* All-Fields Data Table */}
            <div className="flex-1 overflow-auto">
                {filteredItems.length === 0 ? (
                    <div className="py-16 px-6 text-center max-w-md mx-auto">
                        <div className="w-11 h-11 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 mx-auto flex items-center justify-center mb-3">
                            <GitForkIcon className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No tree nodes yet</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Paste an Instagram URL like{" "}
                            <button
                                type="button"
                                onClick={() => setSeedInput("https://www.instagram.com/navyaaaaa_____/?hl=en")}
                                className="underline text-slate-800 dark:text-zinc-200 font-medium cursor-pointer"
                            >
                                https://www.instagram.com/navyaaaaa_____/?hl=en
                            </button>{" "}
                            above and click <strong>Start Tree Harvest</strong> to watch lookalikes, emails, languages, and intake links populate live.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse min-w-[1180px]">
                        <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-zinc-900/95 backdrop-blur border-b border-slate-200 dark:border-zinc-800 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="py-2.5 pl-4 pr-2 w-9">
                                    <input
                                        type="checkbox"
                                        checked={
                                            filteredItems.filter((i) => i.creatorId).length > 0 &&
                                            selectedIds.size === filteredItems.filter((i) => i.creatorId).length
                                        }
                                        onChange={toggleSelectAll}
                                        className="rounded border-slate-300 cursor-pointer"
                                    />
                                </th>
                                <th className="py-2.5 px-3">Creator &amp; Tree Lineage</th>
                                <th className="py-2.5 px-3">Followers &amp; Reach</th>
                                <th className="py-2.5 px-3">Category, Niches &amp; Languages</th>
                                <th className="py-2.5 px-3">Bio &amp; Website / Linktree</th>
                                <th className="py-2.5 px-3">Email, Phone &amp; Agency</th>
                                <th className="py-2.5 px-3">Intake Link ({"{{form_link}}"})</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70 text-xs">
                            {filteredItems.slice(0, visibleCount).map((item) => {
                                const catStyle = getCategoryStyle(item.category);
                                const isCompleted = item.queueStatus === "COMPLETED";
                                const isPending = item.queueStatus === "PENDING" || item.queueStatus === "PROCESSING";
                                const isSkipped = item.queueStatus.startsWith("SKIPPED") || item.queueStatus === "FAILED";
                                const er = Number(item.engagementRatePct || 0);

                                return (
                                    <tr
                                        key={item.queueId}
                                        onClick={() => {
                                            if (item.creatorId) setSelectedCreator(item);
                                        }}
                                        className={`hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors ${
                                            item.creatorId ? "cursor-pointer" : ""
                                        }`}
                                    >
                                        <td className="py-3 pl-4 pr-2 align-top">
                                            {item.creatorId ? (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(item.creatorId)}
                                                    onClick={(e) => toggleSelect(item.creatorId!, e)}
                                                    onChange={() => {}}
                                                    className="rounded border-slate-300 mt-1 cursor-pointer"
                                                />
                                            ) : (
                                                <span className="inline-block w-3.5 h-3.5" />
                                            )}
                                        </td>

                                        {/* 1. Creator & Tree Lineage */}
                                        <td className="py-3 px-3 align-top max-w-[245px]">
                                            <div className="flex items-start gap-2.5">
                                                {/* Exact Instagram Gradient Ring Avatar (matches Search Creator & All Creators) */}
                                                <div className="size-9 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-[#5E43EC] p-0.5 shrink-0 shadow-2xs">
                                                    <div className="size-full bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center font-bold text-xs text-slate-900 dark:text-white overflow-hidden relative">
                                                        <span>{(item.name || item.cleanHandle).replace(/^@/, "")[0]?.toUpperCase() || "C"}</span>
                                                        {item.avatarUrl && (
                                                            <img
                                                                src={item.avatarUrl}
                                                                alt=""
                                                                loading="lazy"
                                                                referrerPolicy="no-referrer"
                                                                className="size-full object-cover absolute inset-0"
                                                                onError={(e) => {
                                                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold text-slate-900 dark:text-white truncate">{item.name}</span>
                                                        {item.isVerified && (
                                                            <span className="size-1.5 rounded-full bg-sky-500 shrink-0" title="Verified" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <a
                                                            href={item.profileUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 truncate"
                                                        >
                                                            <span>{item.handle}</span>
                                                            <ExternalLinkIcon className="w-2.5 h-2.5 shrink-0" />
                                                        </a>
                                                        {item.latestReelUrl && (
                                                            <a
                                                                href={item.latestReelUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 text-[10px] font-medium hover:bg-rose-100"
                                                                title="Watch latest Reel"
                                                            >
                                                                <VideoIcon className="w-2.5 h-2.5" />
                                                                <span>Reel</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                                            {item.depth === 0 ? "Root" : `L${item.depth}`}
                                                        </span>
                                                        {item.seedHandle && item.seedHandle !== item.cleanHandle && (
                                                            <span className="text-[10px] text-slate-500 truncate max-w-[125px]">
                                                                from @{item.seedHandle}
                                                            </span>
                                                        )}
                                                        {isCompleted && (
                                                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                                                <CheckCircle2Icon className="w-2.5 h-2.5" /> Hydrated
                                                            </span>
                                                        )}
                                                        {isPending && (
                                                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                                                <ClockIcon className="w-2.5 h-2.5" /> {item.queueStatus === "PROCESSING" ? "Hydrating" : "Queued"}
                                                            </span>
                                                        )}
                                                        {isSkipped && (
                                                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400" title={item.errorMsg || item.queueStatus}>
                                                                <AlertCircleIcon className="w-2.5 h-2.5" /> {item.queueStatus.replace("SKIPPED_", "").toLowerCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 2. Followers & Reach */}
                                        <td className="py-3 px-3 align-top whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-slate-900 dark:text-white text-xs">
                                                    {formatNumber(item.followersCount)}
                                                </span>
                                                {er > 0 && (
                                                    <span
                                                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                                                            er >= 4
                                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                                : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                                                        }`}
                                                        title="Engagement Rate (Avg Likes + Comments / Followers)"
                                                    >
                                                        {er}% ER
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                                                {item.tier || "—"}
                                                {item.postsCount ? ` · ${formatNumber(item.postsCount)} posts` : ""}
                                            </div>
                                            {(item.avgLikes > 0 || item.avgComments > 0) && (
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    ♥ {formatNumber(item.avgLikes)} · 💬 {formatNumber(item.avgComments)}
                                                </div>
                                            )}
                                        </td>

                                        {/* 3. Category, Niches & Languages */}
                                        <td className="py-3 px-3 align-top max-w-[215px]">
                                            <div className="flex flex-wrap gap-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                                                    {item.category}
                                                </span>
                                                {item.indiaSignal && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                        🇮🇳 Verified
                                                    </span>
                                                )}
                                            </div>
                                            {item.subGenres && item.subGenres.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {item.subGenres.slice(0, 3).map((sg) => (
                                                        <span key={sg} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                                            {sg}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-1 mt-1">
                                                {(item.languages || []).slice(0, 3).map((lang) => (
                                                    <span key={lang} className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/70">
                                                        {lang}
                                                    </span>
                                                ))}
                                                {item.city && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                                        <MapPinIcon className="w-2.5 h-2.5 text-slate-400" />
                                                        {item.city}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 4. Bio & Website / Linktree */}
                                        <td className="py-3 px-3 align-top max-w-[240px]">
                                            {item.bio ? (
                                                <p className="text-[11px] text-slate-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                                                    {item.bio}
                                                </p>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">
                                                    {isPending ? "Waiting for Meta Graph..." : "No bio"}
                                                </span>
                                            )}
                                            {item.website && (
                                                <a
                                                    href={item.website.startsWith("http") ? item.website : `https://${item.website}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-blue-600 dark:text-blue-400 hover:underline max-w-[220px] truncate"
                                                >
                                                    <GlobeIcon className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{item.website.replace(/^https?:\/\//, "")}</span>
                                                </a>
                                            )}
                                        </td>

                                        {/* 5. Email, Phone & Agency */}
                                        <td className="py-3 px-3 align-top max-w-[225px]">
                                            {item.primaryEmail ? (
                                                <div className="flex items-center gap-1">
                                                    <a
                                                        href={`mailto:${item.primaryEmail}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-900 dark:text-white hover:underline truncate max-w-[180px]"
                                                    >
                                                        <MailIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                                                        <span className="truncate">{item.primaryEmail}</span>
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyText(item.primaryEmail!, `email-${item.queueId}`, "email");
                                                        }}
                                                        className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                                        title="Copy email"
                                                    >
                                                        {copiedKey === `email-${item.queueId}` ? (
                                                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                                                        ) : (
                                                            <CopyIcon className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            ) : item.collabHandle ? (
                                                <a
                                                    href={`https://www.instagram.com/${item.collabHandle.replace(/^@/, "")}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/80 text-[10.5px] font-medium hover:underline"
                                                >
                                                    <MessageSquareIcon className="w-3 h-3 shrink-0" />
                                                    <span>Collab/Rep: {item.collabHandle}</span>
                                                </a>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">
                                                    {isPending ? "Pending..." : "IG DM Only"}
                                                </span>
                                            )}
                                            {(item.whatsappNumber || item.phoneNumber) && (
                                                <div className="flex items-center gap-1 text-[10.5px] text-slate-600 dark:text-zinc-300 mt-1">
                                                    <PhoneIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                                                    <span>{item.whatsappNumber || item.phoneNumber}</span>
                                                </div>
                                            )}
                                            {item.agencyName && (
                                                <div className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 mt-1">
                                                    <Building2Icon className="w-2.5 h-2.5 shrink-0" />
                                                    <span className="truncate max-w-[165px]">{item.agencyName}</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* 6. Intake Link ({{form_link}}) */}
                                        <td className="py-3 px-3 align-top whitespace-nowrap">
                                            {item.intakeUrl ? (
                                                <div className="flex items-center gap-1.5">
                                                    <a
                                                        href={item.intakeUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[10.5px] font-medium text-slate-800 dark:text-zinc-200 hover:bg-slate-100"
                                                    >
                                                        <Link2Icon className="w-3 h-3 text-slate-500" />
                                                        <span>Open Form</span>
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyText(item.intakeUrl!, `form-${item.queueId}`, "intake form link");
                                                        }}
                                                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-800 cursor-pointer"
                                                        title="Copy {{form_link}}"
                                                    >
                                                        {copiedKey === `form-${item.queueId}` ? (
                                                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                                        ) : (
                                                            <CopyIcon className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">—</span>
                                            )}
                                        </td>

                                        {/* 7. Actions */}
                                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={expandingHandle === item.cleanHandle}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleExpandSingleBranch(item.cleanHandle, item.depth);
                                                    }}
                                                    className="h-7 px-2 rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-[#FFE600]/30 text-[11px] font-medium text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                    title="Expand ~55 lookalikes from this creator into the tree"
                                                >
                                                    <SparklesIcon className="w-3 h-3 text-amber-500" />
                                                    <span>{expandingHandle === item.cleanHandle ? "..." : "Branch"}</span>
                                                </button>
                                                {item.creatorId && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedCreator(item);
                                                        }}
                                                        className="h-7 px-2 rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
                                                        title="Open full creator insights drawer"
                                                    >
                                                        <EyeIcon className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* Native Centered "+ Load more · X of Y" Pagination Footer */}
                {filteredItems.length > 0 && (
                    <div className="py-4 px-5 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-center bg-white dark:bg-[#121212]">
                        {visibleCount < filteredItems.length ? (
                            <button
                                type="button"
                                onClick={() => setVisibleCount((prev) => prev + 50)}
                                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-200 inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
                            >
                                <span className="text-sm leading-none text-slate-500">+</span>
                                <span>Load more</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                                    {Math.min(visibleCount, filteredItems.length).toLocaleString()} of {filteredItems.length.toLocaleString()}
                                </span>
                            </button>
                        ) : (
                            <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums">
                                Showing all {filteredItems.length.toLocaleString()} of {filteredItems.length.toLocaleString()} tree nodes
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Slide-Over Full Creator Detail Drawer */}
            {selectedCreator && (
                <CreatorDetailDrawer
                    creator={selectedCreator}
                    onClose={() => setSelectedCreator(null)}
                    onUpdate={() => fetchTreeData(true)}
                />
            )}
        </div>
    );
}
