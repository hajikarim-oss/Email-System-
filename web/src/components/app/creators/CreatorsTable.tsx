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
    const [subGenre, setSubGenre] = useState(searchParams.get("subGenre") || "all");
    const [languageFilter, setLanguageFilter] = useState(searchParams.get("language") || "all");
    const [cityFilter, setCityFilter] = useState(searchParams.get("city") || "all");
    const [agencyFilter, setAgencyFilter] = useState(searchParams.get("agency") || "all");
    const [brandFilter, setBrandFilter] = useState(searchParams.get("brand") || "all");
    const [tier, setTier] = useState<string>(searchParams.get("tier") || "all");
    const [intakeStatus, setIntakeStatus] = useState<string>(searchParams.get("intakeStatus") || "all");
    const [channel, setChannel] = useState<string>(searchParams.get("channel") || "all");
    const [source, setSource] = useState<string>(searchParams.get("source") || "all");
    const [sortBy, setSortBy] = useState<string>("default");
    const [reverse, setReverse] = useState(false);
    const [verifiedIndianOnly, setVerifiedIndianOnly] = useState<boolean>(true);
    const [moreFiltersOpen, setMoreFiltersOpen] = useState<boolean>(false);

    // Live Creator Scout Engine states
    const [scoutPanelOpen, setScoutPanelOpen] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [scoutInput, setScoutInput] = useState("");
    const [scoutBrand, setScoutBrand] = useState("");
    const [scoutCategory, setScoutCategory] = useState("Skincare");
    const [scoutSearchEngine, setScoutSearchEngine] = useState<"both" | "instagram" | "google">("both");
    const [dbBrandSuggestions, setDbBrandSuggestions] = useState<Array<{ name: string; domain: string | null; categoryKey: string | null; totalContacts: number; creatorCount: number }>>([]);
    const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
    const [batchUrlsText, setBatchUrlsText] = useState("");
    const [isScouting, setIsScouting] = useState(false);
    const [scoutStepText, setScoutStepText] = useState("");
    const [syncingRowId, setSyncingRowId] = useState<string | null>(null);

    // Selected rows
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Drawer state
    const [selectedCreator, setSelectedCreator] = useState<any | null>(null);

    // Facets / Aggregation counts
    const [facets, setFacets] = useState<any>({
        categories: [],
        brands: [],
        tiers: [],
        statuses: [],
        overview: { total: 6445, emailReady: 4111, whatsappReady: 488, enriched: 43, referredCount: 1, newSignupsCount: 1, insightsReadyCount: 4 },
    });

    // Debounce search (snappy 200ms)
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 200);
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

    // Fetch Paginated Creators (fast DB search: autoScout=false during typing)
    const fetchCreators = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                search: debouncedSearch,
                category: category === "all" ? "" : category,
                subGenre: subGenre === "all" ? "" : subGenre,
                language: languageFilter === "all" ? "" : languageFilter,
                city: cityFilter === "all" ? "" : cityFilter,
                agency: agencyFilter === "all" ? "" : agencyFilter,
                brand: brandFilter === "all" ? "" : brandFilter,
                tier: tier === "all" ? "" : tier,
                intakeStatus: intakeStatus === "all" ? "" : intakeStatus,
                channel: channel === "all" ? "" : channel,
                source: source === "all" ? "" : source,
                sortBy,
                reverse: reverse ? "true" : "false",
                verifiedIndianOnly: verifiedIndianOnly ? "true" : "false",
                limit: String(limit),
                offset: String((page - 1) * limit),
            });

            const res = await fetch(`/api/creators?${params.toString()}`, {
                headers: authHeaders(),
            });
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
    }, [debouncedSearch, category, subGenre, languageFilter, cityFilter, agencyFilter, brandFilter, tier, intakeStatus, channel, source, sortBy, reverse, verifiedIndianOnly, page, limit]);

    // Fetch Live Brand Suggestions from Contacts DB (15,117+ brands) + Creator DB
    useEffect(() => {
        if (!scoutPanelOpen && !brandDropdownOpen) return;
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/creators/brands?q=${encodeURIComponent(scoutBrand)}&limit=15`, {
                    headers: authHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    setDbBrandSuggestions(data.brands || []);
                }
            } catch {
                // ignore
            }
        }, 160);
        return () => clearTimeout(timer);
    }, [scoutBrand, scoutPanelOpen, brandDropdownOpen]);

    // Live Scout & Auto-Store Handler (Single Handle/URL/Reel, Brand Discovery, or Batch URLs)
    const runLiveScout = async (opts?: { customInput?: string; customUrls?: string[]; customBrand?: string; customCategory?: string; customEngine?: "both" | "instagram" | "google" }) => {
        if (isScouting) return;
        const inputVal = (opts?.customInput ?? scoutInput).trim();
        const brandVal = (opts?.customBrand ?? scoutBrand).trim();
        const catVal = opts?.customCategory ?? scoutCategory;
        const engineVal = opts?.customEngine ?? scoutSearchEngine;
        const urlsList = opts?.customUrls || [];

        if (!inputVal && !brandVal && urlsList.length === 0) {
            toast.error("Enter an @handle, Instagram Reel/Profile URL, or Brand name to scout.");
            return;
        }

        setIsScouting(true);
        const engineLabel = engineVal === "instagram" ? "Instagram Profile Search" : engineVal === "google" ? "Google Reel Video Search" : "Instagram + Google Search";
        setScoutStepText(`1/4 Running ${engineLabel} & resolving handles/Reel shortcodes...`);
        const stepTimer1 = setTimeout(() => setScoutStepText("2/4 Verifying Indian creator authenticity & filtering out brand store accounts..."), 1100);
        const stepTimer2 = setTimeout(() => setScoutStepText("3/4 Deep mining Bio, Linktree & Serper talent agency contacts..."), 2400);
        const stepTimer3 = setTimeout(() => setScoutStepText("4/4 Auto-storing creator & generating intake form link..."), 3600);

        try {
            const res = await fetch("/api/creators/scout", {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: inputVal || undefined,
                    urls: urlsList.length > 0 ? urlsList : undefined,
                    brand: brandVal || undefined,
                    category: catVal && catVal !== "all" ? catVal : undefined,
                    searchEngine: engineVal,
                    limit: 15,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.status === "error") {
                throw new Error(data.message || "Could not scout creator from provided input.");
            }
            const found: any[] = data.creators || [];
            if (found.length > 0) {
                toast.success(
                    `Scouted & auto-stored ${found.length} creator${found.length === 1 ? "" : "s"} (${data.emailReadyCount || 0} with verified email)!`
                );
                // Prepend newly scouted creators to current view and refresh facets
                setCreators((prev) => {
                    const existingIds = new Set(found.map((f) => f.id));
                    return [...found, ...prev.filter((p) => !existingIds.has(p.id))];
                });
                fetchFacets();
                if (found.length === 1) {
                    setSelectedCreator(found[0]);
                }
                setScoutInput("");
                setBatchModalOpen(false);
                setBatchUrlsText("");
            } else {
                toast.error("No new creators found for that query.");
            }
        } catch (err: any) {
            toast.error(err?.message || "Live scouting failed");
        } finally {
            clearTimeout(stepTimer1);
            clearTimeout(stepTimer2);
            clearTimeout(stepTimer3);
            setIsScouting(false);
            setScoutStepText("");
        }
    };

    // On-Demand Row Insights & Contact Sync (Post-Facebook Approval / When Required)
    const syncRowInsights = async (creator: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (syncingRowId) return;
        setSyncingRowId(creator.id);
        try {
            const res = await fetch(`/api/creators/${encodeURIComponent(creator.id)}/sync-instagram`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ handle: creator.handle }),
            });
            if (!res.ok) throw new Error("Failed to fetch insights");
            const data = await res.json();
            const updated = data.creator;
            if (updated) {
                setCreators((prev) =>
                    prev.map((c) =>
                        c.id === creator.id
                            ? {
                                  ...c,
                                  ...updated,
                                  engagementRatePct: updated.instagramInsights?.engagementRatePct ?? c.engagementRatePct,
                                  avgLikes: updated.instagramInsights?.avgLikes ?? c.avgLikes,
                                  avgReelViews: updated.instagramInsights?.avgReelViews ?? c.avgReelViews,
                                  scoutFitScore: updated.instagramInsights?.scoutFitScore ?? c.scoutFitScore,
                              }
                            : c
                    )
                );
            }
            toast.success(`Fetched live insights & contacts for ${creator.handle}!`);
        } catch {
            toast.error(`Could not refresh insights for ${creator.handle}`);
        } finally {
            setSyncingRowId(null);
        }
    };

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
                            <span>Creator Scouting &amp; Intelligence Database</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FFE600] text-slate-900">
                                4-Tier Live Harvester
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 pt-0.5">
                            Search 6,445+ scouted creators, live-scout any Instagram Reel/Profile URL or Brand, auto-store contacts &amp; fetch insights on demand.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setScoutPanelOpen(!scoutPanelOpen)}
                            className={`h-8 px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                scoutPanelOpen
                                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                                    : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800"
                            }`}
                        >
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>{scoutPanelOpen ? "Hide Live Scout" : "Live Scout & Auto-Store"}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setBatchModalOpen(true)}
                            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                            <UploadIcon className="w-3.5 h-3.5" />
                            <span>Batch Ingest URLs</span>
                        </button>
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

                {/* Live Creator Scout & Auto-Store Command Bar */}
                {scoutPanelOpen && (
                    <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-gradient-to-r from-purple-50/60 via-white to-amber-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                                <h2 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <SparklesIcon className="w-3.5 h-3.5 text-purple-600" />
                                    <span>Unified Instagram Search + Google Reel Search Engine (15,117+ Contacts DB Brands + Any New Brand)</span>
                                </h2>
                                <p className="text-[11px] text-slate-500">
                                    Paste any @handle / Reel URL, or search any Brand (from our 15,117-brand Contacts DB or any brand-new company) across Instagram &amp; Google. Automatically filters out official brand store accounts and saves human Indian creators.
                                </p>
                            </div>
                            {/* Search Engine Mode Selector: Instagram + Google | Instagram Search | Google Reel Search */}
                            <div className="flex items-center gap-1 rounded-lg border border-purple-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5 text-[11px]">
                                {[
                                    { id: "both" as const, label: "⚡ Instagram + Google" },
                                    { id: "instagram" as const, label: "📸 Instagram Search" },
                                    { id: "google" as const, label: "🔎 Google Reel Search" },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setScoutSearchEngine(mode.id)}
                                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                            scoutSearchEngine === mode.id
                                                ? "bg-purple-600 text-white shadow-2xs"
                                                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-4">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    Instagram @Handle, Profile URL, or Reel URL
                                </label>
                                <input
                                    type="text"
                                    value={scoutInput}
                                    onChange={(e) => setScoutInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") runLiveScout();
                                    }}
                                    placeholder="e.g. @itistanyasingh or https://www.instagram.com/reel/DeecVUIyqsk/"
                                    className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                            </div>
                            <div className="md:col-span-4 relative">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 flex items-center justify-between mb-1">
                                    <span>Brand / Keyword (15,117+ Contacts DB or Any New Brand)</span>
                                    <span className="text-[9.5px] text-purple-600 font-medium">Dynamic • No Exclusions</span>
                                </label>
                                <input
                                    type="text"
                                    value={scoutBrand}
                                    onFocus={() => setBrandDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 180)}
                                    onChange={(e) => {
                                        setScoutBrand(e.target.value);
                                        setBrandDropdownOpen(true);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            setBrandDropdownOpen(false);
                                            runLiveScout();
                                        }
                                    }}
                                    placeholder="Search 15,117+ DB brands or type ANY new brand..."
                                    className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                                {brandDropdownOpen && (dbBrandSuggestions.length > 0 || scoutBrand.trim()) && (
                                    <div className="absolute z-40 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                                        {scoutBrand.trim() && !dbBrandSuggestions.some((b) => b.name.toLowerCase() === scoutBrand.trim().toLowerCase()) && (
                                            <button
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setBrandDropdownOpen(false);
                                                    runLiveScout({ customBrand: scoutBrand.trim() });
                                                }}
                                                className="w-full px-3 py-2 text-left hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-between gap-2 cursor-pointer"
                                            >
                                                <span className="font-semibold text-purple-700 dark:text-purple-300">
                                                    ✨ Scout New Brand: &ldquo;{scoutBrand.trim()}&rdquo;
                                                </span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-medium">
                                                    Live IG + Google
                                                </span>
                                            </button>
                                        )}
                                        {dbBrandSuggestions.map((b) => (
                                            <button
                                                key={b.name}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setScoutBrand(b.name);
                                                    setBrandDropdownOpen(false);
                                                }}
                                                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 cursor-pointer"
                                            >
                                                <div className="truncate">
                                                    <span className="font-semibold text-slate-900 dark:text-white">{b.name}</span>
                                                    {b.domain && (
                                                        <span className="ml-1.5 text-[10px] text-slate-400">({b.domain})</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                                    {b.creatorCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                                                            {b.creatorCount} creators
                                                        </span>
                                                    )}
                                                    {b.totalContacts > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            {b.totalContacts} contacts in DB
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    Vertical Category
                                </label>
                                <select
                                    value={scoutCategory}
                                    onChange={(e) => setScoutCategory(e.target.value)}
                                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium cursor-pointer"
                                >
                                    {[
                                        "Skincare",
                                        "Beauty",
                                        "Fashion",
                                        "Lifestyle",
                                        "Tech",
                                        "Food Blogger",
                                        "Chef / Home Chef",
                                        "Fitness",
                                        "Finance",
                                        "Trading & Stock Market",
                                        "Health",
                                        "Doctor",
                                        "Traveller",
                                        "Appliance Reviewer",
                                        "Haircare",
                                        "Men's Grooming",
                                        "Fragrance",
                                        "Jewellery & Accessories",
                                        "Home Decor",
                                        "Comedy",
                                        "Gaming",
                                        "Education",
                                        "AI & Productivity",
                                        "Business & Startup",
                                        "Family & Parenting",
                                        "Pet Parent",
                                        "Sports",
                                        "Automotive (Cars)",
                                        "Automotive (Bikes)",
                                        "Podcast",
                                        "Infotainment",
                                    ].map((catName) => (
                                        <option key={catName} value={catName}>
                                            {catName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <button
                                    type="button"
                                    disabled={isScouting}
                                    onClick={() => runLiveScout()}
                                    className="w-full h-8 px-3 rounded-md bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                    <SparklesIcon className={`w-3.5 h-3.5 ${isScouting ? "animate-spin" : ""}`} />
                                    <span>{isScouting ? "Scouting..." : "Scout & Store"}</span>
                                </button>
                            </div>
                        </div>

                        {isScouting && scoutStepText && (
                            <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-950/50 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800">
                                <RefreshCcwIcon className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
                                <span className="font-medium">{scoutStepText}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* StatStrip with 1-click filter shortcuts */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                    <div
                        onClick={() => {
                            setCategory("all");
                            setIntakeStatus("all");
                            setChannel("all");
                            setSource("all");
                            setPage(1);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            category === "all" && intakeStatus === "all" && channel === "all" && source === "all"
                                ? "border-slate-400 bg-white shadow-2xs"
                                : "border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300"
                        }`}
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
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            channel === "email"
                                ? "border-blue-400 bg-blue-50/50 shadow-2xs"
                                : "border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300"
                        }`}
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
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            channel === "phone"
                                ? "border-emerald-400 bg-emerald-50/50 shadow-2xs"
                                : "border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-slate-300"
                        }`}
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">WhatsApp / Phone Ready</span>
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {facets.overview.whatsappReady.toLocaleString()}
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            setIntakeStatus(intakeStatus === "COMPLETED" ? "all" : "COMPLETED");
                            setPage(1);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            intakeStatus === "COMPLETED"
                                ? "border-purple-400 bg-purple-50/50 shadow-2xs"
                                : "border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-purple-300"
                        }`}
                    >
                        <span className="text-[11px] font-medium text-slate-500 block">100% Enriched Roster</span>
                        <span className="text-lg font-bold text-[#5E43EC]">
                            {facets.overview.enriched.toLocaleString()}
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            setSource(source === "referred" ? "all" : "referred");
                            setCategory("all");
                            setIntakeStatus("all");
                            setPage(1);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            source === "referred"
                                ? "border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 shadow-2xs ring-1 ring-amber-400"
                                : "border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 hover:border-amber-300"
                        }`}
                    >
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center justify-between">
                            <span>Referred & New Talent</span>
                            <span className="text-[9px] bg-amber-200/90 text-amber-950 font-bold px-1.5 py-0.2 rounded-full">NEW</span>
                        </span>
                        <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                            {(facets.overview.referredCount ?? 0).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Unified Quick Command Bar (Brand, IG URL / @Handle / Keyword, Category, City + DB Filter / Scout Live) */}
                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        {/* Brand Name with 15,117+ DB Brands Autocomplete */}
                        <div className="md:col-span-3 relative">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10.5px] font-semibold text-slate-700 dark:text-zinc-300">
                                    Brand Name (DB or Any New Brand)
                                </label>
                                <span className="text-[9.5px] text-slate-400">15,117+ DB Brands</span>
                            </div>
                            <input
                                type="text"
                                value={scoutBrand}
                                onFocus={() => setBrandDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 180)}
                                onChange={(e) => {
                                    setScoutBrand(e.target.value);
                                    setBrandFilter(e.target.value.trim() || "all");
                                    setPage(1);
                                }}
                                placeholder="e.g. Atomberg, Nykaa, Hyphen..."
                                className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                            />
                            {brandDropdownOpen && dbBrandSuggestions.length > 0 && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                                    {dbBrandSuggestions.map((b) => (
                                        <button
                                            key={b.name}
                                            type="button"
                                            onMouseDown={() => {
                                                setScoutBrand(b.name);
                                                setBrandFilter(b.name);
                                                setBrandDropdownOpen(false);
                                                setPage(1);
                                            }}
                                            className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 cursor-pointer"
                                        >
                                            <span className="font-medium text-slate-800 dark:text-zinc-200 truncate">{b.name}</span>
                                            <span className="text-[10px] text-slate-400 shrink-0">
                                                {b.creatorCount > 0 ? `${b.creatorCount} creators` : `${b.totalContacts} contacts`}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Creator Keyword, Niche, @Handle or Instagram URL */}
                        <div className="md:col-span-3">
                            <label className="text-[10.5px] font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                                Creator Keyword, @Handle or IG URL
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && search.trim()) {
                                            setDebouncedSearch(search.trim());
                                            setPage(1);
                                        }
                                    }}
                                    placeholder="e.g. @anshuffle, instagram.com/..., skincare"
                                    className="w-full h-8 pl-2.5 pr-7 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch("");
                                            setDebouncedSearch("");
                                            setPage(1);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        <XIcon className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Vertical Category */}
                        <div className="md:col-span-2">
                            <label className="text-[10.5px] font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                                Vertical Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) => {
                                    setCategory(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-800 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Categories</option>
                                {(facets.categories || []).map((cat: any) => (
                                    <option key={cat.category} value={cat.category}>
                                        {cat.category} ({cat.count})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* City / Region */}
                        <div className="md:col-span-2">
                            <label className="text-[10.5px] font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                                City / Region (Optional)
                            </label>
                            <input
                                type="text"
                                value={cityFilter === "all" ? "" : cityFilter}
                                onChange={(e) => {
                                    setCityFilter(e.target.value.trim() || "all");
                                    setPage(1);
                                }}
                                placeholder="e.g. Mumbai, Delhi, Bangalore"
                                className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                            />
                        </div>

                        {/* DB Filter + Scout Live Buttons */}
                        <div className="md:col-span-2 flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setDebouncedSearch(search.trim());
                                    setPage(1);
                                    fetchCreators();
                                }}
                                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 text-slate-700 dark:text-zinc-200 text-xs font-medium shrink-0 cursor-pointer"
                            >
                                DB Filter
                            </button>
                            <button
                                type="button"
                                disabled={isScouting}
                                onClick={() => {
                                    const targetInput = search.trim() || scoutInput.trim();
                                    runLiveScout({
                                        customInput: targetInput || undefined,
                                        customBrand: scoutBrand.trim() || undefined,
                                        customCategory: category !== "all" ? category : undefined,
                                    });
                                }}
                                className="flex-1 h-8 px-2.5 rounded-md bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                                <SparklesIcon className={`w-3.5 h-3.5 text-[#FFE600] ${isScouting ? "animate-spin" : ""}`} />
                                <span>{isScouting ? "Scouting..." : "Scout Live"}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Horizontal Quick Category & Status Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
                    <button
                        type="button"
                        onClick={() => {
                            setCategory("all");
                            setIntakeStatus("all");
                            setSource("all");
                            setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full font-medium shrink-0 transition-all cursor-pointer ${
                            category === "all" && intakeStatus === "all" && source === "all"
                                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold shadow-2xs"
                                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                        }`}
                    >
                        All ({facets.overview.total})
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setSource(source === "referred" ? "all" : "referred");
                            setCategory("all");
                            setIntakeStatus("all");
                            setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                            source === "referred"
                                ? "bg-amber-500 text-slate-950 font-bold shadow-2xs ring-2 ring-amber-400/50"
                                : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                        }`}
                    >
                        <span>🤝 Referred Talent ({facets.overview.referredCount ?? 0})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setIntakeStatus(intakeStatus === "COMPLETED" ? "all" : "COMPLETED");
                            setCategory("all");
                            setSource("all");
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

                    {facets.categories.slice(0, 14).map((cat: any) => {
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

            {/* Smart Compact Filter Bar (Zero Duplicates, Collapsible Advanced Filters Tray) */}
            <div className="px-5 py-2.5 border-b border-slate-200/80 dark:border-zinc-800 flex flex-col gap-2 bg-white dark:bg-[#121212]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Follower Tier Segmented Control */}
                        <div className="flex items-center gap-0.5 border border-slate-200 dark:border-zinc-700 rounded-md p-0.5 bg-slate-50 dark:bg-zinc-900 text-xs font-medium">
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

                        {/* Smart Collapsible Advanced Filters Button */}
                        {(() => {
                            const advCount = [
                                subGenre !== "all",
                                languageFilter !== "all",
                                agencyFilter !== "all",
                                source !== "all",
                                intakeStatus !== "all",
                            ].filter(Boolean).length;
                            return (
                                <button
                                    type="button"
                                    onClick={() => setMoreFiltersOpen((v) => !v)}
                                    className={`h-8 px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                        moreFiltersOpen || advCount > 0
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900 shadow-2xs"
                                            : "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50"
                                    }`}
                                >
                                    <FilterIcon className="w-3.5 h-3.5" />
                                    <span>More Filters</span>
                                    {advCount > 0 && (
                                        <span className="px-1.5 py-0.2 rounded-full bg-[#FFE600] text-slate-950 text-[10px] font-bold">
                                            {advCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })()}

                        {/* Smart Multi-Signal Verified Indian Creators Toggle */}
                        <button
                            type="button"
                            onClick={() => {
                                setVerifiedIndianOnly(!verifiedIndianOnly);
                                setPage(1);
                            }}
                            title="Filters using implicit Indian signals (+91 WhatsApp, Indian D2C brands, cities, .in domains, Indic/Hinglish) and excludes official brand store accounts"
                            className={`h-8 px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                verifiedIndianOnly
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs"
                                    : "bg-white text-slate-600 border-slate-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700"
                            }`}
                        >
                        <span>🇮🇳 Verified Indian Creators</span>
                        {verifiedIndianOnly && <CheckIcon className="w-3 h-3 text-emerald-600" />}
                    </button>
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

                {/* Active Advanced Filter Chips (1-click remove) */}
                {(subGenre !== "all" || languageFilter !== "all" || agencyFilter !== "all" || source !== "all" || intakeStatus !== "all" || cityFilter !== "all" || brandFilter !== "all") && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-medium">Active:</span>
                        {brandFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-medium">
                                Brand: {brandFilter}
                                <button type="button" onClick={() => { setBrandFilter("all"); setScoutBrand(""); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {subGenre !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 font-medium">
                                Sub-Niche: {subGenre}
                                <button type="button" onClick={() => { setSubGenre("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {languageFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 font-medium">
                                Language: {languageFilter}
                                <button type="button" onClick={() => { setLanguageFilter("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {cityFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 font-medium">
                                📍 {cityFilter}
                                <button type="button" onClick={() => { setCityFilter("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {agencyFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 font-medium">
                                Agency: {agencyFilter}
                                <button type="button" onClick={() => { setAgencyFilter("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {source !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-medium">
                                Source: {source}
                                <button type="button" onClick={() => { setSource("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        {intakeStatus !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-medium">
                                Status: {intakeStatus}
                                <button type="button" onClick={() => { setIntakeStatus("all"); setPage(1); }} className="hover:text-rose-600 cursor-pointer">×</button>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setBrandFilter("all");
                                setScoutBrand("");
                                setCategory("all");
                                setSubGenre("all");
                                setLanguageFilter("all");
                                setCityFilter("all");
                                setAgencyFilter("all");
                                setSource("all");
                                setIntakeStatus("all");
                                setChannel("all");
                                setTier("all");
                                setPage(1);
                            }}
                            className="text-slate-500 hover:text-slate-900 dark:hover:text-white underline ml-1 cursor-pointer"
                        >
                            Clear all
                        </button>
                    </div>
                )}

                {/* Collapsible Smart 5-Column Advanced Filters Tray */}
                {moreFiltersOpen && (
                    <div className="p-3 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                        <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                                Sub-Category / Micro-Niche
                            </label>
                            <select
                                value={subGenre}
                                onChange={(e) => { setSubGenre(e.target.value); setPage(1); }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Sub-Categories</option>
                                {(facets.subGenres || []).map((sg: any) => (
                                    <option key={sg.subGenre} value={sg.subGenre}>
                                        {sg.subGenre} ({sg.count})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                                Language &amp; Diaspora
                            </label>
                            <select
                                value={languageFilter}
                                onChange={(e) => { setLanguageFilter(e.target.value); setPage(1); }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Languages &amp; Diaspora</option>
                                {["English", "Hindi", "Hinglish", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Punjabi", "Gujarati", "Odia", "Assamese", "Indian Diaspora"].map((lang) => {
                                    const found = (facets.languages || []).find((l: any) => l.language?.toLowerCase() === lang.toLowerCase());
                                    return (
                                        <option key={lang} value={lang}>
                                            {lang === "Indian Diaspora" ? "🌏 Indian Diaspora (NRI)" : lang}
                                            {found ? ` (${found.count})` : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                                Talent Agency
                            </label>
                            <select
                                value={agencyFilter}
                                onChange={(e) => { setAgencyFilter(e.target.value); setPage(1); }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Agencies</option>
                                {(facets.agencies || []).map((a: any) => (
                                    <option key={a.agency} value={a.agency}>
                                        {a.agency} ({a.count})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                                Source
                            </label>
                            <select
                                value={source}
                                onChange={(e) => { setSource(e.target.value); setPage(1); }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Sources</option>
                                <option value="referred">🤝 Referred Talent ({facets.overview.referredCount ?? 0})</option>
                                <option value="new">✨ All New Signups ({facets.overview.newSignupsCount ?? 0})</option>
                                <option value="scouted">Scouted Database</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                                Intake Status
                            </label>
                            <select
                                value={intakeStatus}
                                onChange={(e) => { setIntakeStatus(e.target.value); setPage(1); }}
                                className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                            >
                                <option value="all">All Intake Statuses</option>
                                <option value="COMPLETED">100% Enriched ({facets.overview.enriched})</option>
                                <option value="VIEWED">Form Opened / Viewed</option>
                                <option value="SENT">Outreach Invite Sent</option>
                                <option value="SCRAPED_BASELINE">30% Scraped Baseline</option>
                            </select>
                        </div>
                    </div>
                )}
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
                            <th className="px-3 py-2.5">Vertical &amp; Brand</th>
                            <th className="px-3 py-2.5">Insights &amp; Fit</th>
                            <th className="px-3 py-2.5">Outreach Channels</th>
                            <th className="px-3 py-2.5">Intake Status</th>
                            <th className="w-36 px-3 py-2.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-normal">
                        {creators.map((c) => {
                            const isSelected = selectedIds.has(c.id);
                            const isEnriched = c.intakeStatus === "COMPLETED" || (c.intakeCompletionPct && c.intakeCompletionPct >= 80);
                            const catStyle = CATEGORY_COLORS[c.category] || { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" };
                            const ig = (c.instagramInsights && typeof c.instagramInsights === "object") ? c.instagramInsights : {};
                            const erPct = c.engagementRatePct ?? ig.engagementRatePct;
                            const estViews = c.avgReelViews ?? ig.avgReelViews ?? ig.reach28d;
                            const fitScore = c.scoutFitScore ?? ig.scoutFitScore ?? (c.primaryEmail ? 78 : 42);
                            const isSyncingThisRow = syncingRowId === c.id;

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
                                                <div className="flex items-center gap-1.5 flex-wrap">
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
                                                    {c.sampleReelUrl && (
                                                        <a
                                                            href={c.sampleReelUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="Watch indexed Reel on Instagram"
                                                            className="inline-flex items-center gap-0.5 text-[9.5px] font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800 hover:bg-rose-100"
                                                        >
                                                            <VideoIcon className="w-2.5 h-2.5" />
                                                            <span>Reel</span>
                                                        </a>
                                                    )}
                                                    {c.discoveryKeyword?.startsWith("referral:") ? (
                                                        <span
                                                            title={`Referred by @${c.discoveryKeyword.replace(/^referral:/, "").trim()}`}
                                                            className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-amber-900 bg-amber-100/90 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded border border-amber-300/80"
                                                        >
                                                            🤝 Ref by @{c.discoveryKeyword.replace(/^referral:/, "").trim()}
                                                        </span>
                                                    ) : c.discoveryKeyword === "direct_submission" || c.discoveryKeyword === "organic_referral" ? (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-sky-900 bg-sky-100/90 dark:bg-sky-950/60 dark:text-sky-300 px-1.5 py-0.2 rounded border border-sky-300/80">
                                                            ✨ New Signup
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Followers & Tier */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                                                {c.followersRaw || (c.followersCount ? `${(c.followersCount / 1000).toFixed(1)}K` : "–")}
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

                                    {/* Category, Brand & Location */}
                                    <td className="px-3 py-2">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border w-fit ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                                                    {c.category}
                                                </span>
                                                {c.brandAffinity && (
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                                                        {c.brandAffinity}
                                                    </span>
                                                )}
                                            </div>
                                            {c.city ? (
                                                <span className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                                                    <MapPinIcon className="w-2.5 h-2.5 text-slate-400" />
                                                    <span>{c.city}{c.state ? `, ${c.state}` : ""}</span>
                                                    <span
                                                        title={`Multi-Signal India Score: ${c.indiaConfidenceScore || 85}% (${(c.indiaSignals || []).join(" · ")})`}
                                                        className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400"
                                                    >
                                                        · 🇮🇳 {c.indiaConfidenceScore || 85}%
                                                    </span>
                                                </span>
                                            ) : (
                                                <span
                                                    title={`Multi-Signal India Score: ${c.indiaConfidenceScore || 75}% (${(c.indiaSignals || []).join(" · ") || "Indian Brand & Google India SERP"})`}
                                                    className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium"
                                                >
                                                    🇮🇳 India Verified ({c.indiaConfidenceScore || 75}%)
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* On-Demand Insights & Fit Score */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    {erPct ? (
                                                        <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                                                            {erPct}% ER
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10.5px] text-slate-400">Insights ready</span>
                                                    )}
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
                                                        Fit {fitScore}
                                                    </span>
                                                </div>
                                                {estViews ? (
                                                    <span className="text-[10px] text-slate-400">
                                                        ~{estViews >= 1000 ? `${(estViews / 1000).toFixed(1)}K` : estViews} views/reel
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => syncRowInsights(c, e)}
                                                        disabled={isSyncingThisRow}
                                                        className="text-[10px] text-[#5E43EC] hover:underline font-medium text-left flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <RefreshCcwIcon className={`w-2.5 h-2.5 ${isSyncingThisRow ? "animate-spin" : ""}`} />
                                                        <span>{isSyncingThisRow ? "Fetching..." : "Fetch Insights"}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Outreach Channels */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {c.primaryEmail ? (
                                                <div className="flex flex-col">
                                                    <span
                                                        title={c.primaryEmail}
                                                        className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-zinc-300 font-mono"
                                                    >
                                                        <MailIcon className="w-3 h-3 text-slate-400" />
                                                        <span className="truncate max-w-28">{c.primaryEmail}</span>
                                                    </span>
                                                    {(c.agencyEmail || c.agencyName) && (
                                                        <span className="text-[9.5px] text-purple-600 dark:text-purple-400 font-medium truncate max-w-28">
                                                            Agency: {c.agencyName || c.agencyEmail}
                                                        </span>
                                                    )}
                                                </div>
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
                                                    isEnriched ? "text-emerald-600 dark:text-emerald-400" : c.intakeStatus === "VIEWED" || c.intakeStatus === "FORM_OPENED" ? "text-amber-600" : "text-slate-500"
                                                }`}>
                                                    {isEnriched ? (
                                                        <>
                                                            <CheckCircle2Icon className="w-3 h-3" />
                                                            <span>100% Enriched</span>
                                                        </>
                                                    ) : c.intakeStatus === "VIEWED" || c.intakeStatus === "FORM_OPENED" ? (
                                                        <>
                                                            <EyeIcon className="w-3 h-3" />
                                                            <span>Form Opened</span>
                                                        </>
                                                    ) : c.intakeStatus === "SENT" || c.intakeStatus === "INVITATION_SENT" ? (
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
                                                        isEnriched ? "bg-emerald-500" : c.intakeStatus === "VIEWED" || c.intakeStatus === "FORM_OPENED" ? "bg-amber-400" : "bg-[#FFE600]"
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
                                                type="button"
                                                onClick={(e) => syncRowInsights(c, e)}
                                                disabled={isSyncingThisRow}
                                                className="size-7 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-purple-700 dark:hover:text-purple-300 flex items-center justify-center transition-colors cursor-pointer"
                                                title="Fetch / Refresh Live Insights & Contacts"
                                            >
                                                <RefreshCcwIcon className={`w-3.5 h-3.5 ${isSyncingThisRow ? "animate-spin text-purple-600" : ""}`} />
                                            </button>
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

                {/* Empty State with 1-Click Live Scout from Instagram */}
                {!loading && creators.length === 0 && (
                    <div className="p-12 text-center text-slate-400 space-y-3">
                        <LayersIcon className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                            {search ? `No creator matching "${search}" in database yet` : "No creators found"}
                        </p>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                            {search
                                ? "Click below to live-scout this @handle, Instagram URL, or Brand directly from Instagram & Serper and auto-store it into your database."
                                : "Try broadening your search or resetting category filters."}
                        </p>
                        {search && (
                            <button
                                type="button"
                                disabled={isScouting}
                                onClick={() => runLiveScout({ customInput: search })}
                                className="mt-2 h-8 px-4 rounded-md bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                                <SparklesIcon className={`w-3.5 h-3.5 ${isScouting ? "animate-spin" : ""}`} />
                                <span>{isScouting ? "Scouting Live..." : `Live Scout & Auto-Store "${search}"`}</span>
                            </button>
                        )}
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

            {/* Batch Ingest Reel / Profile URLs Modal */}
            {batchModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4"
                    onClick={() => !isScouting && setBatchModalOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <SparklesIcon className="w-4 h-4 text-purple-600" />
                                    <span>Batch Ingest Instagram Reel &amp; Profile URLs</span>
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Paste Instagram Reel links, Profile URLs, or @handles (one per line). Every profile is enriched and auto-stored in PostgreSQL.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !isScouting && setBatchModalOpen(false)}
                                className="size-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                                    Instagram Reel URLs, Profile Links, or @Handles
                                </label>
                                <textarea
                                    rows={6}
                                    value={batchUrlsText}
                                    onChange={(e) => setBatchUrlsText(e.target.value)}
                                    placeholder={"https://www.instagram.com/reel/DeecVUIyqsk/\nhttps://www.instagram.com/itistanyasingh/\n@prableenkaurbhomrah"}
                                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                        Brand Context (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={scoutBrand}
                                        onChange={(e) => setScoutBrand(e.target.value)}
                                        placeholder="e.g. Hyphen, boAt..."
                                        className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                        Category Tag
                                    </label>
                                    <select
                                        value={scoutCategory}
                                        onChange={(e) => setScoutCategory(e.target.value)}
                                        className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                                    >
                                        {["Skincare", "Beauty", "Fashion", "Lifestyle", "Tech", "Food Blogger", "Fitness", "Finance", "Traveller"].map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {isScouting && scoutStepText && (
                                <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <RefreshCcwIcon className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
                                    <span className="font-medium">{scoutStepText}</span>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3.5 bg-slate-50 dark:bg-zinc-900/90 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() =>
                                    setBatchUrlsText(
                                        "https://www.instagram.com/reel/DeecVUIyqsk/\nhttps://www.instagram.com/itistanyasingh/\nhttps://www.instagram.com/letshyphen/"
                                    )
                                }
                                className="text-xs text-purple-600 hover:underline font-medium cursor-pointer"
                            >
                                Load sample links
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={isScouting}
                                    onClick={() => setBatchModalOpen(false)}
                                    className="h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={isScouting || !batchUrlsText.trim()}
                                    onClick={() => {
                                        const lines = batchUrlsText
                                            .split(/[\r\n,]+/)
                                            .map((l) => l.trim())
                                            .filter(Boolean);
                                        runLiveScout({ customUrls: lines });
                                    }}
                                    className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                    <SparklesIcon className={`w-3.5 h-3.5 ${isScouting ? "animate-spin" : ""}`} />
                                    <span>{isScouting ? "Ingesting & Enriching..." : "Ingest & Auto-Store (4-Tier)"}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Slide-over Detail Drawer */}
            {selectedCreator && (
                <CreatorDetailDrawer
                    creator={selectedCreator}
                    onClose={() => setSelectedCreator(null)}
                    onUpdate={(updated) => {
                        setSelectedCreator(updated);
                        setCreators((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
                    }}
                />
            )}
        </div>
    );
}
