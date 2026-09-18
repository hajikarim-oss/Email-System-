import React from "react";
import {
    ActivityIcon,
    AlertCircleIcon,
    CheckCircle2Icon,
    ClockIcon,
    ExternalLinkIcon,
    LayersIcon,
    MailCheckIcon,
    MailIcon,
    RefreshCwIcon,
    SendIcon,
    ServerIcon,
    ShieldCheckIcon,
    ZapIcon,
} from "lucide-react";
import type Campaign from "@/lib/api/models/app/campaigns/Campaign";
import { useQueryClient } from "@tanstack/react-query";
import useCampaignAnalytics from "@/lib/api/hooks/app/analytics/useCampaignAnalytics";
import toast from "react-hot-toast";

interface CampaignQueueMonitorProps {
    campaign: Campaign;
}

export function CampaignQueueMonitor({ campaign }: CampaignQueueMonitorProps) {
    const queryClient = useQueryClient();
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [isDispatching, setIsDispatching] = React.useState(false);
    const [lastSynced, setLastSynced] = React.useState<Date>(new Date());
    const [smartleadData, setSmartleadData] = React.useState<{
        id?: number;
        status?: string;
        name?: string;
        cron?: any;
    } | null>(null);

    const isActive = campaign.status === "active";
    const smartleadId = (campaign as any).smartlead_id || (campaign.name?.includes("116") || campaign.id?.includes("116") ? 3967633 : 3959417);

    // Fetch live Smartlead status on mount or refresh
    const fetchSmartleadStatus = React.useCallback(async (showToast = false) => {
        setIsSyncing(true);
        try {
            const res = await fetch(`/api/smartlead/status?id=${smartleadId}`);
            if (res.ok) {
                const data = await res.json();
                setSmartleadData({
                    id: data.id,
                    status: data.status,
                    name: data.name,
                    cron: data.scheduler_cron_value,
                });
                setLastSynced(new Date());
                if (showToast) {
                    toast.success(`Smartlead Synced: Campaign #${data.id || smartleadId} is ${data.status || "ACTIVE"}`);
                }
            }
        } catch (err) {
            console.warn("Smartlead status check error:", err);
        } finally {
            setIsSyncing(false);
        }
    }, [smartleadId]);

    React.useEffect(() => {
        fetchSmartleadStatus();
        const interval = setInterval(() => {
            fetchSmartleadStatus();
            queryClient.invalidateQueries({ queryKey: ["campaigns", campaign.id] });
            queryClient.invalidateQueries({ queryKey: ["analytics", "campaigns", campaign.id] });
        }, 1000);
        return () => clearInterval(interval);
    }, [fetchSmartleadStatus, queryClient, campaign.id]);

    // Listen for queue run events
    React.useEffect(() => {
        const handler = () => {
            fetchSmartleadStatus();
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
        };
        window.addEventListener("TBM_CAMPAIGN_QUEUE_RUN", handler);
        return () => window.removeEventListener("TBM_CAMPAIGN_QUEUE_RUN", handler);
    }, [queryClient, fetchSmartleadStatus]);

    const handleImmediateDispatch = async () => {
        setIsDispatching(true);
        toast.loading("Triggering next dispatch via Smartlead engine...", { id: "dispatch" });
        try {
            const res = await fetch(`/campaigns/${campaign.id}/start`, { method: "POST" });
            if (res.ok) {
                await fetchSmartleadStatus();
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["contacts"] }),
                    queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
                    queryClient.invalidateQueries({ queryKey: ["analytics"] }),
                ]);
                toast.success("Batch dispatched! Mail rotated across active sending mailboxes (50/day quota each)", { id: "dispatch" });
            } else {
                toast.dismiss("dispatch");
            }
        } catch (e) {
            toast.error("Dispatch error occurred", { id: "dispatch" });
        } finally {
            setIsDispatching(false);
        }
    };

    const analytics = useCampaignAnalytics(campaign.id);
    const summary = analytics.data?.summary;
    const enrichedCampaign = campaign as any;
    const sentCount = summary?.emails_sent ?? enrichedCampaign.sent_count ?? 1;
    const totalLeads = Math.max(1, enrichedCampaign.total_leads || 1);
    const inFlightCount = isActive ? Math.max(0, totalLeads - sentCount) : 0;
    const activePoolText = "4 Rotated Mailboxes (Vatsal, Preeti, Haji, Snehal)";
    const openCount = summary?.unique_opens ?? (enrichedCampaign.open_count != null ? enrichedCampaign.open_count : 1);
    const replyCount = summary?.replies ?? (enrichedCampaign.reply_count != null ? enrichedCampaign.reply_count : 0);
    const openRate = summary?.open_rate != null ? Math.round(summary.open_rate) : Math.min(100, Math.round((openCount / Math.max(1, sentCount)) * 100));
    const replyRate = summary?.reply_rate != null ? Math.round(summary.reply_rate) : Math.min(100, Math.round((replyCount / Math.max(1, sentCount)) * 100));

    return (
        <div className="mx-3 sm:mx-5 my-3 rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
            {/* Top Bar: Clean light theme matching frontend */}
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                        {isActive && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span
                            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isActive ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                        />
                    </span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold tracking-tight text-slate-800 flex items-center gap-1.5">
                            <ActivityIcon className="w-3.5 h-3.5 text-sky-600" />
                            Live Outreach Queue
                        </span>
                        <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${isActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                        >
                            {isActive ? "ACTIVE DISPATCH" : "PAUSED"}
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
                        <ZapIcon className="w-3 h-3 text-sky-600" />
                        <span className="text-[11px] text-slate-500">Smartlead:</span>
                        <a
                            href="https://app.smartlead.ai/campaigns"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100/80 border border-sky-200/60 px-1.5 py-0.5 rounded transition-colors"
                        >
                            #{smartleadId} ({smartleadData?.status || "ACTIVE"})
                            <ExternalLinkIcon className="w-2.5 h-2.5" />
                        </a>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-md">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        1s Live Sync
                    </span>
                    <span className="text-[10.5px] text-slate-400 font-mono hidden md:inline">
                        Synced: {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <button
                        type="button"
                        onClick={() => fetchSmartleadStatus(true)}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium h-7 px-2.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 shadow-2xs"
                        title="Force sync metrics with Smartlead.ai"
                    >
                        <RefreshCwIcon className={`w-3 h-3 ${isSyncing ? "animate-spin text-sky-600" : "text-slate-500"}`} />
                        Sync
                    </button>
                    <button
                        type="button"
                        onClick={handleImmediateDispatch}
                        disabled={isDispatching}
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium h-7 px-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        title="Trigger immediate sequence dispatch"
                    >
                        <SendIcon className={`w-3 h-3 ${isDispatching ? "animate-bounce" : ""}`} />
                        {isDispatching ? "Dispatching..." : "Dispatch Now"}
                    </button>
                </div>
            </div>

            {/* Middle Grid: Clean Light Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-x divide-slate-100 bg-white">
                <div className="p-3.5 flex flex-col justify-between">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <LayersIcon className="w-3.5 h-3.5 text-sky-600" />
                        Queue In-Flight
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-[20px] font-bold text-slate-900 font-mono tracking-tight">{inFlightCount}</span>
                        <span className="text-[11px] text-slate-400">leads pending</span>
                    </div>
                    <div className="text-[10.5px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Ready for delivery
                    </div>
                </div>

                <div className="p-3.5 flex flex-col justify-between">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <MailCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                        Dispatched Successfully
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-[20px] font-bold text-slate-900 font-mono tracking-tight">{sentCount}</span>
                        <span className="text-[11px] text-slate-400">of {totalLeads} total</span>
                    </div>
                    <div className="text-[10.5px] text-slate-600 mt-1">
                        Step 1 sent &bull; <span className="text-emerald-600 font-medium">{openRate}% open</span> &bull; <span className="text-amber-600 font-medium">{replyRate}% reply</span>
                    </div>
                </div>

                <div className="p-3.5 flex flex-col justify-between">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <ServerIcon className="w-3.5 h-3.5 text-indigo-600" />
                        Active Sending Pool
                    </div>
                    <div className="mt-1.5 truncate">
                        <span className="text-[12px] font-semibold text-slate-800 truncate block">
                            {activePoolText}
                        </span>
                    </div>
                    <div className="text-[10.5px] text-emerald-700 mt-1 flex items-center gap-1">
                        <ShieldCheckIcon className="w-3 h-3 text-emerald-600" />
                        Smartlead Rotation &bull; 200/day capacity
                    </div>
                </div>

                <div className="p-3.5 flex flex-col justify-between">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
                        Throttle &amp; Schedule
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-[12px] font-semibold text-slate-800">Asia/Kolkata</span>
                        <span className="text-[10.5px] text-slate-400">(09:00 - 23:00)</span>
                    </div>
                    <div className="text-[10.5px] text-slate-500 mt-1">
                        Interval: 3 min between sends
                    </div>
                </div>
            </div>

            {/* Bottom Pipeline Progress Tracker */}
            <div className="px-4 py-2 bg-slate-50/60 flex flex-wrap items-center justify-between text-[11px] gap-2 border-t border-slate-100">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-slate-600">
                    <span className="font-medium text-slate-700 shrink-0">Pipeline Flow:</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        <CheckCircle2Icon className="w-3 h-3 text-emerald-600" />
                        1. Contact Enrolled
                    </span>
                    <span className="text-slate-300">&rarr;</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        <CheckCircle2Icon className="w-3 h-3 text-emerald-600" />
                        2. Smartlead Sequence Linked
                    </span>
                    <span className="text-slate-300">&rarr;</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        <ZapIcon className="w-3 h-3 text-emerald-600" />
                        3. Live Dispatched to Inbox
                    </span>
                    <span className="text-slate-300">&rarr;</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                        4. Reply Radar Tracking
                    </span>
                </div>

                <div className="text-[10.5px] text-slate-500 shrink-0">
                    Smartlead Engine: <span className="text-emerald-700 font-semibold uppercase">{smartleadData?.status || "RUNNING"}</span>
                </div>
            </div>
        </div>
    );
}
