import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    ReplyIcon,
    UsersIcon,
    FolderIcon,
    ArrowUpRightIcon,
    SparklesIcon,
    SearchIcon,
    ClockIcon,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReportReply } from "@/lib/api/models/app/analytics/SystemReport";

export interface RepliesHubViewProps {
    replies: ReportReply[];
    teamMembers: Array<{ id: string; name: string; email?: string; role?: string }>;
    selectedMemberId?: string;
    onSelectMember?: (id: string) => void;
    onClose?: () => void;
}

function relTime(iso: string | null): string {
    if (!iso) return "recently";
    const d = new Date(iso);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isMemberMatch(
    r: ReportReply,
    m: { id: string; name: string; email?: string; role?: string }
): boolean {
    if (!m || m.id === "all") return true;

    // Direct ID match
    if (r.team_member_id && r.team_member_id === m.id) return true;

    const mName = m.name.toLowerCase();
    const rTeam = (r.team_member || "").toLowerCase();

    // Direct team_member name match (e.g. "Snehal Maurya" or "Snehal")
    if (rTeam && (rTeam.includes(mName) || mName.includes(rTeam))) return true;

    // Check first name match (e.g. "Snehal" in "Snehal Maurya")
    const firstName = m.name.split(" ")[0].toLowerCase();
    if (firstName.length > 2) {
        if (rTeam && rTeam.includes(firstName)) return true;
        const rCamp = (r.campaign || "").toLowerCase();
        if (rCamp.includes(firstName)) return true;
    }

    // Monu / Master role mapping
    const isMasterUser =
        mName.includes("monu") ||
        (m.role && m.role.toLowerCase() === "master") ||
        (m.email && m.email.toLowerCase().includes("monu"));

    if (isMasterUser) {
        // If the reply is labeled as Master or has no team member assigned
        if (rTeam.includes("master") || !r.team_member_id) {
            const belongsToOther = ["snehal", "vatsal", "preeti"].some(
                (other) => rTeam.includes(other) || (r.campaign || "").toLowerCase().includes(other)
            );
            if (!belongsToOther) return true;
        }
    }

    return false;
}

export function RepliesHubView({
    replies,
    teamMembers,
    selectedMemberId = "all",
    onSelectMember,
    onClose,
}: RepliesHubViewProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMember, setFilterMember] = useState<string>(selectedMemberId);
    const [filterCampaign, setFilterCampaign] = useState<string>("all");

    React.useEffect(() => {
        if (selectedMemberId) {
            setFilterMember(selectedMemberId);
        }
    }, [selectedMemberId]);

    const campaignList = useMemo(() => {
        const set = new Set<string>();
        replies.forEach((r) => {
            if (r.campaign && r.campaign.trim()) set.add(r.campaign.trim());
        });
        return Array.from(set).sort();
    }, [replies]);

    const filteredReplies = useMemo(() => {
        return replies.filter((r) => {
            if (filterMember !== "all") {
                const targetMember = teamMembers.find((m) => m.id === filterMember);
                if (targetMember && !isMemberMatch(r, targetMember)) {
                    return false;
                }
            }

            if (filterCampaign !== "all") {
                if (!r.campaign || r.campaign.trim().toLowerCase() !== filterCampaign.trim().toLowerCase()) {
                    return false;
                }
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inName = (r.contact_name || "").toLowerCase().includes(q);
                const inEmail = (r.contact_email || "").toLowerCase().includes(q);
                const inSubject = (r.subject || "").toLowerCase().includes(q);
                const inSnippet = (r.snippet || "").toLowerCase().includes(q);
                const inCamp = (r.campaign || "").toLowerCase().includes(q);
                const inMember = (r.team_member || "").toLowerCase().includes(q);
                if (!inName && !inEmail && !inSubject && !inSnippet && !inCamp && !inMember) {
                    return false;
                }
            }

            return true;
        });
    }, [replies, filterMember, filterCampaign, searchQuery, teamMembers]);

    const memberCounts = useMemo(() => {
        const counts: Record<string, number> = { all: replies.length };
        teamMembers.forEach((m) => {
            if (m.id === "all") return;
            counts[m.id] = replies.filter((r) => isMemberMatch(r, m)).length;
        });
        return counts;
    }, [replies, teamMembers]);

    const handleOpenThread = (r: ReportReply) => {
        if (onClose) onClose();
        const threadId = r.thread_id || (r.lead_id ? `th_camp_${r.lead_id}` : "");
        if (threadId) {
            navigate(`/app/unibox/all/${threadId}`);
        } else {
            navigate(`/app/unibox/all`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white text-slate-900">
            {/* Controls Toolbar: Team Member, Campaign Filter, Search */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center gap-3 justify-between">
                {/* Member Switcher Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                        Team:
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setFilterMember("all");
                            onSelectMember?.("all");
                        }}
                        className={cn(
                            "px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer",
                            filterMember === "all"
                                ? "bg-slate-900 text-white shadow-2xs font-semibold"
                                : "bg-stone-100 text-slate-700 hover:bg-stone-200/80"
                        )}
                    >
                        <span>All Members</span>
                        <span className={cn(
                            "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                            filterMember === "all" ? "bg-[#FFE600] text-slate-950 font-bold" : "bg-stone-200 text-slate-800"
                        )}>
                            {memberCounts.all || 0}
                        </span>
                    </button>
                    {teamMembers.filter((m) => m.id !== "all").map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                                setFilterMember(m.id);
                                onSelectMember?.(m.id);
                            }}
                            className={cn(
                                "px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer",
                                filterMember === m.id
                                    ? "bg-slate-900 text-white shadow-2xs font-semibold"
                                    : "bg-stone-100 text-slate-700 hover:bg-stone-200/80"
                            )}
                        >
                            <span>{m.name}</span>
                            {(memberCounts[m.id] || 0) > 0 && (
                                <span className={cn(
                                    "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                                    filterMember === m.id ? "bg-[#FFE600] text-slate-950 font-bold" : "bg-[#FFF9DB] text-slate-900 border border-amber-200/80"
                                )}>
                                    {memberCounts[m.id]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Campaign Filter & Search */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {campaignList.length > 0 && (
                        <select
                            value={filterCampaign}
                            onChange={(e) => setFilterCampaign(e.target.value)}
                            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-800 focus:outline-none shadow-2xs"
                        >
                            <option value="all">All Campaigns</option>
                            {campaignList.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    )}
                    <div className="relative flex-1 sm:w-48">
                        <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                        <Input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search replies..."
                            className="h-8 pl-8 pr-3 text-[12px] bg-white border-slate-200 rounded-md shadow-2xs"
                        />
                    </div>
                </div>
            </div>

            {/* Replies List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 max-h-[520px]">
                {filteredReplies.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                        <span className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-slate-400 mb-2.5">
                            <ReplyIcon className="w-5 h-5" />
                        </span>
                        <h3 className="text-[13px] font-bold text-slate-900">
                            No replies match current filters
                        </h3>
                        <p className="text-[12px] text-slate-500 max-w-sm mt-1">
                            Switch team members or clear the search query to view prospect conversations.
                        </p>
                    </div>
                ) : (
                    filteredReplies.map((r, i) => {
                        const displayName = r.contact_name || r.contact_email;
                        const initials = (r.contact_name || r.contact_email || "??")
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();

                        return (
                            <div
                                key={r.lead_id || r.contact_email + i}
                                onClick={() => handleOpenThread(r)}
                                className="group p-3.5 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-white hover:bg-stone-50/60 transition-all cursor-pointer shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    {/* Avatar */}
                                    <div className="w-8 h-8 rounded-full bg-[#FFF9DB] text-slate-900 font-bold text-[11px] flex items-center justify-center shrink-0 border border-amber-200 shadow-2xs">
                                        {initials}
                                    </div>

                                    {/* Content */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="text-[13px] font-bold text-slate-900">
                                                {displayName}
                                            </span>
                                            <span className="text-[11.5px] text-slate-500 font-mono">
                                                &lt;{r.contact_email}&gt;
                                            </span>
                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#FFF9DB] text-slate-900 border border-amber-200/80 flex items-center gap-1">
                                                <SparklesIcon className="w-2.5 h-2.5" />
                                                {r.classification && r.classification !== "NONE" ? r.classification : "Interested"}
                                            </span>
                                            {r.campaign && (
                                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-stone-100 text-slate-700 border border-stone-200 flex items-center gap-1">
                                                    <FolderIcon className="w-2.5 h-2.5 text-slate-400" />
                                                    {r.campaign}
                                                </span>
                                            )}
                                            {r.team_member && (
                                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-800 flex items-center gap-1">
                                                    <UsersIcon className="w-2.5 h-2.5 text-slate-500" />
                                                    {r.team_member}
                                                </span>
                                            )}
                                        </div>

                                        {/* Subject & Preview */}
                                        <div className="text-[12px] font-semibold text-slate-800 mb-0.5 truncate">
                                            {r.subject}
                                        </div>
                                        {(r.snippet || r.subject) && (
                                            <p className="text-[12px] text-slate-600 line-clamp-2 leading-relaxed">
                                                &ldquo;{r.snippet || r.subject}&rdquo;
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Action & Timestamp */}
                                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                                        <ClockIcon className="w-3 h-3" />
                                        <span>{relTime(r.replied_at)}</span>
                                    </div>
                                    <Button
                                        size="xs"
                                        variant="default"
                                        className="h-7 px-2.5 text-[11px] gap-1 shadow-2xs group-hover:bg-[#F2DC00]"
                                    >
                                        <span>Open in Inbox</span>
                                        <ArrowUpRightIcon className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export interface RepliesHubModalProps {
    open: boolean;
    onClose: () => void;
    replies: ReportReply[];
    teamMembers: Array<{ id: string; name: string; email?: string; role?: string }>;
    selectedMemberId?: string;
    onSelectMember?: (id: string) => void;
}

export default function RepliesHubModal({
    open,
    onClose,
    replies,
    teamMembers,
    selectedMemberId = "all",
    onSelectMember,
}: RepliesHubModalProps) {
    const navigate = useNavigate();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden bg-white border border-slate-200/90 shadow-2xl">
                {/* Header matching standard app dialogs */}
                <DialogHeader className="p-4 sm:p-5 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#FFE600] flex items-center justify-center text-slate-950 border border-black/10 shrink-0 shadow-2xs">
                            <ReplyIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-base font-bold text-slate-900 tracking-tight">
                                    Inbound Replies Radar
                                </DialogTitle>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#FFF9DB] text-slate-900 border border-amber-200/80">
                                    {replies.length} Prospect Responses
                                </span>
                            </div>
                            <DialogDescription className="text-xs text-slate-500 mt-0.5">
                                Verified prospect responses across Master &amp; Team Member campaigns. Click any conversation to view and respond in the Unibox.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Hub View Content */}
                <RepliesHubView
                    replies={replies}
                    teamMembers={teamMembers}
                    selectedMemberId={selectedMemberId}
                    onSelectMember={onSelectMember}
                    onClose={onClose}
                />

                {/* Footer matching standard app dialogs */}
                <DialogFooter className="p-3.5 px-5 border-t border-slate-100 bg-[#FAFAFA] flex items-center justify-between sm:justify-between w-full">
                    <span className="text-[11.5px] text-slate-500">
                        Direct sync with verified Smartlead webhooks &amp; mail logs
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            className="h-8 text-xs"
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => {
                                onClose();
                                navigate("/app/unibox/all");
                            }}
                            className="h-8 text-xs gap-1"
                        >
                            <span>Open Unibox</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
