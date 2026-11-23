import React, { useState, useEffect, useCallback } from "react";
import {
    SearchIcon,
    SparklesIcon,
    ExternalLinkIcon,
    CopyIcon,
    MailIcon,
    PhoneIcon,
    RefreshCcwIcon,
    CheckCircle2Icon,
    CheckIcon,
    VideoIcon,
    SendIcon,
    MapPinIcon,
    LayersIcon,
    GlobeIcon,
    UploadIcon,
    DownloadIcon,
    EyeIcon,
    XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { authHeaders } from "@/lib/api/standaloneMock";
import CreatorDetailDrawer from "@/components/app/creators/CreatorDetailDrawer";

// Exact website Category badge color schemes (matching CreatorsTable.tsx)
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Skincare: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800" },
    Fashion: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
    "Fashion & Styling": { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
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

const VERTICAL_CATEGORIES = [
    "All Categories",
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
];

export default function CreatorSearchPage() {
    const navigate = useNavigate();

    // Search Modes: "brand_or_query" | "handle_or_url" | "batch_urls"
    const [searchMode, setSearchMode] = useState<"brand_or_query" | "handle_or_url" | "batch_urls">("brand_or_query");
    const [searchEngine, setSearchEngine] = useState<"both" | "instagram" | "google">("both");

    // Filters & Inputs
    const [queryText, setQueryText] = useState("");
    const [brandText, setBrandText] = useState("");
    const [categoryText, setCategoryText] = useState("All Categories");
    const [languageFilter, setLanguageFilter] = useState("all");
    const [cityText, setCityText] = useState("");
    const [tier, setTier] = useState<string>("all");
    const [channel, setChannel] = useState<string>("all");
    const [directHandleOrUrl, setDirectHandleOrUrl] = useState("");
    const [batchUrlsText, setBatchUrlsText] = useState("");
    const [verifiedIndianOnly, setVerifiedIndianOnly] = useState(true);

    // Live Brand Autocomplete from 15,117+ Contacts DB
    const [dbBrands, setDbBrands] = useState<Array<{ name: string; domain: string; totalContacts: number; creatorCount: number }>>([]);
    const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
    const [matchedDbBrandInfo, setMatchedDbBrandInfo] = useState<{ name: string; domain: string; totalContacts: number } | null>(null);

    // Facets & Results
    const [facets, setFacets] = useState<any>({
        categories: [],
        brands: [],
        overview: { total: 6445, emailReady: 4111, whatsappReady: 488, enriched: 55, referredCount: 1 },
    });
    const [results, setResults] = useState<any[]>([]);
    const [dbTotal, setDbTotal] = useState(0);
    const [isSearchingDb, setIsSearchingDb] = useState(false);
    const [isLiveScouting, setIsLiveScouting] = useState(false);
    const [queueStatus, setQueueStatus] = useState<{
        active: boolean;
        phase: string;
        completed: number;
        total: number;
        newCount: number;
        emailFoundCount: number;
    }>({
        active: false,
        phase: "",
        completed: 0,
        total: 0,
        newCount: 0,
        emailFoundCount: 0,
    });

    // Selection & Drawer
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedCreator, setSelectedCreator] = useState<any | null>(null);
    const [syncingRowId, setSyncingRowId] = useState<string | null>(null);

    // 24/7 BFS Tree Harvest Queue State
    const [harvestQueue, setHarvestQueue] = useState<{
        pending: number;
        processing: number;
        completed: number;
        completedWithEmail: number;
        expandedSeeds: number;
        activeMetaTokens: number;
        dailyFreeCapacity: number;
        lookalikeProvider: string;
    } | null>(null);
    const [harvestSeedInput, setHarvestSeedInput] = useState("");
    const [isSeedingHarvest, setIsSeedingHarvest] = useState(false);
    const [isTickingHarvest, setIsTickingHarvest] = useState(false);

    const fetchHarvestQueueStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/creators/harvest/status", { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setHarvestQueue(data);
            }
        } catch {}
    }, []);

    // Fetch Facets
    const fetchFacets = useCallback(async () => {
        try {
            const res = await fetch("/api/creators/facets", { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setFacets(data);
            }
        } catch {}
    }, []);

    useEffect(() => {
        fetchFacets();
        fetchHarvestQueueStatus();
    }, [fetchFacets, fetchHarvestQueueStatus]);

    // Fetch Live Brand Suggestions from 15,117+ Contacts DB ("Brand" table)
    useEffect(() => {
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/creators/brands?q=${encodeURIComponent(brandText)}&limit=15`, {
                    headers: authHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    setDbBrands(data.brands || []);
                }
            } catch {}
        }, 160);
        return () => clearTimeout(timer);
    }, [brandText]);

    // Query existing PostgreSQL Creator Database
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const searchExistingDatabase = useCallback(
        async (override?: { q?: string; brand?: string; cat?: string; lang?: string; city?: string; tier?: string; channel?: string; offset?: number; append?: boolean }) => {
            if (override?.append) setIsLoadingMore(true);
            else setIsSearchingDb(true);
            try {
                const qVal = (override?.q ?? queryText).trim();
                const bVal = (override?.brand ?? brandText).trim();
                const cVal = override?.cat ?? categoryText;
                const langVal = override?.lang ?? languageFilter;
                const cityVal = (override?.city ?? cityText).trim();
                const tierVal = override?.tier ?? tier;
                const chanVal = override?.channel ?? channel;
                const offsetVal = override?.offset ?? 0;

                const combinedSearch = [qVal, cityVal].filter(Boolean).join(" ").trim();
                const params = new URLSearchParams({
                    search: combinedSearch,
                    brand: bVal,
                    category: cVal === "All Categories" ? "" : cVal,
                    language: langVal === "all" ? "" : langVal,
                    tier: tierVal === "all" ? "" : tierVal,
                    channel: chanVal === "all" ? "" : chanVal,
                    verifiedIndianOnly: verifiedIndianOnly ? "true" : "false",
                    limit: "50",
                    offset: String(offsetVal),
                });

                const res = await fetch(`/api/creators?${params.toString()}`, { headers: authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    const incoming = data.creators || [];
                    if (override?.append) {
                        setResults((prev) => {
                            const seen = new Set(prev.map((p) => p.id));
                            return [...prev, ...incoming.filter((c: any) => !seen.has(c.id))];
                        });
                    } else {
                        setResults(incoming);
                    }
                    setDbTotal(data.total || 0);
                }
            } catch {
                toast.error("Failed to query creator database");
            } finally {
                setIsSearchingDb(false);
                setIsLoadingMore(false);
            }
        },
        [queryText, brandText, categoryText, languageFilter, cityText, tier, channel, verifiedIndianOnly]
    );

    useEffect(() => {
        searchExistingDatabase();
    }, [verifiedIndianOnly, tier, channel, languageFilter]);

    // Progressive 2-Phase Live Discovery & Auto-Store
    const runProgressiveLiveSearch = async (customBrand?: string) => {
        if (isLiveScouting) return;

        // Mode 2: Single @Handle, Profile URL, or Reel URL
        if (searchMode === "handle_or_url") {
            const input = directHandleOrUrl.trim();
            if (!input) {
                toast.error("Paste an Instagram @handle, Profile URL, or Reel URL.");
                return;
            }
            setIsLiveScouting(true);
            setQueueStatus({
                active: true,
                phase: `Resolving ${input} & mining Bio / Linktree / Serper contacts...`,
                completed: 0,
                total: 1,
                newCount: 0,
                emailFoundCount: 0,
            });
            try {
                const res = await fetch("/api/creators/scout", {
                    method: "POST",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input,
                        brand: brandText.trim() || undefined,
                        category: categoryText !== "All Categories" ? categoryText : undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok || data.status === "error") {
                    throw new Error(data.message || "Could not fetch creator from Instagram.");
                }
                const found: any[] = data.creators || [];
                if (found.length > 0) {
                    setResults((prev) => {
                        const ids = new Set(found.map((f) => f.id));
                        return [...found, ...prev.filter((p) => !ids.has(p.id))];
                    });
                    setSelectedCreator(found[0]);
                    toast.success(`Fetched & auto-stored ${found[0].handle} in database!`);
                    setDirectHandleOrUrl("");
                }
            } catch (e: any) {
                toast.error(e?.message || "Failed to fetch Instagram creator");
            } finally {
                setIsLiveScouting(false);
                setQueueStatus((prev) => ({ ...prev, active: false }));
            }
            return;
        }

        // Mode 3: Batch Instagram Reel / Profile URLs
        if (searchMode === "batch_urls") {
            const urls = batchUrlsText
                .split(/[\r\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
            if (urls.length === 0) {
                toast.error("Paste at least one Instagram Reel or Profile URL.");
                return;
            }
            await enrichCandidateQueue(urls, brandText.trim(), categoryText !== "All Categories" ? categoryText : undefined);
            return;
        }

        // Mode 1: Unified Instagram Search + Google Reel Search by Brand / Keyword / Category
        const activeBrand = (customBrand ?? brandText).trim();
        const activeQuery = queryText.trim();
        const activeCat = categoryText !== "All Categories" ? categoryText : "";
        const activeCity = cityText.trim();

        // Direct @handle or instagram.com link pasted in keyword box
        if (
            activeQuery.includes("instagram.com/") ||
            activeQuery.startsWith("@") ||
            (/^[a-zA-Z0-9_.]{3,30}$/.test(activeQuery) && (activeQuery.includes("_") || activeQuery.includes(".")))
        ) {
            setIsLiveScouting(true);
            setQueueStatus({
                active: true,
                phase: `Fetching live profile & contacts for ${activeQuery}...`,
                completed: 0,
                total: 1,
                newCount: 0,
                emailFoundCount: 0,
            });
            try {
                const res = await fetch("/api/creators/scout", {
                    method: "POST",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input: activeQuery,
                        brand: activeBrand || undefined,
                        category: activeCat || undefined,
                    }),
                });
                const data = await res.json();
                const found: any[] = data.creators || [];
                if (found.length > 0) {
                    setResults((prev) => {
                        const ids = new Set(found.map((f) => f.id));
                        return [...found, ...prev.filter((p) => !ids.has(p.id))];
                    });
                    setSelectedCreator(found[0]);
                    toast.success(`Scouted & auto-stored ${found[0].handle}!`);
                } else {
                    toast.error("Could not resolve that Instagram handle/URL.");
                }
            } finally {
                setIsLiveScouting(false);
                setQueueStatus((prev) => ({ ...prev, active: false }));
            }
            return;
        }

        if (!activeBrand && !activeQuery && !activeCat) {
            toast.error("Enter a Brand name, Niche keyword, or select a Category to search.");
            return;
        }

        // Step A: Immediately load existing DB matches
        await searchExistingDatabase({ q: activeQuery, brand: activeBrand, cat: categoryText, city: activeCity });

        // Step B: Phase 1 Fast Candidate Discovery (< 2s)
        setIsLiveScouting(true);
        setQueueStatus({
            active: true,
            phase: `Phase 1: Searching ${searchEngine === "instagram" ? "Instagram Profiles" : searchEngine === "google" ? "Google Reels" : "Instagram + Google"} for "${[activeBrand, activeQuery, activeCat, activeCity].filter(Boolean).join(" ")}"...`,
            completed: 0,
            total: 0,
            newCount: 0,
            emailFoundCount: 0,
        });

        try {
            const discRes = await fetch("/api/creators/scout/discover", {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    brand: activeBrand || undefined,
                    keyword: activeQuery || undefined,
                    category: activeCat || undefined,
                    city: activeCity || undefined,
                    searchEngine,
                    limit: 15,
                }),
            });
            const discData = await discRes.json();
            if (discData?.matchedDbBrand) {
                setMatchedDbBrandInfo(discData.matchedDbBrand);
            } else {
                setMatchedDbBrandInfo(null);
            }

            const candidateUrls: string[] = Array.isArray(discData?.candidateUrls) ? discData.candidateUrls : [];
            if (candidateUrls.length === 0) {
                toast.success("Loaded matching creators from database.");
                setIsLiveScouting(false);
                setQueueStatus((prev) => ({ ...prev, active: false }));
                return;
            }

            // Step C: Phase 2 Progressive Batch Enrichment (3 at a time)
            await enrichCandidateQueue(candidateUrls, activeBrand || activeQuery, activeCat || undefined);
        } catch (err: any) {
            toast.error(err?.message || "Live discovery error");
            setIsLiveScouting(false);
            setQueueStatus((prev) => ({ ...prev, active: false }));
        }
    };

    const enrichCandidateQueue = async (urls: string[], brandVal?: string, catVal?: string) => {
        setIsLiveScouting(true);
        const total = urls.length;
        let completed = 0;
        let newCount = 0;
        let emailFoundCount = 0;

        setQueueStatus({
            active: true,
            phase: `Phase 2: Verifying Indian human creators & mining contacts (0/${total})...`,
            completed: 0,
            total,
            newCount: 0,
            emailFoundCount: 0,
        });

        const BATCH_SIZE = 3;
        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
            const slice = urls.slice(i, i + BATCH_SIZE);
            try {
                const res = await fetch("/api/creators/scout", {
                    method: "POST",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({
                        urls: slice,
                        brand: brandVal || undefined,
                        category: catVal || undefined,
                        searchEngine,
                        limit: BATCH_SIZE,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const batchCreators: any[] = (data.creators || []).filter((c: any) => {
                        if (c.instagramInsights?.isBrandOrStoreAccount) return false;
                        if (verifiedIndianOnly && c.instagramInsights?.isIndianCreator === false) return false;
                        return true;
                    });
                    if (batchCreators.length > 0) {
                        newCount += batchCreators.filter((c) => c.isNewInDb).length;
                        emailFoundCount += batchCreators.filter((c) => Boolean(c.primaryEmail)).length;
                        setResults((prev) => {
                            const incomingHandles = new Set(batchCreators.map((c) => (c.handle || "").toLowerCase()));
                            return [...batchCreators, ...prev.filter((p) => !incomingHandles.has((p.handle || "").toLowerCase()))];
                        });
                    }
                }
            } catch {}

            completed = Math.min(total, i + slice.length);
            setQueueStatus({
                active: true,
                phase: `Phase 2: Enriched & auto-stored ${completed}/${total} candidates (${emailFoundCount} with verified email)...`,
                completed,
                total,
                newCount,
                emailFoundCount,
            });
        }

        toast.success(`Live search complete! Auto-stored results (${emailFoundCount} email-ready).`);
        fetchFacets();
        setIsLiveScouting(false);
        setTimeout(() => {
            setQueueStatus((prev) => ({ ...prev, active: false }));
        }, 2500);
    };

    // Engine 1: 1-Click Lookalike / Similar Creators Graph Expansion (1 -> 50 Lookalikes in exact micro-niche)
    const expandSimilarCreators = async (creator: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLiveScouting) return;
        const seedHandle = creator.handle || "";
        if (!seedHandle) return;

        setIsLiveScouting(true);
        setQueueStatus({
            active: true,
            phase: `Engine 1: Fetching 50 Instagram lookalike creators similar to ${seedHandle}...`,
            completed: 0,
            total: 0,
            newCount: 0,
            emailFoundCount: 0,
        });

        try {
            const res = await fetch("/api/creators/scout/similar", {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ handle: seedHandle, limit: 15 }),
            });
            const data = await res.json();
            const candidateUrls: string[] = Array.isArray(data?.candidateUrls) ? data.candidateUrls : [];
            if (candidateUrls.length === 0) {
                toast.error(`No similar creators returned for ${seedHandle}`);
                setIsLiveScouting(false);
                setQueueStatus((prev) => ({ ...prev, active: false }));
                return;
            }
            toast.success(`Discovered ${candidateUrls.length} lookalikes for ${seedHandle}! Enriching & auto-storing...`);
            await enrichCandidateQueue(candidateUrls, creator.brandAffinity || undefined, creator.category || undefined);
        } catch {
            toast.error(`Lookalike expansion failed for ${seedHandle}`);
            setIsLiveScouting(false);
            setQueueStatus((prev) => ({ ...prev, active: false }));
        }
    };

    // On-Demand Row Insights & Contact Sync
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
            if (!res.ok) throw new Error("Sync failed");
            const data = await res.json();
            const updated = data.creator;
            if (updated) {
                setResults((prev) =>
                    prev.map((c) =>
                        c.id === creator.id
                            ? {
                                  ...c,
                                  ...updated,
                                  engagementRatePct: updated.instagramInsights?.engagementRatePct ?? c.engagementRatePct,
                                  avgLikes: updated.instagramInsights?.avgLikes ?? c.avgLikes,
                                  avgReelViews: updated.instagramInsights?.avgReelViews ?? c.avgReelViews,
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

    const copyIntakeLink = (creator: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}/creator/intake/${creator.intakeToken || creator.id}`;
        navigator.clipboard.writeText(url);
        toast.success(`Copied intake link for ${creator.handle}`);
    };

    const exportCsv = () => {
        const rowsToExport = results.filter((c) => selectedIds.has(c.id));
        const target = rowsToExport.length > 0 ? rowsToExport : results;
        const headers = ["Handle", "Full Name", "Category", "Brand", "Followers", "Email", "WhatsApp", "City", "Intake Status", "Intake URL"];
        const csvContent = [
            headers.join(","),
            ...target.map((c) =>
                [
                    `"${c.handle}"`,
                    `"${(c.fullName || "").replace(/"/g, '""')}"`,
                    `"${c.category || ""}"`,
                    `"${c.brandAffinity || ""}"`,
                    `"${c.followersRaw || ""}"`,
                    `"${c.primaryEmail || ""}"`,
                    `"${c.whatsappNumber || c.phone || ""}"`,
                    `"${c.city || ""}"`,
                    `"${c.intakeStatus || ""}"`,
                    `"${window.location.origin}/creator/intake/${c.intakeToken || c.id}"`,
                ].join(",")
            ),
        ].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `TBM_Creators_Search_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${target.length} creators!`);
    };

    const launchCampaignWithCreators = (list?: any[]) => {
        const rawList = list || (selectedIds.size > 0 ? results.filter((c) => selectedIds.has(c.id)) : []);
        const withEmail = rawList.filter((c) => Boolean(c.primaryEmail));
        if (rawList.length > 0 && withEmail.length === 0) {
            toast.error("Selected creators do not have email addresses yet. Click the refresh icon on the row to mine their email.");
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
            sessionStorage.setItem("tbm_creator_campaign_draft_leads", JSON.stringify(drafts));
            toast.success(`Loaded ${withEmail.length} creators with personalized intake form links into Campaign Builder!`);
        }
        navigate("/app/creators/campaigns?enroll=1");
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === results.length && results.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.map((c) => c.id)));
        }
    };

    const handleSeedHarvestTree = async () => {
        const seed = harvestSeedInput.trim();
        if (!seed) {
            toast.error("Paste an Instagram @handle or profile URL to seed the BFS tree");
            return;
        }
        setIsSeedingHarvest(true);
        const toastId = toast.loading(`Expanding lookalike tree from ${seed}...`);
        try {
            const res = await fetch("/api/creators/harvest/seed", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    seed,
                    category: categoryText !== "All Categories" ? categoryText : undefined,
                    limit: 55,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.message || "Failed to seed tree", { id: toastId });
                return;
            }
            if (data.queue) setHarvestQueue(data.queue);
            setHarvestSeedInput("");
            toast.success(
                `Queued ${data.enqueued || 0} new lookalikes from @${data.seedHandle} via ${data.provider || "provider"}`,
                { id: toastId }
            );
        } catch {
            toast.error("Failed to connect to harvest queue", { id: toastId });
        } finally {
            setIsSeedingHarvest(false);
        }
    };

    const handleTickHarvestQueue = async () => {
        setIsTickingHarvest(true);
        const toastId = toast.loading("Hydrating next 4 queued creators via Meta Graph ($0)...");
        try {
            const res = await fetch("/api/creators/harvest/tick", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ batchSize: 4 }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.message || "Batch hydration failed", { id: toastId });
                return;
            }
            if (data.queue) setHarvestQueue(data.queue);
            toast.success(
                `Processed ${data.processed || 0}: ${data.stored || 0} stored (${data.withEmail || 0} with email)`,
                { id: toastId }
            );
            searchExistingDatabase();
            fetchFacets();
        } catch {
            toast.error("Batch hydration request failed", { id: toastId });
        } finally {
            setIsTickingHarvest(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#121212]">
            {/* Topbar matching CreatorsTable.tsx exact UI */}
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-zinc-800 flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Search &amp; Discover Creators</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FFE600] text-slate-900">
                                Instagram + Google Engine
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 pt-0.5">
                            Search any creator by @handle, Instagram URL, or Brand (across 15,117+ Contacts DB brands or any new brand), auto-store contacts &amp; fetch insights on demand.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Search Engine Segmented Control */}
                        <div className="flex items-center gap-1 border border-slate-200 dark:border-zinc-700 rounded-md p-0.5 bg-slate-50 dark:bg-zinc-900 text-xs font-medium">
                            {[
                                { id: "both" as const, label: "Instagram + Google" },
                                { id: "instagram" as const, label: "Instagram Search" },
                                { id: "google" as const, label: "Google Reel Search" },
                            ].map((eng) => (
                                <button
                                    key={eng.id}
                                    type="button"
                                    onClick={() => setSearchEngine(eng.id)}
                                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                                        searchEngine === eng.id
                                            ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-semibold shadow-2xs"
                                            : "text-slate-500 hover:text-slate-800"
                                    }`}
                                >
                                    {eng.label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                searchExistingDatabase();
                                fetchFacets();
                                fetchHarvestQueueStatus();
                            }}
                            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                            <RefreshCcwIcon className={`w-3.5 h-3.5 ${isSearchingDb ? "animate-spin" : ""}`} />
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

                {/* Live 24/7 BFS Tree Harvest Queue Control Strip */}
                {harvestQueue && (
                    <div className="px-3.5 py-2 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 flex items-center justify-between flex-wrap gap-2.5 text-xs">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                BFS Tree Harvester
                            </span>
                            <span className="text-slate-600 dark:text-zinc-400">
                                Queue: <strong className="text-slate-900 dark:text-white">{harvestQueue.pending.toLocaleString()}</strong> pending
                                {" · "}
                                <strong className="text-emerald-700 dark:text-emerald-400">{harvestQueue.completed.toLocaleString()}</strong> hydrated
                                {harvestQueue.completedWithEmail > 0 && (
                                    <span className="text-slate-500"> ({harvestQueue.completedWithEmail.toLocaleString()} emails)</span>
                                )}
                            </span>
                            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 text-[11px] text-slate-600 dark:text-zinc-300">
                                Meta Tokens: <strong className="text-slate-900 dark:text-white">{harvestQueue.activeMetaTokens}</strong>
                                {" · "}
                                <strong>{harvestQueue.dailyFreeCapacity.toLocaleString()}/day</strong> free
                            </span>
                            <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 text-[11px] text-slate-600 dark:text-zinc-300">
                                Lookalike: <strong className="uppercase text-slate-900 dark:text-white">{harvestQueue.lookalikeProvider}</strong>
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <input
                                type="text"
                                value={harvestSeedInput}
                                onChange={(e) => setHarvestSeedInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSeedHarvestTree();
                                }}
                                placeholder="Seed @handle or IG URL..."
                                className="h-7 w-44 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                            />
                            <button
                                type="button"
                                onClick={handleSeedHarvestTree}
                                disabled={isSeedingHarvest}
                                className="h-7 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
                            >
                                {isSeedingHarvest ? "Seeding..." : "+ Seed Tree"}
                            </button>
                            <button
                                type="button"
                                onClick={handleTickHarvestQueue}
                                disabled={isTickingHarvest || harvestQueue.pending === 0}
                                className="h-7 px-2.5 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
                            >
                                {isTickingHarvest ? "Hydrating..." : "Process Batch (4)"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Search Command Box in Website's Native Stone/Slate Card Style */}
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/50 space-y-3">
                    {/* Mode Pills */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs">
                            {[
                                { id: "brand_or_query" as const, label: "Search by Brand, Niche or Keyword", icon: SearchIcon },
                                { id: "handle_or_url" as const, label: "Paste Instagram @Handle / Profile / Reel URL", icon: SparklesIcon },
                                { id: "batch_urls" as const, label: "Batch Ingest URLs", icon: UploadIcon },
                            ].map((tab) => {
                                const Icon = tab.icon;
                                const active = searchMode === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setSearchMode(tab.id)}
                                        className={`px-3 py-1 rounded-full font-medium shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                                            active
                                                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold shadow-2xs"
                                                : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/80 dark:border-zinc-700 hover:bg-slate-100"
                                        }`}
                                    >
                                        <Icon className="w-3 h-3" />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setVerifiedIndianOnly(!verifiedIndianOnly)}
                                className={`h-7 px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                    verifiedIndianOnly
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs"
                                        : "bg-white text-slate-600 border-slate-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700"
                                }`}
                            >
                                <span>🇮🇳 Verified Indian Creators</span>
                                {verifiedIndianOnly && <CheckIcon className="w-3 h-3 text-emerald-600" />}
                            </button>
                        </div>
                    </div>

                    {/* Mode 1: Brand / Keyword / Category / City Search */}
                    {searchMode === "brand_or_query" && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            {/* Brand Autocomplete Input (15,117+ Contacts DB Brands + Any New Brand) */}
                            <div className="md:col-span-3 relative">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 flex items-center justify-between mb-1">
                                    <span>Brand Name (DB or Any New Brand)</span>
                                    <span className="text-[10px] text-slate-400 font-normal">15,117+ DB Brands</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={brandText}
                                        onFocus={() => setBrandDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 180)}
                                        onChange={(e) => {
                                            setBrandText(e.target.value);
                                            setBrandDropdownOpen(true);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                setBrandDropdownOpen(false);
                                                runProgressiveLiveSearch();
                                            }
                                        }}
                                        placeholder="e.g. Atomberg, Nykaa, Hyphen..."
                                        className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                                    />
                                    {brandText && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBrandText("");
                                                setMatchedDbBrandInfo(null);
                                                searchExistingDatabase({ brand: "" });
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {brandDropdownOpen && (dbBrands.length > 0 || brandText.trim()) && (
                                    <div className="absolute z-40 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                                        {brandText.trim() && !dbBrands.some((b) => b.name.toLowerCase() === brandText.trim().toLowerCase()) && (
                                            <button
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setBrandDropdownOpen(false);
                                                    runProgressiveLiveSearch(brandText.trim());
                                                }}
                                                className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 cursor-pointer"
                                            >
                                                <span className="font-semibold text-slate-900 dark:text-white">
                                                    ✨ Scout New Brand: &ldquo;{brandText.trim()}&rdquo;
                                                </span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFE600] text-slate-900 font-semibold">
                                                    Live IG + Google
                                                </span>
                                            </button>
                                        )}
                                        {dbBrands.map((b) => (
                                            <button
                                                key={b.name}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setBrandText(b.name);
                                                    setBrandDropdownOpen(false);
                                                    searchExistingDatabase({ brand: b.name });
                                                }}
                                                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 cursor-pointer"
                                            >
                                                <div className="truncate">
                                                    <span className="font-semibold text-slate-900 dark:text-white">{b.name}</span>
                                                    {b.domain && <span className="ml-1.5 text-[10px] text-slate-400">({b.domain})</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                                    {b.creatorCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                                                            {b.creatorCount} creators
                                                        </span>
                                                    )}
                                                    {b.totalContacts > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            {b.totalContacts} contacts
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Creator Keyword / @Handle / Bio Search */}
                            <div className="md:col-span-3">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    Creator Keyword, Niche, or @Handle
                                </label>
                                <input
                                    type="text"
                                    value={queryText}
                                    onChange={(e) => setQueryText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") runProgressiveLiveSearch();
                                    }}
                                    placeholder="e.g. dermatologist, sneakerhead, @handle..."
                                    className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                            </div>

                            {/* Vertical Category */}
                            <div className="md:col-span-2">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    Vertical Category
                                </label>
                                <select
                                    value={categoryText}
                                    onChange={(e) => {
                                        setCategoryText(e.target.value);
                                        searchExistingDatabase({ cat: e.target.value });
                                    }}
                                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium cursor-pointer"
                                >
                                    {VERTICAL_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Indian City Filter */}
                            <div className="md:col-span-2">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    City / Region (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={cityText}
                                    onChange={(e) => setCityText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") searchExistingDatabase();
                                    }}
                                    placeholder="e.g. Mumbai, Delhi, Bangalore..."
                                    className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                            </div>

                            {/* Action Buttons: DB Search + Live Scout */}
                            <div className="md:col-span-2 flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => searchExistingDatabase()}
                                    disabled={isSearchingDb}
                                    className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer shrink-0"
                                >
                                    DB Filter
                                </button>
                                <button
                                    type="button"
                                    onClick={() => runProgressiveLiveSearch()}
                                    disabled={isLiveScouting}
                                    className="flex-1 h-8 px-3 rounded-md bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                                >
                                    <SparklesIcon className={`w-3.5 h-3.5 text-[#FFE600] ${isLiveScouting ? "animate-spin" : ""}`} />
                                    <span>{isLiveScouting ? "Scouting..." : "Scout Live"}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Mode 2: Paste Single Instagram @Handle, Profile URL, or Reel URL */}
                    {searchMode === "handle_or_url" && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-9">
                                <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                                    Instagram @Handle, Profile URL, or Reel URL (Auto-Fetches Profile, Contacts, Insights &amp; Stores in DB)
                                </label>
                                <input
                                    type="text"
                                    value={directHandleOrUrl}
                                    onChange={(e) => setDirectHandleOrUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") runProgressiveLiveSearch();
                                    }}
                                    placeholder="e.g. @techburner or https://www.instagram.com/reel/DeecVUIyqsk/ or https://www.instagram.com/itistanyasingh/"
                                    className="w-full h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <button
                                    type="button"
                                    onClick={() => runProgressiveLiveSearch()}
                                    disabled={isLiveScouting}
                                    className="w-full h-8 px-3 rounded-md bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <SparklesIcon className={`w-3.5 h-3.5 text-[#FFE600] ${isLiveScouting ? "animate-spin" : ""}`} />
                                    <span>{isLiveScouting ? "Fetching..." : "Fetch & Auto-Store"}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Mode 3: Bulk Paste Reel / Profile URLs */}
                    {searchMode === "batch_urls" && (
                        <div className="space-y-2">
                            <label className="text-[10.5px] font-semibold text-slate-600 dark:text-zinc-400 block">
                                Paste Multiple Instagram Reel URLs, Profile URLs, or @Handles (One per line or comma-separated)
                            </label>
                            <div className="flex flex-col md:flex-row gap-2 items-stretch">
                                <textarea
                                    rows={2}
                                    value={batchUrlsText}
                                    onChange={(e) => setBatchUrlsText(e.target.value)}
                                    placeholder={"https://www.instagram.com/reel/DeecVUIyqsk/\nhttps://www.instagram.com/itistanyasingh/\n@jairajxai"}
                                    className="flex-1 p-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                                <button
                                    type="button"
                                    onClick={() => runProgressiveLiveSearch()}
                                    disabled={isLiveScouting}
                                    className="md:w-48 px-3 py-2 rounded-md bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <SparklesIcon className={`w-3.5 h-3.5 text-[#FFE600] ${isLiveScouting ? "animate-spin" : ""}`} />
                                    <span>{isLiveScouting ? "Harvesting..." : "Harvest & Store All"}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Matched Contacts DB Brand Banner + Live Progressive Enrichment Queue Bar */}
                    {(matchedDbBrandInfo || queueStatus.active) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            {matchedDbBrandInfo && (
                                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs">
                                    <GlobeIcon className="w-3.5 h-3.5 text-slate-600" />
                                    <span>
                                        Linked Contacts DB Brand: <strong>{matchedDbBrandInfo.name}</strong>
                                        {matchedDbBrandInfo.domain ? ` (${matchedDbBrandInfo.domain})` : ""} ·{" "}
                                        <span className="text-slate-700 dark:text-zinc-300 font-semibold">
                                            {matchedDbBrandInfo.totalContacts} brand contacts in DB
                                        </span>
                                    </span>
                                </div>
                            )}

                            {queueStatus.active && (
                                <div className="flex-1 flex items-center justify-between gap-3 px-3 py-1.5 rounded-md bg-amber-50/90 dark:bg-zinc-800 border border-amber-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-200">
                                    <div className="flex items-center gap-2">
                                        <RefreshCcwIcon className="w-3.5 h-3.5 animate-spin text-slate-700 shrink-0" />
                                        <span className="font-medium">{queueStatus.phase}</span>
                                    </div>
                                    {queueStatus.total > 0 && (
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="w-24 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-slate-900 dark:bg-[#FFE600] transition-all duration-300"
                                                    style={{
                                                        width: `${Math.round((queueStatus.completed / queueStatus.total) * 100)}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="font-semibold text-[11px]">
                                                {queueStatus.completed}/{queueStatus.total}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Filter Toolbar matching CreatorsTable.tsx SectionBar */}
            <div className="px-5 py-2.5 border-b border-slate-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-[#121212]">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Follower Tier Buttons */}
                    <div className="flex items-center gap-1 border border-slate-200 dark:border-zinc-700 rounded-md p-0.5 bg-slate-50 dark:bg-zinc-900 text-xs font-medium">
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
                                onClick={() => setTier(t.key)}
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
                        onChange={(e) => setChannel(e.target.value)}
                        className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
                    >
                        <option value="all">All Channels</option>
                        <option value="email">Has Email ({facets.overview.emailReady})</option>
                        <option value="phone">Has WhatsApp ({facets.overview.whatsappReady})</option>
                        <option value="dual">Dual Ready (Email + Phone)</option>
                    </select>

                    {/* Language & Diaspora Filter */}
                    <select
                        value={languageFilter}
                        onChange={(e) => setLanguageFilter(e.target.value)}
                        className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
                    >
                        <option value="all">All Indian Languages &amp; Diaspora</option>
                        <option value="English">English</option>
                        <option value="Hindi">Hindi / Hinglish</option>
                        <option value="Tamil">Tamil</option>
                        <option value="Telugu">Telugu</option>
                        <option value="Kannada">Kannada</option>
                        <option value="Malayalam">Malayalam</option>
                        <option value="Marathi">Marathi</option>
                        <option value="Bengali">Bengali</option>
                        <option value="Punjabi">Punjabi</option>
                        <option value="Gujarati">Gujarati</option>
                        <option value="Odia">Odia</option>
                        <option value="Assamese">Assamese</option>
                        <option value="Indian Diaspora">🌏 Indian Diaspora (NRI)</option>
                    </select>

                    {/* Quick Category Pills */}
                    <div className="hidden xl:flex items-center gap-1 text-xs">
                        {["Skincare", "Tech", "Fashion", "Food Blogger", "Fitness", "Finance"].map((cat) => {
                            const active = categoryText === cat;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                        const next = active ? "All Categories" : cat;
                                        setCategoryText(next);
                                        searchExistingDatabase({ cat: next });
                                    }}
                                    className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                                        active
                                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                                            : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                                    }`}
                                >
                                    {cat}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>
                        Showing <strong className="text-slate-900 dark:text-white">{results.length}</strong> creators
                        {dbTotal > results.length ? ` (of ${dbTotal.toLocaleString()} verified in DB)` : ""}
                    </span>
                </div>
            </div>

            {/* Dense High-Performance Creators Table — Identical UI to CreatorsTable.tsx */}
            <div className="flex-1 overflow-auto relative">
                <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#FAF9F5] dark:bg-zinc-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-zinc-800 z-10 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th className="w-10 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={results.length > 0 && selectedIds.size === results.length}
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
                        {results.map((c) => {
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
                                                    {c.isNewInDb && (
                                                        <span className="text-[9px] bg-amber-200/90 text-amber-950 font-bold px-1.5 py-0.2 rounded-full">
                                                            NEW
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <a
                                                        href={c.profileUrl || `https://www.instagram.com/${(c.handle || "").replace(/^@/, "")}/`}
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
                                                {(Array.isArray(c.languages) && c.languages.length > 0 ? c.languages : ig.contentLanguages || []).slice(0, 2).map((lang: string) => (
                                                    <span
                                                        key={lang}
                                                        className="inline-block px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300"
                                                    >
                                                        {lang}
                                                    </span>
                                                ))}
                                            </div>
                                            {c.city ? (
                                                <span className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                                                    <MapPinIcon className="w-2.5 h-2.5 text-slate-400" />
                                                    <span>{c.city}{c.state ? `, ${c.state}` : ""}</span>
                                                    <span className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                                                        · 🇮🇳 {c.indiaConfidenceScore || 85}%
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
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
                                                onClick={(e) => expandSimilarCreators(c, e)}
                                                disabled={isLiveScouting}
                                                className="h-7 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-zinc-200 flex items-center gap-1 text-[10.5px] font-semibold transition-colors cursor-pointer"
                                                title={`Engine 1: Find 15-50 Indian lookalike creators similar to ${c.handle}`}
                                            >
                                                <SparklesIcon className="w-3 h-3 text-amber-500" />
                                                <span className="hidden sm:inline">Similar</span>
                                            </button>
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

                {/* Native Centered "+ Load more · X of Y" Pagination Footer */}
                {results.length > 0 && (
                    <div className="py-4 px-5 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-center bg-white dark:bg-[#121212]">
                        {results.length < dbTotal ? (
                            <button
                                type="button"
                                disabled={isLoadingMore}
                                onClick={() => searchExistingDatabase({ offset: results.length, append: true })}
                                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-200 inline-flex items-center gap-2 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                <span className="text-sm leading-none text-slate-500">+</span>
                                <span>{isLoadingMore ? "Loading..." : "Load more"}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                                    {results.length.toLocaleString()} of {dbTotal.toLocaleString()}
                                </span>
                            </button>
                        ) : (
                            <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums">
                                Showing all {results.length.toLocaleString()} of {Math.max(results.length, dbTotal).toLocaleString()} creators
                            </span>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!isSearchingDb && results.length === 0 && (
                    <div className="p-12 text-center text-slate-400 space-y-3">
                        <LayersIcon className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                            No creators matching that filter in database yet
                        </p>
                        <button
                            type="button"
                            onClick={() => runProgressiveLiveSearch()}
                            disabled={isLiveScouting}
                            className="h-8 px-4 rounded-md bg-slate-900 hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                            <SparklesIcon className={`w-3.5 h-3.5 text-[#FFE600] ${isLiveScouting ? "animate-spin" : ""}`} />
                            <span>{isLiveScouting ? "Scouting Live..." : "Scout Live on Instagram + Google & Auto-Store"}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Creator Detail Drawer */}
            {selectedCreator && (
                <CreatorDetailDrawer
                    creator={selectedCreator}
                    onClose={() => setSelectedCreator(null)}
                    onUpdate={() => searchExistingDatabase()}
                />
            )}
        </div>
    );
}
