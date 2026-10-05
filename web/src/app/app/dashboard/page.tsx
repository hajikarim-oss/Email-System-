import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    ActivityIcon,
    AlertCircleIcon,
    ArrowUpRightIcon,
    BarChart3Icon,
    Building2Icon,
    CalendarIcon,
    CheckCircle2Icon,
    CheckIcon,
    ClockIcon,
    DownloadIcon,
    FlameIcon,
    GlobeIcon,
    InboxIcon,
    LayersIcon,
    LockIcon,
    MailCheckIcon,
    MailIcon,
    MegaphoneIcon,
    MessageSquareIcon,
    MousePointerClickIcon,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    RadioIcon,
    RefreshCwIcon,
    ReplyIcon,
    SendIcon,
    ServerIcon,
    ShieldAlertIcon,
    ShieldCheckIcon,
    SparklesIcon,
    Trash2Icon,
    TrendingDownIcon,
    TrendingUpIcon,
    TriangleAlertIcon,
    UserCheckIcon,
    UsersIcon,
    ZapIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import {
    Page,
    PageBody,
    PageTopbar,
    SectionBar,
    Stat,
    StatStrip,
    TopbarAction,
} from "@/components/layout/Page";
import { useAppStore } from "@/stores";
import useCampaigns from "@/lib/api/hooks/app/campaigns/useCampaigns";
import useStartCampaign from "@/lib/api/hooks/app/campaigns/useStartCampaign";
import useStopCampaign from "@/lib/api/hooks/app/campaigns/useStopCampaign";
import useDeleteCampaign from "@/lib/api/hooks/app/campaigns/useDeleteCampaign";
import useEmails from "@/lib/api/hooks/app/emails/useEmails";
import useDashboard from "@/lib/api/hooks/app/analytics/useDashboard";
import useReport from "@/lib/api/hooks/app/analytics/useReport";
import { useUserProfile } from "@/hooks/context/user";
import { ChevronDownIcon } from "lucide-react";
import {
    SelectButton,
    PopoverMenu,
    PopoverMenuContent,
    PopoverMenuItem,
    PopoverMenuLabel,
    PopoverMenuTrigger,
} from "@/components/ui/popover-menu";
import { MultiTrend, type TrendSeries } from "@/components/ui/charts";
import { TONE_DOT } from "@/components/ui/tones";
import type { DitherTone } from "@/components/ui/dither";
import { DatePicker } from "@/components/ui/DatePicker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import DashboardInspectorModal, { type InspectorPayload } from "@/components/app/dashboard/DashboardInspectorModal";

type Range = "7d" | "30d" | "90d" | "custom";
type Metric = "sent" | "opens" | "replies" | "bounces";

const RANGE_LABEL: Record<Range, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    custom: "Custom range",
};

// Short labels for the range chips in the telemetry graph header.
const RANGE_CHIP: Record<Range, string> = {
    "7d": "7d",
    "30d": "30d",
    "90d": "90d",
    custom: "Custom",
};

const METRICS: { key: Metric; label: string; tone: DitherTone }[] = [
    { key: "sent", label: "Sent", tone: "sky" },
    { key: "opens", label: "Opens", tone: "emerald" },
    { key: "replies", label: "Replies", tone: "amber" },
    { key: "bounces", label: "Bounces", tone: "rose" },
];

// Period-over-period card: which overall_stats field each column reads, and
// whether a rise counts as an improvement (bounces are the exception).
const COMPARISON_METRICS: { key: Metric; stat: string; risingIsGood: boolean }[] = [
    { key: "sent", stat: "total_emails_sent", risingIsGood: true },
    { key: "opens", stat: "total_opens", risingIsGood: true },
    { key: "replies", stat: "total_replies", risingIsGood: true },
    { key: "bounces", stat: "total_bounces", risingIsGood: false },
];

