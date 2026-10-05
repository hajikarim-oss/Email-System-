// Top metric strip for the unibox.
//
// Numbers come from /unibox/overview so the strip is server-truth,
// not a sample of whatever happens to be loaded in the list.
//
// On phones and tablets the desktop ScopeRail is hidden, so we
// render a "Scope" pill in the strip that opens a ScopeSheet. The
// pill always sits on the left edge so it stays reachable even when
// the rest of the strip scrolls horizontally.

import * as React from "react";
import { LayoutGridIcon, PenLineIcon, XIcon, UsersIcon, UserIcon, CheckIcon, LayersIcon, CalendarIcon } from "lucide-react";
import useUniboxOverview from "@/lib/api/hooks/app/unibox/useUniboxOverview";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import ShortcutTooltip from "@/components/ui/shortcut-tooltip";
import { useComposeStore } from "@/hooks/useComposeStore";
import { PopoverMenu, PopoverMenuTrigger, PopoverMenuContent, PopoverMenuItem, SelectButton } from "@/components/ui/popover-menu";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";

export const UNIBOX_TEAM_MEMBERS = [
    { id: "all", name: "All Team Members", email: "all", role: "Overview", mailboxIds: [], unread: 0 },
    { id: "cmtr9pp8t0000cygeyjpsz5lt", name: "Monu", email: "monu@theboredmonkey.com", role: "Master", mailboxIds: ["cmtlkufpi000o80qmmlfsfat7"], unread: 0 },
    { id: "cmu6m304o00003307qj8ex6oa", name: "Vatsal Vadecha", email: "vatsal.vadecha@theboredmonkey.com", role: "Growth", mailboxIds: ["cmu6m304o00003307qj8ex6oa", "cmu6m30qk00023307x29a9x30"], unread: 0 },
    { id: "cmu6m31bv00033307zao17anp", name: "Preeti Karki", email: "preeti.karki@theboredmonkey.com", role: "Outreach", mailboxIds: ["cmu6m31bv00033307zao17anp", "cmu6m31vx00053307frspcjkj"], unread: 0 },
    { id: "cmttwwhj5000ovdkr7ooyb6qt", name: "Snehal Maurya", email: "snehal.maurya@theboredmonkey.com", role: "Campaigns", mailboxIds: ["cmtu07q0i00011wxajyd2ehui", "cmttwwhj5000ovdkr7ooyb6qt"], unread: 0 },
];

export const UNIBOX_CAMPAIGNS = [
    { id: "all", name: "All Campaigns", code: "All", leadCount: 50, unread: 4 },
    { id: "cmp_1790233732719_dvlj", name: "Q3 Campaign", code: "Th_camp_bewakoof_q3", leadCount: 50, unread: 2, memberId: "cmu6m304o00003307qj8ex6oa" },
    { id: "cmp_1789718475256_g91f", name: "Q2 Reachout Mails", code: "Th_camp_q2_reachout", leadCount: 30, unread: 1, memberId: "cmu6m304o00003307qj8ex6oa" },
    { id: "cmp_1789560721755", name: "Campaign 120", code: "Th_camp_120", leadCount: 45, unread: 1, memberId: "cmttwwhj5000ovdkr7ooyb6qt" },
    { id: "cmtwmgdm00001sikkb3l1bc3r", name: "Pratik is testing", code: "Th_camp_pratik_test", leadCount: 15, unread: 0, memberId: "cmtr9pp8t0000cygeyjpsz5lt" },
    { id: "cmtvl4lye0001tdcgjxhipix8", name: "Campaign 108", code: "Th_camp_108", leadCount: 20, unread: 0, memberId: "cmu6m31bv00033307zao17anp" },
];

export type UniboxDatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

export interface UniboxDateFilterState {
    preset: UniboxDatePreset;
    since?: Date;
    until?: Date;
    customStart?: string;
    customEnd?: string;
    label?: string;
}

