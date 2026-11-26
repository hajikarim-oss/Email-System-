import React, { useState, useMemo } from "react";
import {
    AlertCircleIcon,
    CalendarClockIcon,
    CheckCircle2Icon,
    ChevronDownIcon,
    ChevronUpIcon,
    LayersIcon,
    SearchIcon,
    SparklesIcon,
    TrendingUpIcon,
    UserIcon,
    ZapIcon,
} from "lucide-react";
import type { CapacityTracker } from "@/lib/api/models/app/analytics/DashboardOverview";

interface CapacityScheduleTrackerProps {
    tracker?: CapacityTracker | null;
    todaySent?: number;
    dailyCapacity?: number;
    onSimulateCampaign?: (leadsCount: number) => void;
}

export function CapacityScheduleTracker({
    tracker,
    todaySent = 2532,
    dailyCapacity = 3400,
}: CapacityScheduleTrackerProps) {
    const [isRosterExpanded, setIsRosterExpanded] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");
    const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
    const [simLeads, setSimLeads] = useState<number>(200);
    const [isSimOpen, setIsSimOpen] = useState(false);

    // Fallback data if tracker is still loading
    const limit = tracker?.daily_limit || Math.max(3400, dailyCapacity);
    // Today's numbers always come from the shared live todaySent value so the
    // tracker, the quota card and the sidebar never disagree.
    const todayRemaining = Math.max(0, limit - todaySent);
    const todayUtil = Math.min(100, Math.round((todaySent / limit) * 100));
    const todayStatus: "OPTIMAL" | "BUSY" | "CAPPED" =
        todayUtil >= 90 ? "CAPPED" : todayUtil >= 70 ? "BUSY" : "OPTIMAL";
    const today = {
        date: tracker?.today?.date || new Date().toISOString().split("T")[0],
        day_name: tracker?.today?.day_name || "Today",
        active_campaigns_count: tracker?.today?.active_campaigns_count ?? 16,
        sent_so_far: todaySent,
        remaining_capacity: todayRemaining,
        utilization_pct: todayUtil,
        status: todayStatus,
        status_label:
            todayStatus === "CAPPED"
                ? "Daily Limit Reached · Hold New Dispatches"
                : todayStatus === "BUSY"
                  ? `Window Busy (${todayRemaining.toLocaleString()} slots left)`
                  : `Optimal Window Open (${todayRemaining.toLocaleString()} slots free)`,
    };

    const tomorrow = tracker?.tomorrow || {
        date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        day_name: "Tomorrow",
        is_sending_day: true,
        projected_leads: 2303,
        projected_remaining: Math.max(0, limit - 2303),
        projected_utilization_pct: Math.round((2303 / limit) * 100),
        aligned_campaigns_count: 18,
        status: "BUSY",
        status_label: "High Volume Expected (1,097 free slots)",
    };

    const rawTimeline = tracker?.timeline || [
        { date: "2026-11-25", day_name: "Wed", projected_leads: today.sent_so_far, capacity: limit, utilization_pct: today.utilization_pct, is_sending_day: true, campaigns_count: today.active_campaigns_count, status: today.status },
        { date: "2026-11-26", day_name: "Thu", projected_leads: tomorrow.projected_leads, capacity: limit, utilization_pct: tomorrow.projected_utilization_pct, is_sending_day: true, campaigns_count: tomorrow.aligned_campaigns_count, status: "BUSY" },
        { date: "2026-11-27", day_name: "Fri", projected_leads: 1509, capacity: limit, utilization_pct: 44, is_sending_day: true, campaigns_count: 14, status: "OPTIMAL" },
        { date: "2026-11-28", day_name: "Sat", projected_leads: 0, capacity: limit, utilization_pct: 0, is_sending_day: false, campaigns_count: 0, status: "REST_DAY" },
        { date: "2026-11-29", day_name: "Sun", projected_leads: 0, capacity: limit, utilization_pct: 0, is_sending_day: false, campaigns_count: 0, status: "REST_DAY" },
        { date: "2026-11-30", day_name: "Mon", projected_leads: 1028, capacity: limit, utilization_pct: 30, is_sending_day: true, campaigns_count: 10, status: "OPTIMAL" },
        { date: "2026-12-01", day_name: "Tue", projected_leads: 890, capacity: limit, utilization_pct: 26, is_sending_day: true, campaigns_count: 7, status: "OPTIMAL" },
    ];
    const timeline = rawTimeline.map((day, i) =>
        i === 0
            ? { ...day, projected_leads: todaySent, utilization_pct: todayUtil, free_slots: todayRemaining }
            : day,
    );

    const alignedCampaigns = useMemo(
        () => (tracker?.aligned_campaigns || []).filter((c) => !c.is_dormant),
        [tracker],
    );

    // Distinct owners for filtering
    const owners = useMemo(() => {
        const set = new Set<string>();
        alignedCampaigns.forEach((c) => {
            if (c.owner_name) set.add(c.owner_name);
        });
        return Array.from(set);
    }, [alignedCampaigns]);

    const filteredCampaigns = useMemo(() => {
        return alignedCampaigns.filter((c) => {
            const matchesSearch =
                c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                c.owner_name.toLowerCase().includes(searchFilter.toLowerCase());
            const matchesOwner = ownerFilter === "ALL" || c.owner_name === ownerFilter;
            return matchesSearch && matchesOwner;
        });
    }, [alignedCampaigns, searchFilter, ownerFilter]);

    // Simulator calculation
    const simTodayNewTotal = today.sent_so_far + simLeads;
    const simTodayUtil = Math.round((simTodayNewTotal / limit) * 100);
    const simTodayFits = simTodayNewTotal <= limit;

    const simTomorrowNewTotal = tomorrow.projected_leads + simLeads;
    const simTomorrowUtil = Math.round((simTomorrowNewTotal / limit) * 100);
    const simTomorrowFits = simTomorrowNewTotal <= limit;

    return (
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 shadow-xs transition-all">
            {/* 1. SECTION HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#FFF9DB] text-slate-900 flex items-center justify-center border border-amber-200/80 shadow-2xs shrink-0">
                        <CalendarClockIcon className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                                Campaign Dispatch &amp; Daily Capacity Tracker
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[#FFF9DB] text-amber-900 border border-amber-200/70 shadow-2xs">
                                {limit.toLocaleString()} Daily Limit
                            </span>
                            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {alignedCampaigns.length || today.active_campaigns_count} Campaigns Aligned
                            </span>
                        </div>
                        <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">
                            Live tracking of scheduled campaigns and lead volume for Today &amp; Tomorrow · Prevent mailbox quota throttling
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsSimOpen(!isSimOpen)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer shadow-2xs ${
                            isSimOpen
                                ? "bg-amber-100 border-amber-300 text-amber-900 font-semibold"
                                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                        }`}
                        title="Simulate adding a new campaign to see window availability"
                    >
                        <SparklesIcon className="w-3.5 h-3.5 text-amber-600" />
                        <span>Campaign Window Simulator</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsRosterExpanded(!isRosterExpanded)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
                    >
                        <LayersIcon className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                        <span>{isRosterExpanded ? "Hide Roster" : "View Aligned Campaigns"}</span>
                        {isRosterExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                    </button>
                </div>
            </div>

            {/* 2. THREE CORE CARDS (TODAY vs TOMORROW vs DECISION ASSISTANT) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {/* CARD 1: TODAY'S DISPATCH STATUS */}
                <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 p-3.5 flex flex-col justify-between space-y-3 relative overflow-hidden">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                    Today&apos;s Window ({today.day_name})
                                </span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-[22px] font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                    {today.sent_so_far.toLocaleString()}
                                </span>
                                <span className="text-[12px] font-medium text-slate-400">
                                    / {limit.toLocaleString()} sent
                                </span>
                            </div>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                                today.utilization_pct >= 90
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : today.utilization_pct >= 70
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                        >
                            {today.utilization_pct}% Utilized
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    today.utilization_pct >= 90
                                        ? "bg-rose-500"
                                        : today.utilization_pct >= 70
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(5, today.utilization_pct))}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                {today.remaining_capacity.toLocaleString()} slots remaining today
                            </span>
                            <span>{today.active_campaigns_count} active campaigns</span>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Status:</span>
                        <span className="font-medium text-slate-800 dark:text-zinc-200">{today.status_label}</span>
                    </div>
                </div>

                {/* CARD 2: TOMORROW'S FORECAST */}
                <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 p-3.5 flex flex-col justify-between space-y-3 relative overflow-hidden">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                    Tomorrow&apos;s Forecast ({tomorrow.day_name})
                                </span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-[22px] font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                    {tomorrow.projected_leads.toLocaleString()}
                                </span>
                                <span className="text-[12px] font-medium text-slate-400">
                                    / {limit.toLocaleString()} queued
                                </span>
                            </div>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                                tomorrow.projected_utilization_pct >= 95
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : tomorrow.projected_utilization_pct >= 70
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                        >
                            {tomorrow.projected_utilization_pct}% Allocated
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    tomorrow.projected_utilization_pct >= 95
                                        ? "bg-rose-500"
                                        : tomorrow.projected_utilization_pct >= 70
                                        ? "bg-blue-600"
                                        : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(5, tomorrow.projected_utilization_pct))}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                {tomorrow.projected_remaining.toLocaleString()} free slots remaining
                            </span>
                            <span>{tomorrow.aligned_campaigns_count} campaigns scheduled</span>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Dispatch Window:</span>
                        <span className="font-medium text-slate-800 dark:text-zinc-200">10:00 AM – 6:00 PM IST</span>
                    </div>
                </div>

                {/* CARD 3: TEAM DECISION ASSISTANT */}
                <div className="rounded-xl border border-amber-200/90 dark:border-amber-900/60 bg-[#FFFDF5] dark:bg-amber-950/20 p-3.5 flex flex-col justify-between space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <SparklesIcon className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-[11.5px] font-bold text-slate-900 dark:text-zinc-100">
                                Campaign Window Advisor
                            </span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFE600] text-slate-950 border border-black/10">
                            Live Fleet Advice
                        </span>
                    </div>

                    <p className="text-[12px] leading-relaxed text-slate-700 dark:text-zinc-300 font-medium">
                        {today.remaining_capacity >= 200 ? (
                            <>
                                <strong className="text-emerald-700 dark:text-emerald-400 font-bold">🟢 Safe to align today:</strong>{" "}
                                You have <strong>{today.remaining_capacity.toLocaleString()} slots</strong> open before midnight.
                            </>
                        ) : (
                            <>
                                <strong className="text-amber-800 dark:text-amber-400 font-bold">⚠️ Today is full:</strong> Only{" "}
                                {today.remaining_capacity.toLocaleString()} slots left. Align new campaigns for tomorrow or Friday.
                            </>
                        )}
                    </p>

                    <div className="rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-amber-200/60 dark:border-amber-900/40 p-2 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Recommended Window:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {today.remaining_capacity >= 300 ? "Today before 6:00 PM" : "Tomorrow 10:00 AM IST"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Max New Batch Size:</span>
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                                {today.remaining_capacity >= 200 ? today.remaining_capacity.toLocaleString() : "200 leads/campaign"}
                            </span>
                        </div>
                    </div>

                    <div className="text-[10.5px] text-slate-500 italic">
                        Tip: Stagger launch times (e.g. 10 AM, 12 PM, 2 PM) to preserve domain deliverability.
                    </div>
                </div>
            </div>

            {/* 3. INTERACTIVE SIMULATOR (EXPANDABLE) */}
            {isSimOpen && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-[#FFFDF0] dark:bg-zinc-850 p-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <ZapIcon className="w-4 h-4 text-amber-600" />
                            <h4 className="text-[12.5px] font-bold text-slate-900 dark:text-white">
                                Campaign Alignment Feasibility Simulator
                            </h4>
                        </div>
                        <span className="text-[11px] text-slate-500">Test before you launch</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600 dark:text-zinc-300 mb-3">
                        Enter how many leads you plan to send to see how it impacts Today&apos;s and Tomorrow&apos;s {limit.toLocaleString()} daily limit:
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <label className="text-[12px] font-semibold text-slate-700 shrink-0">Planned Leads:</label>
                            <input
                                type="number"
                                min="10"
                                max="3400"
                                step="50"
                                value={simLeads}
                                onChange={(e) => setSimLeads(Math.max(10, Number(e.target.value) || 0))}
                                className="w-32 px-2.5 py-1 text-[13px] font-bold rounded-md border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <div className="flex gap-1">
                                {[100, 250, 500, 1000].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setSimLeads(preset)}
                                        className="px-2 py-0.5 rounded text-[10.5px] font-medium border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
                                    >
                                        +{preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Simulation Result Pills */}
                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                            <div
                                className={`px-3 py-1.5 rounded-lg border text-[11.5px] font-medium flex items-center gap-1.5 ${
                                    simTodayFits
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                        : "bg-rose-50 border-rose-200 text-rose-800"
                                }`}
                            >
                                {simTodayFits ? <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircleIcon className="w-3.5 h-3.5 text-rose-600" />}
                                <span>
                                    <strong>Launch Today:</strong> {simTodayNewTotal.toLocaleString()} / {limit.toLocaleString()} ({simTodayUtil}%) —{" "}
                                    {simTodayFits ? "Allowed & Safe" : `Exceeds quota by ${(simTodayNewTotal - limit).toLocaleString()}`}
                                </span>
                            </div>

                            <div
                                className={`px-3 py-1.5 rounded-lg border text-[11.5px] font-medium flex items-center gap-1.5 ${
                                    simTomorrowFits
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                        : "bg-amber-50 border-amber-200 text-amber-900"
                                }`}
                            >
                                {simTomorrowFits ? <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600" />}
                                <span>
                                    <strong>Schedule Tomorrow:</strong> {simTomorrowNewTotal.toLocaleString()} / {limit.toLocaleString()} ({simTomorrowUtil}%) —{" "}
                                    {simTomorrowFits ? "Safe" : "Overallocated (Stagger to Friday)"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. 7-DAY ROLLING CAPACITY TIMELINE BAR */}
            <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <TrendingUpIcon className="w-3.5 h-3.5 text-slate-500" />
                        7-Day Dispatch Capacity Runway
                    </span>
                    <span className="text-slate-400 text-[10.5px]">Cap = {limit.toLocaleString()} emails/day</span>
                </div>

                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {timeline.map((day, idx) => {
                        const isToday = idx === 0;
                        const isTomorrow = idx === 1;
                        const isWeekend = !day.is_sending_day;

                        let barColor = "bg-emerald-500";
                        if (isWeekend) barColor = "bg-slate-200 dark:bg-zinc-800";
                        else if (day.utilization_pct >= 95) barColor = "bg-rose-500";
                        else if (day.utilization_pct >= 65) barColor = "bg-amber-500";

                        return (
                            <div
                                key={day.date}
                                className={`rounded-lg border p-2 flex flex-col justify-between transition-all ${
                                    isToday
                                        ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 shadow-2xs"
                                        : isTomorrow
                                        ? "border-blue-300 bg-blue-50/30 dark:bg-blue-950/20"
                                        : isWeekend
                                        ? "border-slate-100 bg-slate-50/40 dark:border-zinc-850 dark:bg-zinc-900/40 opacity-70"
                                        : "border-slate-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                                }`}
                            >
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                    <span className={`font-bold ${isToday ? "text-amber-900 font-extrabold" : "text-slate-700 dark:text-zinc-300"}`}>
                                        {day.day_name} {isToday && "(Today)"} {isTomorrow && "(Tmrw)"}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {day.date.slice(5)}
                                    </span>
                                </div>

                                <div className="text-[13px] font-bold text-slate-900 dark:text-white tabular-nums">
                                    {isWeekend ? "Rest Day" : day.projected_leads.toLocaleString()}
                                </div>

                                {/* Mini Bar */}
                                <div className="my-1.5 w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                    {!isWeekend && (
                                        <div
                                            className={`h-full rounded-full ${barColor}`}
                                            style={{ width: `${Math.min(100, Math.max(8, day.utilization_pct))}%` }}
                                        />
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>{isWeekend ? "Warmup only" : `${day.utilization_pct}%`}</span>
                                    <span>{isWeekend ? "—" : `${day.campaigns_count} camps`}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 5. ALIGNED CAMPAIGNS ROSTER (COLLAPSIBLE) */}
            {isRosterExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-zinc-800 animate-in fade-in duration-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                            <h4 className="text-[12.5px] font-bold text-slate-900 dark:text-white">
                                Active Aligned Campaigns Taking Quota ({alignedCampaigns.length})
                            </h4>
                            <span className="text-[11px] text-slate-500">Sorted by lead volume</span>
                        </div>

                        {/* Search & Filter */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Filter campaign or owner..."
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    className="pl-8 pr-2.5 py-1 text-[11.5px] rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white w-48 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                            </div>

                            <select
                                value={ownerFilter}
                                onChange={(e) => setOwnerFilter(e.target.value)}
                                className="px-2 py-1 text-[11.5px] rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200"
                            >
                                <option value="ALL">All Owners ({owners.length})</option>
                                {owners.map((owner) => (
                                    <option key={owner} value={owner}>
                                        {owner}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Campaigns Table */}
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
                        <table className="w-full text-left text-[11.5px]">
                            <thead className="bg-slate-50 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 font-semibold border-b border-slate-200 dark:border-zinc-700">
                                <tr>
                                    <th className="py-2 px-3">Campaign Name</th>
                                    <th className="py-2 px-3">Owner</th>
                                    <th className="py-2 px-3 text-right">Uncontacted</th>
                                    <th className="py-2 px-3 text-right">In Sequence</th>
                                    <th className="py-2 px-3 text-right">Est. Daily Dispatch</th>
                                    <th className="py-2 px-3 text-right">Quota Share</th>
                                    <th className="py-2 px-3 text-center">Schedule</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                {filteredCampaigns.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-4 text-center text-slate-400">
                                            No aligned campaigns match filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCampaigns.map((camp) => (
                                        <tr key={camp.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-zinc-100 max-w-[220px] truncate" title={camp.name}>
                                                {camp.name}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                                                <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                                <span className="truncate">{camp.owner_name}</span>
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-800 dark:text-zinc-200">
                                                {camp.uncontacted_leads.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-500">
                                                {camp.in_sequence_leads.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 dark:text-amber-400">
                                                ~{camp.estimated_daily} / day
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                                    {camp.quota_share_pct}%
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-center text-[10.5px] text-slate-500">
                                                {camp.preferred_hour}:00 IST · Mon–Fri
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
export default CapacityScheduleTracker;
