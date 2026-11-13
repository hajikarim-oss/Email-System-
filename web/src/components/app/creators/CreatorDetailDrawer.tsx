import React, { useState } from "react";
import {
    XIcon,
    InstagramIcon,
    ExternalLinkIcon,
    CopyIcon,
    CheckIcon,
    MapPinIcon,
    PhoneIcon,
    MailIcon,
    SparklesIcon,
    CheckCircle2Icon,
    ClockIcon,
    DollarSignIcon,
    VideoIcon,
    Share2Icon,
    SendIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface CreatorDetailDrawerProps {
    creator: any;
    onClose: () => void;
    onUpdate?: (updated: any) => void;
}

export default function CreatorDetailDrawer({ creator, onClose, onUpdate }: CreatorDetailDrawerProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "commercials" | "intake" | "history">("overview");
    const [copied, setCopied] = useState(false);
    const [syncingIg, setSyncingIg] = useState(false);
    const [localIgInsights, setLocalIgInsights] = useState<any>(creator?.instagramInsights || null);

    if (!creator) return null;

    const igData = localIgInsights || creator.instagramInsights || {};
    const handleSyncIg = async () => {
        setSyncingIg(true);
        try {
            const tok = creator.intakeToken || creator.id;
            const res = await fetch(`/api/creator/intake/${encodeURIComponent(tok)}/ig-lookup?handle=${encodeURIComponent(creator.handle || "")}`);
            if (!res.ok) throw new Error("Failed to sync Instagram insights");
            const data = await res.json();
            setLocalIgInsights(data);
            if (onUpdate) onUpdate({ ...creator, instagramInsights: data });
            toast.success("Instagram profile & insights synced!");
        } catch (err: any) {
            toast.error(err?.message || "Unable to sync Instagram insights");
        } finally {
            setSyncingIg(false);
        }
    };

    const intakeUrl = `${window.location.origin}/creator/intake/${creator.intakeToken || creator.id}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(intakeUrl);
        setCopied(true);
        toast.success("Personalized intake link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const isEnriched = creator.intakeStatus === "COMPLETED" || (creator.intakeCompletionPct && creator.intakeCompletionPct >= 80);

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs animate-in fade-in duration-150">
            <div
                className="w-full max-w-xl h-full bg-white dark:bg-[#18181B] border-l border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col slide-in-from-right duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-start justify-between shrink-0 bg-[#FAF9F5] dark:bg-zinc-900/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="size-12 rounded-2xl bg-[#5E43EC] text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
                            {creator.fullName?.[0]?.toUpperCase() || "C"}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                    {creator.fullName}
                                </h3>
                                {creator.isVerified && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                        Verified
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                                <a
                                    href={creator.profileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-[#5E43EC] hover:underline flex items-center gap-1"
                                >
                                    <span>{creator.handle}</span>
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                                <span>•</span>
                                <span className="font-semibold text-slate-800 dark:text-zinc-200">{creator.followersRaw} followers</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="size-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 flex items-center justify-center transition-colors"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Sub-Header Tabs */}
                <div className="px-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-4 text-xs font-medium">
                    {[
                        { id: "overview", label: "Overview & Stats" },
                        { id: "commercials", label: "Commercials & Deliverables" },
                        { id: "intake", label: "Dynamic Intake Link" },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id as any)}
                            className={`py-3 relative transition-colors ${
                                activeTab === t.id
                                    ? "text-slate-900 dark:text-white font-semibold"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            {t.label}
                            {activeTab === t.id && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#18181B] dark:bg-white rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Scrollable Content Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* OVERVIEW TAB */}
                    {activeTab === "overview" && (
                        <div className="space-y-4">
                            {/* Intake Completion Banner */}
                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                        Intake Enrichment Status
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                                        isEnriched
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-amber-100 text-amber-800"
                                    }`}>
                                        {creator.intakeStatus} ({creator.intakeCompletionPct || 30}%)
                                    </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            isEnriched ? "bg-emerald-500" : "bg-[#FFE600]"
                                        }`}
                                        style={{ width: `${creator.intakeCompletionPct || 30}%` }}
                                    />
                                </div>
                                <p className="text-[11px] text-slate-500">
                                    {isEnriched
                                        ? "Full 100% commercial profile enriched by creator via intake form."
                                        : "Baseline 30% data scouted. Send creator intake link to capture WhatsApp, PIN code, and commercial rates."}
                                </p>
                                {creator.discoveryKeyword?.startsWith("referral:") && (
                                    <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs">
                                        <span className="text-slate-500">Acquisition Source:</span>
                                        <span className="font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200">
                                            🤝 Referred by @{creator.discoveryKeyword.replace(/^referral:/, "").trim()}
                                        </span>
                                    </div>
                                )}
                                {(creator.discoveryKeyword === "direct_submission" || creator.discoveryKeyword === "organic_referral") && (
                                    <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs">
                                        <span className="text-slate-500">Acquisition Source:</span>
                                        <span className="font-semibold text-sky-800 dark:text-sky-300 bg-sky-100/90 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200">
                                            ✨ Direct Self-Signup
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Audience Metrics Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-3 rounded-xl border border-slate-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                    <span className="text-[11px] text-slate-400 block">Followers</span>
                                    <span className="text-base font-bold text-slate-900 dark:text-white">
                                        {igData?.followersRaw || creator.followersRaw}
                                    </span>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                    <span className="text-[11px] text-slate-400 block">Following</span>
                                    <span className="text-base font-bold text-slate-900 dark:text-white">
                                        {(igData?.followingCount ?? creator.followingCount) ? Number(igData?.followingCount ?? creator.followingCount).toLocaleString() : "–"}
                                    </span>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                    <span className="text-[11px] text-slate-400 block">Posts</span>
                                    <span className="text-base font-bold text-slate-900 dark:text-white">
                                        {(igData?.postsCount ?? creator.postsCount) ? Number(igData?.postsCount ?? creator.postsCount).toLocaleString() : "–"}
                                    </span>
                                </div>
                            </div>

                            {/* Instagram Graph API Insights Card */}
                            <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 dark:bg-zinc-900 dark:border-zinc-800 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <InstagramIcon className="w-4 h-4 text-amber-700" />
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            Instagram Graph API Insights
                                        </span>
                                        {(creator.igConnected || igData?.igConnected) && (
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                                ✓ Creator Linked
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSyncIg}
                                        disabled={syncingIg}
                                        className="px-2.5 py-1 rounded-md bg-[#FFE600] hover:bg-amber-400 text-slate-900 font-semibold text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        {syncingIg ? "Syncing…" : "↻ Sync Graph Insights"}
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700">
                                        <span className="text-[10.5px] text-slate-400 block">Engagement Rate</span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            {igData?.engagementRatePct ? `${igData.engagementRatePct}%` : "–"}
                                        </span>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700">
                                        <span className="text-[10.5px] text-slate-400 block">Avg Likes / Post</span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            {igData?.avgLikes ? Number(igData.avgLikes).toLocaleString() : "–"}
                                        </span>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700">
                                        <span className="text-[10.5px] text-slate-400 block">
                                            {igData?.reach28d ? "28d Reach" : "Est. Reel Views"}
                                        </span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            {igData?.reach28d
                                                ? Number(igData.reach28d).toLocaleString()
                                                : igData?.avgReelViews
                                                  ? Number(igData.avgReelViews).toLocaleString()
                                                  : "–"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Category & Languages */}
                            <div className="p-4 rounded-xl border border-slate-200/70 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">
                                    Vertical & Content Taxonomy
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="px-2.5 py-1 rounded-md bg-[#FFE600] text-slate-900 font-semibold text-xs">
                                        {creator.category}
                                    </span>
                                    {creator.subGenres?.map((sg: string) => (
                                        <span key={sg} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs">
                                            {sg}
                                        </span>
                                    ))}
                                    {creator.languages?.map((l: string) => (
                                        <span key={l} className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-xs">
                                            {l}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Bio */}
                            <div className="p-4 rounded-xl border border-slate-200/70 dark:border-zinc-800 space-y-1">
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">Public Bio</span>
                                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                                    {creator.publicBio || "No bio available in scraped dataset."}
                                </p>
                            </div>

                            {/* Sample Reel Preview Link */}
                            {creator.sampleReelUrl && (
                                <div className="p-3.5 rounded-xl border border-slate-200/70 dark:border-zinc-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <VideoIcon className="w-4 h-4 text-rose-500" />
                                        <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                                            Sample Scraped Reel
                                        </span>
                                    </div>
                                    <a
                                        href={creator.sampleReelUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-semibold text-[#5E43EC] hover:underline flex items-center gap-1"
                                    >
                                        <span>Watch Reel</span>
                                        <ExternalLinkIcon className="w-3 h-3" />
                                    </a>
                                </div>
                            )}

                            {/* Direct Contact Bar */}
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 space-y-2 text-xs">
                                <span className="font-semibold text-slate-800 dark:text-zinc-200 block">Direct Reachout</span>
                                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                                    <span className="flex items-center gap-1.5">
                                        <MailIcon className="w-3.5 h-3.5" /> Email
                                    </span>
                                    <span className="font-mono text-slate-900 dark:text-white">
                                        {creator.primaryEmail || "Not in bio (requires DM)"}
                                    </span>
                                </div>
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
                                        <span className="text-slate-400">Not verified yet</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* COMMERCIALS & DELIVERABLES TAB */}
                    {activeTab === "commercials" && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Commercial Deliverable Rates
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                        <span className="text-slate-400 block text-[11px]">Reel Deliverable Rate</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                                            {creator.commercialRates?.reelRate || "Not specified"}
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800">
                                        <span className="text-slate-400 block text-[11px]">Collaboration Mode</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm capitalize">
                                            {creator.collabType || "Both Paid & Barter"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-3">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    PR Shipping & Gifting Logistics
                                </span>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                                        <span>PIN Code:</span>
                                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                            {creator.pincode || "Not provided"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                                        <span>City & State:</span>
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                            {creator.city ? `${creator.city}, ${creator.state}` : "Not resolved"}
                                        </span>
                                    </div>
                                    <div className="pt-1 text-slate-500">
                                        <span>Shipping Address:</span>
                                        <p className="font-medium text-slate-800 dark:text-zinc-200 pt-0.5">
                                            {creator.shippingAddress || "Pending courier dispatch details"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Finance & Creator Payouts
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
                            <div className="p-4 rounded-2xl bg-[#FFF9DB] border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 space-y-2">
                                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold">
                                    <SparklesIcon className="w-4 h-4 text-amber-600" />
                                    <span>One-Click Passwordless Intake Link</span>
                                </div>
                                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                    This personalized token pre-fills all known data for <strong>{creator.fullName}</strong>. When they click, they only need to verify and enter their missing WhatsApp and PR shipping PIN code.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                                    Creator URL
                                </span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={intakeUrl}
                                        className="flex-1 h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-mono text-slate-700 dark:text-zinc-300 select-all"
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className="h-10 px-4 rounded-lg bg-[#18181B] dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 shrink-0 cursor-pointer"
                                    >
                                        {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
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

                {/* Footer Action Buttons */}
                <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900/60 flex items-center justify-between shrink-0">
                    <button
                        onClick={handleCopy}
                        className="h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy Intake Link</span>
                    </button>

                    {creator.whatsappNumber || creator.phone ? (
                        <a
                            href={`https://wa.me/${(creator.whatsappNumber || creator.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${creator.fullName}, we loved your recent content! Check our campaign invite here: ${intakeUrl}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <SendIcon className="w-3.5 h-3.5" />
                            <span>WhatsApp Pitch</span>
                        </a>
                    ) : (
                        <a
                            href={creator.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-4 rounded-lg bg-[#18181B] hover:bg-stone-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <InstagramIcon className="w-3.5 h-3.5" />
                            <span>Open Instagram DM</span>
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

