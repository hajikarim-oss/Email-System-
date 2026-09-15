import React, { useMemo, useState } from "react";
import {
    ActivityIcon,
    AlertCircleIcon,
    ArrowDownIcon,
    ArrowUpDownIcon,
    ArrowUpIcon,
    BarChart3Icon,
    CheckCircle2Icon,
    ChevronLeftIcon,
    ChevronRightIcon,
    FilterIcon,
    FlameIcon,
    LayersIcon,
    MessageSquareIcon,
    RotateCcwIcon,
    SearchIcon,
    SparklesIcon,
    TrendingDownIcon,
    TrendingUpIcon,
    UsersIcon,
    ZapIcon,
} from "lucide-react";
import {
    INITIAL_OUTREACH_PERFORMANCE_DATA,
    type OutreachPerformanceItem,
    PREV_WEEK_STATS,
    TREND_DATA,
} from "@/lib/intelligence/performanceReviewData";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tbm_performance_review_v1";

function loadData(): OutreachPerformanceItem[] {
    try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (item) {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    return INITIAL_OUTREACH_PERFORMANCE_DATA;
}

export function OutreachPerformanceReview() {
    const [data] = useState<OutreachPerformanceItem[]>(loadData);

    // Filters state
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [selectedPoc, setSelectedPoc] = useState<string>("all");
    const [selectedDesignation, setSelectedDesignation] = useState<string>("all");
    const [selectedChannel, setSelectedChannel] = useState<string>("all");
    const [selectedStep, setSelectedStep] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");

    // Table state
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [sortKey, setSortKey] = useState<keyof OutreachPerformanceItem | "replyRate">("replyRate");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [currentPage, setCurrentPage] = useState<number>(0);
    const pageSize = 8;

    // Filter lists
    const categories = useMemo(() => Array.from(new Set(data.map((d) => d.category))).sort(), [data]);
    const pocs = useMemo(() => Array.from(new Set(data.map((d) => d.poc))).sort(), [data]);
    const designations = useMemo(() => Array.from(new Set(data.map((d) => d.designation))).sort(), [data]);
    const channels = useMemo(() => Array.from(new Set(data.map((d) => d.channel))).sort(), [data]);
    const steps = useMemo(() => Array.from(new Set(data.map((d) => d.step))).sort(), [data]);

    // Active filter reset
    const hasActiveFilters =
        selectedCategory !== "all" ||
        selectedPoc !== "all" ||
        selectedDesignation !== "all" ||
        selectedChannel !== "all" ||
        selectedStep !== "all" ||
        selectedStatus !== "all";

    const handleResetFilters = () => {
        setSelectedCategory("all");
        setSelectedPoc("all");
        setSelectedDesignation("all");
        setSelectedChannel("all");
        setSelectedStep("all");
        setSelectedStatus("all");
        setSearchQuery("");
        setCurrentPage(0);
    };

    // Filtered data based on dropdown selections
    const filteredData = useMemo(() => {
        return data.filter((d) => {
            if (selectedCategory !== "all" && d.category !== selectedCategory) return false;
            if (selectedPoc !== "all" && d.poc !== selectedPoc) return false;
            if (selectedDesignation !== "all" && d.designation !== selectedDesignation) return false;
            if (selectedChannel !== "all" && d.channel !== selectedChannel) return false;
            if (selectedStep !== "all" && d.step !== selectedStep) return false;
            if (selectedStatus !== "all" && d.status !== selectedStatus) return false;
            return true;
        });
    }, [data, selectedCategory, selectedPoc, selectedDesignation, selectedChannel, selectedStep, selectedStatus]);

    // Headline Metrics
    const metrics = useMemo(() => {
        const totalSent = filteredData.reduce((acc, d) => acc + d.sent, 0);
        const totalOpened = filteredData.reduce((acc, d) => acc + d.opened, 0);
        const totalReplied = filteredData.reduce((acc, d) => acc + d.replied, 0);
        const totalMeetings = filteredData.reduce((acc, d) => acc + d.meetings, 0);
        const totalDeals = filteredData.filter((d) => d.dealStage === "Deal Won").length;
        const openRate = totalSent ? (totalOpened / totalSent) * 100 : 0;
        const replyRate = totalSent ? (totalReplied / totalSent) * 100 : 0;
        const avgDays = filteredData.length
            ? filteredData.reduce((acc, d) => acc + d.daysToReply, 0) / filteredData.length
            : 0;

        // Deltas vs last week
        const sentDelta = PREV_WEEK_STATS.sent ? ((totalSent - PREV_WEEK_STATS.sent) / PREV_WEEK_STATS.sent) * 100 : 0;
        const openDelta = openRate - PREV_WEEK_STATS.openRate;
        const replyDelta = replyRate - PREV_WEEK_STATS.replyRate;
        const meetingsDelta = PREV_WEEK_STATS.meetings
            ? ((totalMeetings - PREV_WEEK_STATS.meetings) / PREV_WEEK_STATS.meetings) * 100
            : 0;
        const dealsDelta = totalDeals - PREV_WEEK_STATS.deals;
        const daysDelta = avgDays - PREV_WEEK_STATS.daysToReply;

        return {
            totalSent,
            totalOpened,
            totalReplied,
            totalMeetings,
            totalDeals,
            openRate,
            replyRate,
            avgDays,
            sentDelta,
            openDelta,
            replyDelta,
            meetingsDelta,
            dealsDelta,
            daysDelta,
        };
    }, [filteredData]);

    // Aggregate Helper for breakdowns
    const aggregateBy = (key: keyof OutreachPerformanceItem) => {
        const map: Record<string, { sent: number; opened: number; replied: number; meetings: number }> = {};
        filteredData.forEach((d) => {
            const val = String(d[key]);
            if (!map[val]) map[val] = { sent: 0, opened: 0, replied: 0, meetings: 0 };
            map[val].sent += d.sent;
            map[val].opened += d.opened;
            map[val].replied += d.replied;
            map[val].meetings += d.meetings;
        });
        return map;
    };

    const categoryAgg = useMemo(() => aggregateBy("category"), [filteredData]);
    const pocAgg = useMemo(() => aggregateBy("poc"), [filteredData]);
    const designationAgg = useMemo(() => aggregateBy("designation"), [filteredData]);
    const channelAgg = useMemo(() => aggregateBy("channel"), [filteredData]);
    const stepAgg = useMemo(() => aggregateBy("step"), [filteredData]);

    // Heatmap Matrix: Categories (rows) x Designations (cols)
    const heatmapMatrix = useMemo(() => {
        const cats = Array.from(new Set(filteredData.map((d) => d.category))).sort();
        const desigs = Array.from(new Set(filteredData.map((d) => d.designation))).sort();

        const rows = cats.map((cat) => {
            const cells = desigs.map((desig) => {
                const matches = filteredData.filter((d) => d.category === cat && d.designation === desig);
                if (matches.length === 0) return { desig, sent: 0, replied: 0, meetings: 0, rate: null };
                const sent = matches.reduce((s, d) => s + d.sent, 0);
                const replied = matches.reduce((s, d) => s + d.replied, 0);
                const meetings = matches.reduce((s, d) => s + d.meetings, 0);
                const rate = sent > 0 ? (replied / sent) * 100 : 0;
                return { desig, sent, replied, meetings, rate };
            });
            return { category: cat, cells };
        });

        return { categories: cats, designations: desigs, rows };
    }, [filteredData]);

    // Diagnosis top working and not working
    const topWorking = useMemo(() => {
        return [...filteredData]
            .filter((d) => d.status === "Working")
            .sort((a, b) => (b.replied / b.sent) - (a.replied / a.sent))
            .slice(0, 4);
    }, [filteredData]);

    const topNotWorking = useMemo(() => {
        return [...filteredData]
            .filter((d) => d.status === "Not Working")
            .sort((a, b) => (a.replied / a.sent) - (b.replied / b.sent))
            .slice(0, 4);
    }, [filteredData]);

    // Table search & sort
    const searchedAndSortedTable = useMemo(() => {
        let list = [...filteredData];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (d) =>
                    d.poc.toLowerCase().includes(q) ||
                    d.category.toLowerCase().includes(q) ||
                    d.designation.toLowerCase().includes(q) ||
                    d.channel.toLowerCase().includes(q) ||
                    d.step.toLowerCase().includes(q) ||
                    d.why.toLowerCase().includes(q) ||
                    d.dealStage.toLowerCase().includes(q)
            );
        }

        list.sort((a, b) => {
            let valA: any = a[sortKey as keyof OutreachPerformanceItem];
            let valB: any = b[sortKey as keyof OutreachPerformanceItem];
            if (sortKey === "replyRate") {
                valA = a.sent > 0 ? (a.replied / a.sent) * 100 : 0;
                valB = b.sent > 0 ? (b.replied / b.sent) * 100 : 0;
            }
            if (typeof valA === "string") {
                return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortDir === "asc" ? valA - valB : valB - valA;
        });

        return list;
    }, [filteredData, searchQuery, sortKey, sortDir]);

    const totalPages = Math.max(1, Math.ceil(searchedAndSortedTable.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = currentPage * pageSize;
        return searchedAndSortedTable.slice(start, start + pageSize);
    }, [searchedAndSortedTable, currentPage, pageSize]);

    const handleSort = (key: keyof OutreachPerformanceItem | "replyRate") => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
        setCurrentPage(0);
    };

    const getHeatmapColor = (rate: number | null) => {
        if (rate === null) return "bg-slate-50 text-slate-400 border-slate-200/50";
        if (rate >= 25) return "bg-emerald-500/10 text-emerald-800 border-emerald-300 font-semibold";
        if (rate >= 18) return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (rate >= 10) return "bg-amber-50 text-amber-800 border-amber-200";
        if (rate >= 5) return "bg-rose-50 text-rose-700 border-rose-200";
        return "bg-red-50 text-red-600 border-red-200";
    };

    return (
        <div className="space-y-6 pt-2">
            {/* Header with Title and Unified Filter Bar */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <h2 className="text-[16px] font-bold text-slate-900 tracking-tight">
                                Team Outreach Performance &mdash; Deep Review
                            </h2>
                        </div>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                            Cross-channel intelligence &bull; Multi-POC attribution &bull; Real-time touchpoint diagnosis
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto">
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                                <RotateCcwIcon className="w-3 h-3 text-slate-500" />
                                <span>Reset Filters</span>
                            </button>
                        )}
                        <span className="text-[11.5px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                            {filteredData.length} of {data.length} Segments
                        </span>
                    </div>
                </div>

                {/* 6 Integrated Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {/* Category Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => {
                                setSelectedCategory(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Categories</option>
                            {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {/* POC Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">POC / Teammate</label>
                        <select
                            value={selectedPoc}
                            onChange={(e) => {
                                setSelectedPoc(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Teammates</option>
                            {pocs.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Designation Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</label>
                        <select
                            value={selectedDesignation}
                            onChange={(e) => {
                                setSelectedDesignation(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Designations</option>
                            {designations.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    {/* Channel Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Channel</label>
                        <select
                            value={selectedChannel}
                            onChange={(e) => {
                                setSelectedChannel(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Channels</option>
                            {channels.map((ch) => (
                                <option key={ch} value={ch}>{ch}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sequence Step Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Touchpoint</label>
                        <select
                            value={selectedStep}
                            onChange={(e) => {
                                setSelectedStep(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Steps</option>
                            {steps.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => {
                                setSelectedStatus(e.target.value);
                                setCurrentPage(0);
                            }}
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                            <option value="all">All Statuses</option>
                            <option value="Working">Working</option>
                            <option value="Mixed">Mixed</option>
                            <option value="Not Working">Not Working</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Headline Numbers (KPI Row with Deltas vs Last Week) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* 1. Outreach Sent */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Outreach Sent</div>
                    <div className="text-[22px] font-bold text-slate-900 font-mono tracking-tight">
                        {metrics.totalSent.toLocaleString()}
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.sentDelta >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.sentDelta >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                        <span>{Math.abs(metrics.sentDelta).toFixed(1)}% vs last wk</span>
                    </div>
                </div>

                {/* 2. Open Rate */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Open Rate</div>
                    <div className="text-[22px] font-bold text-slate-900 font-mono tracking-tight">
                        {metrics.openRate.toFixed(1)}%
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.openDelta >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.openDelta >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                        <span>{metrics.openDelta >= 0 ? "+" : ""}{metrics.openDelta.toFixed(1)} pts vs last wk</span>
                    </div>
                </div>

                {/* 3. Reply Rate */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reply Rate</div>
                    <div className="text-[22px] font-bold text-emerald-700 font-mono tracking-tight">
                        {metrics.replyRate.toFixed(1)}%
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.replyDelta >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.replyDelta >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                        <span>{metrics.replyDelta >= 0 ? "+" : ""}{metrics.replyDelta.toFixed(1)} pts vs last wk</span>
                    </div>
                </div>

                {/* 4. Meetings Booked */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Meetings Booked</div>
                    <div className="text-[22px] font-bold text-sky-700 font-mono tracking-tight">
                        {metrics.totalMeetings}
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.meetingsDelta >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.meetingsDelta >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                        <span>{metrics.meetingsDelta >= 0 ? "+" : ""}{metrics.meetingsDelta.toFixed(1)}% vs last wk</span>
                    </div>
                </div>

                {/* 5. Deals Won */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Deals Won (wk)</div>
                    <div className="text-[22px] font-bold text-purple-700 font-mono tracking-tight">
                        {metrics.totalDeals}
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.dealsDelta >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.dealsDelta >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                        <span>{metrics.dealsDelta >= 0 ? "+" : ""}{metrics.dealsDelta} vs last wk</span>
                    </div>
                </div>

                {/* 6. Avg Days to Reply */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Days to Reply</div>
                    <div className="text-[22px] font-bold text-slate-900 font-mono tracking-tight">
                        {metrics.avgDays.toFixed(1)}d
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-semibold", metrics.daysDelta <= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {metrics.daysDelta <= 0 ? <ArrowDownIcon className="w-3 h-3" /> : <ArrowUpIcon className="w-3 h-3" />}
                        <span>{Math.abs(metrics.daysDelta).toFixed(1)}d vs last wk</span>
                    </div>
                </div>
            </div>

            {/* Funnel & Sequence Touchpoint Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left 6 Cols: Outreach Conversion Funnel */}
                <div className="lg:col-span-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <LayersIcon className="w-4 h-4 text-sky-600" />
                            <span>Outreach Conversion Funnel</span>
                        </h3>
                        <p className="text-[12px] text-slate-500">
                            Sent &rarr; Opened &rarr; Replied &rarr; Meeting Booked &rarr; Deal Won
                        </p>
                    </div>

                    <div className="space-y-3 pt-1">
                        {[
                            { label: "1. Outreach Sent", count: metrics.totalSent, pct: 100, color: "bg-sky-500", text: "text-sky-700" },
                            {
                                label: "2. Opened",
                                count: metrics.totalOpened,
                                pct: metrics.totalSent > 0 ? (metrics.totalOpened / metrics.totalSent) * 100 : 0,
                                color: "bg-cyan-500",
                                text: "text-cyan-700",
                            },
                            {
                                label: "3. Replied",
                                count: metrics.totalReplied,
                                pct: metrics.totalSent > 0 ? (metrics.totalReplied / metrics.totalSent) * 100 : 0,
                                color: "bg-amber-500",
                                text: "text-amber-700",
                            },
                            {
                                label: "4. Meetings Booked",
                                count: metrics.totalMeetings,
                                pct: metrics.totalSent > 0 ? (metrics.totalMeetings / metrics.totalSent) * 100 : 0,
                                color: "bg-emerald-500",
                                text: "text-emerald-700",
                            },
                            {
                                label: "5. Deals Won",
                                count: metrics.totalDeals,
                                pct: metrics.totalSent > 0 ? (metrics.totalDeals / metrics.totalSent) * 100 : 0,
                                color: "bg-purple-600",
                                text: "text-purple-700",
                            },
                        ].map((stage, i) => (
                            <div key={i} className="space-y-1.5">
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="font-semibold text-slate-800">{stage.label}</span>
                                    <div className="flex items-center gap-2 font-mono text-[12px]">
                                        <span className="font-bold text-slate-900">{stage.count}</span>
                                        <span className={cn("text-[11px] font-semibold", stage.text)}>
                                            ({stage.pct.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-500", stage.color)}
                                        style={{ width: `${Math.max(stage.count > 0 ? 3 : 0, Math.min(100, stage.pct))}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right 6 Cols: Reply Rate by Sequence Touchpoint */}
                <div className="lg:col-span-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <ZapIcon className="w-4 h-4 text-amber-500" />
                            <span>Reply Rate by Sequence Touchpoint</span>
                        </h3>
                        <p className="text-[12px] text-slate-500">
                            Which message in the sequence actually triggers direct client responses
                        </p>
                    </div>

                    <div className="space-y-3 pt-1">
                        {Object.entries(stepAgg).map(([stepName, val]) => {
                            const rate = val.sent > 0 ? (val.replied / val.sent) * 100 : 0;
                            return (
                                <div key={stepName} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[12px]">
                                        <span className="font-semibold text-slate-800">{stepName}</span>
                                        <div className="flex items-center gap-2 font-mono text-[12px]">
                                            <span className="text-slate-500 text-[11px]">{val.replied}/{val.sent} sent</span>
                                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                                                {rate.toFixed(1)}% reply
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${Math.min(100, rate * 2.5)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Breakdown by Category, POC, Designation & Channel */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Category Reply Rates */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
                    <div className="border-b border-slate-100 pb-2">
                        <h4 className="text-[13px] font-bold text-slate-900">Reply Rate by Category (%)</h4>
                    </div>
                    <div className="space-y-2.5">
                        {Object.entries(categoryAgg).map(([cat, val]) => {
                            const rate = val.sent > 0 ? (val.replied / val.sent) * 100 : 0;
                            return (
                                <div key={cat} className="space-y-1">
                                    <div className="flex justify-between text-[11.5px]">
                                        <span className="text-slate-700 truncate max-w-[130px] font-medium">{cat}</span>
                                        <span className="font-mono font-bold text-slate-900">{rate.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, rate * 3)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Meetings Booked by POC */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
                    <div className="border-b border-slate-100 pb-2">
                        <h4 className="text-[13px] font-bold text-slate-900">Meetings Booked by POC</h4>
                    </div>
                    <div className="space-y-2.5">
                        {Object.entries(pocAgg).map(([poc, val]) => (
                            <div key={poc} className="space-y-1">
                                <div className="flex justify-between text-[11.5px]">
                                    <span className="text-slate-700 truncate max-w-[130px] font-medium">{poc}</span>
                                    <span className="font-mono font-bold text-emerald-700">{val.meetings} booked</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (val.meetings / 8) * 100)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Reply Rate by Designation */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
                    <div className="border-b border-slate-100 pb-2">
                        <h4 className="text-[13px] font-bold text-slate-900">Reply Rate by Designation (%)</h4>
                    </div>
                    <div className="space-y-2.5">
                        {Object.entries(designationAgg).map(([desig, val]) => {
                            const rate = val.sent > 0 ? (val.replied / val.sent) * 100 : 0;
                            return (
                                <div key={desig} className="space-y-1">
                                    <div className="flex justify-between text-[11.5px]">
                                        <span className="text-slate-700 truncate max-w-[130px] font-medium">{desig}</span>
                                        <span className="font-mono font-bold text-slate-900">{rate.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, rate * 3)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Reply Rate by Channel */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
                    <div className="border-b border-slate-100 pb-2">
                        <h4 className="text-[13px] font-bold text-slate-900">Reply Rate by Channel (%)</h4>
                    </div>
                    <div className="space-y-2.5">
                        {Object.entries(channelAgg).map(([channel, val]) => {
                            const rate = val.sent > 0 ? (val.replied / val.sent) * 100 : 0;
                            return (
                                <div key={channel} className="space-y-1">
                                    <div className="flex justify-between text-[11.5px]">
                                        <span className="text-slate-700 truncate max-w-[130px] font-medium">{channel}</span>
                                        <span className="font-mono font-bold text-slate-900">{rate.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, rate * 3)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Daily Outreach vs Replies Trend Widget */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <ActivityIcon className="w-4 h-4 text-sky-600" />
                            <span>Daily Outreach vs Replies (Past 7 Days)</span>
                        </h3>
                        <p className="text-[12px] text-slate-500">
                            Sent volume correlation against direct prospect responses
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11.5px] font-medium">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                            <span className="text-slate-600">Sent Volume</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span className="text-slate-600">Replies Received</span>
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-2 pt-2">
                    {TREND_DATA.labels.map((day, idx) => {
                        const sent = TREND_DATA.sent[idx];
                        const replied = TREND_DATA.replied[idx];
                        const sentHeightPct = Math.min(100, Math.round((sent / 130) * 100));
                        const replyHeightPct = Math.min(100, Math.round((replied / 30) * 100));

                        return (
                            <div key={day} className="flex flex-col items-center gap-2 p-2.5 rounded-lg bg-slate-50/70 border border-slate-200/60">
                                <div className="text-[11px] font-semibold text-slate-500">{day}</div>
                                <div className="h-24 w-full flex items-end justify-center gap-1.5 pb-1 border-b border-slate-200/80">
                                    {/* Sent Bar */}
                                    <div
                                        className="w-3.5 bg-sky-400 hover:bg-sky-500 rounded-t transition-all"
                                        style={{ height: `${Math.max(12, sentHeightPct)}%` }}
                                        title={`Sent: ${sent}`}
                                    />
                                    {/* Replied Bar */}
                                    <div
                                        className="w-3.5 bg-emerald-500 hover:bg-emerald-600 rounded-t transition-all"
                                        style={{ height: `${Math.max(8, replyHeightPct)}%` }}
                                        title={`Replied: ${replied}`}
                                    />
                                </div>
                                <div className="flex items-center justify-between w-full font-mono text-[10.5px]">
                                    <span className="text-sky-700 font-semibold">{sent}s</span>
                                    <span className="text-emerald-700 font-bold">{replied}r</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Category x Designation Reply-Rate Heatmap */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-[14px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <FlameIcon className="w-4 h-4 text-emerald-600" />
                        <span>Category &times; Designation Reply-Rate Heatmap</span>
                    </h3>
                    <p className="text-[12px] text-slate-500">
                        Darker green = higher reply rate &bull; Cells display <span className="font-mono font-semibold text-slate-700">Reply Rate % / Meetings Booked</span>
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11.5px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="text-left py-2.5 px-3 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                                    Category \ Designation
                                </th>
                                {heatmapMatrix.designations.map((d) => (
                                    <th key={d} className="text-center py-2.5 px-3 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                                        {d}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {heatmapMatrix.rows.map((row) => (
                                <tr key={row.category} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900 bg-slate-50/30">
                                        {row.category}
                                    </td>
                                    {row.cells.map((cell, idx) => (
                                        <td key={idx} className="text-center py-2 px-2">
                                            {cell.rate !== null ? (
                                                <span
                                                    className={cn(
                                                        "inline-block px-2 py-1 rounded-md text-[11px] font-mono border",
                                                        getHeatmapColor(cell.rate)
                                                    )}
                                                >
                                                    {cell.rate.toFixed(1)}% / {cell.meetings}m
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-mono">&mdash;</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Diagnosis: What's Working vs What's Not Working */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* What's Working */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs border-l-4 border-l-emerald-500 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                        <CheckCircle2Icon className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-[13.5px] font-bold text-slate-900">What's Working (High-Conversion Angles)</h3>
                    </div>
                    <div className="space-y-3">
                        {topWorking.map((item) => (
                            <div key={item.id} className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-100 space-y-1">
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="font-bold text-slate-900">
                                        {item.poc} &bull; {item.category} &bull; {item.designation}
                                    </span>
                                    <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                        {((item.replied / item.sent) * 100).toFixed(1)}% reply ({item.meetings}m)
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                    Channel: <span className="font-medium text-slate-700">{item.channel} ({item.step})</span> &bull; Avg reply: <span className="font-semibold text-slate-700">{item.daysToReply}d</span>
                                </div>
                                <p className="text-[11.5px] text-slate-700 leading-relaxed font-medium pt-0.5">
                                    {item.why}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* What's Not Working */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs border-l-4 border-l-rose-500 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                        <AlertCircleIcon className="w-4 h-4 text-rose-600" />
                        <h3 className="text-[13.5px] font-bold text-slate-900">What's Not Working (Actionable Bottlenecks)</h3>
                    </div>
                    <div className="space-y-3">
                        {topNotWorking.map((item) => (
                            <div key={item.id} className="p-3 rounded-lg bg-rose-50/40 border border-rose-100 space-y-1">
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="font-bold text-slate-900">
                                        {item.poc} &bull; {item.category} &bull; {item.designation}
                                    </span>
                                    <span className="font-mono text-[11px] font-semibold text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-200">
                                        {((item.replied / item.sent) * 100).toFixed(1)}% reply ({item.meetings}m)
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                    Channel: <span className="font-medium text-slate-700">{item.channel} ({item.step})</span> &bull; Avg reply: <span className="font-semibold text-slate-700">{item.daysToReply}d</span>
                                </div>
                                <p className="text-[11.5px] text-slate-700 leading-relaxed font-medium pt-0.5">
                                    {item.why}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Full Detail Log Table with Search, Sort & Pagination */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight">
                            Full Outreach Performance Detail Log
                        </h3>
                        <p className="text-[12px] text-slate-500">
                            Granular slice audit: POC &times; Category &times; Designation &times; Channel &times; Touchpoint
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(0);
                                }}
                                placeholder="Search POC, category, note..."
                                className="pl-8 pr-3 h-8 rounded-md border border-slate-200 bg-slate-50/50 text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:bg-white w-[220px]"
                            />
                        </div>
                        <span className="text-[11.5px] font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                            {searchedAndSortedTable.length} rows
                        </span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11.5px] min-w-[980px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
                                <th
                                    onClick={() => handleSort("poc")}
                                    className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-slate-900"
                                >
                                    <div className="flex items-center gap-1">
                                        <span>POC</span>
                                        <ArrowUpDownIcon className="w-3 h-3 text-slate-400" />
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("category")}
                                    className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-slate-900"
                                >
                                    <div className="flex items-center gap-1">
                                        <span>Category</span>
                                        <ArrowUpDownIcon className="w-3 h-3 text-slate-400" />
                                    </div>
                                </th>
                                <th className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Designation
                                </th>
                                <th className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Channel
                                </th>
                                <th className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Step
                                </th>
                                <th
                                    onClick={() => handleSort("sent")}
                                    className="text-right py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-slate-900"
                                >
                                    Sent
                                </th>
                                <th className="text-right py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Opened
                                </th>
                                <th className="text-right py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Replied
                                </th>
                                <th
                                    onClick={() => handleSort("replyRate")}
                                    className="text-right py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-slate-900"
                                >
                                    Reply %
                                </th>
                                <th
                                    onClick={() => handleSort("meetings")}
                                    className="text-right py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-slate-900"
                                >
                                    Mtgs
                                </th>
                                <th className="text-center py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Deal Stage
                                </th>
                                <th className="text-center py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Status
                                </th>
                                <th className="text-left py-2.5 px-2.5 font-bold uppercase tracking-wider text-[10px]">
                                    Diagnosis / Why
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedRows.map((row) => {
                                const rate = row.sent > 0 ? (row.replied / row.sent) * 100 : 0;
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="py-2.5 px-2.5 font-semibold text-slate-900">{row.poc}</td>
                                        <td className="py-2.5 px-2.5 text-slate-700">{row.category}</td>
                                        <td className="py-2.5 px-2.5 text-slate-600">{row.designation}</td>
                                        <td className="py-2.5 px-2.5">
                                            <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 text-slate-700">
                                                {row.channel}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-2.5 text-slate-500 font-mono text-[11px]">{row.step}</td>
                                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-800">{row.sent}</td>
                                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-600">{row.opened}</td>
                                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-emerald-700">{row.replied}</td>
                                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900">{rate.toFixed(1)}%</td>
                                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-sky-700">{row.meetings}</td>
                                        <td className="py-2.5 px-2.5 text-center">
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                                                    row.dealStage === "Deal Won" && "bg-purple-50 text-purple-700 border-purple-200",
                                                    row.dealStage === "In Negotiation" && "bg-indigo-50 text-indigo-700 border-indigo-200",
                                                    row.dealStage === "Meeting Scheduled" && "bg-sky-50 text-sky-700 border-sky-200",
                                                    row.dealStage === "No Deal Yet" && "bg-slate-100 text-slate-600 border-slate-200"
                                                )}
                                            >
                                                {row.dealStage}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-2.5 text-center">
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                                    row.status === "Working" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                    row.status === "Mixed" && "bg-amber-50 text-amber-700 border-amber-200",
                                                    row.status === "Not Working" && "bg-rose-50 text-rose-700 border-rose-200"
                                                )}
                                            >
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-2.5 text-slate-600 text-[11px] max-w-[240px] truncate" title={row.why}>
                                            {row.why}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[12px] text-slate-500">
                    <div>
                        Page <span className="font-semibold text-slate-800">{currentPage + 1}</span> of{" "}
                        <span className="font-semibold text-slate-800">{totalPages}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-[11.5px] font-medium transition-colors"
                        >
                            <ChevronLeftIcon className="w-3.5 h-3.5" />
                            <span>Previous</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage >= totalPages - 1}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-[11.5px] font-medium transition-colors"
                        >
                            <span>Next</span>
                            <ChevronRightIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
