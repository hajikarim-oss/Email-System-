// Mailboxes page strip for self-hosted instances: invites an unlinked
// instance to connect, and shows a linked one how many mailboxes are in the
// pool. Dismissal of the invite is remembered locally.

import React from "react";
import { Link } from "react-router-dom";
import { CloudIcon, XIcon } from "lucide-react";
import useCloudPool from "@/hooks/useCloudPool";

const DISMISS_KEY = "warmbly.cloud-pool-banner.dismissed";

export default function CloudPoolBanner({ onConnect, mailboxCount }: { onConnect: () => void; mailboxCount: number }) {
    const pool = useCloudPool();
    const [dismissed, setDismissed] = React.useState(() => localStorage.getItem(DISMISS_KEY) === "1");

    if (!pool.selfHosted || pool.loading) return null;

    if (pool.connected) {
        const limit = pool.plan?.mailbox_limit ?? null;
        return (
            <div className="px-5 pt-4">
                <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-800 shadow-xs">
                    <CloudIcon className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 leading-snug">
                        <span className="font-semibold text-slate-900">
                            {pool.enrolledCount === 0 ? "No mailbox is in the TheBoredMonkey pool yet." : `${pool.enrolledCount} of ${mailboxCount} mailboxes warm in the TheBoredMonkey pool.`}
                        </span>{" "}
                        <span className="text-slate-500">
                            {limit === null ? "Unlimited mailboxes." : `${pool.enrolledCount} of ${limit} free.`} Use the cloud icon on a row, or the warmup menu, to add one.
                        </span>
                    </span>
                    <Link to="/app/settings/warmbly-cloud" className="shrink-0 text-[12px] font-semibold text-slate-900 hover:underline underline-offset-2 cursor-pointer">
                        Manage
                    </Link>
                </div>
            </div>
        );
    }

    if (dismissed) return null;

    return (
        <div className="px-5 pt-4">
            <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] text-slate-800 shadow-xs">
                <span className="size-7 rounded-md bg-[#18181B] text-[#FFE600] inline-flex items-center justify-center shrink-0">
                    <CloudIcon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                    <span className="font-semibold text-slate-900">Warm these mailboxes in the TheBoredMonkey pool.</span>{" "}
                    <span className="text-slate-600">Thousands of real mailboxes, replies and spam rescue handled for you. Free for up to 10 mailboxes; everything else stays on this server.</span>
                </span>
                <button
                    type="button"
                    onClick={onConnect}
                    className="shrink-0 h-7 px-2.5 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                    Connect
                </button>
                <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => {
                        localStorage.setItem(DISMISS_KEY, "1");
                        setDismissed(true);
                    }}
                    className="shrink-0 size-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                    <XIcon className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
