import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, Loader2Icon, SparklesIcon, UsersIcon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import type MiniCampaign from "@/lib/api/models/app/campaigns/MiniCampaign";
import { ContactsStep, type ContactDraftItem } from "../campaigns/ContactsStep";
import useAddContacts from "@/lib/api/hooks/app/contacts/useAddContacts";
import type { AddContact } from "@/components/app/AddContacts";
import { cleanCompanyName } from "@/lib/api/standaloneMock";

interface Props {
    open: boolean;
    onClose: () => void;
    campaign: MiniCampaign;
}

export default function CampaignImportContactsModal({ open, onClose, campaign }: Props) {
    const [selectedContacts, setSelectedContacts] = React.useState<ContactDraftItem[]>([]);
    const [submitting, setSubmitting] = React.useState(false);
    const addContactsMutation = useAddContacts();
    const queryClient = useQueryClient();

    // Reset when modal opens
    React.useEffect(() => {
        if (open) {
            setSelectedContacts([]);
            setSubmitting(false);
        }
    }, [open]);

    const handleEnroll = async () => {
        if (!selectedContacts.length || submitting) return;
        setSubmitting(true);
        try {
            const toAdd: AddContact[] = selectedContacts.map((c) => {
                const cleanC = cleanCompanyName(c.company || "");
                return {
                    first_name: c.first_name || "",
                    last_name: c.last_name || "",
                    email: c.email,
                    company: cleanC,
                    phone: "",
                    campaigns: [campaign.id],
                    custom_fields: (c.role ? { role: c.role, company: cleanC } : { company: cleanC }) as Record<string, string>,
                    source: c.source === "database" ? ("campaign" as const) : ("manual" as const),
                };
            });

            await addContactsMutation.mutateAsync(toAdd);

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["contacts"] }),
                queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
                queryClient.invalidateQueries({ queryKey: ["campaigns", campaign.id] }),
                queryClient.invalidateQueries({ queryKey: ["analytics", "campaigns", campaign.id] }),
            ]);

            toast.success(`Enrolled ${toAdd.length.toLocaleString()} lead${toAdd.length === 1 ? "" : "s"} into ${campaign.name}`);
            onClose();
        } catch (err) {
            console.error("Failed to enroll leads into campaign:", err);
            toast.error("Failed to add leads to campaign. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onMouseDown={onClose}
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 backdrop-blur-[2px] px-4"
                >
                    <motion.div
                        key="card"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Import Contacts — ${campaign.name}`}
                        initial={{ y: 10, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 10, opacity: 0, scale: 0.985 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full max-w-[700px] rounded-xl bg-white border border-slate-200 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22),0_8px_16px_-8px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col max-h-[90dvh]"
                    >
                        {/* Header */}
                        <div className="h-13 px-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="size-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shrink-0">
                                    <UsersIcon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-bold text-slate-900 truncate">
                                            Import Contacts
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 truncate">
                                            → {campaign.name}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 truncate">
                                        Enroll leads from your database, a CSV file, or add manually
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className="size-7 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body housing the exact ContactsStep */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                            <ContactsStep
                                selectedContacts={selectedContacts}
                                onChangeSelected={setSelectedContacts}
                            />
                        </div>

                        {/* Footer */}
                        <div className="h-14 px-5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
                            <div className="text-[12px] text-slate-600">
                                {selectedContacts.length > 0 ? (
                                    <span className="font-medium text-slate-900">
                                        <strong>{selectedContacts.length.toLocaleString()}</strong> contact{selectedContacts.length === 1 ? "" : "s"} ready to enroll
                                    </span>
                                ) : (
                                    <span className="text-slate-400">No contacts selected yet</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="h-8 px-3.5 rounded-md border border-slate-200 bg-white text-[12px] text-slate-700 hover:bg-slate-50 font-medium cursor-pointer transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEnroll}
                                    disabled={submitting || selectedContacts.length === 0}
                                    className="h-8 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                                            Enrolling...
                                        </>
                                    ) : (
                                        <>
                                            <CheckIcon className="w-3.5 h-3.5" />
                                            Enroll {selectedContacts.length > 0 ? `${selectedContacts.length.toLocaleString()} Leads` : "Contacts"}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
