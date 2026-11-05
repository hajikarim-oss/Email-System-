import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    PlusIcon,
    RefreshCcwIcon,
    PlayIcon,
    PauseIcon,
    Trash2Icon,
    ExternalLinkIcon,
    ActivityIcon,
    EyeIcon,
    FileEditIcon,
    CheckCircle2Icon,
    SparklesIcon,
    TrendingUpIcon,
    UsersIcon,
    FilterIcon,
    ArrowUpRightIcon,
    ClockIcon,
    Loader2Icon,
} from "lucide-react";
import toast from "react-hot-toast";
import { authHeaders } from "@/lib/api/standaloneMock";
import {
    Page,
    PageBody,
    PageTopbar,
    SectionBar,
    Stat,
    StatStrip,
    TopbarAction,
    EmptyBlock,
} from "@/components/layout/Page";
import { SearchInput } from "@/components/ui/field";
import {
    PopoverMenu,
    PopoverMenuContent,
    PopoverMenuItem,
    PopoverMenuLabel,
    PopoverMenuTrigger,
    SelectButton,
} from "@/components/ui/popover-menu";
import { NewCreatorCampaignDialog } from "@/components/app/creators/NewCreatorCampaignDialog";
import { CreatorCampaignTelemetryDialog } from "@/components/app/creators/CreatorCampaignTelemetryDialog";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "ACTIVE" | "PAUSED" | "DRAFT" | "COMPLETED";
type SortOption = "newest" | "oldest" | "highest_open" | "name";

