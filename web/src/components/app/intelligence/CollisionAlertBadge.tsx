import React from "react";
import { AlertTriangleIcon, CheckCircle2Icon, HistoryIcon, UserCheckIcon } from "lucide-react";
import type { ConversationHistoryRecord } from "@/lib/intelligence/conversationMemory";
import { cn } from "@/lib/utils";

export function CollisionAlertBadge({
    history,
    record,
    compact = false,
    className,
}: {
    history?: ConversationHistoryRecord | null;
    record?: ConversationHistoryRecord | null;
    compact?: boolean;
    className?: string;
}) {
    const data = record || history;
    if (!data) return null;

    const formattedDate = React.useMemo(() => {
        if (!data?.last_contacted_at) return "Recently";
        try {
            return new Date(data.last_contacted_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return data.last_contacted_at;
        }
    }, [data?.last_contacted_at]);

    if (compact) {
        return (
            <div
                title={`Previously connected on ${formattedDate} by ${data.contacted_by || "Team Member"}: ${data.summary || ""}`}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs",
                    className
                )}
            >
                <HistoryIcon className="w-3 h-3 text-amber-600 shrink-0" />
                <span className="truncate">
                    Connected {formattedDate} by <span className="font-semibold">{data.contacted_by || "Team Member"}</span>
                </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "p-2.5 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50/90 to-orange-50/50 text-amber-900 text-[11.5px] shadow-xs space-y-1",
                className
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Cross-Team Collision Shield: Prior Contact Record</span>
                </div>
                {data.status && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-800 uppercase tracking-wider">
                        {data.status}
                    </span>
                )}
            </div>

            <p className="text-[11px] text-amber-800/90 leading-snug">
                <span className="font-medium text-amber-950">{data.contacted_by || "Team Member"}</span>
                {data.sender_email ? ` (${data.sender_email})` : ""} reached out on{" "}
                <span className="font-medium text-amber-950">{formattedDate}</span>
                {data.subject ? (
                    <>
                        {" "}regarding <span className="italic font-medium">"{data.subject}"</span>.
                    </>
                ) : (
                    "."
                )}
            </p>

            {data.summary && (
                <div className="text-[11px] text-amber-900 bg-white/70 px-2 py-1 rounded border border-amber-200/60 mt-1">
                    <span className="font-medium text-amber-950">Context: </span>
                    {data.summary}
                </div>
            )}
        </div>
    );
}
