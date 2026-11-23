import React, { useState } from "react";
import {
    X as XIcon,
    ExternalLink as ExternalLinkIcon,
    Copy as CopyIcon,
    Check as CheckIcon,
    MapPin as MapPinIcon,
    Phone as PhoneIcon,
    Mail as MailIcon,
    Sparkles as SparklesIcon,
    Video as VideoIcon,
    Send as SendIcon,
    Heart as HeartIcon,
    MessageCircle as MessageCircleIcon,
    Eye as EyeIcon,
    TrendingUp as TrendingUpIcon,
    RefreshCw as RefreshCwIcon,
    BadgeCheck as BadgeCheckIcon,
    DollarSign as DollarSignIcon,
    Package as PackageIcon,
    ShieldCheck as ShieldCheckIcon,
    Clock as ClockIcon,
    Briefcase as BriefcaseIcon,
    FileText as FileTextIcon,
    UserCheck as UserCheckIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface CreatorDetailDrawerProps {
    creator: any;
    onClose: () => void;
    onUpdate?: (updated: any) => void;
}

export default function CreatorDetailDrawer({ creator, onClose, onUpdate }: CreatorDetailDrawerProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "commercials" | "intake">("overview");
    const [copied, setCopied] = useState(false);
    const [copiedHandle, setCopiedHandle] = useState(false);
    const [syncingIg, setSyncingIg] = useState(false);
    const [localIgInsights, setLocalIgInsights] = useState<any>(creator?.instagramInsights || null);

    if (!creator) return null;

    const cleanHandle = String(creator.handle || "").replace(/^@+/, "").trim();
    const igData = localIgInsights || creator.instagramInsights || {};
    const avatarUrl = igData?.profilePictureUrl || creator.profilePictureUrl || null;
    const isLinked = Boolean(creator.igConnected || igData?.igConnected);

    const handleSyncIg = async () => {
        setSyncingIg(true);
        try {
            const res = await fetch(`/api/creators/${encodeURIComponent(creator.id)}/sync-instagram`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ handle: cleanHandle }),
            });
            if (!res.ok) {
                const tok = creator.intakeToken || creator.id || "new";
                const fallbackRes = await fetch(`/api/creator/intake/${encodeURIComponent(tok)}/ig-lookup?handle=${encodeURIComponent(cleanHandle)}`);
                if (!fallbackRes.ok) throw new Error("Failed to sync Instagram insights");
                const data = await fallbackRes.json();
                setLocalIgInsights(data);
                if (onUpdate) onUpdate({ ...creator, instagramInsights: data, followersRaw: data.followersRaw || creator.followersRaw });
                toast.success("Instagram profile & verified insights refreshed!");
                return;
            }
            const payload = await res.json();
            const updatedCreator = payload.creator || creator;
            const insightsData = payload.insights || updatedCreator.instagramInsights || {};
            setLocalIgInsights(insightsData);
            if (onUpdate) onUpdate({ ...creator, ...updatedCreator, instagramInsights: insightsData });
            toast.success("Insights, engagement metrics & contact endpoints synced and auto-stored!");
        } catch (err: any) {
            toast.error(err?.message || "Unable to sync Instagram insights");
        } finally {
            setSyncingIg(false);
        }
    };

    const intakeUrl = `${window.location.origin}/creator/intake/${creator.intakeToken || creator.id}`;

    const handleCopyIntake = () => {
        navigator.clipboard.writeText(intakeUrl);
        setCopied(true);
        toast.success("Personalized intake link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyHandle = () => {
        navigator.clipboard.writeText(`@${cleanHandle}`);
        setCopiedHandle(true);
        toast.success("Handle copied to clipboard!");
        setTimeout(() => setCopiedHandle(false), 2000);
    };

    const isEnriched = creator.intakeStatus === "COMPLETED" || (creator.intakeCompletionPct && creator.intakeCompletionPct >= 80);

    // Compute Commercial ROI Benchmarks (internal intelligence)
    const rawReelRate = creator.commercialRates?.reelRate || creator.commercialRates?.reel;
    const numericReelRate = typeof rawReelRate === "number" ? rawReelRate : parseInt(String(rawReelRate || "").replace(/\D/g, ""), 10);
    const estViews = igData?.reach28d || igData?.avgReelViews || (igData?.avgLikes ? Math.round(igData.avgLikes * 10) : (creator.followersCount ? Math.round(creator.followersCount * 0.35) : 0));
    
    let cpvFormatted = "–";
    let roiTag = { label: "Standard", color: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300" };
    if (!isNaN(numericReelRate) && numericReelRate > 0 && estViews > 0) {
        const cpv = numericReelRate / estViews;
        cpvFormatted = `₹${cpv.toFixed(2)}`;
        if (cpv < 0.25) {
            roiTag = { label: "🌟 High ROI Potential (Low CPV)", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300" };
        } else if (cpv < 0.60) {
            roiTag = { label: "⚖️ Fair Market Rate", color: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300" };
        } else {
            roiTag = { label: "💎 Premium Tier", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300" };
        }
    }

    const engagementVal = parseFloat(String(igData?.engagementRatePct || "0"));
    let engagementBenchmark = "Normal";
    if (engagementVal >= 4.5) engagementBenchmark = "🔥 Elite (>4.5%)";
    else if (engagementVal >= 2.8) engagementBenchmark = "✨ Strong (>2.8%)";
    else if (engagementVal > 0) engagementBenchmark = "Standard";

    // Management display logic
    let managementLabel = "Self-managed";
    if (creator.managementType === "agency" || creator.agencyName) {
        managementLabel = `Agency: ${creator.agencyName || "Signed Agency"}`;
    } else if (creator.managementType === "personal" || creator.managerName) {
        managementLabel = `Manager: ${creator.managerName || "Personal Manager"}`;
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-150">
            <div
                className="w-full max-w-xl h-full bg-white dark:bg-[#121214] border-l border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col slide-in-from-right duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-zinc-800/80 flex items-start justify-between shrink-0 bg-gradient-to-b from-slate-50/80 to-white dark:from-zinc-900/40 dark:to-[#121214]">
                    <div className="flex items-center gap-3.5 min-w-0">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={creator.fullName || cleanHandle}
                                className="size-13 rounded-2xl object-cover border-2 border-white dark:border-zinc-700 shadow-md shrink-0 bg-slate-100"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                }}
                            />
                        ) : (
                            <div className="size-13 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md">
                                {creator.fullName?.[0]?.toUpperCase() || cleanHandle?.[0]?.toUpperCase() || "C"}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                    {creator.fullName || `@${cleanHandle}`}
                                </h3>
                                {isLinked ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                        <BadgeCheckIcon className="w-3 h-3 text-emerald-600" />
                                        Verified Linked
                                    </span>
                                ) : creator.isVerified ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                        Verified
                                    </span>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                                <a
                                    href={creator.profileUrl || `https://www.instagram.com/${cleanHandle}/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                >
                                    <span>@{cleanHandle}</span>
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                                <span>•</span>
                                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                    {igData?.followersRaw || creator.followersRaw || (creator.followersCount ? `${(creator.followersCount / 1000).toFixed(1)}K` : "–")} followers
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleCopyHandle}
                            title="Copy @handle"
                            className="size-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                            {copiedHandle ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <CopyIcon className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="size-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Sub-Header Tabs */}
                <div className="px-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-5 text-xs font-medium bg-white dark:bg-[#121214]">
                    {[
                        { id: "overview", label: "Overview & Intelligence" },
                        { id: "commercials", label: "Commercials & ROI" },
                        { id: "intake", label: "Intake Link & Pitch" },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id as any)}
                            className={`py-3 relative transition-colors cursor-pointer ${
                                activeTab === t.id
                                    ? "text-slate-900 dark:text-white font-bold"
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300"
                            }`}
                        >
                            {t.label}
                            {activeTab === t.id && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Scrollable Content Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* OVERVIEW TAB */}
                    {activeTab === "overview" && (
                        <div className="space-y-4">
                            {/* Intake Completion Banner */}
                            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                                        <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-600" />
                                        Intake Profile Status
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                                        isEnriched
                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    }`}>
                                        {creator.intakeStatus || "IN_PROGRESS"} ({creator.intakeCompletionPct || 35}%)
                                    </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            isEnriched ? "bg-emerald-500" : "bg-gradient-to-r from-amber-400 to-orange-400"
                                        }`}
                                        style={{ width: `${creator.intakeCompletionPct || 35}%` }}
                                    />
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                    {isEnriched
                                        ? "Full 100% commercial profile completed by creator via intake form."
                                        : "Baseline scouted data. Send personalized intake link to capture WhatsApp, PIN code, and rate card."}
                                </p>
                            </div>

                            {/* Audience Numbers Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
                                    <span className="text-[11px] text-slate-400 font-medium block">Followers</span>
                                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                                        {igData?.followersRaw || creator.followersRaw || (creator.followersCount ? `${(creator.followersCount / 1000).toFixed(1)}K` : "–")}
                                    </span>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
                                    <span className="text-[11px] text-slate-400 font-medium block">Following</span>
                                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                                        {(igData?.followingCount ?? creator.followingCount) ? Number(igData?.followingCount ?? creator.followingCount).toLocaleString() : "–"}
                                    </span>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
                                    <span className="text-[11px] text-slate-400 font-medium block">Total Posts</span>
                                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                                        {(igData?.postsCount ?? creator.postsCount) ? Number(igData?.postsCount ?? creator.postsCount).toLocaleString() : "–"}
                                    </span>
                                </div>
                            </div>

                            {/* Enhanced Instagram Graph Intelligence Card */}
                            <div className="p-4 rounded-2xl border border-purple-200/90 bg-gradient-to-br from-purple-50/40 via-white to-amber-50/30 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900 dark:border-zinc-800 shadow-xs space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
                                            <TrendingUpIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-slate-900 dark:text-white block">
                                                Instagram Graph Intelligence
                                            </span>
                                            <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                                                {isLinked ? "Verified via Creator OAuth Token" : "Fetched via Meta Graph & Profile Discovery"}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSyncIg}
                                        disabled={syncingIg}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 font-semibold text-[11px] transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
                                    >
                                        <RefreshCwIcon className={`w-3 h-3 ${syncingIg ? "animate-spin" : ""}`} />
                                        <span>{syncingIg ? "Refreshing…" : "Re-sync"}</span>
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                    {/* Engagement Rate */}
                                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 shadow-2xs">
                                        <span className="text-[10.5px] text-slate-400 font-medium block">Engagement Rate</span>
                                        <span className="text-sm font-extrabold text-slate-900 dark:text-white block pt-0.5">
                                            {igData?.engagementRatePct ? `${igData.engagementRatePct}%` : "–"}
                                        </span>
                                        {igData?.engagementRatePct ? (
                                            <span className="text-[9.5px] font-semibold text-purple-700 dark:text-purple-300 block pt-0.5">
                                                {engagementBenchmark}
                                            </span>
                                        ) : (
                                            <span className="text-[9.5px] text-slate-400 block pt-0.5">Calculating…</span>
                                        )}
                                    </div>

                                    {/* Avg Likes */}
                                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 shadow-2xs">
                                        <span className="text-[10.5px] text-slate-400 font-medium flex items-center justify-center gap-1">
                                            <HeartIcon className="w-3 h-3 text-rose-500" /> Avg Likes
                                        </span>
                                        <span className="text-sm font-extrabold text-slate-900 dark:text-white block pt-0.5">
                                            {igData?.avgLikes ? Number(igData.avgLikes).toLocaleString() : "–"}
                                        </span>
                                        <span className="text-[9.5px] text-slate-400 block pt-0.5">Per post</span>
                                    </div>

                                    {/* Reach / Est Views */}
                                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 shadow-2xs">
                                        <span className="text-[10.5px] text-slate-400 font-medium flex items-center justify-center gap-1">
                                            <EyeIcon className="w-3 h-3 text-indigo-500" />
                                            {igData?.reach28d ? "28d Reach" : "Est. Views"}
                                        </span>
                                        <span className="text-sm font-extrabold text-slate-900 dark:text-white block pt-0.5">
                                            {igData?.reach28d
                                                ? Number(igData.reach28d).toLocaleString()
                                                : igData?.avgReelViews
                                                  ? Number(igData.avgReelViews).toLocaleString()
                                                  : estViews
                                                    ? Number(estViews).toLocaleString()
                                                    : "–"}
                                        </span>
                                        <span className="text-[9.5px] text-emerald-600 font-semibold block pt-0.5">
                                            {igData?.reach28d ? "✓ First-party" : "Estimated"}
                                        </span>
                                    </div>
                                </div>

                                {igData?.syncedAt && (
                                    <div className="text-[10.5px] text-slate-400 dark:text-zinc-500 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800">
                                        <span className="flex items-center gap-1">
                                            <ClockIcon className="w-3 h-3" />
                                            Snapshot: {new Date(igData.syncedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <span className="font-mono text-[10px] text-slate-500">
                                            source: {igData.source || "public_metadata"}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Creator Pitch & Content Vibe (From Intake Form) */}
                            {creator.contentDescription && (
                                <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-1.5 bg-slate-50/50 dark:bg-zinc-900/40">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                                        <FileTextIcon className="w-3.5 h-3.5 text-purple-600" />
                                        Creator Pitch &amp; Style Vibe
                                    </span>
                                    <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line italic">
                                        &ldquo;{creator.contentDescription}&rdquo;
                                    </p>
                                </div>
                            )}

                            {/* Representation & Management */}
                            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <UserCheckIcon className="w-3.5 h-3.5 text-slate-400" /> Representation:
                                </span>
                                <span className="font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                    {managementLabel}
                                </span>
                            </div>

                            {/* Multi-Signal India & Human Creator Authenticity Verification */}
                            <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>🇮🇳 Smart Geo &amp; Creator Verification</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                            India {creator.indiaConfidenceScore ?? igData?.indiaConfidenceScore ?? 85}%
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                                            Authenticity {creator.authenticityScore ?? igData?.authenticityScore ?? 80}%
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {(creator.indiaSignals || igData?.indiaSignals || ["Indian Brand Ecosystem", "Google India SERP"]).map((sig: string) => (
                                        <span
                                            key={sig}
                                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-zinc-800 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                        >
                                            ✓ {sig}
                                        </span>
                                    ))}
                                    {(creator.authenticitySignals || igData?.authenticitySignals || ["Human Creator Profile"]).map((sig: string) => (
                                        <span
                                            key={sig}
                                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                                        >
                                            {sig}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Media Kit / YouTube Portfolio Link */}
                            {creator.mediaKitUrl && (
                                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                                    <span className="text-slate-500 flex items-center gap-1.5">
                                        <VideoIcon className="w-3.5 h-3.5 text-rose-500" /> Media Kit / Portfolio:
                                    </span>
                                    <a
                                        href={creator.mediaKitUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                    >
                                        <span>View Portfolio</span>
                                        <ExternalLinkIcon className="w-3 h-3" />
                                    </a>
                                </div>
                            )}

                            {/* Vertical & Content Taxonomy */}
                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">
                                    Vertical &amp; Content Taxonomy
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {creator.category && (
                                        <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs border border-purple-200">
                                            {creator.category}
                                        </span>
                                    )}
                                    {creator.subGenres?.map((sg: string) => (
                                        <span key={sg} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs">
                                            {sg}
                                        </span>
                                    ))}
                                    {creator.languages?.map((l: string) => (
                                        <span key={l} className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-xs border border-sky-100">
                                            {l}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Bio */}
                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-1">
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">Public Bio</span>
                                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                                    {creator.publicBio || igData?.biography || "No bio entered."}
                                </p>
                            </div>

                            {/* Direct Contact Bar */}
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-2 text-xs">
                                <span className="font-semibold text-slate-800 dark:text-zinc-200 block">Direct Contact Details</span>
                                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                                    <span className="flex items-center gap-1.5">
                                        <MailIcon className="w-3.5 h-3.5" /> Primary Email
                                    </span>
                                    <span className="font-mono text-slate-900 dark:text-white font-medium">
                                        {creator.primaryEmail || creator.email || "Not captured yet"}
                                    </span>
                                </div>
                                {(creator.agencyEmail || igData?.agencyEmail) && (
                                    <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                                        <span className="flex items-center gap-1.5">
                                            <BriefcaseIcon className="w-3.5 h-3.5 text-purple-600" /> Agency / Talent Desk
                                        </span>
                                        <span className="font-mono text-purple-700 dark:text-purple-300 font-medium">
                                            {creator.agencyEmail || igData?.agencyEmail}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                                    <span className="flex items-center gap-1.5">
                                        <PhoneIcon className="w-3.5 h-3.5" /> WhatsApp / Phone
                                    </span>
                                    {creator.whatsappNumber || creator.phone ? (
                                        <a
                                            href={`https://wa.me/${(creator.whatsappNumber || creator.phone).replace(/\D/g, "")}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-emerald-600 font-semibold hover:underline flex items-center gap-1"
                                        >
                                            {creator.whatsappNumber || creator.phone}
                                            <ExternalLinkIcon className="w-3 h-3" />
                                        </a>
                                    ) : (
                                        <span className="text-slate-400">Pending intake form</span>
                                    )}
                                </div>
                                {(creator.externalUrl || igData?.externalUrl || igData?.website) && (
                                    <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800">
                                        <span className="flex items-center gap-1.5">
                                            <ExternalLinkIcon className="w-3.5 h-3.5 text-indigo-500" /> Linktree / Bio Link
                                        </span>
                                        <a
                                            href={
                                                String(creator.externalUrl || igData?.externalUrl || igData?.website).startsWith("http")
                                                    ? (creator.externalUrl || igData?.externalUrl || igData?.website)
                                                    : `https://${creator.externalUrl || igData?.externalUrl || igData?.website}`
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[240px]"
                                        >
                                            {String(creator.externalUrl || igData?.externalUrl || igData?.website).replace(/^https?:\/\//, "")}
                                        </a>
                                    </div>
                                )}
                                {creator.sampleReelUrl && (
                                    <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800">
                                        <span className="flex items-center gap-1.5">
                                            <VideoIcon className="w-3.5 h-3.5 text-rose-500" /> Indexed Reel
                                        </span>
                                        <a
                                            href={creator.sampleReelUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-medium text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                                        >
                                            <span>Watch Reel</span>
                                            <ExternalLinkIcon className="w-3 h-3" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* COMMERCIALS & DELIVERABLES TAB */}
                    {activeTab === "commercials" && (
                        <div className="space-y-4">
                            {/* ROI Benchmarking Card (Internal Intelligence) */}
                            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 dark:from-zinc-900 dark:to-zinc-900 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <SparklesIcon className="w-3.5 h-3.5 text-indigo-600" />
                                        Commercial Valuation &amp; ROI Benchmark
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${roiTag.color}`}>
                                        {roiTag.label}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                    <div className="p-3 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700">
                                        <span className="text-slate-400 block text-[11px]">Est. Cost Per View (CPV)</span>
                                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                                            {cpvFormatted}
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700">
                                        <span className="text-slate-400 block text-[11px]">Est. Reel Audience</span>
                                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                                            {estViews ? Number(estViews).toLocaleString() : "–"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Commercial Deliverable Rates
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                        <span className="text-slate-400 block text-[11px]">Reel Deliverable Rate</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                                            {creator.commercialRates?.reelRate || (numericReelRate ? `₹${numericReelRate.toLocaleString()}` : "Not specified")}
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                        <span className="text-slate-400 block text-[11px]">Collaboration Mode</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm capitalize">
                                            {creator.collabType || "Both Paid & Barter"}
                                        </span>
                                    </div>
                                    {creator.commercialRates?.storyRate && (
                                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                            <span className="text-slate-400 block text-[11px]">Story Rate</span>
                                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                                                {creator.commercialRates.storyRate}
                                            </span>
                                        </div>
                                    )}
                                    {creator.commercialRates?.staticRate && (
                                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                            <span className="text-slate-400 block text-[11px]">Static Post Rate</span>
                                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                                                {creator.commercialRates.staticRate}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-3">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    PR Gifting &amp; Shipping Address
                                </span>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                                        <span>PIN Code:</span>
                                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                            {creator.pincode || "Not provided"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                                        <span>City &amp; State:</span>
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                            {creator.city ? `${creator.city}, ${creator.state}` : "Not resolved"}
                                        </span>
                                    </div>
                                    <div className="pt-1 text-slate-500">
                                        <span>Courier Address:</span>
                                        <p className="font-medium text-slate-800 dark:text-zinc-200 pt-0.5">
                                            {creator.shippingAddress || "Pending courier dispatch details"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Finance &amp; Creator Payouts
                                </span>
                                <div className="flex justify-between text-xs text-slate-600 dark:text-zinc-400">
                                    <span>UPI ID:</span>
                                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                        {creator.upiId || "Pending campaign booking"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DYNAMIC INTAKE LINK TAB */}
                    {activeTab === "intake" && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 space-y-2">
                                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold">
                                    <SparklesIcon className="w-4 h-4 text-amber-600" />
                                    <span>One-Click Passwordless Intake Link</span>
                                </div>
                                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                    This personalized token pre-fills all known data for <strong>{creator.fullName || `@${cleanHandle}`}</strong>. When they click, they only verify their profile and provide shipping PIN code &amp; rate card.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Creator Personalized URL
                                </span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={intakeUrl}
                                        className="flex-1 h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-mono text-slate-700 dark:text-zinc-300 select-all"
                                    />
                                    <button
                                        onClick={handleCopyIntake}
                                        className="h-10 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 shrink-0 cursor-pointer"
                                    >
                                        {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                        <span>{copied ? "Copied" : "Copy"}</span>
                                    </button>
                                </div>
                            </div>

                            <a
                                href={intakeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <ExternalLinkIcon className="w-3.5 h-3.5" />
                                <span>Preview Form as Creator</span>
                            </a>
                        </div>
                    )}
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 flex items-center justify-between shrink-0">
                    <button
                        onClick={handleCopyIntake}
                        className="h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy Intake Link</span>
                    </button>

                    {creator.whatsappNumber || creator.phone ? (
                        <a
                            href={`https://wa.me/${(creator.whatsappNumber || creator.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${creator.fullName || `@${cleanHandle}`}, we loved your recent content! Check our campaign invite here: ${intakeUrl}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <SendIcon className="w-3.5 h-3.5" />
                            <span>WhatsApp Pitch</span>
                        </a>
                    ) : (
                        <a
                            href={creator.profileUrl || `https://www.instagram.com/${cleanHandle}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <ExternalLinkIcon className="w-3.5 h-3.5" />
                            <span>Open Instagram Profile</span>
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
