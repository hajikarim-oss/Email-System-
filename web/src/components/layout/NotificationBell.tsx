// The in-app notification bell in the dashboard chrome. Reads the persisted feed
// (source of truth for unread state) + refreshes live on the realtime
// NOTIFICATION event (wired in useRealtimeEvents).

import React from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    BellIcon,
    ClockIcon,
    CreditCardIcon,
    KeyRoundIcon,
    ReplyIcon,
    ServerCrashIcon,
    PauseCircleIcon,
    Settings2Icon,
    ShieldAlertIcon,
    ShieldOffIcon,
    TriangleAlertIcon,
    UsersIcon,
    type LucideIcon,
} from "lucide-react";
import useClickOutside from "@/hooks/useClickOutside";
import {
    useNotifications,
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useClearReadNotifications,
} from "@/lib/api/hooks/app/notifications/useNotifications";
import type { AppNotification } from "@/lib/api/models/app/notifications/Notification";

// Per-category icon + tone + badge so the list scans by kind before reading titles.
const CATEGORY_META: Record<string, { icon: LucideIcon; tone: string; badge: string }> = {
    inbound_reply: { icon: ReplyIcon, tone: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/80", badge: "New Reply" },
    inbound_out_of_office: { icon: ClockIcon, tone: "bg-slate-100 text-slate-600", badge: "Auto-Reply" },
    health_bounce: { icon: TriangleAlertIcon, tone: "bg-rose-100 text-rose-800 ring-1 ring-rose-300/80", badge: "Bounce" },
    health_complaint: { icon: ShieldAlertIcon, tone: "bg-rose-100 text-rose-800", badge: "Spam Alert" },
    health_worker_downtime: { icon: ServerCrashIcon, tone: "bg-rose-100 text-rose-800", badge: "System" },
    security_new_signin: { icon: KeyRoundIcon, tone: "bg-violet-100 text-violet-800", badge: "Security" },
    billing_alert: { icon: CreditCardIcon, tone: "bg-amber-100 text-amber-800", badge: "Billing" },
    team_activity: { icon: UsersIcon, tone: "bg-blue-100 text-blue-800", badge: "Team" },
    campaign_paused: { icon: PauseCircleIcon, tone: "bg-amber-100 text-amber-800 ring-1 ring-amber-300/80", badge: "Campaign" },
    health_domain_auth: { icon: ShieldOffIcon, tone: "bg-rose-100 text-rose-800", badge: "DNS" },
};

const FALLBACK_META = { icon: BellIcon, tone: "bg-slate-100 text-slate-500", badge: "Alert" };

type Bucket = "today" | "yesterday" | "earlier";

const BUCKET_LABELS: Record<Bucket, string> = {
    today: "Today",
    yesterday: "Yesterday",
    earlier: "Earlier",
};

function startOfToday(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function bucketFor(d: Date): Bucket {
    const today = startOfToday();
    const yesterday = today - 24 * 60 * 60 * 1000;
    const t = d.getTime();
    if (t >= today) return "today";
    if (t >= yesterday) return "yesterday";
    return "earlier";
}

// Compact relative timestamp: "now", "2m", "3h", "Yesterday", then a short date.
function relTime(iso: string): string {
    const d = new Date(iso);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return "now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    if (bucketFor(d) === "yesterday") return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
    const { data, isLoading } = useNotifications();
    const markAll = useMarkAllNotificationsRead();
    const markOne = useMarkNotificationRead();
    const clearRead = useClearReadNotifications();
    const [open, setOpen] = React.useState(false);
    const [filter, setFilter] = React.useState<"all" | "unread">("unread");
    const ref = React.useRef<HTMLDivElement>(null);
    const close = React.useCallback(() => setOpen(false), []);
    useClickOutside(ref, close);

    const unread = data?.unread ?? 0;
    const items = data?.notifications ?? [];
    const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;

    // Group by day bucket; the feed is newest → oldest, so one pass keeps
    // both global order and group adjacency (same shape as the unibox list).
    const grouped = React.useMemo(() => {
        const groups: { bucket: Bucket; rows: AppNotification[] }[] = [];
        for (const n of visible) {
            const b = bucketFor(new Date(n.created_at));
            const tail = groups[groups.length - 1];
            if (tail && tail.bucket === b) tail.rows.push(n);
            else groups.push({ bucket: b, rows: [n] });
        }
        return groups;
    }, [visible]);

    const itemBody = (n: AppNotification) => {
        const meta = CATEGORY_META[n.category] ?? FALLBACK_META;
        const Icon = meta.icon;
        const isReply = n.category === "inbound_reply";
        return (
            <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.tone} shadow-2xs`}>
                    <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9.5px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                            isReply ? "bg-emerald-100 text-emerald-800" :
                            n.category === "health_bounce" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                        }`}>
                            {meta.badge}
                        </span>
                        <div
                            className={`text-[12px] truncate ${
                                n.read_at ? "font-normal text-slate-600" : "font-bold text-slate-900"
                            }`}
                        >
                            {n.title}
                        </div>
                    </div>
                    {n.body && (
                        <div className={`text-[11px] truncate ${n.read_at ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                            {n.body}
                        </div>
                    )}
                    {isReply && (
                        <div className="text-[10.5px] font-semibold text-emerald-600 hover:text-emerald-700 mt-1 flex items-center gap-1">
                            <span>Open in Inbox</span>
                            <span>→</span>
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-slate-400 font-mono">{relTime(n.created_at)}</span>
                    {!n.read_at && (
                        <span className={`size-2 rounded-full ${isReply ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                    )}
                </div>
            </div>
        );
    };

    const rowClass = (n: AppNotification) =>
        `block w-full text-left px-3 py-2.5 border-l-[3px] transition-colors hover:bg-slate-50 cursor-pointer ${
            n.read_at
                ? "border-l-transparent opacity-75"
                : n.category === "inbound_reply"
                    ? "border-l-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70"
                    : "border-l-amber-500 bg-amber-50/30 hover:bg-amber-50/60"
        }`;

    const emptyState = (
        <div className="px-3 py-8 flex flex-col items-center gap-2 text-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <BellIcon className="size-4" />
            </span>
            <span className="text-[12px] text-slate-400">You&apos;re all caught up.</span>
            {filter === "unread" && items.length > 0 && (
                <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="text-[11px] text-blue-600 hover:text-blue-700 underline mt-0.5"
                >
                    View past notifications ({items.length})
                </button>
            )}
        </div>
    );

    const skeleton = (
        <div className="px-3 py-2.5 space-y-3 animate-pulse" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2.5">
                    <div className="size-6 rounded-md bg-slate-100" />
                    <div className="flex-1 space-y-1.5 pt-0.5">
                        <div className="h-2.5 w-2/3 rounded bg-slate-100" />
                        <div className="h-2 w-1/2 rounded bg-slate-100" />
                    </div>
                </div>
            ))}
        </div>
    );

    const hasReplies = items.some((n) => !n.read_at && n.category === "inbound_reply");
    const hasWarnings = items.some((n) => !n.read_at && (
        n.category === "health_bounce" ||
        n.category === "health_complaint" ||
        n.category === "campaign_paused" ||
        n.category === "health_domain_auth" ||
        n.category === "health_worker_downtime" ||
        n.category === "billing_alert"
    ));

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label="Notifications"
                className={
                    unread > 0
                        ? hasReplies
                            ? "relative w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm hover:bg-emerald-100 transition-all ring-2 ring-emerald-200/50"
                            : hasWarnings
                                ? "relative w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600 border border-rose-200 shadow-sm hover:bg-rose-100 transition-all"
                                : "relative w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200 shadow-sm hover:bg-amber-100 transition-all"
                        : "relative w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                }
            >
                <BellIcon className={unread > 0 ? "w-4 h-4 animate-[wiggle_0.5s_ease-in-out]" : "w-4 h-4"} />
                {unread > 0 && (
                    <span className={
                        hasReplies
                            ? "absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white animate-pulse"
                            : hasWarnings
                                ? "absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white animate-pulse"
                                : "absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white"
                    }>
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1.5 w-[340px] max-w-[90vw] rounded-md border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] z-50 overflow-hidden"
                    >
                        <div className="h-9 px-3 flex items-center gap-2 border-b border-slate-200">
                            <span className="text-[12px] font-medium text-slate-900">Notifications</span>
                            <div className="ml-auto flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                                {(["all", "unread"] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFilter(f)}
                                        className={`h-5 px-1.5 rounded text-[10.5px] font-medium transition-colors ${
                                            filter === f
                                                ? "bg-white text-slate-900 shadow-sm"
                                                : "text-slate-500 hover:text-slate-900"
                                        }`}
                                    >
                                        {f === "all" ? "All" : "Unread"}
                                    </button>
                                ))}
                            </div>
                            {unread > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => markAll.mutate()}
                                    className="text-[11px] text-slate-900 hover:text-black shrink-0 font-medium"
                                >
                                    Mark all read
                                </button>
                            ) : items.some((n) => n.read_at) ? (
                                <button
                                    type="button"
                                    onClick={() => clearRead.mutate()}
                                    className="text-[11px] text-slate-500 hover:text-slate-900 shrink-0"
                                    title="Remove all read notifications from feed"
                                >
                                    Clear read
                                </button>
                            ) : null}
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {isLoading ? (
                                skeleton
                            ) : visible.length === 0 ? (
                                emptyState
                            ) : (
                                grouped.map((g) => (
                                    <div key={g.bucket}>
                                        <div className="sticky top-0 z-10 px-3 pt-2 pb-1 bg-white text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                            {BUCKET_LABELS[g.bucket]}
                                        </div>
                                        {g.rows.map((n) => {
                                            const click = () => {
                                                if (!n.read_at) markOne.mutate(n.id);
                                                setOpen(false);
                                            };
                                            return n.link ? (
                                                <Link key={n.id} to={n.link} onClick={click} className={rowClass(n)}>
                                                    {itemBody(n)}
                                                </Link>
                                            ) : (
                                                <button key={n.id} type="button" onClick={click} className={rowClass(n)}>
                                                    {itemBody(n)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="border-t border-slate-200 bg-slate-50/60">
                            <Link
                                to="/app/settings/notifications"
                                onClick={close}
                                className="flex h-8 items-center justify-center gap-1.5 text-[11.5px] text-slate-500 hover:text-slate-900 transition-colors"
                            >
                                <Settings2Icon className="size-3.5" />
                                Notification settings
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
