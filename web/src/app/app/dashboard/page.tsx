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
    NOT_NOW: { label: "Timing · Not Now", chip: "bg-sky-50 text-sky-700 border-sky-200/70", dot: "bg-sky-500" },
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
    sent: "bg-sky-50 text-sky-700 border-sky-200/60",
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
                                icon={<UsersIcon className="w-3.5 h-3.5 text-sky-600" />}
                                label={TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name || "All Members"}
                                title="Filter analytics by team member"
                                className={cn(
                                    "w-[150px] justify-between shrink-0",
                                    selectedMemberId !== "all" && "border-sky-300 bg-sky-50/70 text-sky-800"
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
                                    icon={<UserCheckIcon className={cn("w-3.5 h-3.5", selectedMemberId === m.id ? "text-sky-600" : "text-slate-400")} />}
                                >
                                    <div className="flex flex-col text-left truncate">
                                        <span className={cn("text-[12px]", selectedMemberId === m.id ? "font-semibold text-sky-900" : "font-medium text-slate-800")}>{m.name}</span>
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
                    <RefreshCwIcon className={cn("w-3.5 h-3.5 text-slate-500", isRefreshing && "animate-spin text-sky-600")} />
                    <span>Sync Telemetry</span>
                </button>
                <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
                >
                    <SparklesIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>AI Assistant</span>
                </button>
                <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
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

            {/* TOP RATE STRIP: Total Contacts, Mails Sent in Period, Open Rate, Reply Rate, Bounce Rate, Daily Quota */}
            <StatStrip cols={6}>
                <Stat
                    label="Total Contacts"
                    value={formatNum(totalContactsCount)}
                    sub={`${formatNum(lifetime?.leads_contacted || 0)} contacted · ${formatNum(Math.max(0, totalContactsCount - (lifetime?.leads_contacted || 0)))} queued`}
                    accent={totalContactsCount > 0}
                    href="/app/contacts"
                />
                <Stat
                    label={`Mails Sent (${RANGE_CHIP[chartRange] || chartRange})`}
                    value={formatNum(periodSentCount)}
                    sub={`${totalSentToday} sent today · ${formatNum(lifetimeMailCount)} lifetime`}
                    accent={periodSentCount > 0}
                />
                <Stat
                    label={`Open Rate (${RANGE_CHIP[chartRange] || chartRange})`}
                    value={periodOpenRate}
                    sub={`${formatNum(periodOpensCount)} opens · ${chartWindowLabel}`}
                    accent={periodOpensCount > 0}
                />
                <Stat
                    label={`Reply Rate (${RANGE_CHIP[chartRange] || chartRange})`}
                    value={periodReplyRate}
                    sub={`${formatNum(periodRepliesCount)} replies · ${chartWindowLabel}`}
                    accent={periodRepliesCount > 0}
                />
                <Stat
                    label={`Bounce Rate (${RANGE_CHIP[chartRange] || chartRange})`}
                    value={periodBounceRate}
                    sub={`${formatNum(periodBouncesCount)} bounces · ${chartWindowLabel}`}
                    last={false}
                />
                <Stat
                    label={`Daily Quota (${teamProfiles.length} ${teamProfiles.length === 1 ? "Profile" : "Profiles"})`}
                    value={`${totalSentToday} / ${totalDailyQuota}`}
                    sub={`${Math.max(0, totalDailyQuota - totalSentToday)} remaining today`}
                    last
                />
            </StatStrip>

            <PageBody className="space-y-6 pb-16">
                {/* OUTREACH BY COMPANY CATEGORY: which categories we contact, and their response */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shrink-0">
                                <LayersIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">
                                        Outreach by Company Category
                                    </h3>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/70">
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
                            className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors shrink-0"
                        >
                            <span>All Categories</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                        {reportCategories.map((cat) => (
                            <div
                                key={cat.category}
                                className="min-w-[196px] max-w-[240px] p-2.5 rounded-lg border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 transition-all flex flex-col justify-between space-y-1"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate"
                                        title={cat.category}
                                    >
                                        {cat.category}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                                        {cat.reply_rate}% replies
                                    </span>
                                </div>
                                <div className="text-[13px] font-mono font-semibold text-slate-800">
                                    {formatNum(cat.leads)} leads
                                </div>
                                <div
                                    className="text-[10px] text-slate-500 truncate"
                                    title={`${cat.contacted} reached · ${cat.opened} opened · ${cat.replied} replied`}
                                >
                                    {formatNum(cat.contacted)} reached · {formatNum(cat.opened)} opened · {formatNum(cat.replied)} replied
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

                {/* HEAD OF DEPARTMENT: the complete system, counted from the database */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                <BarChart3Icon className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                        {selectedMemberId !== "all" && TEAM_MEMBERS.find((m) => m.id === selectedMemberId)
                                            ? `${TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name} · Member Performance Report`
                                            : "Head of Department · Complete System Report"}
                                    </h2>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                        Lifetime
                                    </span>
                                </div>
                                <p className="text-[12px] text-slate-500">
                                    {selectedMemberId !== "all" && TEAM_MEMBERS.find((m) => m.id === selectedMemberId)
                                        ? `Scoped to ${TEAM_MEMBERS.find((m) => m.id === selectedMemberId)?.name}'s campaigns and mailboxes`
                                        : `Counted from the message, lead, brand and mailbox tables · first send ${formatDateOnly(lifetime?.first_send)} · last send ${formatDateOnly(lifetime?.last_send)}`}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/app/analytics"
                            className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors shrink-0"
                        >
                            <span>Full Analytics</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    {/* Lifetime KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        {[
                            { label: "Mails Sent", value: lifetimeMailCount, detail: "message records" },
                            { label: "Leads Contacted", value: lifetime?.leads_contacted, detail: `of ${formatNum(lifetime?.leads_total)} leads` },
                            { label: "Contacts Emailed", value: lifetime?.contacts_emailed, detail: "distinct addresses" },
                            { label: "Leads Replied", value: lifetime?.leads_replied, detail: `${formatNum(lifetime?.interested_replies)} interested` },
                            { label: "Reply Messages", value: lifetime?.reply_messages, detail: "flagged in threads" },
                            { label: "Brands Indexed", value: lifetime?.brands, detail: "target companies" },
                        ].map((kpi) => (
                            <div key={kpi.label} className="p-2.5 rounded-lg border border-slate-200/70 bg-slate-50/40 space-y-0.5">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</div>
                                <div className="text-[17px] font-mono font-bold text-slate-900 leading-tight">{formatNum(kpi.value)}</div>
                                <div className="text-[10px] text-slate-500 truncate">{kpi.detail}</div>
                            </div>
                        ))}
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
                                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200/70">
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
                                            <div key={row.key} className="p-4 space-y-1.5">
                                                <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-600">
                                                    <span className={cn("size-1.5 rounded-full", TONE_DOT[row.tone])} />
                                                    {row.label}
                                                </div>
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="text-[21px] font-mono font-bold leading-none text-slate-900">
                                                        {formatNum(row.current)}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-0.5 text-[11.5px] font-semibold",
                                                            improving === null
                                                                ? "text-slate-400"
                                                                : improving
                                                                  ? "text-emerald-600"
                                                                  : "text-rose-600"
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
                        <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-slate-200/70">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Reply Classification
                                </span>
                                <span className="text-[10.5px] text-slate-400">
                                    {formatNum(reportBreakdown.reduce((sum, row) => sum + (row.leads || 0), 0))} classified replies
                                </span>
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3.5">
                                {reportBreakdown.map((row) => (
                                    <div key={row.classification} className="space-y-1">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-600 font-medium truncate pr-2">
                                                {REPLY_TONE[row.classification]?.label || row.classification}
                                            </span>
                                            <span className="font-mono font-bold text-slate-900 shrink-0">{formatNum(row.leads)}</span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full"
                                                style={{ width: `${Math.max(2, Math.round((row.leads / breakdownMax) * 100))}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
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
                                            <tr key={camp.campaign} className="hover:bg-slate-50/60">
                                                <td className="px-3 py-1.5 text-slate-800 font-medium truncate max-w-[260px]" title={camp.campaign}>
                                                    {camp.campaign}
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
                                        <div key={mb.id} className="flex items-center justify-between gap-2">
                                            <span className="text-slate-600 truncate" title={mb.senderEmail}>
                                                {mb.senderEmail}
                                            </span>
                                            <span className="font-mono text-slate-800 shrink-0">
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
                                            <span className="size-2 rounded-full bg-sky-500" />
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
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/60">
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
                                                    let bg = "bg-slate-100 hover:bg-slate-200 border-slate-200/70 text-slate-400";
                                                    if (slot.level === 1) bg = "bg-emerald-100 hover:bg-emerald-200 border-emerald-200/70 text-emerald-800";
                                                    if (slot.level === 2) bg = "bg-emerald-300 hover:bg-emerald-400 border-emerald-400 text-emerald-950 font-medium";
                                                    if (slot.level === 3) bg = "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white font-semibold";
                                                    if (slot.level === 4) bg = "bg-emerald-700 hover:bg-emerald-800 border-emerald-800 text-white font-bold shadow-2xs";

                                                    return (
                                                        <button
                                                            key={`${day}-${sIdx}`}
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedHeatmapSlot({
                                                                    day,
                                                                    hour: `${hourLabel} - ${HEATMAP_HOURS[(sIdx + 1) % 8]}`,
                                                                })
                                                            }
                                                            className={cn(
                                                                "h-8 rounded-md border text-[10px] font-mono flex items-center justify-center transition-all cursor-pointer relative group",
                                                                bg,
                                                                isSelected && "ring-2 ring-sky-500 ring-offset-1 scale-[1.03]"
                                                            )}
                                                            title={`${day} ${hourLabel}: ${slot.opens} opens · ${slot.replies} replies`}
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
                            <div className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
                                <div className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-emerald-500" />
                                    <span className="font-semibold text-slate-800">
                                        {selectedHeatmapSlot.day} {selectedHeatmapSlot.hour}:
                                    </span>
                                    <span className="text-slate-600">
                                        <strong className="text-slate-900">{selectedSlot.opens}</strong> Human Opens &bull; <strong className="text-emerald-700">{selectedSlot.replies}</strong> Inbound Replies
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                    {selectedSlot.level >= 3 ? "🔥 Peak Converting Window" : selectedSlot.level >= 2 ? "✨ Moderate Activity Window" : "Quiet Dispatch Slot"}
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
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Smartlead Real-Time Engine
                                </div>
                                <div className="p-2.5 rounded-lg border border-slate-200/70 bg-slate-50/40 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600 font-medium">Messages Tracked</span>
                                        <span className="font-mono font-bold text-emerald-700">{formatNum(lifetime?.messages_tracked)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-600 font-medium">Latest Inbound Reply</span>
                                        <span className="font-mono text-[11px] text-slate-700 truncate" title={latestReply?.contact_email}>
                                            {latestReply ? `${latestReply.contact_email} · ${formatStamp(latestReply.replied_at)}` : "None recorded"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600 font-medium">Collision Shield Memory</span>
                                        <span className="font-mono text-[11px] text-emerald-700 font-bold">
                                            {formatNum(lifetime?.contacts_emailed)} contacts · {formatNum(lifetime?.messages_tracked)} messages
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={handleRefreshTelemetry}
                                disabled={isRefreshing}
                                className="w-full h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
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
                    <div className="lg:col-span-7 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                                        <MegaphoneIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">Active Campaigns Telemetry</h2>
                                        <p className="text-[12px] text-slate-500">{safeCampaigns.length} Total Sequences · {activeCampaignsCount} Active</p>
                                    </div>
                                </div>
                                <Link
                                    to="/app/campaigns"
                                    className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors"
                                >
                                    <span>All Campaigns</span>
                                    <ArrowUpRightIcon className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            <div className="space-y-2.5">
                                {safeCampaigns.slice(0, 5).map((camp) => {
                                    const isActive = camp.status === "active";
                                    // Rates only exist for campaigns that have sent;
                                    // a campaign with no sends shows "—", never 100%.
                                    const openRate = camp.sent_count ? Number(camp.open_rate ?? 0) : null;
                                    const replyRate = camp.sent_count ? Number(camp.reply_rate ?? 0) : null;

                                    return (
                                        <div
                                            key={camp.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 transition-all gap-3"
                                        >
                                            <div
                                                onClick={() => navigate(`/app/campaigns/${camp.id}`)}
                                                className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                                            >
                                                <span
                                                    className={cn(
                                                        "w-2.5 h-2.5 rounded-full shrink-0",
                                                        isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                                                    )}
                                                    title={isActive ? "Active - Running dispatches" : "Draft / Paused"}
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-slate-900 truncate hover:text-sky-600 transition-colors flex items-center gap-2">
                                                        <span>{camp.name}</span>
                                                        {camp.smartlead_id && (
                                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-sky-50 text-sky-700 border border-sky-200/60">
                                                                Smartlead #{camp.smartlead_id}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11.5px] text-slate-500">
                                                        {formatNum(camp.total_leads ?? 0)} leads assigned · {formatNum(camp.sent_count ?? 0)} dispatched
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="text-right">
                                                    <div className="text-[12px] font-bold text-slate-800">
                                                        {openRate === null ? "—" : `${openRate}%`}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">Open Rate</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[12px] font-bold text-emerald-600">
                                                        {replyRate === null ? "—" : `${replyRate}%`}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">Reply Rate</div>
                                                </div>

                                                <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleToggleCampaign(e, camp)}
                                                        className={cn(
                                                            "w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer",
                                                            isActive
                                                                ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                                        )}
                                                        title={isActive ? "Pause Campaign" : "Start Campaign"}
                                                        aria-label={isActive ? "Pause Campaign" : "Start Campaign"}
                                                    >
                                                        {isActive ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5 fill-current" />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDeleteCampaign(e, camp)}
                                                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
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
                    <div className="lg:col-span-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                        <ShieldCheckIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                            Collision Shield &amp; Memory
                                        </h2>
                                        <p className="text-[12px] text-slate-500">
                                            {formatNum(lifetime?.messages_tracked)} messages &amp; {formatNum(lifetime?.contacts_emailed)} contacts indexed
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10.5px] font-semibold text-emerald-700">
                                    Shield Active
                                </span>
                            </div>

                            <div className="rounded-lg bg-slate-50/70 border border-slate-200/70 p-3 space-y-1.5">
                                <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                                    <ZapIcon className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Cross-Team Deduplication Guard</span>
                                </div>
                                <p className="text-[11.5px] text-slate-600 leading-relaxed">
                                    Checks <span className="font-mono text-slate-800 font-semibold">email + name + company</span> against{" "}
                                    {formatNum(lifetime?.messages_tracked)} outbound messages, {formatNum(lifetime?.leads_total)} leads and{" "}
                                    {formatNum(lifetime?.brands)} brands across {teamProfiles.length} teammates before a sequence starts.
                                </p>
                            </div>

                            {/* What the shield has indexed */}
                            <div className="space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Dedup Index
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: "Messages Tracked", value: lifetime?.messages_tracked, tone: "text-slate-900" },
                                        { label: "Contacts Emailed", value: lifetime?.contacts_emailed, tone: "text-slate-900" },
                                        { label: "Leads Replied", value: lifetime?.leads_replied, tone: "text-emerald-700" },
                                        { label: "Brands Indexed", value: lifetime?.brands, tone: "text-slate-900" },
                                    ].map((cell) => (
                                        <div
                                            key={cell.label}
                                            className="p-2.5 rounded-lg border border-slate-200/60 bg-white space-y-0.5"
                                        >
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                                {cell.label}
                                            </div>
                                            <div className={`font-mono font-bold text-[15px] ${cell.tone}`}>
                                                {formatNum(cell.value)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-2.5 rounded-lg border border-slate-200/60 bg-white text-[11.5px] text-slate-600">
                                    <span className="font-semibold text-slate-800">{formatNum(lifetime?.reply_messages)}</span>{" "}
                                    reply-flagged messages halted their follow-up sequences.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 3: Inbound Response Radar & Audience Intelligence (7 / 5 Split) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Left 7 Columns: Inbound Response Radar */}
                    <div className="lg:col-span-7 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                    <MessageSquareIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                        High-Intent Inbound Response Radar
                                    </h2>
                                    <p className="text-[12px] text-slate-500">
                                        {formatNum(lifetime?.reply_messages)} reply messages classified across {teamProfiles.length} sending profiles
                                    </p>
                                </div>
                            </div>
                            <Link
                                to="/app/unibox"
                                className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
                            >
                                <span>Open Unified Inbox</span>
                                <ArrowUpRightIcon className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        <div className="space-y-3">
                            {activeConversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    onClick={() => navigate("/app/unibox")}
                                    className="p-3.5 rounded-lg border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("w-2 h-2 rounded-full", conv.dotColor)} />
                                            <span className="text-[13px] font-bold text-slate-900">{conv.contactName}</span>
                                            <span className="text-[12px] text-slate-400">&bull; {conv.company}</span>
                                        </div>
                                        <span className="text-[11px] text-slate-400">{conv.time}</span>
                                    </div>

                                    <p className="text-[12.5px] text-slate-700 line-clamp-1 italic">
                                        "{conv.snippet}"
                                    </p>

                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={cn("px-2 py-0.5 rounded text-[10.5px] font-semibold border shrink-0", conv.sentimentColor)}>
                                                {conv.sentiment}
                                            </span>
                                            <span className="text-[11px] font-medium text-slate-500 truncate">
                                                Mailbox: <span className="font-semibold text-slate-800">{conv.mailboxOwner}</span>
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate("/app/unibox");
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 h-6 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition-colors shadow-2xs shrink-0 cursor-pointer"
                                        >
                                            <ReplyIcon className="w-3 h-3" />
                                            <span>Reply in Unibox</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {activeConversations.length === 0 && (
                                <div className="p-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-[12.5px] text-slate-500 text-center">
                                    {reportQuery.isPending
                                        ? "Loading the latest replies from the database…"
                                        : "No replies recorded yet — the radar fills in as prospects answer."}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right 5 Columns: Audience & Brand Intelligence Funnel */}
                    <div className="lg:col-span-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                                        <Building2Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                            Contacts &amp; Brand Intelligence
                                        </h2>
                                        <p className="text-[12px] text-slate-500">
                                            {formatNum(totalContactsCount)} leads in CRM · {formatNum(lifetime?.brands)} brands indexed
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/app/contacts"
                                    className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors"
                                >
                                    <span>View Contacts</span>
                                    <ArrowUpRightIcon className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            {/* Conversion Funnel */}
                            <div className="space-y-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Outreach Funnel Progress <span className="normal-case font-medium">(share of CRM leads)</span>
                                </div>
                                <div className="space-y-2 text-[12px]">
                                    <div>
                                        <div className="flex items-center justify-between text-slate-700 mb-1">
                                            <span>Leads in CRM</span>
                                            <span className="font-mono font-bold text-slate-900">{formatNum(lifetime?.leads_total ?? totalContactsCount)}</span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full bg-slate-400 rounded-full w-full" />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between text-slate-700 mb-1">
                                            <span>Leads Contacted</span>
                                            <span className="font-mono font-bold text-slate-900">
                                                {formatNum(lifetime?.leads_contacted)} ({pctOf(lifetime?.leads_contacted, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full bg-slate-500 rounded-full"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_contacted, crmLeadTotal) > 0 ? 0.6 : 0, pctOf(lifetime?.leads_contacted, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between text-slate-700 mb-1">
                                            <span>Active Dispatches (Today)</span>
                                            <span className="font-mono font-bold text-sky-600">{totalSentToday} Dispatched</span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full bg-sky-500 rounded-full"
                                                style={{ width: `${totalDailyQuota > 0 ? Math.min(100, (totalSentToday / totalDailyQuota) * 100) : 0}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between text-slate-700 mb-1">
                                            <span>Leads Opened</span>
                                            <span className="font-mono font-bold text-emerald-600">
                                                {formatNum(lifetime?.leads_opened)} ({pctOf(lifetime?.leads_opened, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_opened, crmLeadTotal) > 0 ? 0.6 : 0, pctOf(lifetime?.leads_opened, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between text-slate-700 mb-1">
                                            <span>Leads Replied</span>
                                            <span className="font-mono font-bold text-amber-600">
                                                {formatNum(lifetime?.leads_replied)} ({pctOf(lifetime?.leads_replied, crmLeadTotal)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full bg-amber-500 rounded-full"
                                                style={{ width: `${Math.max(pctOf(lifetime?.leads_replied, crmLeadTotal) > 0 ? 0.6 : 0, pctOf(lifetime?.leads_replied, crmLeadTotal))}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Targeted Brands Chip Cloud */}
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Primary Target Brands
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(reportData?.brands ?? []).map((brand) => (
                                        <span
                                            key={brand.domain}
                                            title={`${brand.contacts} contacts · ${brand.replied} replies`}
                                            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                                        >
                                            {brand.name} · {formatNum(brand.contacts)}
                                        </span>
                                    ))}
                                    {(reportData?.brands ?? []).length === 0 && (
                                        <span className="text-[11px] text-slate-500">No brands indexed yet.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 4: Smartlead Distributed Sending Pool (Shifted Below Per Requirement) */}
                <div className="space-y-3 pt-4 border-t border-slate-200/80">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs border border-sky-100">
                                {teamProfiles.length}
                            </div>
                            <div>
                                <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">
                                    Smartlead Distributed Profiles ({Math.round(totalDailyQuota / Math.max(1, teamProfiles.length))} Sends / Day Quota Each)
                                </h2>
                                <p className="text-[12px] text-slate-500">
                                    Rotates client outreach across {teamProfiles.length} distinct accounts to maintain inbox deliverability · {formatNum(totalDailyQuota)} Total Daily Volume
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/app/mailboxes"
                            className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors"
                        >
                            <span>Manage Mailboxes</span>
                            <ArrowUpRightIcon className="w-3.5 h-3.5" />
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
                                    className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between space-y-3.5"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200/80 flex items-center justify-center text-[12.5px] font-bold text-slate-700 shrink-0 shadow-2xs">
                                                {m.name.split(" ").map((n) => n[0]).join("")}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-1.5">
                                                    <span className="text-[13px] font-bold text-slate-900 truncate">
                                                        {m.name}
                                                    </span>
                                                    <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                                        {m.reputation == null ? "No warmup score" : `${m.reputation}% Health`}
                                                    </span>
                                                </div>
                                                <div className="text-[11.5px] text-slate-500 truncate" title={m.email}>
                                                    {m.email}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] pt-1">
                                            <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 text-slate-600 uppercase">
                                                {m.status}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium text-[11px]">
                                                {m.provider ?? "—"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Quota Progress */}
                                    <div className="space-y-1.5 pt-1 border-t border-slate-100/80">
                                        <div className="flex items-center justify-between text-[11.5px]">
                                            <span className="text-slate-500 font-medium">Daily Quota</span>
                                            <span className="font-mono font-semibold text-slate-800">
                                                {sent} / {limit} sent
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500",
                                                    isNearLimit ? "bg-amber-500" : sent > 0 ? "bg-emerald-500" : "bg-slate-300"
                                                )}
                                                style={{ width: `${Math.max(sent > 0 ? 8 : 4, pct)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-[10.5px] text-slate-400 pt-0.5">
                                            <span>Lifetime: {formatNum(m.total_sent)} sent</span>
                                            <span>{Math.max(0, limit - sent)} remaining</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* SECTION 5: Realtime Outbound & Webhook Stream */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                            <ActivityIcon className="w-4 h-4 text-sky-600" />
                            <h3 className="text-[13.5px] font-bold text-slate-900">Realtime Activity &amp; Webhook Stream</h3>
                        </div>
                        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {recentActivity.length} events · {chartWindowLabel}
                        </span>
                    </div>

                    <div className="divide-y divide-slate-100 font-mono text-[11.5px] text-slate-600 space-y-0.5">
                        {recentActivity.slice(0, 6).map((activity, idx) => (
                            <div key={`${activity.contact_email}-${activity.timestamp}-${idx}`} className="py-2 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-slate-400 shrink-0">{formatStamp(activity.timestamp)}</span>
                                    <span
                                        className={cn(
                                            "px-1.5 py-0.2 rounded border font-semibold text-[10px] shrink-0",
                                            EVENT_TONE[activity.type] || "bg-slate-50 text-slate-600 border-slate-200/60"
                                        )}
                                    >
                                        {activity.type.toUpperCase()}
                                    </span>
                                    <span className="truncate">
                                        {activity.campaign_name || "Unattributed campaign"} →{" "}
                                        <strong className="text-slate-800">{activity.contact_email}</strong>
                                    </span>
                                </div>
                                <span className="text-slate-400 font-sans text-[11px] shrink-0">
                                    {activity.type === "replied"
                                        ? "Follow-up halted"
                                        : activity.type === "bounced"
                                          ? "Paused"
                                          : activity.type === "sent"
                                            ? "Dispatched"
                                            : "Recorded"}
                                </span>
                            </div>
                        ))}
                        {recentActivity.length === 0 && (
                            <div className="py-3 text-[12px] text-slate-500 font-sans">
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
                            <CalendarIcon className="w-5 h-5 text-sky-600" />
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
                                                ? "bg-sky-600 border-sky-600 text-white shadow-xs font-semibold"
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
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span>Campaigns Telemetry</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeMailboxes}
                                        onChange={(e) => setExportIncludeMailboxes(e.target.checked)}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span>{teamProfiles.length} Sending Mailboxes</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeReplies}
                                        onChange={(e) => setExportIncludeReplies(e.target.checked)}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span>Inbound Replies &amp; Sentiment</span>
                                </label>

                                <label className="flex items-center gap-2 p-2 rounded border border-slate-200/80 bg-slate-50/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={exportIncludeContacts}
                                        onChange={(e) => setExportIncludeContacts(e.target.checked)}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span>Audience &amp; Brand Data</span>
                                </label>
                            </div>
                        </div>

                        {/* Export Summary Box */}
                        <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 text-[11.5px] text-sky-800 flex items-start gap-2">
                            <CheckCircle2Icon className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
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
                            className="px-4 h-8 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            <span>{isGeneratingCsv ? "Exporting..." : "Download CSV Report"}</span>
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}