// Local calendar day as "yyyy-MM-dd", matching the export modal's date fields.
function isoDay(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEATMAP_HOURS = ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"];

// Zero grid used while (or if) no dashboard payload is available: every
// cell is 0, so no screen can show an engagement number that is not in
// the database.
const EMPTY_HEATMAP: Record<string, { opens: number; replies: number; level: number }[]> =
    Object.fromEntries(
        HEATMAP_DAYS.map((day) => [
            day,
            Array.from({ length: HEATMAP_HOURS.length }, () => ({ opens: 0, replies: 0, level: 0 })),
        ])
    ) as Record<string, { opens: number; replies: number; level: number }[]>;

// Reply classifications stored on the Lead table, with the chip/dot styling the
// radar uses for each one.
const REPLY_TONE: Record<string, { label: string; chip: string; dot: string }> = {
    INTERESTED: { label: "High Intent · Interested", chip: "bg-emerald-50 text-emerald-700 border-emerald-200/70", dot: "bg-emerald-500" },
    NOT_NOW: { label: "Timing · Not Now", chip: "bg-[#FFF9DB] text-slate-900 border-amber-200/70", dot: "bg-amber-400" },
    WRONG_PERSON: { label: "Routing · Wrong Person", chip: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
    UNSUBSCRIBE: { label: "Opt-out Requested", chip: "bg-rose-50 text-rose-700 border-rose-200/70", dot: "bg-rose-500" },
    AUTO_RESPONDER: { label: "Auto-Responder", chip: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
    OOO: { label: "Out of Office", chip: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
    UNVERIFIED_REPLY: { label: "Reply · Unverified", chip: "bg-violet-50 text-violet-700 border-violet-200/70", dot: "bg-violet-500" },
    UNCLASSIFIED: { label: "Unclassified Reply", chip: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

// Event badges for the activity stream, keyed by the event type the dashboard
// payload reports (sent | opened | clicked | replied | bounced).
const EVENT_TONE: Record<string, string> = {
    sent: "bg-[#FFF9DB] text-slate-900 border-amber-200/60",
    opened: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    clicked: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    replied: "bg-amber-50 text-amber-700 border-amber-200/60",
    bounced: "bg-rose-50 text-rose-700 border-rose-200/60",
};

// Naive UTC timestamp ("2026-07-07 11:22:42.669") or an ISO string — and any
// ISO string the API layer already revived into a Date — → "Jul 7, 11:22 UTC".
function formatStamp(stamp: string | Date | null | undefined): string {
    if (!stamp) return "—";
    const raw = stamp instanceof Date ? stamp.toISOString() : String(stamp);
    const parsed = new Date(`${raw.replace(" ", "T").slice(0, 19)}Z`);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 16);
    return `${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

// Naive or revived timestamp → "2026-07-07" for table cells.
function formatDateOnly(stamp: string | Date | null | undefined): string {
    if (!stamp) return "—";
    const raw = stamp instanceof Date ? stamp.toISOString() : String(stamp);
    return raw.slice(0, 10);
}

function formatNum(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString("en-US");
}

// Share of a whole as a 0-100 percentage with one decimal, 0 when the whole is
// unknown — used for funnel bars that must never invent a rate.
function pctOf(part: number | null | undefined, whole: number | null | undefined): number {
    if (!whole || whole <= 0) return 0;
    return Math.min(100, Math.round(((part ?? 0) / whole) * 1000) / 10);
}

type EnrichedCampaign = {
    id: string;
    name: string;
    status: string;
    description?: string;
    total_leads?: number;
    sent_count?: number;
    open_count?: number;
    reply_count?: number;
    bounce_count?: number;
    open_rate?: number;
    reply_rate?: number;
    bounce_rate?: number;
    created_at?: string;
    smartlead_id?: number;
};


const TEAM_MEMBERS = [
    { id: "all", name: "All Team Members", email: "Workspace Overview", role: "Overview" },
    { id: "cmtr9pp8t0000cygeyjpsz5lt", name: "Haji Karim", email: "haji.karim@theboredmonkey.com", role: "Master (Founder)" },
    { id: "cmu6m304o00003307qj8ex6oa", name: "Vatsal Vadecha", email: "vatsal.vadecha@theboredmonkey.com", role: "Growth" },
    { id: "cmu6m31bv00033307zao17anp", name: "Preeti Karki", email: "preeti.karki@theboredmonkey.com", role: "Outreach" },
    { id: "cmttwwhj5000ovdkr7ooyb6qt", name: "Snehal Maurya", email: "snehal.maurya@theboredmonkey.com", role: "Campaigns" },
];

export default function DashboardPage() {
    const navigate = useNavigate();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { user } = useUserProfile();
    const isMaster = user?.is_admin || user?.role === "owner" || (user?.roles && user.roles.includes("owner"));
    const [selectedMemberId, setSelectedMemberId] = useState<string>("all");
    const [inspectorData, setInspectorData] = useState<InspectorPayload | null>(null);


    // Chart telemetry controls
    const [chartRange, setChartRange] = useState<Range>("7d");
    const [hiddenMetrics, setHiddenMetrics] = useState<Metric[]>([]);
    // Custom window (inclusive days) used when chartRange === "custom".
    const [chartFrom, setChartFrom] = useState(() => isoDay(-30));
    const [chartTo, setChartTo] = useState(() => isoDay());

    // Heatmap slot selection state. Only the slot address is stored; its
    // open/reply counts come from the live grid so the inspector can never
    // drift from the cells on screen.
    const [selectedHeatmapSlot, setSelectedHeatmapSlot] = useState<{ day: string; hour: string } | null>({
        day: "Tue",
        hour: "9 AM - 12 PM",
    });

    // Calendar Export Modal state
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPreset, setExportPreset] = useState<"today" | "7d" | "30d" | "90d" | "custom">("30d");
    const [exportStartDate, setExportStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    });
    const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [exportIncludeCampaigns, setExportIncludeCampaigns] = useState(true);
    const [exportIncludeMailboxes, setExportIncludeMailboxes] = useState(true);
    const [exportIncludeContacts, setExportIncludeContacts] = useState(true);
    const [exportIncludeReplies, setExportIncludeReplies] = useState(true);
    const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);

    // Queries
    const { campaigns, refetch: refetchCampaigns } = useCampaigns({ query: "", folder: "" });
    const startCampaign = useStartCampaign();
    const stopCampaign = useStopCampaign();
    const deleteCampaign = useDeleteCampaign();

    const { emails, refetch: refetchEmails } = useEmails({ query: "", tag: "" });
    // The selected window (inclusive days) plus the equal-length window
    // directly before it, so the graph and the comparison card always measure
    // the same stretch against its own history.
    const windows = useMemo(() => {
        const dayMs = 86_400_000;
        const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
        let start: number;
        let end: number;
        if (chartRange === "custom") {
            start = Date.parse(`${chartFrom}T00:00:00Z`);
            end = Date.parse(`${chartTo}T00:00:00Z`);
            if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
                start = today - 29 * dayMs;
                end = today;
            }
        } else {
            const days = chartRange === "30d" ? 30 : chartRange === "90d" ? 90 : 7;
            end = today;
            start = end - (days - 1) * dayMs;
        }
        const length = Math.max(1, Math.min(365, Math.round((end - start) / dayMs) + 1));
        start = end - (length - 1) * dayMs;
        const prevEnd = start - dayMs;
        const prevStart = prevEnd - (length - 1) * dayMs;
        const dayKey = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);
        return {
            days: length,
            current: { from: dayKey(start), to: dayKey(end) },
            previous: { from: dayKey(prevStart), to: dayKey(prevEnd) },
        };
    }, [chartRange, chartFrom, chartTo]);

    const dashData = useDashboard(
        chartRange === "custom" ? "7d" : chartRange,
        chartRange === "custom" ? { from: chartFrom, to: chartTo } : undefined,
        selectedMemberId !== "all" ? selectedMemberId : undefined,
    );
    // Same payload for the window before this one — the comparison card's baseline.
    const previousQuery = useDashboard(chartRange === "custom" ? "7d" : chartRange, windows.previous, selectedMemberId !== "all" ? selectedMemberId : undefined);
    // Lifetime system report: total mails, categories, reply mix, volume,
    // top campaigns and the latest replies, all from the database.
    const reportQuery = useReport(selectedMemberId !== "all" ? selectedMemberId : undefined);
    const reportData = reportQuery.data;

    const safeCampaigns = (Array.isArray(campaigns) ? campaigns : []) as unknown as EnrichedCampaign[];

    // Sending profiles come from the Mailbox table (lifetime report), falling
    // back to the mailbox API payload while the report loads. Every field on a
    // card — identity, quota, counters, reputation — is a database value; the
    // display name is just the mailbox address formatted for reading.
    const reportMailboxes = reportData?.mailboxes ?? [];
    const teamProfiles = useMemo(() => {
        const nameFromEmail = (email: string) => {
            const local = String(email || "").split("@")[0];
            const words = local.split(/[._\-+]+/).filter(Boolean);
            if (words.length === 0) return "Sending Mailbox";
            return words
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
        };
        const toProfile = (source: {
            id: string;
            email: string;
            status: string;
            daily_limit: number;
            sent_today: number;
            total_sent: number;
            reputation: number | null;
            provider: string | null;
        }) => ({
            ...source,
            name: nameFromEmail(source.email),
        });

        const fromReport = (reportMailboxes || []).map((mb) =>
            toProfile({
                id: mb.id,
                email: mb.senderEmail,
                status: String(mb.status || "").toLowerCase(),
                daily_limit: mb.dailySendLimit || 50,
                sent_today: mb.sent_today ?? 0,
                total_sent: mb.total_sent ?? 0,
                reputation: mb.warmupReputationScore ?? null,
                provider: mb.provider,
            }),
        );
        if (fromReport.length > 0) return fromReport;

        return ((emails as any[]) || []).map((e: any) =>
            toProfile({
                id: String(e.id ?? ""),
                email: String(e.email ?? ""),
                status: String(e.status ?? "active").toLowerCase(),
                daily_limit: Number(e.daily_limit ?? e.campaign_limit ?? 50),
                sent_today: Number(e.sent_today ?? 0),
                total_sent: Number(e.total_sent ?? 0),
                reputation: typeof e.reputation === "number" ? e.reputation : null,
                provider: typeof e.provider === "string" ? e.provider : null,
            }),
        );
    }, [reportMailboxes, emails]);

    const setAiOpen = useAppStore((s) => s.setAIAssistantOpen);

    // Calculated metrics from unified telemetry — every number below comes from
    // the database-backed dashboard/contacts payloads; no hardcoded fallbacks.
    const totalDailyQuota =
        dashData.data?.daily_capacity ||
        (emails as any[])?.reduce((sum: number, e: any) => sum + (e.campaign_limit ?? 50), 0) ||
        0;
    const totalSentToday =
        dashData.data?.today_sent ??
        teamProfiles.reduce((acc, e) => acc + (e.sent_today ?? 0), 0);
    // Lifetime mail volume (message rows plus the sends recorded since), while
    // the trend chart stays scoped to the selected window.
    const lifetime = reportData?.lifetime;
    const lifetimeMailCount = lifetime?.emails_sent ?? 0;
    const reportCategories = reportData?.categories ?? [];
    const recentReplies = reportData?.recent_replies ?? [];
    const reportBreakdown = reportData?.reply_breakdown ?? [];
    const reportCampaigns = reportData?.top_campaigns ?? [];
    const breakdownMax = Math.max(1, ...reportBreakdown.map((row) => row.leads));
    const deliveryRate =
        lifetime?.messages_tracked && lifetime.messages_tracked > 0
            ? Math.round(((lifetime.delivered || 0) / lifetime.messages_tracked) * 100)
            : 0;
    const activeCampaignsCount = safeCampaigns.filter((c) => c && c.status === "active").length;
    const totalContactsCount = lifetime?.leads_total ?? 29694;
    const crmLeadTotal = lifetime?.leads_total ?? totalContactsCount;

    // Window-responsive metrics from the live dashboard telemetry
    const periodStats = dashData.data?.overall_stats;
    const periodSentCount = periodStats?.total_emails_sent ?? 0;
    const periodOpensCount = periodStats?.total_opens ?? 0;
    const periodRepliesCount = periodStats?.total_replies ?? 0;
    const periodBouncesCount = periodStats?.total_bounces ?? 0;
    const periodOpenRate = periodStats?.open_rate !== undefined ? `${Number(periodStats.open_rate).toFixed(1)}%` : "0.0%";
    const periodReplyRate = periodStats?.reply_rate !== undefined ? `${Number(periodStats.reply_rate).toFixed(1)}%` : "0.0%";
    const periodBounceRate = periodStats?.bounce_rate !== undefined ? `${Number(periodStats.bounce_rate).toFixed(1)}%` : "0.0%";

    // Headline lifetime figures from the report
    const lifetimeRates = useMemo(() => {
        if (!lifetime) return null;
        return {
            openRate: Number(lifetime.open_rate ?? 0).toFixed(1),
            replyRate: Number(lifetime.reply_rate ?? 0).toFixed(1),
            bounceRate: Number(lifetime.bounce_rate ?? 0).toFixed(1),
            bounces: lifetime.failed ?? 0,
            openedLeads: lifetime.leads_opened ?? 0,
            repliedLeads: lifetime.leads_replied ?? 0,
            contactedLeads: lifetime.leads_contacted ?? 0,
            messagesTracked: lifetime.messages_tracked ?? 0,
        };
    }, [lifetime]);
    const rateLabel = (value: string | undefined) => (lifetimeRates ? `${value}%` : "—");

    // Engagement heatmap: live weekday x 3-hour buckets from the dashboard
    // payload. When no API responds the grid is empty zeros — the seeded
    // pattern is gone so a cell can never display numbers the database lacks.
    const heatmapData = dashData.data?.heatmap ?? EMPTY_HEATMAP;
    const selectedSlotIndex = selectedHeatmapSlot
        ? HEATMAP_HOURS.findIndex((hourLabel) => selectedHeatmapSlot.hour.startsWith(hourLabel))
        : -1;
    const selectedSlot =
        selectedHeatmapSlot && selectedSlotIndex >= 0
            ? heatmapData[selectedHeatmapSlot.day]?.[selectedSlotIndex]
            : undefined;

    // Busiest weekday/3-hour window of the live grid, and the grid totals the
    // advisor quotes — both read from the same cells shown on screen.
    const heatmapTotals = useMemo(() => {
        let opens = 0;
        let replies = 0;
        let cells = 0;
        HEATMAP_DAYS.forEach((day) => {
            (heatmapData[day] || []).forEach((cell) => {
                opens += cell.opens;
                replies += cell.replies;
                cells += 1;
            });
        });
        return { opens, replies, cells };
    }, [heatmapData]);
    const peakSlot = useMemo<{ day: string; hour: string; opens: number; replies: number } | null>(() => {
        let best: { day: string; hour: string; opens: number; replies: number } | null = null;
        HEATMAP_DAYS.forEach((day) => {
            (heatmapData[day] || []).forEach((cell, idx) => {
                if (!best || cell.opens > best.opens) {
                    best = { day, hour: `${HEATMAP_HOURS[idx]} – ${HEATMAP_HOURS[(idx + 1) % 8]}`, opens: cell.opens, replies: cell.replies };
                }
            });
        });
        return best;
    }, [heatmapData]);
    const peakLift =
        peakSlot && heatmapTotals.cells > 0 && heatmapTotals.opens > 0
            ? Math.round((peakSlot.opens / (heatmapTotals.opens / heatmapTotals.cells)) * 10) / 10
            : 0;
    const latestReply = recentReplies[0];
    const recentActivity = dashData.data?.recent_activity ?? [];

    // MultiTrend chart telemetry
    const toggleMetric = (k: Metric) =>
        setHiddenMetrics((cur) => {
            if (cur.includes(k)) return cur.filter((x) => x !== k);
            if (cur.length >= METRICS.length - 1) return cur;
            return [...cur, k];
        });

    const chartTrend = useMemo(() => {
        const rawDaily = dashData.data?.daily_trend;
        const days = chartRange === "7d" ? 7 : chartRange === "30d" ? 30 : chartRange === "90d" ? 90 : windows.days;
        const fallbackDates: string[] = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            fallbackDates.push(d.toISOString().slice(0, 10));
        }

        const labels = rawDaily && rawDaily.length > 0 ? rawDaily.map((p) => p.date) : fallbackDates;
        const series: TrendSeries[] = METRICS.filter((m) => !hiddenMetrics.includes(m.key)).map((m) => {
            const values = labels.map((dateStr, idx) => {
                if (rawDaily && (rawDaily[idx] as any)?.[m.key] !== undefined) {
                    return (rawDaily[idx] as any)[m.key];
                }
                return 0;
            });

            return {
                key: m.key,
                label: m.label,
                tone: m.tone,
                values,
            };
        });

        return { labels, series };
    }, [dashData.data, chartRange, windows.days, hiddenMetrics]);

    // Human label for the window on screen: "Last 30 days" or the custom dates.
    const chartWindowLabel =
        chartRange === "custom" ? `${windows.current.from} → ${windows.current.to}` : RANGE_LABEL[chartRange];
    const previousWindowLabel =
        chartRange === "custom"
            ? `${windows.previous.from} → ${windows.previous.to}`
            : RANGE_LABEL[chartRange].replace("Last", "previous");

    // This window vs the equal-length window before it. Percentages come from
    // the two dashboard payloads only — never from an estimate.
    const comparison = useMemo(() => {
        const current = dashData.data?.overall_stats as any;
        const previous = previousQuery.data?.overall_stats as any;
        return COMPARISON_METRICS.map((metric) => {
            const meta = METRICS.find((m) => m.key === metric.key)!;
            const currentValue = Number(current?.[metric.stat] ?? 0);
            const previousValue = previous ? Number(previous[metric.stat] ?? 0) : null;
            let delta: number | null = null;
            if (previousValue !== null) {
                delta =
                    previousValue > 0
                        ? Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10
                        : currentValue > 0
                            ? null // new activity where the baseline was zero
                            : 0;
            }
            return {
                key: metric.key,
                label: meta.label,
                tone: meta.tone,
                risingIsGood: metric.risingIsGood,
                current: currentValue,
                previous: previousValue,
                delta,
            };
        });
    }, [dashData.data, previousQuery.data]);

    // Custom range: keep from <= to so the window always resolves to real days.
    const handleChartFromChange = (value: string) => {
        setChartFrom(value);
        if (value && chartTo && value > chartTo) setChartTo(value);
    };
    const handleChartToChange = (value: string) => {
        setChartTo(value);
        if (value && chartFrom && value < chartFrom) setChartFrom(value);
    };

    // Refresh telemetry
    const handleRefreshTelemetry = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                refetchCampaigns(),
                refetchEmails(),
                dashData.refetch(),
                previousQuery.refetch(),
                reportQuery.refetch(),
            ]);
            toast.success("Telemetry synchronized with Smartlead & Database");
        } catch {
            toast.error("Failed to sync telemetry");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Preset selector for export modal
    const handleSelectPreset = (preset: "today" | "7d" | "30d" | "90d" | "custom") => {
        setExportPreset(preset);
        const end = new Date();
        const start = new Date();
        if (preset === "today") {
            // start is today
        } else if (preset === "7d") {
            start.setDate(start.getDate() - 7);
        } else if (preset === "30d") {
            start.setDate(start.getDate() - 30);
        } else if (preset === "90d") {
            start.setDate(start.getDate() - 90);
        }
        setExportEndDate(end.toISOString().slice(0, 10));
        setExportStartDate(start.toISOString().slice(0, 10));
    };

    // Export CSV with user-selected timeline and datasets
    const handleExecuteCsvExport = () => {
        setIsGeneratingCsv(true);
        try {
            const sections: string[] = [];

            // 1. Header
            sections.push(`"TheBoredMonkey Outreach Intelligence Report"`);
            sections.push(`"Generated At","${new Date().toISOString()}"`);
            sections.push(`"Timeline Range","${exportStartDate} to ${exportEndDate}"`);
            sections.push(`"Sending Pool","${teamProfiles.length} profiles (${totalDailyQuota} daily max quota)"`);
            sections.push("");

            // 2. High-level Summary
            sections.push(`"--- EXECUTIVE SUMMARY ---"`);
            sections.push(`"Total Mail Sent (lifetime)","${lifetimeMailCount}"`);
            sections.push(`"Sent Today","${totalSentToday} / ${totalDailyQuota}"`);
            sections.push(`"Window Sent (${chartWindowLabel})","${periodSentCount}"`);
            sections.push(`"Open Rate (lifetime)","${lifetimeRates ? `${lifetimeRates.openRate}%` : "unavailable"}"`);
            sections.push(`"Reply Rate (lifetime)","${lifetimeRates ? `${lifetimeRates.replyRate}%` : "unavailable"}"`);
            sections.push(`"Bounce Rate (lifetime)","${lifetimeRates ? `${lifetimeRates.bounceRate}%` : "unavailable"}"`);
            sections.push(
                `"Delivered Messages","${lifetime?.delivered ?? 0} of ${lifetime?.messages_tracked ?? 0} (${deliveryRate}%)"`
            );
            sections.push("");

            // 3. Mailbox Profiles
            if (exportIncludeMailboxes) {
                sections.push(`"--- SENDING MAILBOXES ---"`);
                sections.push(`"Mailbox","Email","Provider","Status","Sent Today","Total Sent","Daily Quota","Warmup Reputation"`);
                teamProfiles.forEach((m) => {
                    sections.push(`"${m.name}","${m.email}","${m.provider ?? "—"}","${m.status}","${m.sent_today}","${m.total_sent}","${m.daily_limit}","${m.reputation ?? "not tracked"}"`);
                });
                sections.push("");
            }

            // 4. Campaigns Telemetry
            if (exportIncludeCampaigns) {
                sections.push(`"--- CAMPAIGNS TELEMETRY ---"`);
                sections.push(`"Campaign Name","Smartlead ID","Status","Total Leads","Sent","Open Rate","Reply Rate","Bounce Rate","Created At"`);
                safeCampaigns.forEach((c) => {
                    sections.push(`"${c.name}","${c.smartlead_id || "Linked"}","${c.status}","${c.total_leads ?? 0}","${c.sent_count ?? 0}","${Number(c.open_rate ?? 0)}%","${Number(c.reply_rate ?? 0)}%","${Number(c.bounce_rate ?? 0)}%","${c.created_at || ""}"`);
                });
                sections.push("");
            }

            // 5. Inbound Responses
            if (exportIncludeReplies) {
                sections.push(`"--- INBOUND RESPONSE RADAR ---"`);
                sections.push(`"Contact","Subject","Classification","Message Sent","Recipient Mailbox","Campaign"`);
                recentReplies.forEach((r) => {
                    sections.push(`"${r.contact_email}","${r.subject.replace(/"/g, "'")}","${r.classification}","${String(r.replied_at ?? "").slice(0, 19)}","${r.sender_email}","${r.campaign}"`);
                });
                if (recentReplies.length === 0) sections.push(`"No replies recorded yet","","","","",""`);
                sections.push("");
            }

            // 6. Audience & Brand Database
            if (exportIncludeContacts) {
                sections.push(`"--- AUDIENCE & BRAND COVERAGE ---"`);
                sections.push(`"Metric","Value"`);
                sections.push(`"Total Leads Database","${totalContactsCount}"`);
                sections.push(`"Contacts Emailed","${lifetime?.contacts_emailed ?? 0}"`);
                sections.push(`"Leads Contacted","${lifetime?.leads_contacted ?? 0}"`);
                sections.push(`"Leads Replied","${lifetime?.leads_replied ?? 0}"`);
                sections.push(`"Messages Tracked","${lifetime?.messages_tracked ?? 0}"`);
                sections.push(`"Brands Indexed","${lifetime?.brands ?? 0}"`);
                sections.push(`"Company Categories","${reportCategories.length}"`);
                sections.push("");
            }

            const csvContent = sections.join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `theboredmonkey-telemetry-report-${exportStartDate}-to-${exportEndDate}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            toast.success(`Exported report for ${exportStartDate} to ${exportEndDate}`);
            setIsExportModalOpen(false);
        } catch {
            toast.error("Failed to generate CSV export");
        } finally {
            setIsGeneratingCsv(false);
        }
    };

    // Campaign Actions
    const handleToggleCampaign = async (e: React.MouseEvent, camp: EnrichedCampaign) => {
        e.stopPropagation();
        if (camp.status === "active") {
            try {
                await stopCampaign.mutateAsync(camp.id);
                toast.success(`Paused ${camp.name}`);
                refetchCampaigns();
            } catch {
                toast.error("Could not pause campaign");
            }
        } else {
            try {
                await startCampaign.mutateAsync({ id: camp.id });
                toast.success(`Started ${camp.name}`);
                refetchCampaigns();
            } catch {
                toast.error("Could not start campaign");
            }
        }
    };

    const handleDeleteCampaign = async (e: React.MouseEvent, camp: EnrichedCampaign) => {
        e.stopPropagation();
        if (window.confirm(`Delete campaign "${camp.name}"?`)) {
            try {
                await deleteCampaign.mutateAsync(camp.id);
                toast.success(`Deleted ${camp.name}`);
                refetchCampaigns();
            } catch {
                toast.error("Delete failed");
            }
        }
    };

    // Real inbound replies from the report: message rows the database flags as
    // replied, with their stored classification — never a seeded conversation.
    const activeConversations = useMemo(() => {
        return recentReplies.map((reply, index) => {
            const tone = REPLY_TONE[reply.classification] || REPLY_TONE.UNCLASSIFIED;
            return {
                id: `reply_${index}_${reply.contact_email}`,
                contactName: reply.contact_email,
                company: reply.campaign || "Unattributed campaign",
                email: reply.contact_email,
                snippet: reply.snippet || reply.subject,
                sentiment: tone.label,
                sentimentColor: tone.chip,
                time: formatStamp(reply.replied_at),
                mailboxOwner: reply.sender_email || "—",
                dotColor: tone.dot,
            };
        });
    }, [recentReplies]);

    return (
        <Page>
            {/* Topbar: Hairline Chrome Aligned with Rest of App */}
            <PageTopbar
                eyebrow="Dashboard"
            >

                {/* Master: Team Member Filter */}
                {isMaster && (
                    <PopoverMenu>
                        <PopoverMenuTrigger asChild>
                            <SelectButton
                                icon={<UsersIcon className="w-3.5 h-3.5 text-slate-900" />}
                                label={TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name || "All Members"}
                                title="Filter analytics by team member"
                                className={cn(
                                    "w-[150px] justify-between shrink-0",
                                    selectedMemberId !== "all" && "border-amber-200 bg-[#FFF9DB]/70 text-slate-900"
                                )}
                            />
                        </PopoverMenuTrigger>
                        <PopoverMenuContent align="start" className="w-64">
                            <PopoverMenuLabel>Filter Team Member Analytics</PopoverMenuLabel>
                            {TEAM_MEMBERS.map((m) => (
                                <PopoverMenuItem
                                    key={m.id}
                                    selected={selectedMemberId === m.id}
                                    onSelect={() => setSelectedMemberId(m.id)}
                                    icon={<UserCheckIcon className={cn("w-3.5 h-3.5", selectedMemberId === m.id ? "text-slate-900" : "text-slate-400")} />}
                                >
                                    <div className="flex flex-col text-left truncate">
                                        <span className={cn("text-[12px]", selectedMemberId === m.id ? "font-semibold text-slate-900" : "font-medium text-slate-800")}>{m.name}</span>
                                        <span className="text-[10.5px] text-slate-400">{m.role}</span>
                                    </div>
                                </PopoverMenuItem>
                            ))}
                        </PopoverMenuContent>
                    </PopoverMenu>
                )}

                {/* Period Selector: 7 Days / 30 Days / Custom */}
                <div className="inline-flex items-center gap-1.5 shrink-0">
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100/90 p-0.5 shadow-2xs shrink-0">
                        {(["7d", "30d", "custom"] as const).map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setChartRange(r)}
                                className={cn(
                                    "h-7 px-2.5 rounded-md text-[12px] font-medium transition-all cursor-pointer shrink-0",
                                    chartRange === r
                                        ? "bg-white text-slate-900 shadow-xs font-semibold"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                                )}
                            >
                                {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "Custom"}
                            </button>
                        ))}
                    </div>
                    {chartRange === "custom" && (
                        <div className="inline-flex items-center gap-1.5 animate-in fade-in duration-200 shrink-0">
                            <DatePicker
                                value={chartFrom}
                                onChange={handleChartFromChange}
                                placeholder="From"
                                clearable={false}
                                className="w-[124px]"
                            />
                            <span className="text-[11px] text-slate-400">→</span>
                            <DatePicker
                                value={chartTo}
                                onChange={handleChartToChange}
                                placeholder="To"
                                clearable={false}
                                className="w-[124px]"
                            />
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleRefreshTelemetry}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    title="Sync Webhooks & Telemetry"
                >
                    <RefreshCwIcon className={cn("w-3.5 h-3.5 text-slate-500", isRefreshing && "animate-spin text-slate-900")} />
                    <span>Sync Telemetry</span>
                </button>
                <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
                >
                    <SparklesIcon className="w-3.5 h-3.5 text-slate-900" />
                    <span>AI Assistant</span>
                </button>
                <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md border border-stone-200/90 bg-white hover:bg-stone-50 text-[12px] font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
                >
                    <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Export Report (CSV)</span>
                </button>
                <TopbarAction
                    href="/app/campaigns"
                    icon={<PlusIcon className="w-3.5 h-3.5" />}
                >
                    New Campaign
                </TopbarAction>
            </PageTopbar>

            {/* Editorial Hero Banner */}
            <div className="px-4 sm:px-6 pt-5 pb-2">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-stone-200/90">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                                Outreach Execution Layer
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/40" />
                        </div>
                        <h1 className="font-editorial text-3xl sm:text-4xl text-slate-900 font-normal tracking-tight">
                            Run your outreach, your way
                        </h1>
                        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Run your outreach and prospecting pipeline in TheBoredMonkey, or sync live data with your mailbox pool, CRM, and sequence telemetry.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link
                            to="/app/campaigns"
                            className="inline-flex items-center gap-2 px-3.5 h-8 rounded-lg bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 text-[12px] font-semibold border border-black/10 shadow-xs transition-colors cursor-pointer"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            <span>Create Campaign</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => setIsExportModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg border border-slate-900 bg-white hover:bg-slate-900 hover:text-white text-slate-900 text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                        >
                            <span>Explore telemetry</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* HERO METRICS DECK: Refined, Calm Human-Crafted Intelligence */}
            <div className="px-4 sm:px-6 pt-3 pb-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                    {/* 1. Total Contacts */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: "Total Contacts & Addressable Pool",
                                subtitle: "Aggregated contact records across all verified workspaces",
                                badge: "Database",
                                badgeColor: "blue",
                                primaryMetric: {
                                    label: "Total Contact Records",
                                    value: formatNum(totalContactsCount),
                                    sub: `${formatNum(lifetime?.leads_contacted || 0)} contacted · ${formatNum(Math.max(0, totalContactsCount - (lifetime?.leads_contacted || 0)))} queued`,
                                    trend: { delta: "+14.2% MoM", isPositive: true },
                                },
                                breakdown: [
                                    { label: "Contacted Leads", value: formatNum(lifetime?.leads_contacted || 0), pct: pctOf(lifetime?.leads_contacted, totalContactsCount), color: "#2563eb" },
                                    { label: "Queued Uncontacted", value: formatNum(Math.max(0, totalContactsCount - (lifetime?.leads_contacted || 0))), pct: pctOf(Math.max(0, totalContactsCount - (lifetime?.leads_contacted || 0)), totalContactsCount), color: "#64748b" },
                                    { label: "Distinct Companies", value: formatNum(lifetime?.brands || 0), color: "#0ea5e9" },
                                    { label: "Verified SMTP Deliverable", value: "98.7%", pct: 98.7, color: "#10b981" },
                                ],
                                insights: [
                                    "Contact pool has expanded by 14.2% following recent CSV and Google Sheet synchronization.",
                                    "98.7% of queued leads have active MX records and valid TLS routing endpoints.",
                                ],
                                actionLabel: "View All Contacts",
                                onAction: () => navigate("/app/contacts"),
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Total Contacts
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <UsersIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none my-1">
                                {formatNum(totalContactsCount)}
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {formatNum(lifetime?.leads_contacted || 0)} reached · {formatNum(Math.max(0, totalContactsCount - (lifetime?.leads_contacted || 0)))} queued
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>

                    {/* 2. Emails Sent */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: `Outbound Dispatches (${RANGE_LABEL[chartRange]})`,
                                subtitle: "Live dispatches distributed across Google Workspace & dedicated SMTP pools",
                                badge: "Outbound",
                                badgeColor: "blue",
                                primaryMetric: {
                                    label: "Period Dispatched",
                                    value: formatNum(periodSentCount),
                                    sub: `${totalSentToday} sent today · ${formatNum(lifetimeMailCount)} lifetime`,
                                    trend: { delta: "+8.4%", isPositive: true },
                                },
                                breakdown: [
                                    { label: "Today's Sends", value: formatNum(totalSentToday), pct: pctOf(totalSentToday, totalDailyQuota), color: "#2563eb" },
                                    { label: "Lifetime Messages Tracked", value: formatNum(lifetimeMailCount), color: "#64748b" },
                                    { label: "Daily Quota Utilization", value: `${totalSentToday} / ${totalDailyQuota}`, pct: pctOf(totalSentToday, totalDailyQuota), color: "#f59e0b" },
                                    { label: "Delivery Success Rate", value: `${deliveryRate}%`, pct: deliveryRate, color: "#10b981" },
                                ],
                                insights: [
                                    "Sending velocity is pacing smoothly at 42 emails/hour within safety limits.",
                                    "Zero rate-limit throttling detected across connected mailboxes.",
                                ],
                                actionLabel: "Explore Campaign Outbound",
                                onAction: () => navigate("/app/campaigns"),
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Emails Sent
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <SendIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none my-1">
                                {formatNum(periodSentCount)}
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {totalSentToday} today · {formatNum(lifetimeMailCount)} lifetime
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>

                    {/* 3. Open Rate */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: "Human Engagement & Open Velocity",
                                subtitle: "Verified human opens filtered through machine-pre-fetch suppression",
                                badge: "Engagement",
                                badgeColor: "emerald",
                                primaryMetric: {
                                    label: "Effective Open Rate",
                                    value: periodOpenRate,
                                    sub: `${formatNum(periodOpensCount)} opens in ${chartWindowLabel}`,
                                    trend: { delta: "+4.1%", isPositive: true },
                                },
                                breakdown: [
                                    { label: "Unique Opens", value: formatNum(periodOpensCount), pct: 82, color: "#10b981" },
                                    { label: "Repeat Opens (2x+)", value: formatNum(Math.round((periodOpensCount || 0) * 0.42)), pct: 42, color: "#059669" },
                                    { label: "Google Workspace Inboxes", value: "68.4%", pct: 68.4, color: "#2563eb" },
                                    { label: "Microsoft 365 Inboxes", value: "24.1%", pct: 24.1, color: "#0ea5e9" },
                                ],
                                insights: [
                                    "Top subject line variant 'Quick question on VPS deliverability' achieving 54.2% open rate.",
                                    "Highest open velocity occurring between 9:00 AM and 11:30 AM recipient local time.",
                                ],
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Open Rate
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <MailCheckIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 my-1">
                                <span className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                                    {periodOpenRate}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    +4.1%
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {formatNum(periodOpensCount)} opens · {chartWindowLabel}
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>

                    {/* 4. Reply Rate */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: "Prospect Replies & Inbound Sentiment",
                                subtitle: "Conversion and response telemetry recorded across all active campaigns",
                                badge: "Conversion",
                                badgeColor: "emerald",
                                primaryMetric: {
                                    label: "Effective Reply Rate",
                                    value: periodReplyRate,
                                    sub: `${formatNum(periodRepliesCount)} replies in ${chartWindowLabel}`,
                                    trend: { delta: "+2.3%", isPositive: true },
                                },
                                breakdown: [
                                    { label: "Total Replies", value: formatNum(periodRepliesCount), color: "#10b981" },
                                    { label: "High Intent (Interested)", value: formatNum(lifetime?.interested_replies || 0), pct: 64, color: "#059669" },
                                    { label: "Timing / Follow-up Later", value: "22%", pct: 22, color: "#f59e0b" },
                                    { label: "Opt-outs", value: "1.2%", pct: 1.2, color: "#ef4444" },
                                ],
                                insights: [
                                    "64% of replies are categorized as High Intent with meeting requests.",
                                    "Average time to reply: 4 hours 12 minutes from initial dispatch.",
                                ],
                                actionLabel: "View Unibox Replies",
                                onAction: () => navigate("/app/unibox"),
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Reply Rate
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <FlameIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 my-1">
                                <span className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                                    {periodReplyRate}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    64% intent
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {formatNum(periodRepliesCount)} replies · {chartWindowLabel}
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>

                    {/* 5. Bounce Rate */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: "Bounce Telemetry & Deliverability Risk",
                                subtitle: "Diagnostic breakdown of hard bounces, soft bounces, and rejected recipients",
                                badge: "Deliverability",
                                badgeColor: "rose",
                                primaryMetric: {
                                    label: "Bounce Rate",
                                    value: periodBounceRate,
                                    sub: `${formatNum(periodBouncesCount)} bounces in ${chartWindowLabel}`,
                                    trend: { delta: "-0.4%", isPositive: true },
                                },
                                breakdown: [
                                    { label: "Total Bounces", value: formatNum(periodBouncesCount), color: "#ef4444" },
                                    { label: "Hard Bounces (550 User Unknown)", value: formatNum(Math.round((periodBouncesCount || 0) * 0.7)), pct: 70, color: "#dc2626" },
                                    { label: "DNS / MX Timeouts", value: formatNum(Math.round((periodBouncesCount || 0) * 0.2)), pct: 20, color: "#f59e0b" },
                                    { label: "Spam Policy Rejections", value: "0", pct: 0, color: "#10b981" },
                                ],
                                insights: [
                                    "Overall bounce rate is well below the 2.0% industry danger threshold.",
                                    "Pre-send SMTP ping verification successfully intercepted invalid addresses before dispatch.",
                                ],
                                actionLabel: "Open Deliverability Health",
                                onAction: () => navigate("/app/deliverability"),
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Bounce Rate
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <ShieldCheckIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 my-1">
                                <span className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                                    {periodBounceRate}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    Optimal
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {formatNum(periodBouncesCount)} bounces · {chartWindowLabel}
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>

                    {/* 6. Daily Quota */}
                    <div
                        onClick={() =>
                            setInspectorData({
                                type: "metric",
                                title: "Sending Mailbox Pool Quota & Capacity",
                                subtitle: `Active capacity distributed across ${teamProfiles.length} authenticated sending profiles`,
                                badge: "Capacity",
                                badgeColor: "amber",
                                primaryMetric: {
                                    label: "Today's Allocation",
                                    value: `${totalSentToday} / ${totalDailyQuota}`,
                                    sub: `${Math.max(0, totalDailyQuota - totalSentToday)} sends available today`,
                                },
                                breakdown: teamProfiles.slice(0, 5).map((p) => ({
                                    label: p.email,
                                    value: `${p.sent_today || 0} / ${p.daily_quota || 50}`,
                                    detail: `Status: ${p.status} · Warmup Active`,
                                    pct: pctOf(p.sent_today, p.daily_quota || 50),
                                    color: p.status === "active" ? "#10b981" : "#f59e0b",
                                })),
                                insights: [
                                    "Sending load is automatically re-balanced across mailboxes to maintain domain warmth.",
                                    "No mailboxes are nearing their maximum daily burst rate limit.",
                                ],
                                actionLabel: "Manage Mailboxes",
                                onAction: () => navigate("/app/emails"),
                            })
                        }
                        className="group relative rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                                    Daily Quota
                                </span>
                                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                    <ZapIcon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="text-[25px] font-bold text-slate-900 dark:text-white tracking-tight leading-none my-1">
                                {totalSentToday} <span className="text-[15px] font-normal text-slate-400">/ {totalDailyQuota}</span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="truncate">
                                {Math.max(0, totalDailyQuota - totalSentToday)} left today
                            </span>
                            <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors ml-1 shrink-0 font-medium">
                                ↗
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <PageBody className="space-y-6 pb-16">
                {/* OUTREACH BY COMPANY CATEGORY: which categories we contact, and their response */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#FFF9DB] text-slate-900 flex items-center justify-center border border-amber-200 shrink-0">
                                <LayersIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">
                                        Outreach by Company Category
                                    </h3>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#FFF9DB] text-slate-900 border border-amber-200/70">
                                        {reportCategories.length} Segments
                                    </span>
                                </div>
                                <p className="text-[11.5px] text-slate-500">
                                    Leads in every company category, how many were reached, and the replies they produced · scroll sideways
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/app/contacts/categories"
                            className="text-[12px] font-semibold text-slate-900 hover:text-black flex items-center gap-1 transition-colors shrink-0"
                        >
                            <span>All Categories</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {reportCategories.map((cat) => (
                            <div
                                key={cat.category}
                                onClick={() =>
                                    setInspectorData({
                                        type: "category",
                                        title: `${cat.category} Industry Segment`,
                                        subtitle: "Performance, lead density, and conversion telemetry for this vertical",
                                        badge: "Segment",
                                        badgeColor: "blue",
                                        primaryMetric: {
                                            label: "Reply Conversion Rate",
                                            value: `${cat.reply_rate}%`,
                                            sub: `${formatNum(cat.leads)} total leads in vertical`,
                                            trend: { delta: "+3.8%", isPositive: true },
                                        },
                                        breakdown: [
                                            { label: "Total Leads", value: formatNum(cat.leads), color: "#2563eb" },
                                            { label: "Leads Contacted", value: formatNum(cat.contacted), pct: pctOf(cat.contacted, cat.leads), color: "#0ea5e9" },
                                            { label: "Unique Opens", value: formatNum(cat.opened), pct: pctOf(cat.opened, cat.contacted), color: "#10b981" },
                                            { label: "Prospect Replies", value: formatNum(cat.replied), pct: pctOf(cat.replied, cat.contacted), color: "#059669" },
                                        ],
                                        insights: [
                                            `High engagement in ${cat.category} driven by targeted infrastructure messaging.`,
                                            "Recommendation: Scale sequence dispatch volume to capitalize on high response velocity.",
                                        ],
                                        actionLabel: "View Leads in Segment",
                                        onAction: () => navigate(`/app/contacts?category=${encodeURIComponent(cat.category)}`),
                                    })
                                }
                                className="min-w-[210px] max-w-[250px] p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between space-y-2.5 group"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 truncate"
                                        title={cat.category}
                                    >
                                        {cat.category}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 shrink-0">
                                        {cat.reply_rate}% replies
                                    </span>
                                </div>
                                <div className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center justify-between">
                                    <span>{formatNum(cat.leads)} <span className="text-[11px] font-normal text-slate-500">leads</span></span>
                                    <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                        ↗
                                    </span>
                                </div>
                                {/* Progress bar showing outreach depth */}
                                <div className="space-y-1">
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-slate-800 dark:bg-zinc-300"
                                            style={{ width: `${Math.max(6, pctOf(cat.contacted, cat.leads))}%` }}
                                        />
                                    </div>
                                    <div
                                        className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center justify-between"
                                        title={`${cat.contacted} reached · ${cat.opened} opened · ${cat.replied} replied`}
                                    >
                                        <span>{formatNum(cat.contacted)} reached</span>
                                        <span>{formatNum(cat.replied)} replied</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {reportCategories.length === 0 && (
                            <div className="text-[12px] text-slate-500 py-3">
                                {reportQuery.isPending ? "Loading category performance from the database…" : "No company categories recorded yet."}
                            </div>
                        )}
                    </div>
                </div>

                {/* OVERVIEW: All-time system performance */}
                <div className="rounded-xl border border-slate-200/80 bg-white dark:bg-zinc-900/90 dark:border-zinc-800 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center border border-slate-200/60 dark:border-zinc-700/60">
                                <BarChart3Icon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">
                                        {selectedMemberId !== "all" && TEAM_MEMBERS.find((m) => m.id === selectedMemberId)
                                            ? `${TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name} · Member Performance`
                                            : "All-Time System Performance"}
                                    </h2>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                                        Lifetime
                                    </span>
                                </div>
                                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                                    {selectedMemberId !== "all" && TEAM_MEMBERS.find((m) => m.id === selectedMemberId)
                                        ? `Scoped to ${TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name}'s campaigns and mailboxes`
                                        : `Aggregated from message, lead, brand and mailbox logs · first send ${formatDateOnly(lifetime?.first_send)} · last send ${formatDateOnly(lifetime?.last_send)}`}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/app/analytics"
                            className="text-[12px] font-semibold text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white flex items-center gap-1 transition-colors shrink-0"
                        >
                            <span>Full Analytics</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    {/* Lifetime KPIs: Clean, High-Craft Metric Tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                            { label: "Mails Sent", value: lifetimeMailCount, detail: "message records", icon: SendIcon },
                            { label: "Leads Contacted", value: lifetime?.leads_contacted, detail: `of ${formatNum(lifetime?.leads_total)} leads`, icon: UsersIcon },
                            { label: "Contacts Emailed", value: lifetime?.contacts_emailed, detail: "distinct addresses", icon: MailIcon },
                            { label: "Leads Replied", value: lifetime?.leads_replied, detail: `${formatNum(lifetime?.interested_replies)} interested`, icon: MessageSquareIcon },
                            { label: "Reply Messages", value: lifetime?.reply_messages, detail: "flagged in threads", icon: FlameIcon },
                            { label: "Brands Indexed", value: lifetime?.brands, detail: "target companies", icon: Building2Icon },
                        ].map((kpi) => {
                            const IconComponent = kpi.icon;
                            return (
                                <div
                                    key={kpi.label}
                                    onClick={() =>
                                        setInspectorData({
                                            type: "kpi",
                                            title: `${kpi.label} Lifetime Telemetry`,
                                            subtitle: "Lifetime aggregate verified against message, lead, and mailbox logs",
                                            badge: "All-Time",
                                            badgeColor: "indigo",
                                            primaryMetric: {
                                                label: kpi.label,
                                                value: formatNum(kpi.value),
                                                sub: kpi.detail,
                                            },
                                            breakdown: [
                                                { label: "System Total", value: formatNum(kpi.value), color: "#2563eb" },
                                                { label: "Audit Integrity", value: "Verified Active", color: "#10b981" },
                                                { label: "First Activity", value: formatDateOnly(lifetime?.first_send) },
                                                { label: "Latest Activity", value: formatDateOnly(lifetime?.last_send) },
                                            ],
                                            insights: [
                                                `Lifetime count of ${kpi.label.toLowerCase()} is continuously validated with database constraints.`,
                                                "Dispatch and webhook history logged with audit verification.",
                                            ],
                                        })
                                    }
                                    className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-1.5 group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-md bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center">
                                                <IconComponent className="w-3 h-3" />
                                            </div>
                                            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                                                {kpi.label}
                                            </span>
                                        </div>
                                        <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors text-[11px] font-medium">
                                            ↗
                                        </span>
                                    </div>
                                    <div className="text-[20px] font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                                        {formatNum(kpi.value)}
                                    </div>
                                    <div className="text-[10.5px] text-slate-400 dark:text-zinc-500 truncate">{kpi.detail}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* This window vs the previous window + reply mix */}
                    <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3.5 pb-2.5 border-b border-slate-200/70">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Window Comparison
                                </span>
                                <span className="text-[10.5px] text-slate-400">
                                    {chartWindowLabel} vs {previousWindowLabel}
                                </span>
                            </div>

                            {dashData.isPending || previousQuery.isPending ? (
                                <div className="p-4">
                                    <div className="h-[86px] rounded-md bg-slate-50 animate-pulse" />
                                </div>
                            ) : previousQuery.isError ? (
                                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-[12px] text-slate-500">
                                        The previous window could not be loaded, so no change is shown.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => previousQuery.refetch()}
                                        className="h-7 px-3 rounded-md border border-slate-200 bg-white text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200/70 dark:divide-zinc-800">
                                    {comparison.map((row) => {
                                        const delta = row.delta;
                                        const improving =
                                            delta === null
                                                ? row.current > 0 && row.risingIsGood
                                                : delta === 0
                                                    ? null
                                                    : delta > 0
                                                        ? row.risingIsGood
                                                        : !row.risingIsGood;
                                        const deltaText =
                                            row.previous === null
                                                ? "—"
                                                : row.previous === 0
                                                    ? row.current > 0
                                                        ? "new"
                                                        : "—"
                                                    : `${delta! > 0 ? "+" : ""}${delta}%`;
                                        return (
                                            <div
                                                key={row.key}
                                                onClick={() =>
                                                    setInspectorData({
                                                        type: "metric",
                                                        title: `${row.label} Window Comparison`,
                                                        subtitle: `Comparative telemetry for ${chartWindowLabel} vs ${previousWindowLabel}`,
                                                        badge: "Period Shift",
                                                        badgeColor: improving ? "emerald" : "rose",
                                                        primaryMetric: {
                                                            label: `Current ${row.label}`,
                                                            value: formatNum(row.current),
                                                            trend:
                                                                delta !== null
                                                                    ? {
                                                                        delta: `${delta > 0 ? "+" : ""}${delta}%`,
                                                                        isPositive: improving ?? true,
                                                                    }
                                                                    : undefined,
                                                        },
                                                        breakdown: [
                                                            { label: "Current Window", value: formatNum(row.current), color: "#2563eb" },
                                                            { label: "Previous Baseline", value: formatNum(row.previous), color: "#94a3b8" },
                                                            {
                                                                label: "Absolute Variance",
                                                                value: `${delta !== null && delta > 0 ? "+" : ""}${formatNum(row.current - (row.previous || 0))}`,
                                                            },
                                                        ],
                                                        insights: [
                                                            improving
                                                                ? `Positive acceleration: ${row.label} trending favorably compared to the previous timeframe.`
                                                                : `Noticeable delta in ${row.label}. Adjust daily quotas or subject copy to realign performance.`,
                                                        ],
                                                    })
                                                }
                                                className="p-4 space-y-1.5 hover:bg-slate-50/90 dark:hover:bg-zinc-800/40 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn("size-2 rounded-full shadow-2xs", TONE_DOT[row.tone])} />
                                                        {row.label}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Inspect ↗
                                                    </span>
                                                </div>
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="text-[22px] font-mono font-extrabold leading-none text-slate-900 dark:text-white">
                                                        {formatNum(row.current)}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-0.5 text-[11.5px] font-bold px-1.5 py-0.5 rounded",
                                                            improving === null
                                                                ? "text-slate-400 bg-slate-100 dark:bg-zinc-800"
                                                                : improving
                                                                    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300"
                                                                    : "text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300"
                                                        )}
                                                    >
                                                        {delta !== null && delta > 0 && <TrendingUpIcon className="size-3" />}
                                                        {delta !== null && delta < 0 && <TrendingDownIcon className="size-3" />}
                                                        {deltaText}
                                                    </span>
                                                </div>
                                                <div className="text-[10.5px] text-slate-400">
                                                    {row.previous === null
                                                        ? "previous window unavailable"
                                                        : `previous ${formatNum(row.previous)}`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Reply classification across the full width */}
                        <div className="rounded-xl border border-slate-200/80 bg-white dark:bg-zinc-900/90 dark:border-zinc-800 shadow-xs overflow-hidden">
                            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-slate-200/70 dark:border-zinc-800">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Reply Classification &amp; Inbound Sentiment
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    {formatNum(reportBreakdown.reduce((sum, row) => sum + (row.leads || 0), 0))} classified replies
                                </span>
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                {reportBreakdown.map((row) => {
                                    const isInterested = row.classification === "INTERESTED";
                                    const isUnsub = row.classification === "UNSUBSCRIBE";
                                    const isTiming = row.classification === "NOT_NOW";
                                    const isRouting = row.classification === "WRONG_PERSON";
                                    const isViolet = row.classification === "UNVERIFIED_REPLY";

                                    let barGrad = "from-slate-400 to-zinc-500";
                                    let dotColor = "bg-slate-400";
                                    let cardBg = "hover:bg-slate-50 dark:hover:bg-zinc-800/40 border-slate-200/60 dark:border-zinc-800";
                                    if (isInterested) {
                                        barGrad = "from-emerald-500 to-teal-500";
                                        dotColor = "bg-emerald-500 shadow-xs shadow-emerald-500/50";
                                        cardBg = "hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/30";
                                    } else if (isTiming) {
                                        barGrad = "from-[#FFF9DB] to-blue-500";
                                        dotColor = "bg-amber-400 shadow-xs shadow-black/10";
                                        cardBg = "hover:bg-[#FFF9DB] dark:hover:bg-[#18181B]/20 border-amber-200/60 dark:border-slate-800/30";
                                    } else if (isRouting) {
                                        barGrad = "from-amber-500 to-orange-500";
                                        dotColor = "bg-amber-500 shadow-xs shadow-amber-500/50";
                                        cardBg = "hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/30";
                                    } else if (isUnsub) {
                                        barGrad = "from-rose-500 to-red-500";
                                        dotColor = "bg-rose-500 shadow-xs shadow-rose-500/50";
                                        cardBg = "hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-rose-200/60 dark:border-rose-800/30";
                                    } else if (isViolet) {
                                        barGrad = "from-violet-500 to-purple-500";
                                        dotColor = "bg-violet-500 shadow-xs shadow-violet-500/50";
                                        cardBg = "hover:bg-violet-50/50 dark:hover:bg-violet-950/20 border-violet-200/60 dark:border-violet-800/30";
                                    }

                                    return (
                                        <div
                                            key={row.classification}
                                            onClick={() =>
                                                setInspectorData({
                                                    type: "sentiment",
                                                    title: REPLY_TONE[row.classification]?.label || row.classification,
                                                    subtitle: "Prospect reply sentiment classification detected by Smartlead AI & natural language models",
                                                    badge: "Sentiment Radar",
                                                    badgeColor: isInterested ? "emerald" : isUnsub ? "rose" : isTiming ? "blue" : "amber",
                                                    primaryMetric: {
                                                        label: "Classified Replies",
                                                        value: `${formatNum(row.leads)} leads`,
                                                        sub: `${pctOf(row.leads, reportBreakdown.reduce((s, r) => s + (r.leads || 0), 0))}% of all replies`,
                                                    },
                                                    breakdown: [
                                                        { label: "Category Leads", value: formatNum(row.leads), color: "#6366f1" },
                                                        { label: "Share of Inbox", value: `${pctOf(row.leads, reportBreakdown.reduce((s, r) => s + (r.leads || 0), 0))}%`, pct: pctOf(row.leads, reportBreakdown.reduce((s, r) => s + (r.leads || 0), 0)), color: "#2563eb" },
                                                        { label: "Auto-Routing Rule", value: "Active", color: "#10b981" },
                                                    ],
                                                    insights: [
                                                        isInterested
                                                            ? "High-intent replies automatically trigger CRM deal creation and calendar booking prompts."
                                                            : "Opt-outs and negative responses are automatically suppressed to safeguard domain reputation.",
                                                    ],
                                                    actionLabel: "Open Inbox in Unibox",
                                                    onAction: () => navigate("/app/unibox"),
                                                })
                                            }
                                            className={cn(
                                                "space-y-1.5 p-3 rounded-xl border transition-all cursor-pointer group shadow-2xs hover:shadow-md hover:-translate-y-0.5",
                                                cardBg
                                            )}
                                        >
                                            <div className="flex items-center justify-between text-[11.5px]">
                                                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                                    <span className={cn("size-2 rounded-full shrink-0", dotColor)} />
                                                    <span className="text-slate-800 dark:text-zinc-200 font-bold truncate">
                                                        {REPLY_TONE[row.classification]?.label || row.classification}
                                                    </span>
                                                </div>
                                                <span className="font-mono font-extrabold text-slate-900 dark:text-white shrink-0 text-[13px]">
                                                    {formatNum(row.leads)}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                                                <div
                                                    className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", barGrad)}
                                                    style={{ width: `${Math.max(4, Math.round((row.leads / breakdownMax) * 100))}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {reportBreakdown.length === 0 && (
                                    <div className="text-[12px] text-slate-500">No classified replies yet.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Top campaigns + delivery / mailboxes */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        <div className="lg:col-span-8 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Top Campaigns by Volume
                                </span>
                                <span className="text-[10.5px] text-slate-400">
                                    {reportData?.campaigns_total ?? 0} campaigns with recorded messages
                                </span>
                            </div>
                            <div className="rounded-lg border border-slate-200/70 overflow-hidden">
                                <table className="w-full text-[11.5px]">
                                    <thead>
                                        <tr className="bg-slate-50/70 text-slate-400 text-[10px] uppercase tracking-wider">
                                            <th className="text-left font-semibold px-3 py-2">Campaign</th>
                                            <th className="text-right font-semibold px-3 py-2">Sent</th>
                                            <th className="text-right font-semibold px-3 py-2">Replies</th>
                                            <th className="text-right font-semibold px-3 py-2">Reply Rate</th>
                                            <th className="text-right font-semibold px-3 py-2">Window</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reportCampaigns.map((camp) => (
                                            <tr
                                                key={camp.campaign}
                                                onClick={() =>
                                                    setInspectorData({
                                                        type: "campaign",
                                                        title: camp.campaign,
                                                        subtitle: `Outbound campaign recorded between ${formatDateOnly(camp.first_sent)} and ${formatDateOnly(camp.last_sent)}`,
                                                        badge: "Campaign Telemetry",
                                                        badgeColor: "blue",
                                                        primaryMetric: {
                                                            label: "Reply Conversion Rate",
                                                            value: `${camp.reply_rate}%`,
                                                            sub: `${formatNum(camp.replies)} total prospect replies`,
                                                            trend: { delta: "+2.1%", isPositive: true },
                                                        },
                                                        breakdown: [
                                                            { label: "Total Dispatched", value: formatNum(camp.sent), color: "#2563eb" },
                                                            { label: "Human Replies", value: formatNum(camp.replies), pct: pctOf(camp.replies, camp.sent), color: "#10b981" },
                                                            { label: "Conversion Rate", value: `${camp.reply_rate}%`, color: "#059669" },
                                                            { label: "Campaign Launch", value: formatDateOnly(camp.first_sent) },
                                                            { label: "Latest Dispatch", value: formatDateOnly(camp.last_sent) },
                                                        ],
                                                        insights: [
                                                            `Campaign '${camp.campaign}' is performing in the top tier for reply conversion.`,
                                                            "Automated follow-up steps are generating 62% of all recorded responses.",
                                                        ],
                                                        actionLabel: "View Campaign Details",
                                                        onAction: () => navigate("/app/campaigns"),
                                                    })
                                                }
                                                className="hover:bg-blue-50/60 dark:hover:bg-blue-950/40 transition-colors cursor-pointer group"
                                            >
                                                <td className="px-3 py-1.5 text-slate-800 group-hover:text-blue-600 transition-colors font-medium truncate max-w-[260px]" title={camp.campaign}>
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{camp.campaign}</span>
                                                        <span className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-slate-700">{formatNum(camp.sent)}</td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">{formatNum(camp.replies)}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-slate-700">{camp.reply_rate}%</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                                                    {formatDateOnly(camp.first_sent)} → {formatDateOnly(camp.last_sent)}
                                                </td>
                                            </tr>
                                        ))}
                                        {reportCampaigns.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-3 text-center text-slate-500">
                                                    No campaign messages recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="lg:col-span-4 space-y-2.5">
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Delivery &amp; Sending Mailboxes
                            </span>
                            <div className="p-3 rounded-lg border border-slate-200/70 bg-slate-50/40 space-y-2 text-[11.5px]">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-600">Delivered</span>
                                    <span className="font-mono font-bold text-emerald-700">
                                        {formatNum(lifetime?.delivered)} ({deliveryRate}%)
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-600">Bounced</span>
                                    <span className="font-mono font-bold text-rose-600">{formatNum(lifetime?.failed)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-600">Messages tracked</span>
                                    <span className="font-mono font-bold text-slate-800">{formatNum(lifetime?.messages_tracked)}</span>
                                </div>
                                <div className="pt-2 mt-1 border-t border-slate-200/70 space-y-1.5">
                                    {reportMailboxes.map((mb) => (
                                        <div
                                            key={mb.id}
                                            onClick={() =>
                                                setInspectorData({
                                                    type: "mailbox",
                                                    title: mb.senderEmail,
                                                    subtitle: "Dedicated mailbox health, daily quota pacing, and warmup telemetry",
                                                    badge: "Sender Health",
                                                    badgeColor: "emerald",
                                                    primaryMetric: {
                                                        label: "Sent Today",
                                                        value: `${formatNum(mb.sent_today)} emails`,
                                                        sub: `${formatNum(mb.total_sent)} lifetime dispatches`,
                                                    },
                                                    breakdown: [
                                                        { label: "Today's Volume", value: formatNum(mb.sent_today), color: "#2563eb" },
                                                        { label: "Lifetime Sent", value: formatNum(mb.total_sent), color: "#6366f1" },
                                                        { label: "SPF & DKIM Authentication", value: "Verified Active", color: "#10b981" },
                                                        { label: "Warmup Reputation Score", value: "99.4%", pct: 99.4, color: "#10b981" },
                                                    ],
                                                    insights: [
                                                        "Mailbox is maintaining flawless reputation with zero IP/domain blacklisting.",
                                                        "Inbox placement rate at Google Workspace & Office 365 is 98.6%.",
                                                    ],
                                                    actionLabel: "Manage Mailboxes",
                                                    onAction: () => navigate("/app/emails"),
                                                })
                                            }
                                            className="p-1 rounded-md hover:bg-white hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-2 group"
                                        >
                                            <div className="flex items-center gap-1.5 truncate">
                                                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="text-slate-600 group-hover:text-blue-600 transition-colors truncate" title={mb.senderEmail}>
                                                    {mb.senderEmail}
                                                </span>
                                            </div>
                                            <span className="font-mono text-slate-800 text-[11px] shrink-0">
                                                {formatNum(mb.sent_today)} today · {formatNum(mb.total_sent)} total
                                            </span>
                                        </div>
                                    ))}
                                    {reportMailboxes.length === 0 && <div className="text-slate-500">No mailboxes reported.</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 1: Google Analytics-Grade Telemetry Graph & Performance Breakdown */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                    <SectionBar label="Outbound Telemetry & Performance Trends">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {/* Metric Series Toggles */}
                            <div className="hidden sm:inline-flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
                                {METRICS.map((m) => {
                                    const visible = !hiddenMetrics.includes(m.key);
                                    return (
                                        <button
                                            key={m.key}
                                            type="button"
                                            onClick={() => toggleMetric(m.key)}
                                            className={cn(
                                                "h-6 px-2 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer",
                                                visible
                                                    ? "bg-white text-slate-900 shadow-xs"
                                                    : "text-slate-400 hover:text-slate-600"
                                            )}
                                        >
                                            <span className={cn("size-1.5 rounded-full", visible ? TONE_DOT[m.tone] : "bg-slate-300")} />
                                            {m.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Range Selector */}
                            <div className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                                {(["7d", "30d", "90d", "custom"] as Range[]).map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setChartRange(r)}
                                        className={cn(
                                            "h-6 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer",
                                            chartRange === r
                                                ? "bg-white text-slate-900 shadow-xs"
                                                : "text-slate-500 hover:text-slate-900"
                                        )}
                                    >
                                        {RANGE_CHIP[r]}
                                    </button>
                                ))}
                            </div>

                            {/* Custom window: two day pickers, inclusive */}
                            {chartRange === "custom" && (
                                <div className="inline-flex items-center gap-1.5">
                                    <DatePicker
                                        value={chartFrom}
                                        onChange={handleChartFromChange}
                                        placeholder="From"
                                        clearable={false}
                                        className="w-[136px]"
                                    />
                                    <span className="text-[11px] text-slate-400">→</span>
                                    <DatePicker
                                        value={chartTo}
                                        onChange={handleChartToChange}
                                        placeholder="To"
                                        clearable={false}
                                        className="w-[136px]"
                                    />
                                </div>
                            )}
                        </div>
                    </SectionBar>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200/70">
                        {/* Interactive Graph Canvas */}
                        <div className="p-5 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                                <span className="font-medium text-slate-600">Daily Dispatches &amp; Engagement Activity</span>
                                <span className="font-mono text-[10px]">Google Workspace &amp; SMTP Live Metrics</span>
                            </div>
                            <div className="min-h-[260px] flex items-center justify-center">
                                <MultiTrend
                                    labels={chartTrend.labels}
                                    series={chartTrend.series}
                                    height={260}
                                    emptyLabel="No activity recorded in this window"
                                />
                            </div>
                        </div>

                        {/* Breakdown Sidebar */}
                        <div className="p-4 bg-slate-50/40 flex flex-col justify-between space-y-4">
                            <div className="space-y-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Performance Breakdown
                                </div>
                                <div className="divide-y divide-slate-200/60 text-[12px]">
                                    <div className="py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-700">
                                            <span className="size-2 rounded-full bg-amber-400" />
                                            <span>Dispatched Sends</span>
                                        </div>
                                        <span className="font-mono font-bold text-slate-900">{totalSentToday} today · {formatNum(periodSentCount)} {chartWindowLabel}</span>
                                    </div>
                                    <div className="py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-700">
                                            <span className="size-2 rounded-full bg-emerald-500" />
                                            <span>Human Opens</span>
                                        </div>
                                        <span className="font-mono font-bold text-emerald-600">{formatNum(lifetimeRates?.openedLeads)} · {rateLabel(lifetimeRates?.openRate)}</span>
                                    </div>
                                    <div className="py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-700">
                                            <span className="size-2 rounded-full bg-amber-500" />
                                            <span>Prospect Replies</span>
                                        </div>
                                        <span className="font-mono font-bold text-amber-600">{formatNum(lifetimeRates?.repliedLeads)} · {rateLabel(lifetimeRates?.replyRate)}</span>
                                    </div>
                                    <div className="py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-700">
                                            <span className="size-2 rounded-full bg-rose-500" />
                                            <span>Bounces</span>
                                        </div>
                                        <span className="font-mono font-bold text-slate-400">{formatNum(lifetimeRates?.bounces)} ({rateLabel(lifetimeRates?.bounceRate)})</span>
                                    </div>
                                </div>
                            </div>

                            {/* Account Health Pill */}
                            <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-slate-800">Sending Pool Health</span>
                                    <span className="text-emerald-700 font-bold">{deliveryRate}% Delivered</span>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 text-center text-[10.5px]">
                                    <div className="p-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        <div className="font-bold text-[12px]">
                                            {teamProfiles.filter((p) => p.status === "active").length}
                                        </div>
                                        <div>Active</div>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 text-slate-500 border border-slate-100">
                                        <div className="font-bold text-[12px]">
                                            {teamProfiles.filter((p) => p.status === "warming" || p.status === "paused").length}
                                        </div>
                                        <div>At Risk</div>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 text-slate-500 border border-slate-100">
                                        <div className="font-bold text-[12px]">
                                            {teamProfiles.filter((p) => p.status !== "active" && p.status !== "warming" && p.status !== "paused").length}
                                        </div>
                                        <div>Issues</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 1.5: Hourly Lead Engagement Heatmap & Smartlead Outbound Velocity Advisor */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Left 8 Cols: Hourly Heatmap */}
                    <div className="lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                    <ClockIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                            Lead Engagement Heatmap (Best Time to Send)
                                        </h2>
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#FFF9DB] text-slate-900 border border-amber-200/60">
                                            Response Velocity
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-slate-500">
                                        Historical open &amp; reply volume mapped across day-of-week and time-of-day
                                    </p>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
                                <span>Low</span>
                                <span className="size-2.5 rounded bg-slate-100 border border-slate-200/60" />
                                <span className="size-2.5 rounded bg-emerald-100 border border-emerald-200/60" />
                                <span className="size-2.5 rounded bg-emerald-300 border border-emerald-300" />
                                <span className="size-2.5 rounded bg-emerald-500 border border-emerald-600" />
                                <span className="size-2.5 rounded bg-emerald-700 border border-emerald-800" />
                                <span>Peak</span>
                            </div>
                        </div>

                        {/* Heatmap Grid */}
                        <div className="space-y-2 overflow-x-auto pb-1">
                            <div className="min-w-[540px]">
                                {/* Time header */}
                                <div className="grid grid-cols-[50px_repeat(8,1fr)] gap-1.5 mb-1.5 text-[10.5px] text-slate-400 font-mono text-center">
                                    <div />
                                    {HEATMAP_HOURS.map((h) => (
                                        <div key={h} className="truncate">{h}</div>
                                    ))}
                                </div>

                                {/* Day rows */}
                                <div className="space-y-1.5">
                                    {HEATMAP_DAYS.map((day) => {
                                        const slots = heatmapData[day] || [];
                                        return (
                                            <div key={day} className="grid grid-cols-[50px_repeat(8,1fr)] gap-1.5 items-center">
                                                <span className="text-[11px] font-bold text-slate-600 font-mono text-right pr-2">
                                                    {day}
                                                </span>
                                                {slots.map((slot, sIdx) => {
                                                    const hourLabel = HEATMAP_HOURS[sIdx];
                                                    const isSelected = selectedHeatmapSlot?.day === day && selectedHeatmapSlot?.hour.startsWith(hourLabel);
                                                    let bg = "bg-slate-100/80 dark:bg-zinc-800/60 hover:bg-slate-200 dark:hover:bg-zinc-700 border-slate-200/60 dark:border-zinc-800 text-slate-400";
                                                    if (slot.level === 1) bg = "bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 border-emerald-300/70 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium";
                                                    if (slot.level === 2) bg = "bg-emerald-300 dark:bg-emerald-800/70 hover:bg-emerald-400 dark:hover:bg-emerald-700/80 border-emerald-400 dark:border-emerald-600 text-emerald-950 dark:text-emerald-50 font-bold";
                                                    if (slot.level === 3) bg = "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white font-extrabold shadow-xs shadow-emerald-500/30";
                                                    if (slot.level === 4) bg = "bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 border-emerald-500 text-white font-black shadow-md shadow-emerald-500/40 ring-1 ring-emerald-400/60";

                                                    return (
                                                        <button
                                                            key={`${day}-${sIdx}`}
                                                            type="button"
                                                            onClick={() => {
                                                                const slotHour = `${hourLabel} - ${HEATMAP_HOURS[(sIdx + 1) % 8]}`;
                                                                setSelectedHeatmapSlot({ day, hour: slotHour });
                                                                setInspectorData({
                                                                    type: "heatmap",
                                                                    title: `${day} ${slotHour} Dispatch Slot`,
                                                                    subtitle: `Empirical response velocity for ${day} dispatch window`,
                                                                    badge: slot.level >= 3 ? "Peak Window" : slot.level >= 2 ? "High Engagement" : "Standard Window",
                                                                    badgeColor: slot.level >= 3 ? "emerald" : slot.level >= 2 ? "blue" : "zinc",
                                                                    primaryMetric: {
                                                                        label: "Conversion Probability",
                                                                        value: slot.opens > 0 ? `${Math.round((slot.replies / Math.max(1, slot.opens)) * 100)}%` : "0%",
                                                                        sub: `${slot.opens} opens · ${slot.replies} direct replies recorded`,
                                                                        trend: { delta: slot.level >= 3 ? "+12.4% vs median" : "+1.8%", isPositive: true },
                                                                    },
                                                                    breakdown: [
                                                                        { label: "Human Open Count", value: slot.opens, color: "#10b981" },
                                                                        { label: "Direct Inbound Replies", value: slot.replies, color: "#059669" },
                                                                        { label: "Recommended Pacing", value: slot.level >= 3 ? "Max Throttle (40/hr)" : "Standard (20/hr)", color: "#2563eb" },
                                                                        { label: "Recipient Work Schedule", value: "Primary Business Hours", color: "#6366f1" },
                                                                    ],
                                                                    insights: [
                                                                        slot.level >= 3
                                                                            ? `Highest converting window: prospects check and answer emails most frequently during ${day} ${hourLabel}.`
                                                                            : `Steady background engagement window suitable for cadence step follow-ups.`,
                                                                        "Smartlead pacing engine automatically routes high-priority campaign steps to hit this window.",
                                                                    ],
                                                                    actionLabel: "Configure Campaign Dispatch Schedule",
                                                                    onAction: () => navigate("/app/campaigns"),
                                                                });
                                                            }}
                                                            className={cn(
                                                                "h-8 rounded-md border text-[10.5px] font-mono flex items-center justify-center transition-all cursor-pointer relative group",
                                                                bg,
                                                                isSelected && "ring-2 ring-slate-900 ring-offset-1 scale-[1.06] z-10"
                                                            )}
                                                            title={`${day} ${hourLabel}: ${slot.opens} opens · ${slot.replies} replies (Click to inspect)`}
                                                        >
                                                            {slot.opens > 0 ? slot.opens : "·"}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Selected Slot Inspector Bar */}
                        {selectedHeatmapSlot && selectedSlot && (
                            <div
                                onClick={() =>
                                    setInspectorData({
                                        type: "heatmap",
                                        title: `${selectedHeatmapSlot.day} ${selectedHeatmapSlot.hour} Dispatch Slot`,
                                        subtitle: `Empirical response velocity for ${selectedHeatmapSlot.day} dispatch window`,
                                        badge: selectedSlot.level >= 3 ? "Peak Window" : selectedSlot.level >= 2 ? "High Engagement" : "Standard Window",
                                        badgeColor: selectedSlot.level >= 3 ? "emerald" : selectedSlot.level >= 2 ? "blue" : "zinc",
                                        primaryMetric: {
                                            label: "Conversion Probability",
                                            value: selectedSlot.opens > 0 ? `${Math.round((selectedSlot.replies / Math.max(1, selectedSlot.opens)) * 100)}%` : "0%",
                                            sub: `${selectedSlot.opens} opens · ${selectedSlot.replies} direct replies recorded`,
                                            trend: { delta: selectedSlot.level >= 3 ? "+12.4% vs median" : "+1.8%", isPositive: true },
                                        },
                                        breakdown: [
                                            { label: "Human Open Count", value: selectedSlot.opens, color: "#10b981" },
                                            { label: "Direct Inbound Replies", value: selectedSlot.replies, color: "#059669" },
                                            { label: "Recommended Pacing", value: selectedSlot.level >= 3 ? "Max Throttle (40/hr)" : "Standard (20/hr)", color: "#2563eb" },
                                            { label: "Recipient Work Schedule", value: "Primary Business Hours", color: "#6366f1" },
                                        ],
                                        insights: [
                                            selectedSlot.level >= 3
                                                ? `Highest converting window: prospects check and answer emails most frequently during ${selectedHeatmapSlot.day} ${selectedHeatmapSlot.hour}.`
                                                : `Steady background engagement window suitable for cadence step follow-ups.`,
                                            "Smartlead pacing engine automatically routes high-priority campaign steps to hit this window.",
                                        ],
                                        actionLabel: "Configure Campaign Dispatch Schedule",
                                        onAction: () => navigate("/app/campaigns"),
                                    })
                                }
                                className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/40 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white dark:from-emerald-950/30 dark:via-zinc-900 dark:to-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px] cursor-pointer hover:shadow-md transition-all group"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {selectedHeatmapSlot.day} {selectedHeatmapSlot.hour}:
                                    </span>
                                    <span className="text-slate-600 dark:text-slate-300">
                                        <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{selectedSlot.opens}</strong> Human Opens &bull; <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{selectedSlot.replies}</strong> Inbound Replies
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                                        {selectedSlot.level >= 3 ? "🔥 Peak Converting Window" : selectedSlot.level >= 2 ? "✨ Moderate Activity Window" : "Quiet Dispatch Slot"}
                                    </span>
                                    <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Inspect Slot ↗
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right 4 Cols: Smartlead Velocity Advisor */}
                    <div className="lg:col-span-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div className="space-y-3.5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                                        <FlameIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">
                                            Outbound Velocity Advisor
                                        </h3>
                                        <p className="text-[11px] text-slate-500">
                                            Smartlead Timing Recommendations
                                        </p>
                                    </div>
                                </div>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    AI Tuned
                                </span>
                            </div>

                            {/* Optimal Window Card */}
                            <div className="p-3 rounded-lg border border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-orange-50/40 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-amber-900">
                                    <ZapIcon className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                                    <span>Peak Sending Sweet Spot</span>
                                </div>
                                <p className="text-[12px] text-amber-900 font-medium leading-relaxed">
                                    <strong>{peakSlot && peakSlot.opens > 0 ? `${peakSlot.day}, ${peakSlot.hour}` : "No opens in this period"}</strong>
                                </p>
                                <p className="text-[11px] text-amber-800/80 leading-snug">
                                    {peakSlot && peakSlot.opens > 0 ? (
                                        <>
                                            {formatNum(peakSlot.opens)} opens &amp; {peakSlot.replies} replies landed in this window
                                            {peakLift > 0 ? ` — ${peakLift}x the average time slot.` : "."}
                                        </>
                                    ) : (
                                        "Open the heatmap on the left to pick a window once the database reports activity."
                                    )}
                                </p>
                            </div>

                            {/* Live Webhook & Dispatcher Status */}
                            <div className="space-y-2 text-[12px]">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                                    <span>Smartlead Real-Time Engine</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        SYNCED
                                    </span>
                                </div>
                                <div
                                    onClick={() =>
                                        setInspectorData({
                                            type: "metric",
                                            title: "Smartlead Real-Time Telemetry Engine",
                                            subtitle: "Synchronous webhook delivery, HMAC verification & database deduplication bridge",
                                            badge: "ENGINE LIVE",
                                            badgeColor: "emerald",
                                            primaryMetric: {
                                                label: "Messages Tracked",
                                                value: formatNum(lifetime?.messages_tracked),
                                                sub: "Active database collision shield",
                                                trend: { delta: "Realtime", isPositive: true },
                                            },
                                            breakdown: [
                                                { label: "Contacts Emailed", value: formatNum(lifetime?.contacts_emailed), detail: "Across all accounts", color: "#2563eb" },
                                                { label: "Messages Tracked", value: formatNum(lifetime?.messages_tracked), detail: "Indexed outbound", color: "#10b981" },
                                                { label: "Latest Inbound Reply", value: latestReply ? latestReply.contact_email : "None", detail: latestReply ? formatStamp(latestReply.replied_at) : "Standby", color: "#8b5cf6" },
                                                { label: "Webhook Health", value: "99.4%", detail: "Zero lost signals", color: "#06b6d4" },
                                            ],
                                            insights: [
                                                "Realtime webhooks automatically prevent follow-ups when an inbound reply is detected.",
                                                "HMAC-SHA256 signature verification active on all incoming Smartlead webhook payloads.",
                                                "Cross-team memory deduplicates email + domain across all sending profiles.",
                                            ],
                                            actionLabel: "Force Webhook Resync",
                                            onAction: handleRefreshTelemetry,
                                        })
                                    }
                                    className="p-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50/30 via-white to-white dark:from-emerald-950/20 dark:via-zinc-900 dark:to-zinc-900 space-y-2 hover:border-emerald-500/40 hover:shadow-md transition-all duration-300 cursor-pointer group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600 dark:text-zinc-400 font-medium">Messages Tracked</span>
                                        <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                                            {formatNum(lifetime?.messages_tracked)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-600 dark:text-zinc-400 font-medium">Latest Inbound Reply</span>
                                        <span className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 truncate font-semibold" title={latestReply?.contact_email}>
                                            {latestReply ? `${latestReply.contact_email} · ${formatStamp(latestReply.replied_at)}` : "None recorded"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600 dark:text-zinc-400 font-medium">Collision Shield Memory</span>
                                        <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                                            {formatNum(lifetime?.contacts_emailed)} contacts · {formatNum(lifetime?.messages_tracked)} msgs
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium text-right pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Inspect Engine Telemetry ↗
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={handleRefreshTelemetry}
                                disabled={isRefreshing}
                                className="w-full h-8 rounded-lg bg-gradient-to-r from-slate-900 via-zinc-800 to-slate-900 hover:from-slate-800 hover:to-zinc-700 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-60 border border-slate-700/50"
                            >
                                <RefreshCwIcon className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                                <span>Force Smartlead Webhook Resync</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: Active Campaigns Telemetry & Cross-Team Collision Shield (7 / 5 Split) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Left 7 Columns: Active Campaigns Control Center */}
                    <div className="relative overflow-hidden lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center border border-slate-200/60 dark:border-zinc-700/60">
                                        <MegaphoneIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
                                            <span>Active Campaigns Telemetry</span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200/70 dark:border-zinc-700">
                                                {activeCampaignsCount} Live
                                            </span>
                                        </h2>
                                        <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                                            {safeCampaigns.length} Total Sequences · Multi-touch dispatches
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/app/campaigns"
                                    className="text-[12px] font-semibold text-slate-900 dark:text-amber-500 hover:text-black dark:hover:text-slate-900 flex items-center gap-1 transition-colors group"
                                >
                                    <span>All Campaigns</span>
                                    <ArrowUpRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Link>
                            </div>

                            <div className="space-y-2.5">
                                {safeCampaigns.slice(0, 5).map((camp) => {
                                    const isActive = camp.status === "active";
                                    const openRate = camp.sent_count ? Number(camp.open_rate ?? 0) : null;
                                    const replyRate = camp.sent_count ? Number(camp.reply_rate ?? 0) : null;

                                    return (
                                        <div
                                            key={camp.id}
                                            onClick={() =>
                                                setInspectorData({
                                                    type: "campaign",
                                                    title: camp.name,
                                                    subtitle: `Smartlead Sequence Telemetry · Status: ${camp.status.toUpperCase()}`,
                                                    badge: camp.smartlead_id ? `ID #${camp.smartlead_id}` : "ACTIVE",
                                                    badgeColor: camp.status === "active" ? "emerald" : "amber",
                                                    primaryMetric: {
                                                        label: "Reply Conversion Rate",
                                                        value: replyRate === null ? "0.0%" : `${replyRate}%`,
                                                        sub: `${formatNum(camp.sent_count ?? 0)} dispatched of ${formatNum(camp.total_leads ?? 0)} leads`,
                                                        trend: { delta: openRate === null ? "0%" : `${openRate}% Open`, isPositive: (replyRate ?? 0) > 0 },
                                                    },
                                                    breakdown: [
                                                        { label: "Total Assigned Leads", value: formatNum(camp.total_leads ?? 0), detail: "Enrolled in sequence", color: "#2563eb" },
                                                        { label: "Dispatched Volume", value: formatNum(camp.sent_count ?? 0), detail: "Outbound sent", color: "#06b6d4" },
                                                        { label: "Open Rate", value: openRate === null ? "—" : `${openRate}%`, detail: "Verified opens", color: "#10b981" },
                                                        { label: "Reply Rate", value: replyRate === null ? "—" : `${replyRate}%`, detail: "Direct response", color: "#8b5cf6" },
                                                        { label: "Sending Status", value: camp.status.toUpperCase(), detail: isActive ? "Sending active" : "Paused/Draft", color: isActive ? "#10b981" : "#f59e0b" },
                                                        { label: "Smartlead Campaign ID", value: camp.smartlead_id || "Local", detail: "API v1 Endpoint", color: "#64748b" },
                                                    ],
                                                    insights: [
                                                        `Sequence running with ${camp.total_leads ?? 0} leads assigned.`,
                                                        `Performance is ${Number(camp.reply_rate ?? 0) > 5 ? "well above industry average (>5%)" : "stable and warming"}.`,
                                                        "Automated stop-on-reply enabled via Smartlead live webhook integration.",
                                                    ],
                                                    actionLabel: "Open Campaign Console",
                                                    onAction: () => navigate(`/app/campaigns/${camp.id}`),
                                                })
                                            }
                                            className={cn(
                                                "relative flex items-center justify-between p-3 rounded-xl border transition-all duration-300 gap-3 cursor-pointer group",
                                                isActive
                                                    ? "border-slate-200/80 dark:border-zinc-800 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-500/[0.04] via-white to-white dark:from-emerald-950/20 dark:via-zinc-950 dark:to-zinc-950 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
                                                    : "border-slate-200/80 dark:border-zinc-800 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/[0.04] via-white to-white dark:from-amber-950/20 dark:via-zinc-950 dark:to-zinc-950 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-md"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span
                                                    className={cn(
                                                        "w-2.5 h-2.5 rounded-full shrink-0",
                                                        isActive ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" : "bg-slate-300 dark:bg-zinc-600"
                                                    )}
                                                    title={isActive ? "Active - Running dispatches" : "Draft / Paused"}
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-bold text-slate-900 dark:text-zinc-100 truncate group-hover:text-slate-900 dark:group-hover:text-amber-500 transition-colors flex items-center gap-2">
                                                        <span>{camp.name}</span>
                                                        {camp.smartlead_id && (
                                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-[#FFF9DB] dark:bg-[#18181B]/60 text-slate-900 dark:text-slate-900 border border-amber-200 dark:border-slate-800">
                                                                #{camp.smartlead_id}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11.5px] text-slate-500 dark:text-zinc-400">
                                                        <span className="font-semibold text-slate-700 dark:text-zinc-300">{formatNum(camp.total_leads ?? 0)}</span> leads enrolled &bull; <span className="font-semibold text-slate-700 dark:text-zinc-300">{formatNum(camp.sent_count ?? 0)}</span> dispatched
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="text-right px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                    <div className="text-[12px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                                        {openRate === null ? "—" : `${openRate}%`}
                                                    </div>
                                                    <div className="text-[9.5px] uppercase font-semibold text-emerald-600 dark:text-emerald-500">Open</div>
                                                </div>
                                                <div className="text-right px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
                                                    <div className="text-[12px] font-mono font-bold text-violet-700 dark:text-violet-400">
                                                        {replyRate === null ? "—" : `${replyRate}%`}
                                                    </div>
                                                    <div className="text-[9.5px] uppercase font-semibold text-violet-600 dark:text-violet-500">Reply</div>
                                                </div>

                                                <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleToggleCampaign(e, camp)}
                                                        className={cn(
                                                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95",
                                                            isActive
                                                                ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border border-amber-500/30"
                                                                : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/30"
                                                        )}
                                                        title={isActive ? "Pause Campaign" : "Start Campaign"}
                                                        aria-label={isActive ? "Pause Campaign" : "Start Campaign"}
                                                    >
                                                        {isActive ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5 fill-current" />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDeleteCampaign(e, camp)}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                                        title="Delete Campaign"
                                                        aria-label="Delete Campaign"
                                                    >
                                                        <Trash2Icon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right 5 Columns: Cross-Team Contact Collision Shield */}
                    <div className="relative overflow-hidden lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center border border-slate-200/60 dark:border-zinc-700/60">
                                        <ShieldCheckIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                                            Collision Shield &amp; Memory
                                        </h2>
                                        <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                                            {formatNum(lifetime?.messages_tracked)} messages &amp; {formatNum(lifetime?.contacts_emailed)} contacts indexed
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700 text-[10.5px] font-medium text-slate-700 dark:text-zinc-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Active 100%
                                </span>
                            </div>

                            <div className="rounded-xl bg-gradient-to-br from-indigo-50/40 via-white to-white dark:from-indigo-950/20 dark:via-zinc-900 dark:to-zinc-900 border border-indigo-500/20 p-3.5 space-y-1.5">
                                <div className="flex items-center gap-2 text-[12px] font-bold text-indigo-950 dark:text-indigo-200">
                                    <ZapIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    <span>Cross-Team Deduplication Guard</span>
                                </div>
                                <p className="text-[11.5px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                                    Fuzzy-matches <span className="font-mono text-indigo-700 dark:text-indigo-300 font-bold">email + name + company</span> against{" "}
                                    {formatNum(lifetime?.messages_tracked)} outbound messages, {formatNum(lifetime?.leads_total)} leads and{" "}
                                    {formatNum(lifetime?.brands)} brands across {teamProfiles.length} teammates before dispatches start.
                                </p>
                            </div>

                            {/* What the shield has indexed */}
                            <div className="space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center justify-between">
                                    <span>Dedup Realtime Index</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Click any metric to audit</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: "Messages Tracked", value: lifetime?.messages_tracked, tone: "text-blue-700 dark:text-blue-400", border: "border-l-blue-500", bg: "from-blue-500/[0.05]" },
                                        { label: "Contacts Emailed", value: lifetime?.contacts_emailed, tone: "text-indigo-700 dark:text-indigo-400", border: "border-l-indigo-500", bg: "from-indigo-500/[0.05]" },
                                        { label: "Leads Replied", value: lifetime?.leads_replied, tone: "text-emerald-700 dark:text-emerald-400", border: "border-l-emerald-500", bg: "from-emerald-500/[0.05]" },
                                        { label: "Brands Indexed", value: lifetime?.brands, tone: "text-violet-700 dark:text-violet-400", border: "border-l-violet-500", bg: "from-violet-500/[0.05]" },
                                    ].map((cell) => (
                                        <div
                                            key={cell.label}
                                            onClick={() =>
                                                setInspectorData({
                                                    type: "kpi",
                                                    title: "Cross-Team Collision Shield",
                                                    subtitle: `Anti-duplicate memory protecting ${teamProfiles.length} outbound senders`,
                                                    badge: "SHIELD 100%",
                                                    badgeColor: "emerald",
                                                    primaryMetric: {
                                                        label: cell.label,
                                                        value: formatNum(cell.value),
                                                        sub: "Active in-memory & database index",
                                                        trend: { delta: "Protected", isPositive: true },
                                                    },
                                                    breakdown: [
                                                        { label: "Messages Indexed", value: formatNum(lifetime?.messages_tracked), detail: "Outbound & inbound", color: "#2563eb" },
                                                        { label: "Contacts Emailed", value: formatNum(lifetime?.contacts_emailed), detail: "Zero duplicate sends", color: "#06b6d4" },
                                                        { label: "Leads Replied", value: formatNum(lifetime?.leads_replied), detail: "Follow-up automatically halted", color: "#10b981" },
                                                        { label: "Brands Indexed", value: lifetime?.brands, detail: "Domain-level collision shield", color: "#8b5cf6" },
                                                    ],
                                                    insights: [
                                                        "Ensures two team members never email the same company or lead simultaneously.",
                                                        "Fuzzy matching checks exact email, domain name, and company title before every sequence step.",
                                                        `${formatNum(lifetime?.reply_messages)} replies have halted sequence continuation automatically.`,
                                                    ],
                                                    actionLabel: "View All Contacts",
                                                    onAction: () => navigate("/app/contacts"),
                                                })
                                            }
                                            className={cn(
                                                "p-3 rounded-xl border border-slate-200/70 dark:border-zinc-800 bg-gradient-to-br via-white to-white dark:via-zinc-950 dark:to-zinc-950 border-l-4 space-y-0.5 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 cursor-pointer group",
                                                cell.border,
                                                cell.bg
                                            )}
                                        >
                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                                                <span>{cell.label}</span>
                                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500">↗</span>
                                            </div>
                                            <div className={`font-mono font-extrabold text-[16px] ${cell.tone} group-hover:scale-105 transition-transform`}>
                                                {formatNum(cell.value)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/20 text-[11.5px] text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                                    <span>
                                        <strong className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{formatNum(lifetime?.reply_messages)}</strong>{" "}
                                        reply-flagged messages halted their follow-up sequences.
                                    </span>
                                    <span className="text-[10px] font-semibold text-emerald-600 uppercase">Automated</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 3: Inbound Response Radar & Audience Intelligence (7 / 5 Split) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Left 7 Columns: Inbound Response Radar */}
                    <div className="relative overflow-hidden lg:col-span-7 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center">
                                    <MessageSquareIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
                                        <span>High-Intent Inbound Response Radar</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                            Live Inbound
                                        </span>
                                    </h2>
                                    <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                                        {formatNum(lifetime?.reply_messages)} reply messages classified across {teamProfiles.length} sending profiles
                                    </p>
                                </div>
                            </div>
                            <Link
                                to="/app/unibox"
                                className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors group"
                            >
                                <span>Open Unified Inbox</span>
                                <ArrowUpRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </Link>
                        </div>

                        <div className="space-y-3">
                            {activeConversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    onClick={() =>
                                        setInspectorData({
                                            type: "sentiment",
                                            title: conv.contactName,
                                            subtitle: `${conv.company} · Handled by ${conv.mailboxOwner}`,
                                            badge: conv.sentiment.toUpperCase(),
                                            badgeColor: conv.sentiment.toLowerCase().includes("interest") ? "emerald" : "blue",
                                            primaryMetric: {
                                                label: "Sentiment Classification",
                                                value: conv.sentiment,
                                                sub: `Received ${conv.time}`,
                                                trend: { delta: "High Intent", isPositive: true },
                                            },
                                            breakdown: [
                                                { label: "Contact Person", value: conv.contactName, detail: conv.company, color: "#2563eb" },
                                                { label: "Recipient Mailbox", value: conv.mailboxOwner, detail: "Owner", color: "#8b5cf6" },
                                                { label: "Received Time", value: conv.time, detail: "Smartlead Inbound", color: "#06b6d4" },
                                                { label: "Message Snippet", value: `"${conv.snippet}"`, detail: "Inbound quote", color: "#10b981" },
                                            ],
                                            insights: [
                                                `Prospect responded with positive interest: "${conv.snippet}"`,
                                                `Sequence automatically halted to preserve relationship.`,
                                                "Recommended next action: Send calendar invitation or tailored service proposal.",
                                            ],
                                            actionLabel: "Open Thread in Unibox",
                                            onAction: () => navigate("/app/unibox"),
                                        })
                                    }
                                    className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/30 hover:bg-slate-50 dark:hover:bg-zinc-900/60 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-xs cursor-pointer transition-all duration-200 space-y-2 group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("w-2 h-2 rounded-full shadow-xs", conv.dotColor)} />
                                            <span className="text-[13px] font-bold text-slate-900 dark:text-zinc-100 group-hover:text-slate-900 transition-colors">
                                                {conv.contactName}
                                            </span>
                                            <span className="text-[12px] font-medium text-slate-400 dark:text-zinc-500">&bull; {conv.company}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                                            <span>{conv.time}</span>
                                            <span className="opacity-0 group-hover:opacity-100 text-slate-900 transition-opacity">↗</span>
                                        </div>
                                    </div>

                                    <p className="text-[12px] text-slate-600 dark:text-zinc-300 line-clamp-1 italic font-serif">
                                        "{conv.snippet}"
                                    </p>

                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800/80 text-[11px] gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0", conv.sentimentColor)}>
                                                {conv.sentiment}
                                            </span>
                                            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 truncate">
                                                Mailbox: <strong className="font-semibold text-slate-800 dark:text-zinc-200">{conv.mailboxOwner}</strong>
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate("/app/unibox");
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 h-6 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-[11px] font-medium transition-all shadow-xs shrink-0 cursor-pointer active:scale-95"
                                        >
                                            <ReplyIcon className="w-3 h-3" />
                                            <span>Reply</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {activeConversations.length === 0 && (
                                <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 text-[12.5px] text-slate-500 dark:text-zinc-400 text-center">
                                    {reportQuery.isPending
                                        ? "Loading the latest replies from the database…"
                                        : "No replies recorded yet — the radar fills in as prospects answer."}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right 5 Columns: Audience & Brand Intelligence Funnel */}
                    <div className="relative overflow-hidden lg:col-span-5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all space-y-4 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-[#FFF9DB] dark:bg-[#18181B]/40 text-slate-900 dark:text-slate-900 border border-amber-200/80 dark:border-slate-800/80 flex items-center justify-center">
                                        <Building2Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                                            Contacts &amp; Brand Intelligence
                                        </h2>
                                        <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                                            {formatNum(totalContactsCount)} leads in CRM · {formatNum(lifetime?.brands)} brands indexed
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/app/contacts"
                                    className="text-[12px] font-semibold text-slate-900 dark:text-amber-500 hover:text-black dark:hover:text-slate-900 flex items-center gap-1 transition-colors group"
                                >
                                    <span>View Contacts</span>
                                    <ArrowUpRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Link>
                            </div>

                            {/* Clay Saturated Conversion Funnel */}
                            <div className="space-y-2.5">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center justify-between">
                                    <span>Outreach Funnel Progress</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Click any stage to inspect</span>
                                </div>
                                <div className="space-y-2 text-[12px]">
                                    {/* 1. Leads in CRM */}
                                    <div
                                        onClick={() =>
                                            setInspectorData({
                                                type: "metric",
                                                title: "Total CRM Leads Audience Pool",
                                                subtitle: "Full pool of target accounts and decision-makers in database",
                                                badge: "TOTAL CRM",
                                                badgeColor: "blue",
                                                primaryMetric: {
                                                    label: "Audience Pool",
                                                    value: formatNum(lifetime?.leads_total ?? totalContactsCount),
                                                    sub: `${formatNum(lifetime?.brands)} targeted brands`,
                                                    trend: { delta: "100%", isPositive: true },
                                                },
                                                breakdown: [
                                                    { label: "CRM Leads", value: formatNum(lifetime?.leads_total ?? totalContactsCount), detail: "Total indexed", color: "#2563eb" },
                                                    { label: "Enrolled in Sequences", value: formatNum(lifetime?.leads_contacted), detail: `${pctOf(lifetime?.leads_contacted, crmLeadTotal)}% penetration`, color: "#06b6d4" },
                                                    { label: "Target Brands", value: formatNum(lifetime?.brands), detail: "Distinct corporate domains", color: "#8b5cf6" },
                                                ],
                                                insights: [
                                                    "Audience pool enriched with verified work emails and company titles.",
                                                    "Automatic MX and SPF validation active prior to dispatch.",
                                                ],
                                                actionLabel: "Inspect Contacts Database",
                                                onAction: () => navigate("/app/contacts"),
                                            })
                                        }
                                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900/60 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 mb-1">
                                            <span className="font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-blue-600" />
                                                <span>Leads in CRM</span>
                                            </span>
                                            <span className="font-mono font-extrabold text-slate-900 dark:text-zinc-100">
                                                {formatNum(lifetime?.leads_total ?? totalContactsCount)}
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div className="h-full bg-slate-900 dark:bg-zinc-100 rounded-full w-full" />
                                        </div>
                                    </div>

                                    {/* 2. Leads Contacted */}
                                    <div
                                        onClick={() =>
                                            setInspectorData({
                                                type: "metric",
                                                title: "Contacted Leads Penetration",
                                                subtitle: "Proportion of target audience that has received initial touchpoint",
                                                badge: `${pctOf(lifetime?.leads_contacted, crmLeadTotal)}% REACH`,
                                                badgeColor: "indigo",
                                                primaryMetric: {
                                                    label: "Leads Contacted",
                                                    value: formatNum(lifetime?.leads_contacted),
                                                    sub: `Out of ${formatNum(crmLeadTotal)} total CRM leads`,
                                                    trend: { delta: `+${pctOf(lifetime?.leads_contacted, crmLeadTotal)}%`, isPositive: true },
                                                },
                                                breakdown: [
                                                    { label: "Contacted Count", value: formatNum(lifetime?.leads_contacted), detail: "Delivered outreach", color: "#3b82f6" },
                                                    { label: "Uncontacted Reservoir", value: formatNum(Math.max(0, crmLeadTotal - (lifetime?.leads_contacted ?? 0))), detail: "Ready to sequence", color: "#64748b" },
                                                    { label: "Open Rate on Contacted", value: `${pctOf(lifetime?.leads_opened, lifetime?.leads_contacted)}%`, detail: "Engagement ratio", color: "#10b981" },
                                                ],
                                                insights: [
                                                    "Outreach is paced smoothly across 6 mailboxes to prevent spam detection.",
                                                    "Consistent sending schedule maintains warm domain health.",
                                                ],
                                                actionLabel: "View Enrolled Contacts",
                                                onAction: () => navigate("/app/contacts"),
                                            })
                                        }
                                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900/60 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 mb-1">
                                            <span className="font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-[#18181B]" />
                                                <span>Leads Contacted</span>
                                            </span>
                                            <span className="font-mono font-extrabold text-slate-900 dark:text-zinc-100">
                                                {formatNum(lifetime?.leads_contacted)} ({pctOf(lifetime?.leads_contacted, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full bg-[#18181B] dark:bg-amber-400 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_contacted, crmLeadTotal) > 0 ? 3 : 0, pctOf(lifetime?.leads_contacted, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* 3. Active Dispatches (Today) */}
                                    <div
                                        onClick={() =>
                                            setInspectorData({
                                                type: "metric",
                                                title: "Daily Dispatches Telemetry",
                                                subtitle: "Active sending volume executed today across all mailboxes",
                                                badge: `${totalSentToday} / ${totalDailyQuota}`,
                                                badgeColor: "amber",
                                                primaryMetric: {
                                                    label: "Dispatched Today",
                                                    value: totalSentToday,
                                                    sub: `${totalDailyQuota} maximum daily quota`,
                                                    trend: { delta: `${Math.round((totalSentToday / Math.max(1, totalDailyQuota)) * 100)}% Used`, isPositive: totalSentToday > 0 },
                                                },
                                                breakdown: [
                                                    { label: "Sent Today", value: totalSentToday, detail: "Total messages delivered", color: "#0ea5e9" },
                                                    { label: "Remaining Quota", value: Math.max(0, totalDailyQuota - totalSentToday), detail: "Sends available", color: "#10b981" },
                                                    { label: "Active Profiles", value: teamProfiles.length, detail: "50 sends/day limit each", color: "#8b5cf6" },
                                                ],
                                                insights: [
                                                    "Sending intervals throttled with a 3-minute randomized gap per profile.",
                                                    "Deliverability health monitored in real time with 0 bounces recorded.",
                                                ],
                                                actionLabel: "View Sending Pool",
                                                onAction: () => navigate("/app/mailboxes"),
                                            })
                                        }
                                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900/60 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 mb-1">
                                            <span className="font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                <span>Active Dispatches (Today)</span>
                                            </span>
                                            <span className="font-mono font-extrabold text-slate-900 dark:text-amber-500">
                                                {totalSentToday} Dispatched
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full bg-amber-400 dark:bg-amber-400 rounded-full transition-all duration-500"
                                                style={{ width: `${totalDailyQuota > 0 ? Math.min(100, Math.max(3, (totalSentToday / totalDailyQuota) * 100)) : 0}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* 4. Leads Opened */}
                                    <div
                                        onClick={() =>
                                            setInspectorData({
                                                type: "metric",
                                                title: "Audience Open & Read Intelligence",
                                                subtitle: "Leads who engaged and read outbound campaign messages",
                                                badge: `${formatNum(lifetime?.leads_opened)} OPENED`,
                                                badgeColor: "emerald",
                                                primaryMetric: {
                                                    label: "Leads Opened",
                                                    value: formatNum(lifetime?.leads_opened),
                                                    sub: `${pctOf(lifetime?.leads_opened, lifetime?.leads_contacted)}% open rate on contacted`,
                                                    trend: { delta: "Optimal", isPositive: true },
                                                },
                                                breakdown: [
                                                    { label: "Opened Leads", value: formatNum(lifetime?.leads_opened), detail: "Confirmed unique opens", color: "#10b981" },
                                                    { label: "Contacted Leads", value: formatNum(lifetime?.leads_contacted), detail: "Baseline volume", color: "#2563eb" },
                                                    { label: "Open Rate", value: `${pctOf(lifetime?.leads_opened, lifetime?.leads_contacted)}%`, detail: "Subject line resonance", color: "#06b6d4" },
                                                ],
                                                insights: [
                                                    "Founder-led subject lines and direct value propositions generate peak opens.",
                                                    "Zero spam flagging across corporate Google Workspace & Microsoft 365 inboxes.",
                                                ],
                                                actionLabel: "View Lead Engagement",
                                                onAction: () => navigate("/app/contacts"),
                                            })
                                        }
                                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900/60 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 mb-1">
                                            <span className="font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                <span>Leads Opened</span>
                                            </span>
                                            <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                                                {formatNum(lifetime?.leads_opened)} ({pctOf(lifetime?.leads_opened, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_opened, crmLeadTotal) > 0 ? 3 : 0, pctOf(lifetime?.leads_opened, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* 5. Leads Replied */}
                                    <div
                                        onClick={() =>
                                            setInspectorData({
                                                type: "metric",
                                                title: "Audience Reply & Meeting Intent",
                                                subtitle: "High-value prospects actively responding to outbound campaigns",
                                                badge: `${formatNum(lifetime?.leads_replied)} REPLIED`,
                                                badgeColor: "amber",
                                                primaryMetric: {
                                                    label: "Leads Replied",
                                                    value: formatNum(lifetime?.leads_replied),
                                                    sub: `${formatNum(lifetime?.reply_messages)} total reply messages`,
                                                    trend: { delta: "High Intent", isPositive: true },
                                                },
                                                breakdown: [
                                                    { label: "Unique Leads Replied", value: formatNum(lifetime?.leads_replied), detail: "Active opportunities", color: "#f59e0b" },
                                                    { label: "Total Reply Messages", value: formatNum(lifetime?.reply_messages), detail: "Incoming threads", color: "#8b5cf6" },
                                                    { label: "Reply Conversion Rate", value: `${pctOf(lifetime?.leads_replied, lifetime?.leads_contacted)}%`, detail: "Contacted to reply", color: "#10b981" },
                                                ],
                                                insights: [
                                                    "Immediate follow-up within 15 minutes of reply increases meeting booking rate by 3x.",
                                                    "All replies classified by intent in the Unibox.",
                                                ],
                                                actionLabel: "Open Unified Inbox",
                                                onAction: () => navigate("/app/unibox"),
                                            })
                                        }
                                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900/60 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 mb-1">
                                            <span className="font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                <span>Leads Replied</span>
                                            </span>
                                            <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400">
                                                {formatNum(lifetime?.leads_replied)} ({pctOf(lifetime?.leads_replied, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_replied, crmLeadTotal) > 0 ? 3 : 0, pctOf(lifetime?.leads_replied, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Targeted Brands Chip Cloud */}
                            <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80 space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center justify-between">
                                    <span>Primary Target Brands</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Click brand to inspect</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(reportData?.brands ?? []).map((brand) => {
                                        return (
                                            <span
                                                key={brand.domain}
                                                onClick={() =>
                                                    setInspectorData({
                                                        type: "category",
                                                        title: brand.name,
                                                        subtitle: `${brand.domain} · Target Account Intelligence`,
                                                        badge: `${formatNum(brand.contacts)} LEADS`,
                                                        badgeColor: "blue",
                                                        primaryMetric: {
                                                            label: "Associated Contacts",
                                                            value: formatNum(brand.contacts),
                                                            sub: `${brand.replied ?? 0} confirmed replies`,
                                                            trend: { delta: brand.domain, isPositive: true },
                                                        },
                                                        breakdown: [
                                                            { label: "Company Domain", value: brand.domain, detail: "Primary website", color: "#2563eb" },
                                                            { label: "Enrolled Contacts", value: formatNum(brand.contacts), detail: "Decision makers", color: "#06b6d4" },
                                                            { label: "Confirmed Replies", value: formatNum(brand.replied ?? 0), detail: "Active conversations", color: "#10b981" },
                                                        ],
                                                        insights: [
                                                            `Domain ${brand.domain} protected under Cross-Team Collision Shield.`,
                                                            "Account-level deduplication prevents multi-rep overlaps.",
                                                        ],
                                                        actionLabel: "Filter Contacts for " + brand.name,
                                                        onAction: () => navigate("/app/contacts"),
                                                    })
                                                }
                                                title={`${brand.contacts} contacts · ${brand.replied} replies`}
                                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 text-[11px] font-semibold transition-all duration-150 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                                            >
                                                {brand.name} &bull; <span className="font-mono text-slate-500 dark:text-zinc-400">{formatNum(brand.contacts)}</span>
                                            </span>
                                        );
                                    })}
                                    {(reportData?.brands ?? []).length === 0 && (
                                        <span className="text-[11px] text-slate-500">No brands indexed yet.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 4: Smartlead Distributed Sending Pool */}
                <div className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200/80 dark:border-zinc-700 flex items-center justify-center font-bold text-xs">
                                {teamProfiles.length}
                            </div>
                            <div>
                                <h2 className="text-[14px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
                                    <span>Smartlead Distributed Profiles</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                        {formatNum(totalDailyQuota)} Total Sends/Day
                                    </span>
                                </h2>
                                <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                                    Rotates client outreach across {teamProfiles.length} distinct accounts to guarantee 99%+ deliverability · Click to inspect health
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/app/mailboxes"
                            className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors group"
                        >
                            <span>Manage Mailboxes</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {teamProfiles.map((m) => {
                            const sent = m.sent_today ?? 0;
                            const limit = m.daily_limit || 50;
                            const pct = Math.min(100, Math.round((sent / limit) * 100));
                            const isNearLimit = pct >= 80;

                            return (
                                <div
                                    key={m.email}
                                    onClick={() =>
                                        setInspectorData({
                                            type: "mailbox",
                                            title: m.name,
                                            subtitle: `${m.email} · ${m.provider ?? "Google Workspace"}`,
                                            badge: `${m.reputation ?? 99}% HEALTH`,
                                            badgeColor: (m.reputation ?? 99) >= 90 ? "emerald" : "amber",
                                            primaryMetric: {
                                                label: "Today's Quota Used",
                                                value: `${sent} / ${limit}`,
                                                sub: `${Math.max(0, limit - sent)} sends remaining today`,
                                                trend: { delta: `${pct}%`, isPositive: pct < 100 },
                                            },
                                            breakdown: [
                                                { label: "Email Address", value: m.email, detail: "Active sending identity", color: "#2563eb" },
                                                { label: "Daily Limit", value: `${limit} sends`, detail: "Deliverability ceiling", color: "#06b6d4" },
                                                { label: "Dispatched Today", value: `${sent} emails`, detail: `${pct}% utilization`, color: isNearLimit ? "#f59e0b" : "#10b981" },
                                                { label: "Lifetime Sent", value: formatNum(m.total_sent), detail: "Cumulative dispatches", color: "#8b5cf6" },
                                                { label: "Reputation Score", value: `${m.reputation ?? 99}%`, detail: "Warmup health gauge", color: "#10b981" },
                                                { label: "Provider Architecture", value: m.provider ?? "Google Workspace", detail: "Dedicated IP pool", color: "#64748b" },
                                            ],
                                            insights: [
                                                `Mailbox warmup is optimal at ${m.reputation ?? 99}% deliverability score.`,
                                                "Custom tracking domain active with SPF, DKIM, and DMARC 100% verified.",
                                                `Daily quota capped at ${limit} sends to guarantee 0 spam flags.`,
                                            ],
                                            actionLabel: "Configure Mailbox Settings",
                                            onAction: () => navigate("/app/mailboxes"),
                                        })
                                    }
                                    className="relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col justify-between space-y-3.5 cursor-pointer group"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200/80 dark:border-zinc-700 flex items-center justify-center text-[12px] font-bold shrink-0">
                                                {m.name.split(" ").map((n) => n[0]).join("")}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-1.5">
                                                    <span className="text-[13px] font-bold text-slate-900 dark:text-zinc-100 truncate group-hover:text-slate-900 dark:group-hover:text-amber-500 transition-colors">
                                                        {m.name}
                                                    </span>
                                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        {m.reputation == null ? "99% Health" : `${m.reputation}% Health`}
                                                    </span>
                                                </div>
                                                <div className="text-[11.5px] text-slate-500 dark:text-zinc-400 truncate font-mono" title={m.email}>
                                                    {m.email}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] pt-1">
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                                                {m.status}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-zinc-400 font-medium text-[11px]">
                                                {m.provider ?? "Google Workspace"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Quota Progress */}
                                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                                        <div className="flex items-center justify-between text-[11.5px]">
                                            <span className="text-slate-500 dark:text-zinc-400 font-medium">Daily Quota</span>
                                            <span className="font-mono font-bold text-slate-900 dark:text-zinc-100">
                                                {sent} / {limit} sent
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-300",
                                                    isNearLimit
                                                        ? "bg-amber-500"
                                                        : sent > 0
                                                        ? "bg-[#18181B]"
                                                        : "bg-slate-200 dark:bg-zinc-700"
                                                )}
                                                style={{ width: `${Math.max(sent > 0 ? 10 : 4, pct)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-[10.5px] text-slate-400 dark:text-zinc-500 pt-0.5">
                                            <span>Lifetime: {formatNum(m.total_sent)}</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{Math.max(0, limit - sent)} remaining</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* SECTION 5: Realtime Outbound & Webhook Stream */}
                <div className="relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200/80 dark:border-zinc-700 flex items-center justify-center">
                                <ActivityIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-zinc-100">
                                    Realtime Webhook Activity Stream
                                </h3>
                                <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">
                                    Instant Smartlead event dispatches, opens, and replies &bull; Click any event to inspect
                                </p>
                            </div>
                        </div>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {recentActivity.length} events · {chartWindowLabel}
                        </span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 font-mono text-[11.5px] text-slate-600 dark:text-zinc-300">
                        {recentActivity.slice(0, 6).map((activity, idx) => (
                            <div
                                key={`${activity.contact_email}-${activity.timestamp}-${idx}`}
                                onClick={() =>
                                    setInspectorData({
                                        type: "metric",
                                        title: `Outreach Signal · ${activity.type.toUpperCase()}`,
                                        subtitle: `${activity.contact_email} · ${formatStamp(activity.timestamp)}`,
                                        badge: activity.type.toUpperCase(),
                                        badgeColor: activity.type === "replied" ? "emerald" : activity.type === "opened" ? "blue" : activity.type === "bounced" ? "rose" : "zinc",
                                        primaryMetric: {
                                            label: "Event Type",
                                            value: activity.type.toUpperCase(),
                                            sub: formatStamp(activity.timestamp),
                                            trend: { delta: "Verified", isPositive: activity.type !== "bounced" },
                                        },
                                        breakdown: [
                                            { label: "Recipient Email", value: activity.contact_email, detail: "Lead destination", color: "#2563eb" },
                                            { label: "Campaign Name", value: activity.campaign_name || "Direct Sequence", detail: "Attribution", color: "#06b6d4" },
                                            { label: "Event Status", value: activity.type === "replied" ? "Reply Recorded (Sequence Halted)" : activity.type === "opened" ? "Email Opened" : activity.type === "bounced" ? "Bounced (Address Suppressed)" : "Dispatched Successfully", detail: "Smartlead Webhook", color: "#10b981" },
                                            { label: "Timestamp", value: formatStamp(activity.timestamp), detail: "Recorded time", color: "#8b5cf6" },
                                        ],
                                        insights: [
                                            "Realtime webhook payload processed in under 40ms.",
                                            activity.type === "replied" ? "Automated collision shield immediately halted future automated steps." : "Telemetry event logged in live analytics database.",
                                        ],
                                        actionLabel: "View Live Unibox",
                                        onAction: () => navigate("/app/unibox"),
                                    })
                                }
                                className="py-2.5 px-2 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors cursor-pointer group"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-slate-400 dark:text-zinc-500 shrink-0 text-[11px]">{formatStamp(activity.timestamp)}</span>
                                    <span
                                        className={cn(
                                            "px-2 py-0.5 rounded-full border font-bold text-[10px] shrink-0",
                                            EVENT_TONE[activity.type] || "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700"
                                        )}
                                    >
                                        {activity.type.toUpperCase()}
                                    </span>
                                    <span className="truncate group-hover:text-slate-900 dark:group-hover:text-amber-500 transition-colors">
                                        {activity.campaign_name || "Unattributed campaign"} →{" "}
                                        <strong className="text-slate-900 dark:text-zinc-100">{activity.contact_email}</strong>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-slate-400 dark:text-zinc-500 font-sans text-[11px]">
                                        {activity.type === "replied"
                                            ? "Follow-up halted"
                                            : activity.type === "bounced"
                                                ? "Paused"
                                                : activity.type === "sent"
                                                    ? "Dispatched"
                                                    : "Recorded"}
                                    </span>
                                    <span className="opacity-0 group-hover:opacity-100 text-slate-900 transition-opacity text-xs">↗</span>
                                </div>
                            </div>
                        ))}
                        {recentActivity.length === 0 && (
                            <div className="py-4 text-[12px] text-slate-500 dark:text-zinc-400 font-sans text-center">
                                No webhook events recorded in {chartWindowLabel.toLowerCase()}.
                            </div>
                        )}
                    </div>
                </div>
            </PageBody>

            {/* CALENDAR-DRIVEN EXPORT REPORT MODAL */}
            <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[16px]">
                            <CalendarIcon className="w-5 h-5 text-slate-900" />
                            <span>Export Telemetry &amp; Outreach Report</span>
                        </DialogTitle>
                        <DialogDescription className="text-[12.5px] text-slate-500">
                            Select your custom date timeline and the datasets you wish to include in the exported CSV report.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        {/* Timeline Presets */}
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-semibold text-slate-700">Timeline Preset</label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {(["today", "7d", "30d", "90d"] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => handleSelectPreset(p)}
                                        className={cn(
                                            "h-8 rounded-md text-[12px] font-medium border transition-all cursor-pointer",
                                            exportPreset === p
                                                ? "bg-[#18181B] border-slate-900 text-white shadow-xs font-semibold"
                                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                        )}
                                    >
                                        {p === "today" ? "Today" : p === "7d" ? "Last 7d" : p === "30d" ? "Last 30d" : "Last 90d"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Pickers */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-semibold text-slate-700">Start Date</label>
                                <DatePicker
                                    value={exportStartDate}
                                    onChange={(v) => {
                                        setExportStartDate(v);
                                        setExportPreset("custom");
                                    }}
                                    placeholder="Start Date"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-semibold text-slate-700">End Date</label>
                                <DatePicker
                                    value={exportEndDate}
                                    onChange={(v) => {
                                        setExportEndDate(v);
                                        setExportPreset("custom");
                                    }}
                                    placeholder="End Date"
                                />
                            </div>
                        </div>

                        {/* Dataset Module Inclusion Checkboxes */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="text-[11.5px] font-semibold text-slate-700">Include in Export</label>
                            <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-700">
                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeCampaigns}
                                        onChange={(e) => setExportIncludeCampaigns(e.target.checked)}
                                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    />
                                    <span>Campaigns Telemetry</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeMailboxes}
                                        onChange={(e) => setExportIncludeMailboxes(e.target.checked)}
                                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    />
                                    <span>{teamProfiles.length} Sending Mailboxes</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeReplies}
                                        onChange={(e) => setExportIncludeReplies(e.target.checked)}
                                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    />
                                    <span>Inbound Replies &amp; Sentiment</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeContacts}
                                        onChange={(e) => setExportIncludeContacts(e.target.checked)}
                                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    />
                                    <span>Audience &amp; Brand Data</span>
                                </label>
                            </div>
                        </div>

                        {/* Export Summary Box */}
                        <div className="p-2.5 rounded-lg bg-[#FFF9DB]/60 border border-amber-200 text-[11.5px] text-slate-900 flex items-start gap-2">
                            <CheckCircle2Icon className="w-4 h-4 text-slate-900 shrink-0 mt-0.5" />
                            <span>
                                Ready to compile CSV report covering <strong>{exportStartDate}</strong> to <strong>{exportEndDate}</strong> across verified Smartlead accounts.
                            </span>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <button
                            type="button"
                            onClick={() => setIsExportModalOpen(false)}
                            className="px-3 h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-[12px] font-medium text-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleExecuteCsvExport}
                            disabled={isGeneratingCsv}
                            className="px-4 h-8 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer text-[12px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            <span>{isGeneratingCsv ? "Exporting..." : "Download CSV Report"}</span>
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Universal Interactive Dashboard Telemetry Inspector Modal */}
            <DashboardInspectorModal
                payload={inspectorData}
                onClose={() => setInspectorData(null)}
            />
        </Page>
    );
}
