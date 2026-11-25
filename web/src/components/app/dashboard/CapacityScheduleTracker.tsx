import React, { useState, useMemo } from "react";
import {
    AlertCircleIcon,
    CalendarCheckIcon,
    CalendarClockIcon,
    CalendarIcon,
    CheckCircle2Icon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClockIcon,
    FilterIcon,
    FlameIcon,
    LayersIcon,
    SearchIcon,
    SendIcon,
    ShieldAlertIcon,
    SparklesIcon,
    UserIcon,
    ZapIcon,
} from "lucide-react";
import type {
    CapacityTracker,
    CapacityTimelineDay,
    CalendarCampaignSlot,
    AlignedCampaignItem,
} from "@/lib/api/models/app/analytics/DashboardOverview";

interface CapacityScheduleTrackerProps {
    tracker?: CapacityTracker | null;
    todaySent?: number;
    dailyCapacity?: number;
    onSimulateCampaign?: (leadsCount: number) => void;
}

interface OwnerTheme {
    bg: string;
    border: string;
    accent: string;
    text: string;
    badge: string;
    dot: string;
}

const OWNER_THEMES: Record<string, OwnerTheme> = {
    "Snehal Maurya": {
        bg: "bg-blue-50/85 hover:bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-200/80 dark:border-blue-800/60",
        accent: "border-l-blue-600",
        text: "text-blue-950 dark:text-blue-200",
        badge: "bg-blue-100/90 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
        dot: "bg-blue-600",
    },
    "Vatsal Vadecha": {
        bg: "bg-emerald-50/85 hover:bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-200/80 dark:border-emerald-800/60",
        accent: "border-l-emerald-600",
        text: "text-emerald-950 dark:text-emerald-200",
        badge: "bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
        dot: "bg-emerald-600",
    },
    "Sanika Pingulkar": {
        bg: "bg-violet-50/85 hover:bg-violet-50 dark:bg-violet-950/30",
        border: "border-violet-200/80 dark:border-violet-800/60",
        accent: "border-l-violet-600",
        text: "text-violet-950 dark:text-violet-200",
        badge: "bg-violet-100/90 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
        dot: "bg-violet-600",
    },
    "Monu": {
        bg: "bg-amber-50/90 hover:bg-amber-50 dark:bg-amber-950/30",
        border: "border-amber-200/80 dark:border-amber-800/60",
        accent: "border-l-amber-500",
        text: "text-amber-950 dark:text-amber-200",
        badge: "bg-amber-100/90 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        dot: "bg-amber-500",
    },
    "Riya Thapliyal": {
        bg: "bg-rose-50/85 hover:bg-rose-50 dark:bg-rose-950/30",
        border: "border-rose-200/80 dark:border-rose-800/60",
        accent: "border-l-rose-500",
        text: "text-rose-950 dark:text-rose-200",
        badge: "bg-rose-100/90 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
        dot: "bg-rose-500",
    },
};

const DEFAULT_THEME: OwnerTheme = {
    bg: "bg-slate-50 hover:bg-slate-100/80 dark:bg-zinc-800/50",
    border: "border-slate-200 dark:border-zinc-700",
    accent: "border-l-slate-600",
    text: "text-slate-900 dark:text-zinc-200",
    badge: "bg-slate-200/80 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300",
    dot: "bg-slate-600",
};

