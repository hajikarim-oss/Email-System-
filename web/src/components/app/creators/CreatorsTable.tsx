import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    SearchIcon,
    FilterIcon,
    DownloadIcon,
    UploadIcon,
    RefreshCcwIcon,
    ExternalLinkIcon,
    CopyIcon,
    MailIcon,
    PhoneIcon,
    CheckIcon,
    SparklesIcon,
    VideoIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XIcon,
    MoreHorizontalIcon,
    CheckCircle2Icon,
    LayersIcon,
    MapPinIcon,
    EyeIcon,
    ClockIcon,
    SendIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authHeaders } from "@/lib/api/standaloneMock";
import CreatorDetailDrawer from "./CreatorDetailDrawer";

// Category badge color schemes
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Skincare: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800" },
    Fashion: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
    "Food Blogger": { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
    "Chef / Home Chef": { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
    Tech: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
    "Appliance Reviewer": { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800" },
    Finance: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
    "Trading & Stock Market": { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
    Fitness: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
    Education: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
    Lifestyle: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800" },
    Infotainment: { bg: "bg-cyan-50 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-800" },
};

export default function CreatorsTable() {
    const [creators, setCreators] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [loading, setLoading] = useState(true);

    const [searchParams] = useSearchParams();

    // Filters
    const [search, setSearch] = useState(searchParams.get("search") || "");
    const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search") || "");
    const [category, setCategory] = useState(searchParams.get("category") || "all");
    const [tier, setTier] = useState<string>(searchParams.get("tier") || "all");
    const [intakeStatus, setIntakeStatus] = useState<string>(searchParams.get("intakeStatus") || "all");
    const [channel, setChannel] = useState<string>(searchParams.get("channel") || "all");
    const [sortBy, setSortBy] = useState<string>("default");
    const [reverse, setReverse] = useState(false);

    // Selected rows
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Drawer state
    const [selectedCreator, setSelectedCreator] = useState<any | null>(null);

    // Facets / Aggregation counts
    const [facets, setFacets] = useState<any>({
        categories: [],
        tiers: [],
        statuses: [],
        overview: { total: 6441, emailReady: 4111, whatsappReady: 562, enriched: 48 },
    });

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [search]);

    // Fetch Facets once
    const fetchFacets = useCallback(async () => {
        try {
            const res = await fetch("/api/creators/facets", { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setFacets(data);
            }
        } catch {
            // graceful fallback
        }
    }, []);

    useEffect(() => {
        fetchFacets();
    }, [fetchFacets]);

    // Fetch Paginated Creators
    const fetchCreators = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                search: debouncedSearch,
                category: category === "all" ? "" : category,
                tier: tier === "all" ? "" : tier,
                intakeStatus: intakeStatus === "all" ? "" : intakeStatus,
                channel: channel === "all" ? "" : channel,
                sortBy,
                reverse: reverse ? "true" : "false",
                limit: String(limit),
                offset: String((page - 1) * limit),
            });

            const res = await fetch(`/api/creators?${params.toString()}`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setCreators(data.creators || []);
                setTotal(data.total || 0);
            }
        } catch (err: any) {
            toast.error("Failed to fetch creators database");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, category, tier, intakeStatus, channel, sortBy, reverse, page, limit]);

    useEffect(() => {
        fetchCreators();
    }, [fetchCreators]);

    // Selection handlers
    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === creators.length && creators.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(creators.map((c) => c.id)));
        }
    };

    // Quick action: Copy intake link
    const copyIntakeLink = (creator: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}/creator/intake/${creator.intakeToken || creator.id}`;
        navigator.clipboard.writeText(url);
        toast.success(`Copied intake link for ${creator.handle}`);
    };

    // Export selected or all to CSV
    const exportCsv = () => {
        const rowsToExport = creators.filter((c) => selectedIds.has(c.id));
        const target = rowsToExport.length > 0 ? rowsToExport : creators;

        const headers = ["Handle", "Full Name", "Category", "Followers", "Email", "WhatsApp", "PIN Code", "City", "Intake Status", "Intake URL"];
        const csvContent = [
            headers.join(","),
            ...target.map((c) =>
                [
                    `"${c.handle}"`,
                    `"${(c.fullName || "").replace(/"/g, '""')}"`,
                    `"${c.category}"`,
                    `"${c.followersRaw}"`,
                    `"${c.primaryEmail || ""}"`,
                    `"${c.whatsappNumber || c.phone || ""}"`,
                    `"${c.pincode || ""}"`,
                    `"${c.city || ""}"`,
                    `"${c.intakeStatus}"`,
                    `"${window.location.origin}/creator/intake/${c.intakeToken || c.id}"`,
                ].join(",")
            ),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `TBM_Creators_Export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${target.length} creator records!`);
    };

    const navigate = useNavigate();

    const launchCampaignWithCreators = (list?: any[]) => {
        const rawList = list || (selectedIds.size > 0 ? creators.filter((c) => selectedIds.has(c.id)) : []);
        const withEmail = rawList.filter((c) => Boolean(c.primaryEmail));
        if (rawList.length > 0 && withEmail.length === 0) {
            toast.error("Selected creators do not have email addresses on file.");
            return;
        }
        if (withEmail.length > 0) {
            const origin = window.location.origin;
            const drafts = withEmail.map((c) => {
                const cleanHandle = (c.handle || "").replace(/^@/, "").trim();
                const fullName = (c.fullName || cleanHandle || "").trim();
                const parts = fullName.split(/\s+/);
                const token = c.intakeToken || c.id;
                return {
                    id: c.id,
                    email: c.primaryEmail,
                    first_name: parts[0] || cleanHandle,
                    last_name: parts.slice(1).join(" "),
                    company: cleanHandle ? `@${cleanHandle}` : "",
                    role: c.category || "Creator",
                    handle: cleanHandle ? `@${cleanHandle}` : "",
                    category: c.category || "Creator",
                    followers: c.followersRaw || "",
                    intake_token: token,
                    form_link: `${origin}/creator/intake/${token}`,
                    intake_link: `${origin}/creator/intake/${token}`,
                    source: "database" as const,
                };
            });
            try {
                sessionStorage.setItem("tbm_preselected_creators", JSON.stringify(drafts));
            } catch {}
            toast.success(`Queued ${drafts.length} creator${drafts.length === 1 ? "" : "s"} for campaign!`);
        } else if (category !== "all") {
            try {
                sessionStorage.setItem("tbm_preselected_creator_category", category);
            } catch {}
        }
        navigate("/app/creators/campaigns?new=1");
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#121212]">
            {/* Topbar: Header Title & Stats Strip */}
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-zinc-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Creator Scouting & Database</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FFE600] text-slate-900">
                                Troops Workspace
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 pt-0.5">
                            Scouted influencer database with dynamic Bumble-style intake and automatic profile enrichment.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                fetchCreators();
                                fetchFacets();
                            }}
                            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                            <RefreshCcwIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                            <span>Refresh</span>
                        </button>
                        <button
                            onClick={exportCsv}
                            className="h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            <span>Export CSV</span>
                        </button>
                        <button
                            onClick={() => launchCampaignWithCreators()}
                            className="h-8 px-3 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                            <SendIcon className="w-3.5 h-3.5" />
                            <span>{selectedIds.size > 0 ? `Campaign (${selectedIds.size})` : "New Campaign"}</span>
                        </button>
                    </div>
                </div>

                {/* StatStrip with 1-click filter shortcuts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div
                        onClick={() => {
                            setCategory("all");
                            setIntakeStatus("all");
                            setChannel("all");
                            setPage(1);
                        }}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300 transition-all cursor-pointer"
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">Total Scouted Talent</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">
                            {facets.overview.total.toLocaleString()}
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            setChannel("email");
                            setPage(1);
                        }}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300 transition-all cursor-pointer"
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">Email Outreach Ready</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">
                            {facets.overview.emailReady.toLocaleString()}
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            setChannel("phone");
                            setPage(1);
                        }}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300 transition-all cursor-pointer"
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">WhatsApp / Phone Ready</span>
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {facets.overview.whatsappReady.toLocaleString()}
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            setIntakeStatus("COMPLETED");
                            setPage(1);
                        }}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-purple-300 transition-all cursor-pointer"
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">100% Enriched Roster</span>
                        <span className="text-lg font-bold text-[#5E43EC]">
                            {facets.overview.enriched.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Horizontal Quick Category & Status Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
                    <button
                        type="button"
                        onClick={() => {
                            setCategory("all");
                            setIntakeStatus("all");
                            setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full font-medium shrink-0 transition-all cursor-pointer ${
                            category === "all" && intakeStatus === "all"
                                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold shadow-2xs"
                                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                        }`}
                    >
                        All ({facets.overview.total})
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setIntakeStatus(intakeStatus === "COMPLETED" ? "all" : "COMPLETED");
                            setCategory("all");
                            setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full font-semibold shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
                            intakeStatus === "COMPLETED"
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                        }`}
                    >
                        <SparklesIcon className="w-3 h-3" />
                        <span>⚡ 100% Enriched ({facets.overview.enriched})</span>
                    </button>

                    {facets.categories.slice(0, 8).map((cat: any) => {
                        const isSelected = category === cat.category;
                        return (
                            <button
                                key={cat.category}
                                type="button"
                                onClick={() => {
                                    setCategory(isSelected ? "all" : cat.category);
                                    setIntakeStatus("all");
                                    setPage(1);
                                }}
                                className={`px-3 py-1 rounded-full font-medium shrink-0 transition-all cursor-pointer ${
                                    isSelected
                                        ? "bg-[#5E43EC] text-white shadow-2xs font-semibold"
                                        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                                }`}
                            >
                                {cat.category} ({cat.count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filter Toolbar (SectionBar) */}
            <div className="px-5 py-2.5 border-b border-slate-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-[#121212]">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search Field */}
                    <div className="relative w-64">
                        <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search handle, name, city, bio..."
                            className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <XIcon className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Follower Tier Buttons */}
                    <div className="hidden lg:flex items-center gap-1 border border-slate-200 dark:border-zinc-700 rounded-md p-0.5 bg-slate-50 dark:bg-zinc-900 text-xs font-medium">
                        {[
                            { key: "all", label: "All Tiers" },
                            { key: "nano", label: "Nano (<10k)" },
                            { key: "micro", label: "Micro (10k-50k)" },
                            { key: "mid", label: "Mid (50k-200k)" },
                            { key: "macro", label: "Macro (200k-1M)" },
                            { key: "mega", label: "Mega (1M+)" },
                        ].map((t) => (
                            <button
                                key={t.key}
                                onClick={() => {
                                    setTier(t.key);
                                    setPage(1);
                                }}
                                className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                                    tier === t.key
                                        ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-semibold shadow-2xs"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Channel Filter */}
                    <select
                        value={channel}
                        onChange={(e) => {
                            setChannel(e.target.value);
                            setPage(1);
                        }}
                        className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
                    >
                        <option value="all">All Channels</option>
                        <option value="email">Has Email ({facets.overview.emailReady})</option>
                        <option value="phone">Has WhatsApp ({facets.overview.whatsappReady})</option>
                        <option value="dual">Dual Ready (Email + Phone)</option>
                    </select>

                    {/* Intake Status Filter */}
                    <select
                        value={intakeStatus}
                        onChange={(e) => {
                            setIntakeStatus(e.target.value);
                            setPage(1);
                        }}
                        className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
                    >
                        <option value="all">All Intake Statuses</option>
                        <option value="COMPLETED">100% Enriched ({facets.overview.enriched})</option>
                        <option value="VIEWED">Form Opened / Viewed</option>
                        <option value="SENT">Outreach Invite Sent</option>
                        <option value="SCRAPED_BASELINE">30% Scraped Baseline</option>
                    </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Sort:</span>
                    <button
                        onClick={() => {
                            if (sortBy === "default") setSortBy("followersCount");
                            else if (sortBy === "followersCount") setSortBy("fullName");
                            else setSortBy("default");
                        }}
                        className="font-medium text-slate-900 dark:text-white hover:underline cursor-pointer"
                    >
                        {sortBy === "default" ? "⚡ Enriched First" : sortBy === "followersCount" ? "Followers" : "Name"}
                    </button>
                    <button
                        onClick={() => setReverse(!reverse)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Toggle sort direction"
                    >
                        {reverse ? "↑" : "↓"}
                    </button>
                </div>
            </div>

            {/* Dense High-Performance Creators Table */}
            <div className="flex-1 overflow-auto relative">
                <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#FAF9F5] dark:bg-zinc-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-zinc-800 z-10 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th className="w-10 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={creators.length > 0 && selectedIds.size === creators.length}
                                    onChange={toggleSelectAll}
                                    className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                                />
                            </th>
                            <th className="px-3 py-2.5">Creator / Instagram</th>
                            <th className="px-3 py-2.5">Followers</th>
                            <th className="px-3 py-2.5">Vertical & Location</th>
                            <th className="px-3 py-2.5">Outreach Channels</th>
                            <th className="px-3 py-2.5">Intake Status</th>
                            <th className="w-28 px-3 py-2.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-normal">
                        {creators.map((c) => {
                            const isSelected = selectedIds.has(c.id);
                            const isEnriched = c.intakeStatus === "COMPLETED" || (c.intakeCompletionPct && c.intakeCompletionPct >= 80);
                            const catStyle = CATEGORY_COLORS[c.category] || { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" };

                            return (
                                <tr
                                    key={c.id}
                                    onClick={() => setSelectedCreator(c)}
                                    className={`h-12 transition-colors hover:bg-slate-50/80 dark:hover:bg-zinc-800/50 cursor-pointer ${
                                        isSelected ? "bg-amber-50/50 dark:bg-zinc-800/70" : ""
                                    }`}
                                >
                                    {/* Checkbox */}
                                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => toggleSelect(c.id, e as any)}
                                            className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                                        />
                                    </td>

                                    {/* Creator & Handle */}
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="size-8 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-[#5E43EC] p-0.5 shrink-0 shadow-2xs">
                                                <div className="size-full bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center font-bold text-xs text-slate-900 dark:text-white overflow-hidden relative">
                                                    <span>{c.fullName?.[0]?.toUpperCase() || "C"}</span>
                                                    <img
                                                        src={c.avatarUrl || `/creator-avatars/${(c.handle || "").replace(/^@/, "").toLowerCase()}.jpg`}
                                                        alt=""
                                                        loading="lazy"
                                                        className="size-full object-cover absolute inset-0"
                                                        onError={(e) => {
                                                            (e.currentTarget as HTMLImageElement).style.display = "none";
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                                                        {c.fullName}
                                                    </span>
                                                    {c.isVerified && (
                                                        <span className="size-1.5 rounded-full bg-sky-500 shrink-0" title="Verified" />
                                                    )}
                                                </div>
                                                <a
                                                    href={c.profileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-[11px] text-[#5E43EC] hover:underline flex items-center gap-0.5"
                                                >
                                                    <span>{c.handle}</span>
                                                    <ExternalLinkIcon className="w-2.5 h-2.5 text-slate-400" />
                                                </a>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Followers & Tier */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                                                {c.followersRaw}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-400">
                                                {c.followersCount >= 1000000
                                                    ? "🟣 Mega"
                                                    : c.followersCount >= 200000
                                                    ? "🔵 Macro"
                                                    : c.followersCount >= 50000
                                                    ? "🟢 Mid-Tier"
                                                    : c.followersCount >= 10000
                                                    ? "🟡 Micro"
                                                    : "⚪ Nano"}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Category & Location */}
                                    <td className="px-3 py-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border w-fit ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                                                {c.category}
                                            </span>
                                            {c.city ? (
                                                <span className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-0.5">
                                                    <MapPinIcon className="w-2.5 h-2.5 text-slate-400" />
                                                    <span>{c.city}, {c.state}</span>
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-400">India</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Outreach Channels */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {c.primaryEmail ? (
                                                <span
                                                    title={c.primaryEmail}
                                                    className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-zinc-300 font-mono"
                                                >
                                                    <MailIcon className="w-3 h-3 text-slate-400" />
                                                    <span className="truncate max-w-28">{c.primaryEmail}</span>
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-300">No email</span>
                                            )}

                                            {(c.whatsappNumber || c.phone) && (
                                                <a
                                                    href={`https://wa.me/${(c.whatsappNumber || c.phone).replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold hover:bg-emerald-100 transition-colors"
                                                    title={`WhatsApp: ${c.whatsappNumber || c.phone}`}
                                                >
                                                    <PhoneIcon className="w-2.5 h-2.5 text-emerald-600" />
                                                    <span>WhatsApp</span>
                                                </a>
                                            )}
                                        </div>
                                    </td>

                                    {/* Intake Status Progress Bar */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="space-y-1 max-w-32">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className={`font-semibold flex items-center gap-1 ${
                                                    isEnriched ? "text-emerald-600 dark:text-emerald-400" : c.intakeStatus === "VIEWED" ? "text-amber-600" : "text-slate-500"
                                                }`}>
                                                    {isEnriched ? (
                                                        <>
                                                            <CheckCircle2Icon className="w-3 h-3" />
                                                            <span>100% Enriched</span>
                                                        </>
                                                    ) : c.intakeStatus === "VIEWED" ? (
                                                        <>
                                                            <EyeIcon className="w-3 h-3" />
                                                            <span>Form Opened</span>
                                                        </>
                                                    ) : c.intakeStatus === "SENT" ? (
                                                        <>
                                                            <SendIcon className="w-3 h-3" />
                                                            <span>Invite Sent</span>
                                                        </>
                                                    ) : (
                                                        <span>30% Baseline</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        isEnriched ? "bg-emerald-500" : c.intakeStatus === "VIEWED" ? "bg-amber-400" : "bg-[#FFE600]"
                                                    }`}
                                                    style={{ width: `${c.intakeCompletionPct || 30}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    {/* Action Buttons */}
                                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={(e) => copyIntakeLink(c, e)}
                                                className="h-7 px-2 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                                                title="Copy Personalized Intake Link"
                                            >
                                                <CopyIcon className="w-3 h-3" />
                                                <span className="hidden sm:inline">Link</span>
                                            </button>
                                            <a
                                                href={`${window.location.origin}/creator/intake/${c.intakeToken || c.id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="size-7 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                                title="Open Live Intake Form"
                                            >
                                                <ExternalLinkIcon className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Empty State */}
                {!loading && creators.length === 0 && (
                    <div className="p-12 text-center text-slate-400 space-y-2">
                        <LayersIcon className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">No creators found</p>
                        <p className="text-xs text-slate-400">Try broadening your search or resetting category filters.</p>
                    </div>
                )}
            </div>

            {/* Pagination Strip */}
            <div className="px-5 py-3 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-500 bg-[#FAF9F5] dark:bg-zinc-900/60">
                <span>
                    Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total.toLocaleString()} creators
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="size-7 rounded border border-slate-200 dark:border-zinc-700 flex items-center justify-center disabled:opacity-40 hover:bg-white cursor-pointer"
                    >
                        <ChevronLeftIcon className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200 px-1">
                        Page {page} of {totalPages || 1}
                    </span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                        className="size-7 rounded border border-slate-200 dark:border-zinc-700 flex items-center justify-center disabled:opacity-40 hover:bg-white cursor-pointer"
                    >
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Floating Selection Bar (Bulk Actions) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom duration-150 text-xs">
                    <span className="font-semibold bg-[#FFE600] text-slate-900 px-2 py-0.5 rounded-full text-[11px]">
                        {selectedIds.size} selected
                    </span>
                    <button
                        onClick={() => launchCampaignWithCreators()}
                        className="bg-amber-400/20 hover:bg-[#FFE600] text-[#FFE600] hover:text-slate-950 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                        <SendIcon className="w-3.5 h-3.5" />
                        <span>Launch Campaign</span>
                    </button>
                    <button
                        onClick={exportCsv}
                        className="hover:text-[#FFE600] font-medium flex items-center gap-1 cursor-pointer"
                    >
                        <DownloadIcon className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                    </button>
                    <button
                        onClick={() => {
                            const firstId = Array.from(selectedIds)[0];
                            const c = creators.find((cr) => cr.id === firstId);
                            if (c) {
                                const url = `${window.location.origin}/creator/intake/${c.intakeToken || c.id}`;
                                navigator.clipboard.writeText(url);
                                toast.success("Copied first creator intake link!");
                            }
                        }}
                        className="hover:text-[#FFE600] font-medium flex items-center gap-1 cursor-pointer"
                    >
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-slate-400 hover:text-white ml-1 cursor-pointer"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Slide-over Detail Drawer */}
            {selectedCreator && (
                <CreatorDetailDrawer
                    creator={selectedCreator}
                    onClose={() => setSelectedCreator(null)}
                />
            )}
        </div>
    );
}
