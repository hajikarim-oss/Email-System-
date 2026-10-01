// Top metric strip for the unibox.
//
// Numbers come from /unibox/overview so the strip is server-truth,
// not a sample of whatever happens to be loaded in the list.
//
// On phones and tablets the desktop ScopeRail is hidden, so we
// render a "Scope" pill in the strip that opens a ScopeSheet. The
// pill always sits on the left edge so it stays reachable even when
// the rest of the strip scrolls horizontally.

import { LayoutGridIcon, PenLineIcon, XIcon, UsersIcon, UserIcon, CheckIcon } from "lucide-react";
import useUniboxOverview from "@/lib/api/hooks/app/unibox/useUniboxOverview";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import ShortcutTooltip from "@/components/ui/shortcut-tooltip";
import { useComposeStore } from "@/hooks/useComposeStore";
import { PopoverMenu, PopoverMenuTrigger, PopoverMenuContent, PopoverMenuItem, SelectButton } from "@/components/ui/popover-menu";
import { cn } from "@/lib/utils";

export const UNIBOX_TEAM_MEMBERS = [
    { id: "all", name: "All Team Members", email: "all", role: "Overview", mailboxIds: [] },
    { id: "cmtr9pp8t0000cygeyjpsz5lt", name: "Haji Karim", email: "haji.karim@theboredmonkey.com", role: "Master (Founder)", mailboxIds: ["cmtlkufpi000o80qmmlfsfat7"] },
    { id: "cmu6m304o00003307qj8ex6oa", name: "Vatsal Vadecha", email: "vatsal.vadecha@theboredmonkey.com", role: "Growth", mailboxIds: ["cmu6m304o00003307qj8ex6oa"] },
    { id: "cmu6m31bv00033307zao17anp", name: "Preeti Karki", email: "preeti.karki@theboredmonkey.com", role: "Outreach", mailboxIds: ["cmu6m31bv00033307zao17anp"] },
    { id: "cmttwwhj5000ovdkr7ooyb6qt", name: "Snehal Maurya", email: "snehal.maurya@theboredmonkey.com", role: "Campaigns", mailboxIds: ["cmtu07q0i00011wxajyd2ehui", "cmttwwhj5000ovdkr7ooyb6qt"] },
];

interface UniboxHeaderProps {
    scopeLabel: string;
    onClearScope?: () => void;
    onOpenScopeSheet?: () => void;
    selectedMemberId?: string;
    onSelectMember?: (id: string) => void;
    isMaster?: boolean;
    currentUser?: any;
}

export function UniboxHeader({
    scopeLabel,
    onClearScope,
    onOpenScopeSheet,
    selectedMemberId = "all",
    onSelectMember,
    isMaster = true,
    currentUser,
}: UniboxHeaderProps) {
    const overview = useUniboxOverview();
    const data = overview.data;

    const currentMember = UNIBOX_TEAM_MEMBERS.find((m) => m.id === selectedMemberId) || UNIBOX_TEAM_MEMBERS[0];
    const nonMasterMember = UNIBOX_TEAM_MEMBERS.find(m => m.email.toLowerCase() === currentUser?.email?.toLowerCase()) || {
        name: currentUser?.name || "My Inbound",
        role: "Team Member",
    };

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
                <PopoverMenu>
                    <PopoverMenuTrigger asChild>
                        <SelectButton
                            icon={<UsersIcon className="w-3.5 h-3.5 text-sky-600" />}
                            label={currentMember.name}
                            className="h-7 text-xs font-medium w-[150px] justify-between shrink-0"
                        />
                    </PopoverMenuTrigger>
                    <PopoverMenuContent align="start" className="w-56 p-1 z-50">
                        {UNIBOX_TEAM_MEMBERS.map((member) => (
                            <PopoverMenuItem
                                key={member.id}
                                onClick={() => onSelectMember?.(member.id)}
                                className={cn(
                                    "flex items-center justify-between text-xs px-2.5 py-1.5 rounded cursor-pointer",
                                    selectedMemberId === member.id && "bg-sky-50 text-sky-700 font-semibold"
                                )}
                            >
                                <div className="flex flex-col">
                                    <span>{member.name}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{member.role}</span>
                                </div>
                                {selectedMemberId === member.id && (
                                    <CheckIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                )}
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

            {scopeLabel !== "All" && (
                <button
                    type="button"
                    onClick={onClearScope}
                    className="inline-flex items-center gap-1 h-5 pl-1.5 pr-1 rounded bg-sky-50 text-sky-700 text-[11px] font-medium hover:bg-sky-100 transition-colors shrink-0"
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
                        className="lg:hidden inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11.5px] font-medium shadow-sm shadow-sky-600/20 transition-colors"
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
                    tone === "accent" ? "text-sky-600" : muted ? "text-slate-400" : "text-slate-900",
                )}
            >
                <AnimatedNumber value={value} />
            </span>
            <span className="text-[10.5px] text-slate-500">{label}</span>
        </div>
    );
}
