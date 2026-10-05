// Hosted free workspace, Accounts page: the two ways to get mailboxes
// warming (connect them here, or self-host and link the instance). Full
// panel when the list is empty, one strip once mailboxes exist.

import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRightIcon, CloudIcon, InboxIcon, PlusIcon, ServerIcon } from "lucide-react";
import useFeatureAccess from "@/hooks/useFeatureAccess";
import useAuthConfig from "@/lib/api/hooks/auth/useAuthConfig";
import { usePoolLinkInstances } from "@/lib/api/hooks/app/cloudlink/useCloudLink";

const SELF_HOST_DOCS = "https://docs.theboredmonkey.com/development/deployment-guide/";
const FREE_MAILBOXES = 10;

export default function CloudPathsPanel({ mailboxCount, onAdd }: { mailboxCount: number; onAdd: () => void }) {
    const authConfig = useAuthConfig();
    const access = useFeatureAccess();
    const hosted = authConfig.data?.self_hosted === false;
    const instances = usePoolLinkInstances(hosted);
    const linked = instances.data?.data.length ?? 0;
    const plan = instances.data?.plan;

    if (!hosted || access.loading) return null;
    const limit = plan?.mailbox_limit ?? (access.paid ? null : FREE_MAILBOXES);
    const used = plan?.enrolled ?? mailboxCount;

    if (mailboxCount === 0 && linked === 0) {
        return (
            <div className="px-5 py-6">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                    <div className="px-6 py-6 text-center border-b border-slate-200/70 bg-gradient-to-b from-[#FFF9DB]/40 to-white">
                        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#18181B] text-white text-[11px] font-medium shadow-xs">
                            <CloudIcon className="w-3 h-3 text-[#FFE600]" /> {limit === null ? "Unlimited mailboxes" : `${FREE_MAILBOXES} mailboxes free`}
                        </span>
                        <h2 className="mt-3 font-editorial text-[24px] font-normal tracking-tight text-slate-950">Start warming your mailboxes</h2>
                        <p className="mt-1.5 text-[13px] text-slate-500 max-w-md mx-auto leading-relaxed">
                            Two ways in. Both are free, both warm in the same pool of real mailboxes.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/70">
                        <div className="px-6 py-5">
                            <span className="size-8 rounded-lg bg-[#18181B] text-[#FFE600] inline-flex items-center justify-center">
                                <InboxIcon className="w-4 h-4" />
                            </span>
                            <h3 className="mt-3 font-editorial text-[17px] font-normal text-slate-950">Connect a mailbox here</h3>
                            <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">
                                Gmail, Microsoft 365 or any SMTP/IMAP account. Warmup starts on its own, replies and spam rescue included.
                            </p>
                            <button
                                type="button"
                                onClick={onAdd}
                                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 text-[12.5px] font-semibold transition-colors shadow-xs cursor-pointer"
                            >
                                <PlusIcon className="w-3.5 h-3.5" /> Add account
                            </button>
                        </div>
                        <div className="px-6 py-5">
                            <span className="size-8 rounded-lg bg-slate-900 text-white inline-flex items-center justify-center">
                                <ServerIcon className="w-4 h-4" />
                            </span>
                            <h3 className="mt-3 font-editorial text-[17px] font-normal text-slate-950">Self-host for free, link your instance</h3>
                            <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">
                                Run TheBoredMonkey on your own server with unlimited mailboxes and campaigns, then connect it from its Settings so this workspace warms them.
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <a
                                    href={SELF_HOST_DOCS}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-900/80 hover:bg-slate-900 hover:text-white text-[12.5px] font-medium text-slate-900 transition-colors cursor-pointer"
                                >
                                    Self-host guide <ArrowRightIcon className="w-3.5 h-3.5" />
                                </a>
                                <Link to="/connect" className="text-[12.5px] font-medium text-slate-700 hover:text-slate-950 underline underline-offset-2 cursor-pointer">
                                    I have a code
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="px-5 pt-4">
            <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700 shadow-xs">
                <CloudIcon className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 leading-snug">
                    <span className="font-medium">
                        {limit === null ? `${used} mailboxes warming in the pool.` : `${used} of ${limit} free mailboxes used.`}
                    </span>{" "}
                    <span className="text-slate-500">
                        {linked > 0 ? `${linked} linked instance${linked === 1 ? "" : "s"}. ` : ""}
                        Self-host for free and link the instance to warm more.
                    </span>
                </span>
                <a href={SELF_HOST_DOCS} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2">
                    Self-host
                </a>
                <Link to="/app/settings/warmbly-cloud" className="shrink-0 text-[12px] font-medium text-slate-900 hover:text-black underline underline-offset-2 cursor-pointer underline underline-offset-2">
                    Linked instances
                </Link>
            </div>
        </div>
    );
}
