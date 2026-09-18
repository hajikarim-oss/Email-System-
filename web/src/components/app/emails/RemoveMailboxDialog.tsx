import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangleIcon, Loader2Icon, Trash2Icon, XIcon, ShieldAlertIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import type Inbox from "@/lib/api/models/app/emails/Inbox";
import removeEmail from "@/lib/api/client/app/emails/removeEmail";
import patchEmailLists from "@/lib/api/hooks/app/emails/patchEmailLists";

interface RemoveMailboxDialogProps {
    open: boolean;
    mailbox: Inbox | null;
    onClose: () => void;
    onRemoved?: (mailboxId: string) => void;
}

export default function RemoveMailboxDialog({
    open,
    mailbox,
    onClose,
    onRemoved,
}: RemoveMailboxDialogProps) {
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);

    if (!mailbox) return null;

    const initials = mailbox.email.slice(0, 2).toUpperCase();

    const handleConfirmRemove = async () => {
        if (!mailbox || loading) return;
        setLoading(true);

        try {
            await removeEmail(mailbox.id);

            // Optimistically remove from React Query caches
            patchEmailLists(queryClient, (rows) => rows.filter((c) => c.id !== mailbox.id));
            await queryClient.invalidateQueries({ queryKey: ["emails"] });
            await queryClient.invalidateQueries({ queryKey: ["analytics", "accounts"] });

            toast.success(`Removed ${mailbox.email}`);
            onRemoved?.(mailbox.id);
            onClose();
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } }; message?: string };
            const msg = e?.response?.data?.message || e?.message || "Failed to remove mailbox";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
                        onClick={() => !loading && onClose()}
                    />

                    {/* Dialog Box */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.16 }}
                        role="alertdialog"
                        aria-modal="true"
                        className="relative w-full max-w-[460px] rounded-xl bg-white border border-slate-200 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22),0_8px_16px_-8px_rgba(15,23,42,0.1)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="h-14 px-5 border-b border-slate-100 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
                                <AlertTriangleIcon className="w-4 h-4 text-rose-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-semibold text-slate-900 leading-tight">
                                    Remove Mailbox
                                </div>
                                <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium text-slate-400 mt-0.5">
                                    Disconnect account confirmation
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !loading && onClose()}
                                disabled={loading}
                                aria-label="Close"
                                className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4">
                            {/* Mailbox Card */}
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200/80 bg-slate-50/60">
                                <div className="w-9 h-9 rounded-full bg-sky-100 border border-sky-200/60 flex items-center justify-center shrink-0">
                                    <span className="text-[11px] font-bold text-sky-700">
                                        {initials}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold text-slate-900 truncate">
                                        {mailbox.email}
                                    </div>
                                    <div className="text-[11px] text-slate-500 capitalize flex items-center gap-2 mt-0.5">
                                        <span>{mailbox.provider || "Google Workspace"}</span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span className="text-emerald-600 font-medium">Connected</span>
                                    </div>
                                </div>
                            </div>

                            {/* Warning Note */}
                            <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3.5 flex items-start gap-2.5">
                                <ShieldAlertIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-[12px] text-amber-900 leading-relaxed space-y-1">
                                    <p className="font-semibold text-amber-950">
                                        Are you sure you want to disconnect this mailbox?
                                    </p>
                                    <ul className="text-[11.5px] text-amber-800 list-disc list-inside space-y-0.5 pt-0.5">
                                        <li>Warmup network pairing will immediately stop.</li>
                                        <li>Active campaigns using this mailbox will pause dispatching from this address.</li>
                                        <li>Sent telemetry and reply logs will be preserved.</li>
                                    </ul>
                                </div>
                            </div>

                            <p className="text-[11.5px] text-slate-500 leading-normal">
                                You can reconnect this email account anytime from the <strong>Add account</strong> button.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="px-5 h-14 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !loading && onClose()}
                                disabled={loading}
                                className="h-8 px-3.5 rounded-md border border-slate-200 hover:border-slate-300 text-[12px] font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRemove}
                                disabled={loading}
                                className="h-8 px-4 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
                            >
                                {loading ? (
                                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Trash2Icon className="w-3.5 h-3.5" />
                                )}
                                <span>Remove Mailbox</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