export default function CreatorCampaignsPage() {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOption, setSortOption] = useState<SortOption>("newest");
    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [telemetryCampaign, setTelemetryCampaign] = useState<{ id: string; name: string } | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Fetch native Creator Campaigns with live polling every 6 seconds
    const {
        data: campaigns = [],
        isLoading,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ["creator_campaigns"],
        queryFn: async () => {
            const res = await fetch("/api/creators/campaigns", {
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error("Failed to load creator campaigns");
            return res.json();
        },
        refetchInterval: 6000,
    });

    // Aggregate stats across all campaigns
    const stats = useMemo(() => {
        const totalCampaigns = campaigns.length;
        const activeOutreach = campaigns.filter((c: any) => c.status === "ACTIVE").length;
        const totalEnrolled = campaigns.reduce((acc: number, c: any) => acc + (Number(c.enrolledCount) || 0), 0);
        const totalSent = campaigns.reduce((acc: number, c: any) => acc + (Number(c.sentCount) || 0), 0);
        const totalOpened = campaigns.reduce((acc: number, c: any) => acc + (Number(c.formsOpenedCount) || 0), 0);
        const totalFilling = campaigns.reduce((acc: number, c: any) => acc + (Number(c.partiallyFilledCount) || 0), 0);
        const totalEnriched = campaigns.reduce((acc: number, c: any) => acc + (Number(c.completedCount) || 0), 0);

        const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";
        const enrichmentRate = totalSent > 0 ? ((totalEnriched / totalSent) * 100).toFixed(1) : "0.0";

        return {
            totalCampaigns,
            activeOutreach,
            totalEnrolled,
            totalSent,
            totalOpened,
            totalFilling,
            totalEnriched,
            openRate,
            enrichmentRate,
        };
    }, [campaigns]);

    // Filtering & Sorting
    const filteredCampaigns = useMemo(() => {
        return campaigns
            .filter((c: any) => {
                if (statusFilter !== "all" && c.status !== statusFilter) return false;
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const matchName = (c.name || "").toLowerCase().includes(q);
                    const matchVertical = (c.targetVertical || "").toLowerCase().includes(q);
                    const matchSubject = (c.subject || "").toLowerCase().includes(q);
                    if (!matchName && !matchVertical && !matchSubject) return false;
                }
                return true;
            })
            .sort((a: any, b: any) => {
                if (sortOption === "newest") {
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }
                if (sortOption === "oldest") {
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                }
                if (sortOption === "highest_open") {
                    return (b.openRate || 0) - (a.openRate || 0);
                }
                if (sortOption === "name") {
                    return (a.name || "").localeCompare(b.name || "");
                }
                return 0;
            });
    }, [campaigns, statusFilter, searchQuery, sortOption]);

    // Toggle campaign active/paused
    const handleToggleStatus = async (c: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const nextStatus = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
        setActionLoadingId(c.id);
        try {
            const res = await fetch(`/api/creators/campaigns/${c.id}`, {
                method: "PATCH",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });
            if (!res.ok) throw new Error("Failed to update status");
            toast.success(`Campaign ${nextStatus === "ACTIVE" ? "activated" : "paused"}`);
            queryClient.invalidateQueries({ queryKey: ["creator_campaigns"] });
        } catch (err: any) {
            toast.error(err.message || "Failed to update campaign");
        } finally {
            setActionLoadingId(null);
        }
    };

    // Delete campaign
    const handleDeleteCampaign = async (c: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete "${c.name}"?`)) return;
        setActionLoadingId(c.id);
        try {
            const res = await fetch(`/api/creators/campaigns/${c.id}`, {
                method: "DELETE",
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error("Failed to delete campaign");
            toast.success("Campaign deleted");
            queryClient.invalidateQueries({ queryKey: ["creator_campaigns"] });
        } catch (err: any) {
            toast.error(err.message || "Failed to delete campaign");
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <Page>
            <PageTopbar
                crumbs={[
                    { label: "Troops Outreach", to: "/app" },
                    { label: "Creators", to: "/app/creators" },
                    { label: "Campaigns" },
                ]}
                current="Creator Campaigns"
                badges={
                    <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        {campaigns.length} campaigns
                    </span>
                }
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-md shadow-2xs transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            <RefreshCcwIcon className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-amber-500")} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => setNewDialogOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-slate-950 bg-[#FFE600] hover:bg-[#F5DC00] border border-amber-300/80 rounded-md shadow-2xs transition-all shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            New campaign
                        </button>
                    </>
                }
            />

            {/* Real-time Telemetry & Funnel Stat Strip */}
            <StatStrip>
                <Stat
                    label="All Campaigns"
                    value={stats.totalCampaigns}
                    sub="native creator database"
                    active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                />
                <Stat
                    label="Active Outreach"
                    value={stats.activeOutreach}
                    sub="dispatching intake links"
                    active={statusFilter === "ACTIVE"}
                    onClick={() => setStatusFilter("ACTIVE")}
                />
                <Stat
                    label="Links Opened"
                    value={stats.totalOpened}
                    sub={`${stats.openRate}% creator open rate`}
                    badge="Live Telemetry"
                />
                <Stat
                    label="In-Progress Intake"
                    value={stats.totalFilling}
                    sub="step 1 or 2 auto-saved"
                />
                <Stat
                    label="100% Enriched"
                    value={stats.totalEnriched}
                    sub={`${stats.enrichmentRate}% verified talent`}
                    last
                    badge="Roster Ready"
                />
            </StatStrip>

            {/* Filters, Search & Sort */}
            <SectionBar
                label={
                    statusFilter === "all"
                        ? "All Creator Campaigns"
                        : `${statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()} Campaigns`
                }
                count={filteredCampaigns.length}
            >
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by name, vertical, subject..."
                    className="w-full sm:w-64"
                />

                {/* Status Selector */}
                <PopoverMenu align="end">
                    <PopoverMenuTrigger asChild>
                        <SelectButton
                            icon={<FilterIcon className="w-3.5 h-3.5 text-slate-500" />}
                            label={
                                statusFilter === "all"
                                    ? "All statuses"
                                    : statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()
                            }
                        />
                    </PopoverMenuTrigger>
                    <PopoverMenuContent minWidth={180}>
                        <PopoverMenuLabel>Filter by Status</PopoverMenuLabel>
                        <PopoverMenuItem
                            selected={statusFilter === "all"}
                            onSelect={() => setStatusFilter("all")}
                        >
                            All statuses ({campaigns.length})
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={statusFilter === "ACTIVE"}
                            onSelect={() => setStatusFilter("ACTIVE")}
                        >
                            Active ({campaigns.filter((c: any) => c.status === "ACTIVE").length})
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={statusFilter === "PAUSED"}
                            onSelect={() => setStatusFilter("PAUSED")}
                        >
                            Paused ({campaigns.filter((c: any) => c.status === "PAUSED").length})
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={statusFilter === "DRAFT"}
                            onSelect={() => setStatusFilter("DRAFT")}
                        >
                            Draft ({campaigns.filter((c: any) => c.status === "DRAFT").length})
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={statusFilter === "COMPLETED"}
                            onSelect={() => setStatusFilter("COMPLETED")}
                        >
                            Completed ({campaigns.filter((c: any) => c.status === "COMPLETED").length})
                        </PopoverMenuItem>
                    </PopoverMenuContent>
                </PopoverMenu>

                {/* Sort Selector */}
                <PopoverMenu align="end">
                    <PopoverMenuTrigger asChild>
                        <SelectButton
                            icon={<TrendingUpIcon className="w-3.5 h-3.5 text-slate-500" />}
                            label={
                                sortOption === "newest"
                                    ? "Newest first"
                                    : sortOption === "oldest"
                                    ? "Oldest first"
                                    : sortOption === "highest_open"
                                    ? "Highest link open"
                                    : "Name (A–Z)"
                            }
                        />
                    </PopoverMenuTrigger>
                    <PopoverMenuContent minWidth={180}>
                        <PopoverMenuLabel>Sort Campaigns</PopoverMenuLabel>
                        <PopoverMenuItem
                            selected={sortOption === "newest"}
                            onSelect={() => setSortOption("newest")}
                        >
                            Newest first
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={sortOption === "highest_open"}
                            onSelect={() => setSortOption("highest_open")}
                        >
                            Highest link open rate
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={sortOption === "name"}
                            onSelect={() => setSortOption("name")}
                        >
                            Name (A–Z)
                        </PopoverMenuItem>
                        <PopoverMenuItem
                            selected={sortOption === "oldest"}
                            onSelect={() => setSortOption("oldest")}
                        >
                            Oldest first
                        </PopoverMenuItem>
                    </PopoverMenuContent>
                </PopoverMenu>
            </SectionBar>

            {/* Campaign Table / Feed */}
            <PageBody>
                {isLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2Icon className="w-6 h-6 animate-spin text-amber-500" />
                        <span className="text-xs">Loading creator campaigns & real-time telemetry...</span>
                    </div>
                ) : filteredCampaigns.length === 0 ? (
                    <EmptyBlock
                        title={campaigns.length === 0 ? "No creator campaigns yet" : "No matching campaigns"}
                        body={
                            campaigns.length === 0
                                ? "Create your first dedicated creator outreach campaign with real-time intake telemetry."
                                : "Try clearing filters or search to view other campaigns."
                        }
                        cta={
                            <TopbarAction
                                icon={<PlusIcon className="w-3 h-3" />}
                                onClick={() => setNewDialogOpen(true)}
                            >
                                New creator campaign
                            </TopbarAction>
                        }
                    />
                ) : (
                    <div className="divide-y divide-slate-100 bg-white">
                        {filteredCampaigns.map((c: any) => {
                            const isActionLoading = actionLoadingId === c.id;
                            const openPercent = c.sentCount > 0 ? Math.round((c.formsOpenedCount / c.sentCount) * 100) : 0;
                            const fillPercent = c.formsOpenedCount > 0 ? Math.round((c.partiallyFilledCount / c.formsOpenedCount) * 100) : 0;
                            const completePercent = c.sentCount > 0 ? Math.round((c.completedCount / c.sentCount) * 100) : 0;

                            return (
                                <div
                                    key={c.id}
                                    className="group px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                                >
                                    {/* Left: Campaign Identity & Target Vertical */}
                                    <div className="flex items-start gap-3 min-w-0 max-w-xl">
                                        {/* Status Dot / Icon */}
                                        <div className="mt-1 shrink-0">
                                            {c.status === "ACTIVE" ? (
                                                <span className="relative flex size-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                    <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
                                                </span>
                                            ) : c.status === "PAUSED" ? (
                                                <span className="inline-block size-2.5 rounded-full bg-amber-400" />
                                            ) : c.status === "COMPLETED" ? (
                                                <span className="inline-block size-2.5 rounded-full bg-blue-500" />
                                            ) : (
                                                <span className="inline-block size-2.5 rounded-full bg-slate-300" />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[13.5px] font-semibold text-slate-900 truncate">
                                                    {c.name}
                                                </span>
                                                {c.targetVertical && (
                                                    <span className="px-2 py-0.5 text-[10.5px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60 rounded-full">
                                                        {c.targetVertical}
                                                    </span>
                                                )}
                                                <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                    {c.id.replace(/^creator_cmp_/, "#")}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-3 mt-1 text-[11.5px] text-slate-500">
                                                <span className="truncate max-w-[280px]">
                                                    Subject: <span className="text-slate-700 italic font-normal">"{c.subject}"</span>
                                                </span>
                                                <span className="hidden sm:inline text-slate-300">•</span>
                                                <span className="hidden sm:inline font-mono text-[11px] text-slate-400">
                                                    {new Date(c.createdAt).toLocaleDateString("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle: Live Conversion Funnel (Sent -> Opened -> Filling -> 100% Enriched) */}
                                    <div className="grid grid-cols-4 gap-2 sm:gap-4 shrink-0 py-1 px-3 bg-slate-50/90 rounded-lg border border-slate-200/60">
                                        {/* Step 1: Enrolled / Sent */}
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                                                Dispatched
                                            </span>
                                            <div className="flex items-baseline gap-1 mt-0.5">
                                                <span className="font-mono text-[13px] font-bold text-slate-800">
                                                    {c.sentCount || 0}
                                                </span>
                                                <span className="text-[10.5px] text-slate-400">creators</span>
                                            </div>
                                        </div>

                                        {/* Step 2: Form Opened */}
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-700 flex items-center gap-1">
                                                <EyeIcon className="w-2.5 h-2.5" />
                                                Opened
                                            </span>
                                            <div className="flex items-baseline gap-1 mt-0.5">
                                                <span className="font-mono text-[13px] font-bold text-amber-800">
                                                    {c.formsOpenedCount || 0}
                                                </span>
                                                <span className="text-[10.5px] text-amber-600 font-mono">
                                                    ({openPercent}%)
                                                </span>
                                            </div>
                                        </div>

                                        {/* Step 3: Filling Intake Form */}
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-700 flex items-center gap-1">
                                                <FileEditIcon className="w-2.5 h-2.5" />
                                                Filling
                                            </span>
                                            <div className="flex items-baseline gap-1 mt-0.5">
                                                <span className="font-mono text-[13px] font-bold text-blue-800">
                                                    {c.partiallyFilledCount || 0}
                                                </span>
                                                <span className="text-[10.5px] text-blue-600 font-mono">
                                                    ({fillPercent}%)
                                                </span>
                                            </div>
                                        </div>

                                        {/* Step 4: 100% Enriched */}
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-700 flex items-center gap-1">
                                                <CheckCircle2Icon className="w-2.5 h-2.5" />
                                                Enriched
                                            </span>
                                            <div className="flex items-baseline gap-1 mt-0.5">
                                                <span className="font-mono text-[13px] font-bold text-emerald-800">
                                                    {c.completedCount || 0}
                                                </span>
                                                <span className="text-[10.5px] text-emerald-600 font-mono">
                                                    ({completePercent}%)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Actions (Telemetry Drawer, Toggle, Delete) */}
                                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                                        {/* Telemetry Button */}
                                        <button
                                            type="button"
                                            onClick={() => setTelemetryCampaign({ id: c.id, name: c.name })}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-md shadow-2xs transition-colors cursor-pointer"
                                            title="View real-time intake telemetry & enrolled creators"
                                        >
                                            <ActivityIcon className="w-3.5 h-3.5 text-amber-600" />
                                            <span>Telemetry</span>
                                            <ArrowUpRightIcon className="w-3 h-3 text-slate-400" />
                                        </button>

                                        {/* Toggle Active/Paused */}
                                        <button
                                            type="button"
                                            disabled={isActionLoading}
                                            onClick={(e) => handleToggleStatus(c, e)}
                                            className={cn(
                                                "size-8 rounded-md flex items-center justify-center border transition-all cursor-pointer disabled:opacity-40",
                                                c.status === "ACTIVE"
                                                    ? "text-slate-600 hover:text-slate-900 bg-white border-slate-200 hover:bg-slate-50"
                                                    : "text-amber-900 bg-amber-50 border-amber-200 hover:bg-[#FFE600] hover:text-slate-950"
                                            )}
                                            title={c.status === "ACTIVE" ? "Pause campaign" : "Activate campaign"}
                                        >
                                            {isActionLoading ? (
                                                <Loader2Icon className="w-3.5 h-3.5 animate-spin text-slate-500" />
                                            ) : c.status === "ACTIVE" ? (
                                                <PauseIcon className="w-3.5 h-3.5" />
                                            ) : (
                                                <PlayIcon className="w-3.5 h-3.5 fill-current" />
                                            )}
                                        </button>

                                        {/* Delete Campaign */}
                                        <button
                                            type="button"
                                            disabled={isActionLoading}
                                            onClick={(e) => handleDeleteCampaign(c, e)}
                                            className="size-8 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors cursor-pointer"
                                            title="Delete campaign"
                                        >
                                            <Trash2Icon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </PageBody>

            {/* Campaign Wizard Dialog */}
            <NewCreatorCampaignDialog
                open={newDialogOpen}
                onClose={() => {
                    setNewDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ["creator_campaigns"] });
                }}
            />

            {/* Real-time Telemetry Dialog */}
            <CreatorCampaignTelemetryDialog
                campaignId={telemetryCampaign?.id ?? null}
                campaignName={telemetryCampaign?.name}
                onClose={() => setTelemetryCampaign(null)}
            />
        </Page>
    );
}