interface UniboxHeaderProps {
    scopeLabel: string;
    onClearScope?: () => void;
    onOpenScopeSheet?: () => void;
    selectedMemberId?: string;
    onSelectMember?: (id: string) => void;
    selectedCampaignId?: string;
    onSelectCampaign?: (id: string) => void;
    dateFilter?: UniboxDateFilterState;
    onSelectDatePreset?: (preset: UniboxDatePreset) => void;
    onApplyCustomDateRange?: (start: string, end: string) => void;
    isMaster?: boolean;
    currentUser?: any;
}

export function UniboxHeader({
    scopeLabel,
    onClearScope,
    onOpenScopeSheet,
    selectedMemberId = "all",
    onSelectMember,
    selectedCampaignId = "all",
    onSelectCampaign,
    dateFilter = { preset: "all" },
    onSelectDatePreset,
    onApplyCustomDateRange,
    isMaster = true,
    currentUser,
}: UniboxHeaderProps) {
    const overview = useUniboxOverview();
    const data = overview.data;

    const currentMember = UNIBOX_TEAM_MEMBERS.find((m) => m.id === selectedMemberId) || UNIBOX_TEAM_MEMBERS[0];
    const nonMasterMember = UNIBOX_TEAM_MEMBERS.find(m => m.email.toLowerCase() === currentUser?.email?.toLowerCase()) || {
        name: currentUser?.name || "My Inbound",
        role: "Team Member",
        unread: 2,
    };

    const currentCampaign = UNIBOX_CAMPAIGNS.find((c) => c.id === selectedCampaignId) || UNIBOX_CAMPAIGNS[0];

    // Filter available campaigns for current user if not master
    const visibleCampaigns = React.useMemo(() => {
        if (isMaster) return UNIBOX_CAMPAIGNS;
        const userMem = UNIBOX_TEAM_MEMBERS.find(m => m.email.toLowerCase() === currentUser?.email?.toLowerCase());
        if (!userMem) return UNIBOX_CAMPAIGNS;
        return [
            UNIBOX_CAMPAIGNS[0],
            ...UNIBOX_CAMPAIGNS.filter(c => c.id !== "all" && (!c.memberId || c.memberId === userMem.id))
        ];
    }, [isMaster, currentUser]);

    const [customFrom, setCustomFrom] = React.useState(dateFilter.customStart || "");
    const [customTo, setCustomTo] = React.useState(dateFilter.customEnd || "");

    React.useEffect(() => {
        if (dateFilter.customStart !== undefined) setCustomFrom(dateFilter.customStart);
        if (dateFilter.customEnd !== undefined) setCustomTo(dateFilter.customEnd);
    }, [dateFilter.customStart, dateFilter.customEnd]);

    return (
        <header className="h-10 px-3 sm:px-4 border-b border-slate-200 bg-white flex items-center gap-2 sm:gap-3 shrink-0 overflow-x-auto">
            {onOpenScopeSheet && (
                <button
                    type="button"
                    onClick={onOpenScopeSheet}
                    aria-label="Switch scope"
                    className="lg:hidden sticky left-0 z-10 bg-white inline-flex items-center gap-1 h-6 px-1.5 rounded-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11.5px] font-medium transition-colors shrink-0"
                >
                    <LayoutGridIcon className="w-3 h-3" />
                    Scope
                </button>
            )}

            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold shrink-0 hidden sm:inline">
                Inbox
            </span>

            {/* Team Member Filter: Master has full workspace selector; Team member locked to own profile */}
            {isMaster ? (
                <PopoverMenu align="start">
                    <PopoverMenuTrigger asChild>
                        <SelectButton
                            icon={<UsersIcon className="w-3.5 h-3.5 text-slate-900" />}
                            label={currentMember.name}
                            className="h-7 text-xs font-medium w-[160px] justify-between shrink-0"
                        />
                    </PopoverMenuTrigger>
                    <PopoverMenuContent minWidth={290} className="w-[300px] p-1.5 shadow-xl border border-slate-200/90 rounded-xl bg-white z-50">
                        <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-100 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team Members</span>
                            <span className="text-[10px] text-slate-400 font-medium">{UNIBOX_TEAM_MEMBERS.length - 1} members</span>
                        </div>
                        {UNIBOX_TEAM_MEMBERS.map((member) => (
                            <PopoverMenuItem
                                key={member.id}
                                selected={selectedMemberId === member.id}
                                onSelect={() => onSelectMember?.(member.id)}
                                trailing={
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {member.unread > 0 && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFF3B0] text-slate-900 shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#18181B] shrink-0" />
                                                {member.unread} unread
                                            </span>
                                        )}
                                        {selectedMemberId === member.id && (
                                            <CheckIcon className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                                        )}
                                    </div>
                                }
                                className={cn(
                                    "flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors mb-0.5",
                                    selectedMemberId === member.id
                                        ? "bg-[#FFF9DB] text-slate-900 font-medium"
                                        : "hover:bg-slate-50 text-slate-700"
                                )}
                            >
                                <div className="flex flex-col min-w-0 pr-1">
                                    <span className={cn(
                                        "text-[12.5px] truncate leading-snug",
                                        selectedMemberId === member.id ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                                    )}>
                                        {member.name}
                                    </span>
                                    <span className="text-[10.5px] text-slate-400 truncate">
                                        {member.role}
                                    </span>
                                </div>
                            </PopoverMenuItem>
                        ))}
                    </PopoverMenuContent>
                </PopoverMenu>
            ) : (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 shrink-0">
                    <UserIcon className="w-3 h-3 text-slate-500" />
                    <span>{nonMasterMember.name}</span>
                    <span className="text-[9.5px] px-1 py-0.2 rounded bg-slate-200/70 text-slate-600 font-normal">{nonMasterMember.role}</span>
                </div>
            )}

            {/* Campaign Filter Dropdown: Available for both Master and Team Members with Unread Highlight */}
            <PopoverMenu align="start">
                <PopoverMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors shrink-0",
                            selectedCampaignId !== "all"
                                ? "bg-[#FFF9DB]/80 border-amber-200 text-slate-900 font-semibold shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                    >
                        <LayersIcon className={cn("w-3.5 h-3.5", selectedCampaignId !== "all" ? "text-slate-900" : "text-slate-500")} />
                        <span className="truncate max-w-[130px]">{currentCampaign.name}</span>
                        {currentCampaign.unread > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FFE600]/60/80 text-slate-900">
                                {currentCampaign.unread}
                            </span>
                        )}
                    </button>
                </PopoverMenuTrigger>
                <PopoverMenuContent minWidth={320} className="w-[330px] p-1.5 shadow-xl border border-slate-200/90 rounded-xl bg-white z-50">
                    <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-100 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filter by Campaign</span>
                        <span className="text-[10px] text-slate-400 font-medium">{visibleCampaigns.length - 1} campaigns</span>
                    </div>
                    {visibleCampaigns.map((camp) => (
                        <PopoverMenuItem
                            key={camp.id}
                            selected={selectedCampaignId === camp.id}
                            onSelect={() => onSelectCampaign?.(camp.id)}
                            trailing={
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {camp.unread > 0 && (
                                        <span className={cn(
                                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0",
                                            camp.id === "cmp_1790233732719_dvlj"
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                                : "bg-[#FFF3B0] text-slate-900"
                                        )}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                                            {camp.unread} unread
                                        </span>
                                    )}
                                    {selectedCampaignId === camp.id && (
                                        <CheckIcon className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                                    )}
                                </div>
                            }
                            className={cn(
                                "flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors mb-0.5",
                                selectedCampaignId === camp.id
                                    ? "bg-[#FFF9DB] text-slate-900 font-medium"
                                    : "hover:bg-slate-50 text-slate-700"
                            )}
                        >
                            <div className="flex flex-col min-w-0 pr-1">
                                <span className={cn(
                                    "text-[12.5px] truncate leading-snug",
                                    selectedCampaignId === camp.id ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                                )}>
                                    {camp.name}
                                </span>
                                {camp.id !== "all" && camp.code && (
                                    <span className="text-[10.5px] text-slate-400 font-mono tracking-tight truncate">
                                        {camp.code}
                                    </span>
                                )}
                            </div>
                        </PopoverMenuItem>
                    ))}
                </PopoverMenuContent>
            </PopoverMenu>

            {/* Campaign breadcrumb chip when active */}
            {selectedCampaignId !== "all" && (
                <div className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-[#FFF3B0] text-slate-900 text-[11px] font-medium shrink-0">
                    <span>{currentCampaign.code || currentCampaign.name}</span>
                    <button
                        type="button"
                        onClick={() => onSelectCampaign?.("all")}
                        className="hover:bg-[#FFE600]/60 rounded-full p-0.5 transition-colors"
                        aria-label="Clear campaign filter"
                    >
                        <XIcon className="w-2.5 h-2.5" />
                    </button>
                </div>
            )}

            {/* Date Filter Dropdown */}
            <PopoverMenu align="start">
                <PopoverMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors shrink-0",
                            dateFilter.preset !== "all"
                                ? "bg-[#FFF9DB]/80 border-amber-200 text-slate-900 font-semibold shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                    >
                        <CalendarIcon className={cn("w-3.5 h-3.5", dateFilter.preset !== "all" ? "text-slate-900" : "text-slate-500")} />
                        <span className="truncate max-w-[125px]">
                            {dateFilter.preset === "all" ? "Date" : (dateFilter.label || "Date Filter")}
                        </span>
                        {dateFilter.preset !== "all" && (
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectDatePreset?.("all");
                                }}
                                className="hover:bg-[#FFE600]/60 rounded-full p-0.5 transition-colors ml-0.5"
                                aria-label="Clear date filter"
                            >
                                <XIcon className="w-2.5 h-2.5" />
                            </span>
                        )}
                    </button>
                </PopoverMenuTrigger>
                <PopoverMenuContent minWidth={270} className="w-[280px] p-2 shadow-xl border border-slate-200/90 rounded-xl bg-white z-50">
                    <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filter by Date</span>
                        {dateFilter.preset !== "all" && (
                            <button
                                type="button"
                                onClick={() => onSelectDatePreset?.("all")}
                                className="text-[10.5px] text-slate-900 hover:text-black font-medium"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                    <div className="space-y-0.5">
                        {[
                            { id: "all", label: "All time" },
                            { id: "today", label: "Today" },
                            { id: "yesterday", label: "Yesterday" },
                            { id: "7d", label: "Last 7 days" },
                            { id: "30d", label: "Last 30 days" },
                        ].map((item) => (
                            <PopoverMenuItem
                                key={item.id}
                                selected={dateFilter.preset === item.id}
                                onSelect={() => onSelectDatePreset?.(item.id as UniboxDatePreset)}
                                trailing={
                                    dateFilter.preset === item.id ? (
                                        <CheckIcon className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                                    ) : undefined
                                }
                                className={cn(
                                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors",
                                    dateFilter.preset === item.id
                                        ? "bg-[#FFF9DB] text-slate-900 font-semibold"
                                        : "hover:bg-slate-50 text-slate-700"
                                )}
                            >
                                <span>{item.label}</span>
                            </PopoverMenuItem>
                        ))}
                    </div>

                    {/* Custom Date Range Picker */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between px-1 mb-1.5">
                            <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                                Custom Range
                            </span>
                            {dateFilter.preset === "custom" && (
                                <span className="text-[10px] font-semibold text-slate-900">Active</span>
                            )}
                        </div>
                        <div className="space-y-1.5 px-0.5">
                            <div>
                                <label className="text-[10px] text-slate-400 font-medium block mb-0.5">From</label>
                                <DatePicker
                                    value={customFrom}
                                    onChange={setCustomFrom}
                                    placeholder="Start date"
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-400 font-medium block mb-0.5">To</label>
                                <DatePicker
                                    value={customTo}
                                    onChange={setCustomTo}
                                    placeholder="End date"
                                    className="w-full"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={!customFrom && !customTo}
                                onClick={() => onApplyCustomDateRange?.(customFrom, customTo)}
                                className="w-full mt-1 h-7 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-white text-[11.5px] font-medium transition-colors"
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                </PopoverMenuContent>
            </PopoverMenu>

            {/* Date filter active breadcrumb chip */}
            {dateFilter.preset !== "all" && (
                <div className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-[#FFF3B0] text-slate-900 text-[11px] font-medium shrink-0">
                    <CalendarIcon className="w-2.5 h-2.5 text-slate-900" />
                    <span>{dateFilter.label || "Date"}</span>
                    <button
                        type="button"
                        onClick={() => onSelectDatePreset?.("all")}
                        className="hover:bg-[#FFE600]/60 rounded-full p-0.5 transition-colors"
                        aria-label="Clear date filter"
                    >
                        <XIcon className="w-2.5 h-2.5" />
                    </button>
                </div>
            )}

            {scopeLabel !== "All" && (
                <button
                    type="button"
                    onClick={onClearScope}
                    className="inline-flex items-center gap-1 h-5 pl-1.5 pr-1 rounded bg-[#FFF9DB] text-slate-900 text-[11px] font-medium hover:bg-[#FFF3B0] transition-colors shrink-0"
                    aria-label="Clear scope"
                >
                    <span className="truncate max-w-[45vw] md:max-w-none">{scopeLabel}</span>
                    <XIcon className="w-2.5 h-2.5 shrink-0" />
                </button>
            )}

            <div className="h-4 w-px bg-slate-200 shrink-0 hidden sm:block" />

            <div className="flex items-center gap-3.5 min-w-0">
                <Stat
                    label="unread"
                    value={data?.unread ?? 0}
                    tone={data && data.unread > 0 ? "accent" : "default"}
                    muted={!data || data.unread === 0}
                />
                <Stat label="awaiting" value={data?.awaiting_reply ?? 0} />
                <Stat label="today" value={data?.today ?? 0} />
                <Stat label="week" value={data?.week ?? 0} />
                <Stat
                    label="snoozed"
                    value={data?.snoozed ?? 0}
                    muted
                    className="hidden sm:inline-flex"
                />
                <Stat
                    label="mailboxes"
                    value={data?.mailboxes.length ?? 0}
                    muted
                    className="hidden sm:inline-flex"
                />
            </div>

            <div className="ml-auto flex items-center gap-2.5 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                    <span className="relative flex size-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    live
                </span>
                {/* Desktop gets the rail's Compose button; this is the
                    phone/tablet entry where the rail is hidden. */}
                <ShortcutTooltip label="New email" combo="n">
                    <button
                        type="button"
                        onClick={() => useComposeStore.getState().openCompose()}
                        className="lg:hidden inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-[11.5px] font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                        <PenLineIcon className="w-3 h-3" />
                        Compose
                    </button>
                </ShortcutTooltip>
            </div>
        </header>
    );
}

function Stat({
    label,
    value,
    tone = "default",
    muted,
    className,
}: {
    label: string;
    value: number;
    tone?: "default" | "accent";
    muted?: boolean;
    className?: string;
}) {
    return (
        <div className={cn("inline-flex items-baseline gap-1 shrink-0", className)}>
            <span
                className={cn(
                    "font-mono tabular-nums text-[12.5px] font-semibold",
                    tone === "accent" ? "text-slate-900" : muted ? "text-slate-400" : "text-slate-900",
                )}
            >
                <AnimatedNumber value={value} />
            </span>
            <span className="text-[10.5px] text-slate-500">{label}</span>
        </div>
    );
}
