// New contact dialog — brae-density modal mirroring NewCampaignDialog.
//
// Required: email. Everything else optional. Submits via useAddContacts
// which posts an array (the endpoint is bulk-shaped); we send a single
// item.

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangleIcon, BanIcon, Loader2Icon, MailIcon, UserPlusIcon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import useAddContacts from "@/lib/api/hooks/app/contacts/useAddContacts";
import type { AddContact } from "@/components/app/AddContacts";
import { Label, TextInput } from "@/components/ui/field";
import type { AppError } from "@/lib/api/client/normalizeError";
import buildError from "@/lib/helper/buildError";
import CategoryPicker from "./CategoryPicker";

interface Props {
    open: boolean;
    onClose: () => void;
    // When set (the campaign Leads tab), the new lead is added straight into
    // this campaign.
    campaign?: { id: string; name: string };
    // When set (a segment's member list), the contact is pinned into that
    // segment, so it shows up where it was created even if the segment's
    // conditions don't match it.
    segment?: { id: string; name: string };
}

export function NewContactDialog({ open, onClose, campaign, segment }: Props) {
    const [email, setEmail] = React.useState("");
    const [firstName, setFirstName] = React.useState("");
    const [lastName, setLastName] = React.useState("");
    const [company, setCompany] = React.useState("");
    const [phone, setPhone] = React.useState("");
    const [categories, setCategories] = React.useState<string[]>([]);
    const [duplicateContact, setDuplicateContact] = React.useState<any | null>(null);
    const [quarantineAlert, setQuarantineAlert] = React.useState<any | null>(null);
    const [checking, setChecking] = React.useState(false);
    const add = useAddContacts();

    React.useEffect(() => {
        if (!open) {
            setEmail("");
            setFirstName("");
            setLastName("");
            setCompany("");
            setPhone("");
            setCategories([]);
            setDuplicateContact(null);
            setQuarantineAlert(null);
            setChecking(false);
        }
    }, [open]);

    function isValidEmail(s: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    }

    async function submit() {
        const e = email.trim();
        if (!isValidEmail(e)) {
            toast.error("Enter a valid email");
            return;
        }

        setDuplicateContact(null);
        setQuarantineAlert(null);
        setChecking(true);

        try {
            const checkRes = await fetch("/api/intelligence/check-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: e }),
            });
            const checkData = await checkRes.json();
            setChecking(false);

            if (checkData.isQuarantined) {
                setQuarantineAlert(checkData);
                return;
            }

            if (checkData.isDuplicate) {
                setDuplicateContact(checkData.existingContact);
                return;
            }
        } catch {
            setChecking(false);
        }

        const contact: AddContact = {
            email: e,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            company: company.trim(),
            phone: phone.trim(),
            campaigns: campaign ? [campaign.id] : [],
            categories,
            segments: segment ? [segment.id] : undefined,
            custom_fields: {},
            source: campaign ? "campaign" : "manual",
        };
        try {
            await toast.promise(add.mutateAsync([contact]), {
                loading: "Adding contact…",
                success: segment ? `Contact added to ${segment.name}` : "Contact added",
                error: (err: AppError) => buildError(err),
            });
            onClose();
        } catch {
            /* toast.promise already surfaced */
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px] px-4"
                >
                    <motion.div
                        key="card"
                        initial={{ y: 8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 8, opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[460px] rounded-lg bg-white border border-slate-200 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18),0_8px_16px_-8px_rgba(15,23,42,0.1)] overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]"
                    >
                        <div className="h-12 px-4 border-b border-slate-200 flex items-center gap-2.5 shrink-0">
                            <div className="size-5 rounded bg-slate-100 text-slate-600 flex items-center justify-center">
                                <UserPlusIcon className="w-3 h-3" />
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-medium">
                                New
                            </span>
                            <div className="h-4 w-px bg-slate-200" />
                            <span className="text-[12.5px] text-slate-900 font-medium">
                                Contact
                            </span>
                            {segment && (
                                <span className="hidden sm:inline-flex items-center h-5 px-1.5 rounded bg-sky-50 text-sky-700 text-[10px] font-medium max-w-[160px] truncate">
                                    {segment.name}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className="ml-auto size-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
                            >
                                <XIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {duplicateContact && (
                            <div className="px-4 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                                <div className="rounded-lg border border-amber-300 bg-amber-50/95 p-3.5 text-xs text-amber-950 space-y-2.5">
                                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-[12.5px]">
                                        <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
                                        <span>Contact Already Stored in Database</span>
                                    </div>
                                    <p className="text-amber-800 leading-relaxed text-[11.5px]">
                                        We already have <strong>{duplicateContact.email}</strong> saved in your system.
                                    </p>
                                    <div className="rounded-md bg-white/90 p-2.5 border border-amber-200 text-[11px] space-y-1.5 shadow-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-medium">Name:</span>
                                            <span className="font-semibold text-slate-800">{duplicateContact.name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-medium">Outreach State:</span>
                                            <span className="font-semibold text-amber-800 uppercase">{duplicateContact.outreachState || "Active"}</span>
                                        </div>
                                        {duplicateContact.daysSinceLastContact !== undefined && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 font-medium">Last Contacted:</span>
                                                <span className="text-slate-700">{duplicateContact.daysSinceLastContact} days ago</span>
                                            </div>
                                        )}
                                        {duplicateContact.lastSubject && (
                                            <div className="pt-1 border-t border-slate-100">
                                                <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Last Subject:</span>
                                                <span className="text-slate-800 font-medium italic">&ldquo;{duplicateContact.lastSubject}&rdquo;</span>
                                            </div>
                                        )}
                                        {duplicateContact.lastMessage && (
                                            <div className="pt-1.5 border-t border-slate-100 space-y-1">
                                                <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider flex items-center gap-1">
                                                    <MailIcon className="w-3 h-3 text-amber-600" /> Last Conversation Message:
                                                </span>
                                                <div className="p-2 rounded bg-amber-50/80 border border-amber-200/70 text-slate-700 text-[11px] italic leading-relaxed">
                                                    &ldquo;{duplicateContact.lastMessage}&rdquo;
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-amber-700 font-medium">
                                        Duplicate prevention safeguards your sending reputation and prevents duplicate messaging across your team.
                                    </p>
                                </div>
                            </div>
                        )}

                        {quarantineAlert && (
                            <div className="px-4 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                                <div className="rounded-lg border border-rose-300 bg-rose-50/95 p-3.5 text-xs text-rose-950 space-y-2.5">
                                    <div className="flex items-center gap-1.5 font-semibold text-rose-800 text-[12.5px]">
                                        <BanIcon className="w-4 h-4 text-rose-600 shrink-0" />
                                        <span>Quarantine Alert: Suppressed Address</span>
                                    </div>
                                    <p className="text-rose-800 leading-relaxed text-[11.5px]">
                                        {quarantineAlert.error || `The address ${email} is permanently suppressed.`}
                                    </p>
                                    <div className="rounded-md bg-white/90 p-2 border border-rose-200 text-[11px] flex items-center justify-between">
                                        <span className="text-slate-500 font-medium">Suppression Reason:</span>
                                        <span className="font-semibold text-rose-700 uppercase">{quarantineAlert.reason || "BOUNCE / SPAM"}</span>
                                    </div>
                                    <p className="text-[10px] text-rose-700 font-medium">
                                        Sending to bounced or spam-reporting addresses is blocked to protect domain deliverability.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!duplicateContact && !quarantineAlert && (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    submit();
                                }}
                                className="px-4 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto"
                            >
                                <div>
                                    <Label>Email</Label>
                                    <TextInput
                                        value={email}
                                        onChange={setEmail}
                                        placeholder="name@company.com"
                                        type="email"
                                        autoFocus
                                        className="w-full"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label>First name</Label>
                                        <TextInput value={firstName} onChange={setFirstName} className="w-full" />
                                    </div>
                                    <div>
                                        <Label>Last name</Label>
                                        <TextInput value={lastName} onChange={setLastName} className="w-full" />
                                    </div>
                                </div>
                                <div>
                                    <Label>Company</Label>
                                    <TextInput value={company} onChange={setCompany} className="w-full" />
                                </div>
                                <div>
                                    <Label>Phone</Label>
                                    <TextInput value={phone} onChange={setPhone} className="w-full" />
                                </div>
                                <div>
                                    <Label>Categories</Label>
                                    <CategoryPicker value={categories} onChange={setCategories} />
                                </div>
                            </form>
                        )}

                        <div className="px-3 h-12 border-t border-slate-200 flex items-center gap-1.5 shrink-0">
                            {duplicateContact || quarantineAlert ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDuplicateContact(null);
                                        setQuarantineAlert(null);
                                        onClose();
                                    }}
                                    className="ml-auto h-7 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
                                >
                                    Acknowledge & Close
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="ml-auto h-7 px-2.5 rounded-md text-[12px] text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submit}
                                        disabled={add.isPending || checking}
                                        className="h-7 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                                    >
                                        {(add.isPending || checking) && <Loader2Icon className="w-3 h-3 animate-spin" />}
                                        Add
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
