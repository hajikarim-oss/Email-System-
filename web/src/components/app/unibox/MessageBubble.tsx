// Single message in a thread.
//
// Visually distinguishes INBOUND PROSPECT REPLIES from OUTBOUND SEQUENCE STEPS
// so the user can scan a multi-message conversation at a glance and immediately
// focus on the prospect's actual reply.

import React from "react";
import {
    AlertCircleIcon,
    ArrowDownLeftIcon,
    ArrowUpRightIcon,
    CornerUpLeftIcon,
    ForwardIcon,
    Loader2Icon,
} from "lucide-react";
import EmailBody from "./EmailBody";
import useUniboxEmail from "@/lib/api/hooks/app/unibox/useUniboxEmail";
import type UniboxEmail from "@/lib/api/models/app/unibox/UniboxEmail";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
    email: UniboxEmail;
    /** Expanded on mount. The newest message and any inbound replies open by default. */
    defaultExpanded?: boolean;
    onReply?: () => void;
    onForward?: () => void;
}

function fromName(s: string): string {
    const m = s.match(/^"?([^"<]+)"?\s*<.+>$/);
    if (m) return m[1].trim();
    const raw = s.replace(/<.+>/, "").trim() || s;
    if (raw.includes("@")) {
        return raw
            .split("@")[0]
            .split(/[._-]+/)
            .filter(Boolean)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" ");
    }
    return raw;
}

function fromAddr(s: string): string | null {
    const m = s.match(/<([^>]+)>/);
    if (m) return m[1].trim();
    if (s.includes("@")) return s.trim();
    return null;
}

function initials(s: string): string {
    const name = fromName(s);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

function isOutboundSender(s: string, explicitDirection?: string): boolean {
    if (explicitDirection === "inbound") return false;
    if (explicitDirection === "outbound") return true;
    const lower = (s || "").toLowerCase();
    return (
        lower.includes("@theboredmonkey.com") ||
        lower.includes("@theboredmonkey.in") ||
        lower.includes("@tbmtroop.com")
    );
}

export function MessageBubble({
    email,
    defaultExpanded = false,
    onReply,
    onForward,
}: MessageBubbleProps) {
    const explicitDir = (email as any).direction as string | undefined;
    const isOutbound = isOutboundSender(email.from, explicitDir);
    const isInbound = !isOutbound;

    // Inbound replies should always be expanded by default so the user sees the prospect's reply immediately
    const [expanded, setExpanded] = React.useState(defaultExpanded || isInbound);
    const hasInlineBody = Boolean((email as any).body_html || (email as any).body_plain);
    const body = useUniboxEmail(email.id, expanded && !hasInlineBody);

    const date = new Date(email.date);
    const dateStr = date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const name = fromName(email.from);
    const addr = fromAddr(email.from);
    const toDisplay = fromAddr(email.to) || email.to;
    const snippet = email.snippet ?? "";

    const resolvedHtml = (email as any).body_html || body.data?.body_html;
    const resolvedPlain = (email as any).body_plain || body.data?.body_plain || email.snippet;

    return (
        <article
            className={cn(
                "group px-3 sm:px-5 py-3.5 transition-colors",
                isInbound ? "bg-emerald-50/25" : "bg-white",
            )}
        >
            <div
                className={cn(
                    "rounded-xl border px-3.5 sm:px-4 py-3 transition-shadow",
                    isInbound
                        ? "border-emerald-200/90 bg-white shadow-xs"
                        : "border-slate-200/80 bg-slate-50/50",
                )}
            >
                <header
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    className="flex items-start gap-3 cursor-pointer select-none"
                    onClick={() => setExpanded((v) => !v)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpanded((v) => !v);
                        }
                    }}
                >
                    <div
                        className={cn(
                            "size-8 rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 border",
                            isInbound
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-slate-200/70 text-slate-700 border-slate-300/60",
                        )}
                    >
                        {initials(email.from)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12.5px] font-semibold text-slate-900 truncate">
                                {name}
                            </span>
                            {addr && (
                                <span className="font-mono text-[10.5px] text-slate-500 truncate">
                                    &lt;{addr}&gt;
                                </span>
                            )}
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 h-4 px-1.5 rounded text-[9.5px] font-semibold uppercase tracking-wider shrink-0",
                                    isInbound
                                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300/60"
                                        : "bg-slate-200/70 text-slate-600",
                                )}
                            >
                                {isInbound ? (
                                    <>
                                        <ArrowDownLeftIcon className="w-2.5 h-2.5" />
                                        Prospect Reply
                                    </>
                                ) : (
                                    <>
                                        <ArrowUpRightIcon className="w-2.5 h-2.5" />
                                        Sent Outreach
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span className="truncate min-w-0">to {toDisplay}</span>
                            {email.subject && (
                                <>
                                    <span className="text-slate-300">&middot;</span>
                                    <span className="truncate text-slate-400">{email.subject}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {onReply && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onReply();
                                    }}
                                    aria-label="Reply to this message"
                                    title="Reply to this message"
                                    className="size-6 rounded text-slate-500 hover:text-slate-950 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
                                >
                                    <CornerUpLeftIcon className="w-3 h-3" />
                                </button>
                            )}
                            {onForward && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onForward();
                                    }}
                                    aria-label="Forward this message"
                                    title="Forward this message"
                                    className="size-6 rounded text-slate-500 hover:text-violet-700 hover:bg-violet-50 inline-flex items-center justify-center transition-colors"
                                >
                                    <ForwardIcon className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <span className="font-mono text-[10.5px] text-slate-400 tabular-nums">
                            {dateStr}
                        </span>
                    </div>
                </header>

                <div className="mt-3 pt-2.5 border-t border-slate-100">
                    {!expanded ? (
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            className="w-full text-left text-[12.5px] text-slate-500 line-clamp-2 hover:text-slate-800 transition-colors"
                            title="Click to expand full message"
                        >
                            {snippet || "Click to view full message"}
                        </button>
                    ) : !hasInlineBody && body.isPending ? (
                        <div className="flex items-center gap-2 text-[12px] text-slate-400">
                            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                            Loading message…
                        </div>
                    ) : !hasInlineBody && body.isError ? (
                        <div className="text-[12.5px] text-slate-600">
                            <p className="whitespace-pre-wrap break-words">{snippet}</p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-amber-700">
                                <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                Couldn't load the full message.
                                <button
                                    type="button"
                                    onClick={() => body.refetch()}
                                    className="underline underline-offset-2 hover:text-amber-800"
                                >
                                    Try again
                                </button>
                            </p>
                        </div>
                    ) : (
                        <>
                            <EmailBody html={resolvedHtml} plain={resolvedPlain} />
                            {body.data?.body_truncated && (
                                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-amber-700">
                                    <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                    Only a preview of this message is stored.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