function getOwnerTheme(ownerName: string): OwnerTheme {
    return OWNER_THEMES[ownerName] || DEFAULT_THEME;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCalendarHeaderRange(timeline: CapacityTimelineDay[]): string {
    if (!timeline.length) return "7-Day Schedule";
    const first = timeline[0]?.date;
    const last = timeline[timeline.length - 1]?.date;
    if (!first || !last) return "7-Day Schedule";
    const [, m1, d1] = first.split("-").map(Number);
    const [y2, m2, d2] = last.split("-").map(Number);
    if (m1 === m2) {
        return `${MONTH_SHORT[(m1 || 1) - 1]} ${d1} – ${d2}, ${y2}`;
    }
    return `${MONTH_SHORT[(m1 || 1) - 1]} ${d1} – ${MONTH_SHORT[(m2 || 1) - 1]} ${d2}, ${y2}`;
}

export function CapacityScheduleTracker({
    tracker,
    todaySent = 2532,
    dailyCapacity = 3400,
}: CapacityScheduleTrackerProps) {
    const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
    const [isDayAgendaOpen, setIsDayAgendaOpen] = useState<boolean>(true);
    const [isRosterExpanded, setIsRosterExpanded] = useState<boolean>(false);
    const [showDormant, setShowDormant] = useState<boolean>(false);
    const [searchFilter, setSearchFilter] = useState<string>("");
    const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
    const [simLeadsInput, setSimLeadsInput] = useState<string>("400");
    const [showSimulator, setShowSimulator] = useState<boolean>(false);

    const limit = Math.max(3400, tracker?.daily_limit || dailyCapacity || 3400);

    const todayData = useMemo(() => {
        if (tracker?.today) return tracker.today;
        const sent = todaySent;
        const rem = Math.max(0, limit - sent);
        const util = Math.min(100, Math.round((sent / limit) * 100));
        return {
            date: new Date().toISOString().split("T")[0],
            day_name: "Today",
            sent_so_far: sent,
            remaining_capacity: rem,
            utilization_pct: util,
            active_campaigns_count: 16,
            status: util >= 90 ? ("CAPPED" as const) : util >= 70 ? ("BUSY" as const) : ("OPTIMAL" as const),
            status_label: `${rem.toLocaleString()} slots left today`,
        };
    }, [tracker, todaySent, limit]);

    const tomorrowData = useMemo(() => {
        if (tracker?.tomorrow) return tracker.tomorrow;
        const proj = 2303;
        const rem = Math.max(0, limit - proj);
        const util = Math.round((proj / limit) * 100);
        return {
            date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
            day_name: "Tomorrow",
            is_sending_day: true,
            projected_leads: proj,
            projected_remaining: rem,
            projected_utilization_pct: util,
            aligned_campaigns_count: 18,
            finishing_campaigns_count: 4,
            status: util >= 95 ? ("CAPPED" as const) : util >= 70 ? ("BUSY" as const) : ("OPTIMAL" as const),
            status_label: `${rem.toLocaleString()} free slots tomorrow`,
        };
    }, [tracker, limit]);

    const timeline = useMemo<CapacityTimelineDay[]>(() => {
        if (tracker?.timeline && tracker.timeline.length > 0) return tracker.timeline;
        return [];
    }, [tracker]);

    const campaigns = useMemo<AlignedCampaignItem[]>(() => {
        return tracker?.aligned_campaigns || [];
    }, [tracker]);

    const activeAlignedCampaigns = useMemo(
        () => campaigns.filter((c) => !c.is_dormant),
        [campaigns],
    );
    const dormantCampaigns = useMemo(
        () => campaigns.filter((c) => c.is_dormant),
        [campaigns],
    );

    const owners = useMemo(() => {
        const set = new Set<string>();
        activeAlignedCampaigns.forEach((c) => {
            if (c.owner_name) set.add(c.owner_name);
        });
        return ["ALL", ...Array.from(set)];
    }, [activeAlignedCampaigns]);

    const filteredCampaigns = useMemo(() => {
        const base = showDormant ? campaigns : activeAlignedCampaigns;
        return base.filter((c) => {
            const matchesOwner = ownerFilter === "ALL" || c.owner_name === ownerFilter;
            const matchesSearch =
                !searchFilter.trim() ||
                c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                c.owner_name.toLowerCase().includes(searchFilter.toLowerCase());
            return matchesOwner && matchesSearch;
        });
    }, [campaigns, activeAlignedCampaigns, showDormant, ownerFilter, searchFilter]);

    const selectedDay: CapacityTimelineDay | undefined = timeline[selectedDayIdx] || timeline[0];

    const selectedDayFilteredSlots = useMemo<CalendarCampaignSlot[]>(() => {
        const slots = selectedDay?.scheduled_campaigns || [];
        return slots.filter((slot) => {
            const matchesOwner = ownerFilter === "ALL" || slot.owner_name === ownerFilter;
            const matchesSearch =
                !searchFilter.trim() ||
                slot.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                slot.owner_name.toLowerCase().includes(searchFilter.toLowerCase());
            return matchesOwner && matchesSearch;
        });
    }, [selectedDay, ownerFilter, searchFilter]);

    // Simulator feasibility calculation across all 7 calendar days
    const simResult = useMemo(() => {
        const count = Math.max(0, parseInt(simLeadsInput.replace(/[^0-9]/g, ""), 10) || 0);
        const fitsToday = count <= todayData.remaining_capacity;
        const fitsTomorrow = tomorrowData.is_sending_day && count <= tomorrowData.projected_remaining;

        const todayPctAfter = Math.min(100, Math.round(((todayData.sent_so_far + count) / limit) * 100));
        const tomorrowPctAfter = Math.min(100, Math.round(((tomorrowData.projected_leads + count) / limit) * 100));

        // Find the first sending day in the 7-day calendar that has enough free slots
        const bestDay = timeline.find(
            (d) => d.is_sending_day && (d.free_slots ?? Math.max(0, d.capacity - d.projected_leads)) >= count,
        );

        let verdict: "SAFE_TODAY" | "SAFE_TOMORROW" | "SPLIT_NEEDED" = "SAFE_TODAY";
        let headline = "";
        let detail = "";

        if (count === 0) {
            headline = "Enter a lead count to test campaign schedule fit";
            detail = "See instant capacity impact across today, tomorrow, and the 7-day calendar.";
        } else if (fitsToday) {
            verdict = "SAFE_TODAY";
            headline = `Yes! All ${count.toLocaleString()} leads can be dispatched Today`;
            detail = `Leaves ${(todayData.remaining_capacity - count).toLocaleString()} buffer slots today (${todayPctAfter}% of ${limit.toLocaleString()} daily limit).`;
        } else if (fitsTomorrow) {
            verdict = "SAFE_TOMORROW";
            headline = `Exceeds today (${todayData.remaining_capacity.toLocaleString()} left), but fits Tomorrow (${tomorrowData.day_name})`;
            detail = `Schedule for tomorrow 10:00 AM IST (${(tomorrowData.projected_remaining - count).toLocaleString()} buffer slots left tomorrow, ${tomorrowPctAfter}% total load).`;
        } else {
            verdict = "SPLIT_NEEDED";
            const todayTake = todayData.remaining_capacity;
            const tomorrowTake = Math.min(Math.max(0, count - todayTake), tomorrowData.projected_remaining);
            const rest = Math.max(0, count - todayTake - tomorrowTake);
            headline = bestDay
                ? `Best single-day window: ${bestDay.full_day_name || bestDay.day_name} (${bestDay.date.slice(5)}) with ${(bestDay.free_slots ?? 0).toLocaleString()} free slots`
                : `Multi-Day Drip Recommended (${Math.ceil(count / 400)} days)`;
            detail = `Auto-stagger across days: ${todayTake.toLocaleString()} today → ${tomorrowTake.toLocaleString()} tomorrow${rest > 0 ? ` → ${rest.toLocaleString()} on Friday/Monday` : ""}.`;
        }

        return {
            count,
            fitsToday,
            fitsTomorrow,
            todayPctAfter,
            tomorrowPctAfter,
            verdict,
            headline,
            detail,
        };
    }, [simLeadsInput, todayData, tomorrowData, timeline, limit]);

    return (
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
            {/* TOP HEADER BAR */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-slate-50/90 via-white to-amber-50/30 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800/40">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF9DB] text-slate-900 flex items-center justify-center border border-amber-300/80 shadow-2xs shrink-0">
                        <CalendarClockIcon className="w-4.5 h-4.5 text-amber-700" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">
                                Campaign Dispatch &amp; Google Calendar Capacity Tracker
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-900 text-[#FFF3B0] dark:bg-amber-400/20 dark:text-amber-300 border border-slate-800">
                                {limit.toLocaleString()} Daily Fleet Limit (17 Mailboxes × 200)
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80">
                                {activeAlignedCampaigns.length} Active Aligned
                            </span>
                            {dormantCampaigns.length > 0 && (
                                <span
                                    title="Old unlaunched campaigns created >7 days ago with 0 sends"
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200/70"
                                >
                                    {dormantCampaigns.length} Dormant Excluded
                                </span>
                            )}
                        </div>
                        <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Live day-by-day campaign calendar with lead pool depletion &amp; sequence follow-up forecasting
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowSimulator((v) => !v)}
                        className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            showSimulator
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-[#FFF9DB] hover:bg-[#FFF3B0] text-slate-900 border-amber-300/80"
                        }`}
                    >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        <span>{showSimulator ? "Hide Launch Simulator" : "Test New Campaign Fit"}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsRosterExpanded((v) => !v)}
                        className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-zinc-200 border border-slate-200/90 dark:border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <LayersIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>All Campaigns Table ({activeAlignedCampaigns.length})</span>
                        {isRosterExpanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* SIMULATOR DRAWER (IF TOGGLED) */}
            {showSimulator && (
                <div className="px-5 py-3.5 bg-slate-900 text-white border-b border-slate-800">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <ZapIcon className="w-4 h-4 text-amber-300 shrink-0" />
                                <span className="text-[12px] font-bold tracking-tight text-amber-200 uppercase">
                                    New Campaign Window Simulator
                                </span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1">
                                <span className="text-[11px] text-slate-400">New Campaign Leads:</span>
                                <input
                                    type="text"
                                    value={simLeadsInput}
                                    onChange={(e) => setSimLeadsInput(e.target.value)}
                                    placeholder="400"
                                    className="w-20 bg-transparent text-white font-mono font-bold text-[13px] focus:outline-none text-right"
                                />
                                <span className="text-[11px] text-slate-400">leads</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {[200, 400, 800, 1500].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setSimLeadsInput(String(preset))}
                                        className={`px-2 py-0.5 rounded text-[10.5px] font-mono transition-colors cursor-pointer ${
                                            simResult.count === preset
                                                ? "bg-amber-400 text-slate-950 font-bold"
                                                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                                        }`}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/70 border border-slate-700/80 rounded-xl px-3.5 py-2">
                            <div className="flex items-start sm:items-center gap-2.5">
                                {simResult.verdict === "SAFE_TODAY" ? (
                                    <CheckCircle2Icon className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                                ) : simResult.verdict === "SAFE_TOMORROW" ? (
                                    <ClockIcon className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                                ) : (
                                    <AlertCircleIcon className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                                )}
                                <div>
                                    <div className="text-[12.5px] font-bold text-white leading-snug">
                                        {simResult.headline}
                                    </div>
                                    <div className="text-[11px] text-slate-300">{simResult.detail}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span
                                    className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold uppercase tracking-wider ${
                                        simResult.verdict === "SAFE_TODAY"
                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                            : simResult.verdict === "SAFE_TOMORROW"
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                            : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                    }`}
                                >
                                    {simResult.verdict === "SAFE_TODAY"
                                        ? "Fits Today"
                                        : simResult.verdict === "SAFE_TOMORROW"
                                        ? "Align Tomorrow"
                                        : "Multi-Day Drip"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 3 CORE SUMMARY CARDS: TODAY VS TOMORROW VS FLEET ADVISOR */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 border-b border-slate-100 dark:border-zinc-800">
                {/* 1. TODAY'S SENDING WINDOW */}
                <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-800/30 p-4 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                    todayData.status === "CAPPED"
                                        ? "bg-rose-500 animate-pulse"
                                        : todayData.status === "BUSY"
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                }`}
                            />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Today&apos;s Window ({todayData.day_name})
                            </span>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                                todayData.status === "CAPPED"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : todayData.status === "BUSY"
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                        >
                            {todayData.utilization_pct}% Utilized
                        </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                        <div>
                            <span className="text-[24px] font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
                                {todayData.sent_so_far.toLocaleString()}
                            </span>
                            <span className="text-[13px] font-medium text-slate-400 ml-1">
                                / {limit.toLocaleString()} sent
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-[14px] font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                                +{todayData.remaining_capacity.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-semibold">free slots today</div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="w-full h-2.5 rounded-full bg-slate-200/80 dark:bg-zinc-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    todayData.status === "CAPPED"
                                        ? "bg-rose-500"
                                        : todayData.status === "BUSY"
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.max(4, Math.min(100, todayData.utilization_pct))}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700 dark:text-zinc-300">
                                {todayData.remaining_capacity.toLocaleString()} leads can still go today
                            </span>
                            <span className="text-slate-500 dark:text-zinc-400">
                                {todayData.active_campaigns_count} campaigns today
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. TOMORROW'S FORECASTED QUEUE */}
                <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-800/30 p-4 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                    !tomorrowData.is_sending_day
                                        ? "bg-slate-400"
                                        : tomorrowData.status === "CAPPED"
                                        ? "bg-rose-500"
                                        : tomorrowData.status === "BUSY"
                                        ? "bg-blue-600"
                                        : "bg-emerald-500"
                                }`}
                            />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Tomorrow&apos;s Forecast ({tomorrowData.day_name})
                            </span>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                                !tomorrowData.is_sending_day
                                    ? "bg-slate-100 text-slate-600 border border-slate-200"
                                    : tomorrowData.status === "CAPPED"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : tomorrowData.status === "BUSY"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                        >
                            {!tomorrowData.is_sending_day
                                ? "Rest Day"
                                : `${tomorrowData.projected_utilization_pct}% Committed`}
                        </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                        <div>
                            <span className="text-[24px] font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
                                {tomorrowData.projected_leads.toLocaleString()}
                            </span>
                            <span className="text-[13px] font-medium text-slate-400 ml-1">
                                / {limit.toLocaleString()} scheduled
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-[14px] font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                                +{tomorrowData.projected_remaining.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-semibold">open tomorrow</div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="w-full h-2.5 rounded-full bg-slate-200/80 dark:bg-zinc-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    !tomorrowData.is_sending_day
                                        ? "bg-slate-400"
                                        : tomorrowData.status === "CAPPED"
                                        ? "bg-rose-500"
                                        : "bg-blue-600"
                                }`}
                                style={{
                                    width: `${
                                        !tomorrowData.is_sending_day
                                            ? 5
                                            : Math.max(4, Math.min(100, tomorrowData.projected_utilization_pct))
                                    }%`,
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700 dark:text-zinc-300">
                                {tomorrowData.aligned_campaigns_count} campaigns scheduled
                            </span>
                            {(tomorrowData.finishing_campaigns_count ?? 0) > 0 && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                    ✓ {tomorrowData.finishing_campaigns_count} finish tomorrow
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. SMART DISPATCH DECISION ASSISTANT */}
                <div className="rounded-xl border border-amber-200/90 dark:border-amber-900/50 bg-gradient-to-br from-[#FFFDF2] via-[#FFF9DB]/60 to-amber-50/40 dark:from-zinc-800/80 dark:to-zinc-900 p-4 flex flex-col justify-between space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <SparklesIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-[11.5px] font-bold text-slate-900 dark:text-white tracking-tight">
                                Team Campaign Alignment Advisor
                            </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-[#FFF3B0]">
                            Live Depletion Forecast
                        </span>
                    </div>

                    <p className="text-[12px] text-slate-700 dark:text-zinc-200 leading-relaxed font-medium">
                        {tracker?.decision_assistant?.recommended_action ||
                            `You have ${todayData.remaining_capacity.toLocaleString()} open sending slots today and ${tomorrowData.projected_remaining.toLocaleString()} open slots tomorrow.`}
                    </p>

                    <div className="pt-2 border-t border-amber-200/70 dark:border-zinc-700 flex items-center justify-between text-[11px]">
                        <div>
                            <span className="text-slate-500">Recommended Window: </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                                {tracker?.decision_assistant?.best_window || "Today before 6:00 PM IST"}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSimulator(true)}
                            className="font-bold text-amber-800 hover:text-slate-950 dark:text-amber-300 underline cursor-pointer"
                        >
                            Simulate →
                        </button>
                    </div>
                </div>
            </div>

            {/* GOOGLE CALENDAR 7-DAY SCHEDULE VIEW */}
            <div className="p-4 sm:p-5 bg-white dark:bg-zinc-900">
                {/* Google Calendar Toolbar */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-slate-200/80 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-zinc-700">
                            <CalendarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight">
                                {formatCalendarHeaderRange(timeline)}
                            </span>
                            <span className="text-[10.5px] font-medium text-slate-500 dark:text-zinc-400 border-l border-slate-300 dark:border-zinc-700 pl-2">
                                Week View (IST)
                            </span>
                        </div>

                        <span className="text-[11px] text-slate-500 dark:text-zinc-400 hidden sm:inline">
                            Click any day column to inspect full hourly campaign breakdown &amp; remaining lead backlog
                        </span>
                    </div>

                    {/* Team Owner Calendar Filter Pills (Color-Coded Like Google Calendar My Calendars) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                            <FilterIcon className="w-3 h-3" />
                            Calendars:
                        </span>
                        {owners.map((owner) => {
                            const active = ownerFilter === owner;
                            const theme = owner === "ALL" ? null : getOwnerTheme(owner);
                            return (
                                <button
                                    key={owner}
                                    type="button"
                                    onClick={() => setOwnerFilter(owner)}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                                        active
                                            ? "bg-slate-900 text-white border-slate-900 shadow-2xs dark:bg-white dark:text-slate-900"
                                            : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200/90 dark:border-zinc-700 hover:bg-slate-50"
                                    }`}
                                >
                                    {theme && <span className={`w-2 h-2 rounded-full ${theme.dot}`} />}
                                    <span>{owner === "ALL" ? "All Team" : owner.split(" ")[0]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 7-COLUMN GOOGLE CALENDAR WEEK GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-zinc-800 bg-slate-50/20 dark:bg-zinc-900">
                    {timeline.map((day, idx) => {
                        const isToday = idx === 0;
                        const isTomorrow = idx === 1;
                        const isSelected = selectedDayIdx === idx;
                        const dayNum = day.date.slice(8, 10).replace(/^0/, "");
                        const freeSlots = day.free_slots ?? Math.max(0, day.capacity - day.projected_leads);

                        const dayEvents = (day.scheduled_campaigns || []).filter((slot) =>
                            ownerFilter === "ALL" ? true : slot.owner_name === ownerFilter,
                        );
                        const displayedLeads =
                            ownerFilter === "ALL"
                                ? day.projected_leads
                                : dayEvents.reduce((acc, s) => acc + s.total_leads, 0);
                        const displayedUtil = Math.min(100, Math.round((displayedLeads / day.capacity) * 100));
                        const finishingToday = dayEvents.filter((s) => s.is_finishing).length;

                        return (
                            <div
                                key={day.date}
                                onClick={() => {
                                    setSelectedDayIdx(idx);
                                    setIsDayAgendaOpen(true);
                                }}
                                className={`flex flex-col min-h-[340px] transition-all cursor-pointer ${
                                    !day.is_sending_day
                                        ? "bg-slate-100/50 dark:bg-zinc-900/40"
                                        : isSelected
                                        ? "bg-amber-50/25 dark:bg-amber-950/15 ring-2 ring-inset ring-blue-600/80"
                                        : "bg-white dark:bg-zinc-900 hover:bg-slate-50/70"
                                }`}
                            >
                                {/* GOOGLE CALENDAR DAY COLUMN HEADER */}
                                <div
                                    className={`p-2.5 border-b border-slate-200/80 dark:border-zinc-800 ${
                                        isToday
                                            ? "bg-blue-50/60 dark:bg-blue-950/30"
                                            : isTomorrow
                                            ? "bg-amber-50/40 dark:bg-amber-950/20"
                                            : "bg-slate-50/70 dark:bg-zinc-800/50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={`text-[10.5px] font-bold uppercase tracking-wider ${
                                                    isToday
                                                        ? "text-blue-700 dark:text-blue-400"
                                                        : "text-slate-500 dark:text-zinc-400"
                                                }`}
                                            >
                                                {day.day_name}
                                            </span>
                                            {isToday && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white uppercase">
                                                    Today
                                                </span>
                                            )}
                                            {isTomorrow && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200/90 text-amber-950 uppercase">
                                                    Tmrw
                                                </span>
                                            )}
                                        </div>

                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-extrabold ${
                                                isToday
                                                    ? "bg-blue-600 text-white shadow-2xs"
                                                    : isSelected
                                                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                                    : "text-slate-800 dark:text-zinc-200"
                                            }`}
                                        >
                                            {dayNum}
                                        </span>
                                    </div>

                                    {/* Daily Capacity Summary Meter Inside Calendar Header */}
                                    {day.is_sending_day ? (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[14px] font-extrabold font-mono text-slate-900 dark:text-white">
                                                    {displayedLeads.toLocaleString()}
                                                </span>
                                                <span className="text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                                    +{freeSlots.toLocaleString()} free
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${
                                                        displayedUtil >= 90
                                                            ? "bg-rose-500"
                                                            : displayedUtil >= 70
                                                            ? "bg-amber-500"
                                                            : "bg-emerald-500"
                                                    }`}
                                                    style={{ width: `${Math.max(5, displayedUtil)}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-[9.5px] text-slate-500">
                                                <span>{displayedUtil}% of 3.4k</span>
                                                <span>{dayEvents.length} camps</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-2 py-1.5 text-center rounded bg-slate-200/50 dark:bg-zinc-800 text-[10px] font-semibold text-slate-500">
                                            Weekend Rest Window
                                        </div>
                                    )}
                                </div>

                                {/* CALENDAR EVENT BLOCKS LIST */}
                                <div className="p-1.5 flex-1 flex flex-col justify-between space-y-1.5">
                                    {day.is_sending_day ? (
                                        <>
                                            <div className="space-y-1">
                                                {dayEvents.slice(0, 5).map((ev) => {
                                                    const theme = getOwnerTheme(ev.owner_name);
                                                    return (
                                                        <div
                                                            key={`${day.date}-${ev.id}`}
                                                            title={`${ev.name} (${ev.owner_name})\nTime: ${ev.time_label} IST\nDispatching: ${ev.total_leads} leads (${ev.new_leads} new + ${ev.followup_leads} follow-up)\nRemaining queue after: ${ev.remaining_after} leads`}
                                                            className={`p-1.5 rounded-md border border-l-[3.5px] ${theme.bg} ${theme.border} ${theme.accent} transition-all shadow-2xs`}
                                                        >
                                                            <div className="flex items-center justify-between gap-1">
                                                                <span className="text-[9.5px] font-mono font-semibold text-slate-500 dark:text-zinc-400">
                                                                    {ev.time_label.replace(":00", "")}
                                                                </span>
                                                                <span className="text-[10px] font-mono font-extrabold text-slate-900 dark:text-white">
                                                                    {ev.total_leads}
                                                                </span>
                                                            </div>
                                                            <div
                                                                className={`text-[10.5px] font-bold truncate leading-tight mt-0.5 ${theme.text}`}
                                                            >
                                                                {ev.name}
                                                            </div>
                                                            <div className="flex items-center justify-between gap-1 mt-1">
                                                                <span className="text-[9px] text-slate-500 truncate">
                                                                    {ev.owner_name.split(" ")[0]}
                                                                </span>
                                                                {ev.is_finishing ? (
                                                                    <span className="px-1 py-0.1 rounded text-[8.5px] font-bold bg-emerald-600 text-white uppercase">
                                                                        Completes
                                                                    </span>
                                                                ) : ev.is_new_launch ? (
                                                                    <span className="px-1 py-0.1 rounded text-[8.5px] font-bold bg-amber-300 text-slate-950 uppercase">
                                                                        New
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[8.5px] font-mono text-slate-400">
                                                                        {ev.remaining_after} left
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {dayEvents.length > 5 && (
                                                    <div className="py-1 px-2 rounded bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 text-center text-[10px] font-bold text-blue-700 dark:text-blue-400">
                                                        + {dayEvents.length - 5} more scheduled · View all
                                                    </div>
                                                )}
                                            </div>

                                            {/* Column Footer Pill */}
                                            <div className="pt-1 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[9.5px] px-1">
                                                {finishingToday > 0 ? (
                                                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                                        🏁 {finishingToday} finishing
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">Active queue</span>
                                                )}
                                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                                    Inspect →
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-center p-3 text-slate-400">
                                            <CalendarCheckIcon className="w-5 h-5 mb-1 opacity-50" />
                                            <span className="text-[11px] font-semibold">No Campaign Sends</span>
                                            <span className="text-[9.5px] mt-0.5">
                                                Domain reputation &amp; warmup maintenance only
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* SELECTED DAY GOOGLE CALENDAR AGENDA INSPECTOR */}
                {selectedDay && isDayAgendaOpen && (
                    <div className="mt-4 rounded-xl border border-blue-200/90 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/40 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 dark:from-zinc-800 dark:to-zinc-900 border-b border-slate-200/80 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-600 text-white">
                                    {selectedDay.full_day_name || selectedDay.day_name} · {selectedDay.date}
                                </span>
                                <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">
                                    Hourly Campaign Dispatch Agenda ({selectedDayFilteredSlots.length} campaigns)
                                </h4>
                                {selectedDay.is_sending_day && (
                                    <span className="text-[11.5px] text-slate-600 dark:text-zinc-300 font-mono">
                                        · <strong>{selectedDay.projected_leads.toLocaleString()}</strong> scheduled (
                                        <span className="text-blue-700 font-bold">
                                            {(selectedDay.new_leads_count ?? 0).toLocaleString()} Step-1 new
                                        </span>{" "}
                                        +{" "}
                                        <span className="text-violet-700 font-bold">
                                            {(selectedDay.followup_leads_count ?? 0).toLocaleString()} follow-ups
                                        </span>
                                        ) ·{" "}
                                        <span className="text-emerald-700 font-bold">
                                            +{(selectedDay.free_slots ?? Math.max(0, selectedDay.capacity - selectedDay.projected_leads)).toLocaleString()} free slots open
                                        </span>
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsDayAgendaOpen(false)}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer self-end sm:self-auto"
                            >
                                Hide Day Agenda ✕
                            </button>
                        </div>

                        {selectedDay.is_sending_day && selectedDayFilteredSlots.length > 0 ? (
                            <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto">
                                {selectedDayFilteredSlots.map((slot) => {
                                    const theme = getOwnerTheme(slot.owner_name);
                                    return (
                                        <div
                                            key={`agenda-${selectedDay.date}-${slot.id}`}
                                            className={`p-3 rounded-lg border border-l-4 bg-white dark:bg-zinc-900 ${theme.border} ${theme.accent} shadow-2xs flex flex-col justify-between gap-2`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                                            {slot.time_label} IST
                                                        </span>
                                                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${theme.badge}`}>
                                                            {slot.owner_name}
                                                        </span>
                                                        {slot.is_finishing && (
                                                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-600 text-white">
                                                                🏁 Final Batch
                                                            </span>
                                                        )}
                                                        {slot.is_new_launch && (
                                                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-300 text-slate-950">
                                                                🚀 New Launch
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="text-[12.5px] font-bold text-slate-900 dark:text-white truncate mt-1"
                                                        title={slot.name}
                                                    >
                                                        {slot.name}
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="text-[15px] font-extrabold font-mono text-slate-900 dark:text-white leading-none">
                                                        {slot.total_leads.toLocaleString()}
                                                    </div>
                                                    <div className="text-[9.5px] text-slate-400">leads today</div>
                                                </div>
                                            </div>

                                            <div className="pt-1.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[10.5px] text-slate-500">
                                                <span>
                                                    <strong className="text-slate-700 dark:text-zinc-200">{slot.new_leads}</strong> new ·{" "}
                                                    <strong className="text-slate-700 dark:text-zinc-200">{slot.followup_leads}</strong> follow-up ({slot.max_steps} step{slot.max_steps > 1 ? "s" : ""})
                                                </span>
                                                <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                                                    {slot.remaining_after === 0
                                                        ? "0 left (Done)"
                                                        : `${slot.remaining_after.toLocaleString()} left after`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-[12px] text-slate-500">
                                {selectedDay.is_sending_day
                                    ? "No campaigns match the active owner filter on this day."
                                    : "Weekend rest day — outbound sequences pause automatically on Saturday & Sunday and resume Monday at 10:00 AM IST."}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* EXPANDABLE FULL CAMPAIGN ROSTER TABLE */}
            {isRosterExpanded && (
                <div className="p-4 sm:p-5 bg-slate-50/50 dark:bg-zinc-900/60 border-t border-slate-200/80 dark:border-zinc-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                                Master Campaign Queue &amp; Depletion Roster
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowDormant((v) => !v)}
                                className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border cursor-pointer ${
                                    showDormant
                                        ? "bg-slate-800 text-white border-slate-800"
                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
                            >
                                {showDormant
                                    ? `Showing All (${campaigns.length})`
                                    : `Show ${dormantCampaigns.length} Dormant October Drafts`}
                            </button>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="Filter campaign or owner..."
                                className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11.5px] text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-slate-400"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/50 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                    <th className="py-2.5 px-3.5">Campaign Name</th>
                                    <th className="py-2.5 px-3">Owner</th>
                                    <th className="py-2.5 px-3 text-center">Steps</th>
                                    <th className="py-2.5 px-3 text-right">Sent Today</th>
                                    <th className="py-2.5 px-3 text-right">Uncontacted (Step 1)</th>
                                    <th className="py-2.5 px-3 text-right">Active Follow-ups</th>
                                    <th className="py-2.5 px-3 text-right">Daily Pace</th>
                                    <th className="py-2.5 px-3.5 text-right">Est. Runway</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-[12px]">
                                {filteredCampaigns.map((camp) => {
                                    const theme = getOwnerTheme(camp.owner_name);
                                    return (
                                        <tr
                                            key={camp.id}
                                            className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                        >
                                            <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-white max-w-[260px] truncate">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                                            camp.is_dormant ? "bg-slate-300" : theme.dot
                                                        }`}
                                                    />
                                                    <span className="truncate" title={camp.name}>
                                                        {camp.name}
                                                    </span>
                                                    {camp.is_dormant && (
                                                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-500">
                                                            Dormant
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${theme.badge}`}
                                                >
                                                    <UserIcon className="w-3 h-3" />
                                                    {camp.owner_name}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                                                {camp.max_steps || 1}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700 dark:text-blue-400">
                                                {(camp.sent_today ?? 0).toLocaleString()}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 dark:text-zinc-200">
                                                {camp.uncontacted_leads.toLocaleString()}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-zinc-400">
                                                {camp.in_sequence_leads.toLocaleString()}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                                {camp.is_dormant ? "0 / day" : `~${camp.estimated_daily.toLocaleString()} / day`}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right font-mono text-[11px]">
                                                {camp.is_dormant ? (
                                                    <span className="text-slate-400">Unlaunched</span>
                                                ) : (camp.estimated_days_left ?? 0) <= 1 ? (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                                                        Finishes Tomorrow
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-700 dark:text-zinc-300 font-semibold">
                                                        ~{camp.estimated_days_left} working days
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CapacityScheduleTracker;
