import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    MailIcon,
    PlusIcon,
    Trash2Icon,
    SaveIcon,
    CheckCircle2Icon,
    AlertCircleIcon,
    ClockIcon,
    SparklesIcon,
    SendIcon,
    LayersIcon,
    ExternalLinkIcon,
    RotateCcwIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { RichEmailEditor } from "@/components/app/campaigns/RichEmailEditor";
import { NumberInput } from "@/components/ui/field";
import PermissionButton from "@/components/ui/PermissionButton";
import useSequences from "@/lib/api/hooks/app/campaigns/sequences/useSequences";
import useSaveCampaignSteps from "@/lib/api/hooks/app/campaigns/sequences/useSaveCampaignSteps";
import type Campaign from "@/lib/api/models/app/campaigns/Campaign";
import { cn } from "@/lib/utils";

interface CampaignTemplateEditorProps {
    campaign: Campaign;
    onSwitchToFlow?: () => void;
    showFlowToggle?: boolean;
}

interface StepItem {
    id: string;
    stepNumber: number;
    name: string;
    subject: string;
    body_plain: string;
    body_html: string;
    wait_after: number;
}

export default function CampaignTemplateEditor({
    campaign,
    onSwitchToFlow,
    showFlowToggle = false,
}: CampaignTemplateEditorProps) {
    const { data: remoteSequences, isLoading } = useSequences(campaign.id);
    const saveStepsMutation = useSaveCampaignSteps(campaign.id);

    // Initial steps state seeded from remote sequences or campaign.steps / sequences
    const initialSteps = useMemo<StepItem[]>(() => {
        const source = (remoteSequences && remoteSequences.length > 0)
            ? remoteSequences
            : ((campaign as any).steps && (campaign as any).steps.length > 0)
                ? (campaign as any).steps
                : ((campaign as any).sequences && (campaign as any).sequences.length > 0)
                    ? (campaign as any).sequences
                    : [];

        if (source.length === 0) {
            // Default 1 step draft if campaign has no steps
            return [
                {
                    id: `stp_${Date.now()}_1`,
                    stepNumber: 1,
                    name: "First email",
                    subject: "Quick question regarding {{company}}",
                    body_plain: "Hi {{firstName}},\n\nNoticed {{company}} is expanding outreach.\n\nWould you be open to a quick 5-min intro?\n\nBest,\nHaji",
                    body_html: "<p>Hi {{firstName}},</p><p>Noticed {{company}} is expanding outreach.</p><p>Would you be open to a quick 5-min intro?</p><p>Best,<br/>Haji</p>",
                    wait_after: 0,
                },
            ];
        }

        return source.map((s: any, idx: number) => {
            const rawHtml = s.body_html || s.email_body || s.bodyTemplate || s.body || "";
            const rawPlain = s.body_plain || (rawHtml ? rawHtml.replace(/<[^>]+>/g, "") : "");
            const html = rawHtml || (rawPlain ? `<div>${rawPlain.replace(/\n/g, "<br/>")}</div>` : "");
            return {
                id: s.id || `stp_${Date.now()}_${idx + 1}`,
                stepNumber: s.stepNumber || idx + 1,
                name: s.name || (idx === 0 ? "First email" : `Follow-up ${idx}`),
                subject: s.subject || "",
                body_plain: rawPlain,
                body_html: html,
                wait_after: s.wait_after !== undefined ? s.wait_after : (idx === 0 ? 0 : 3),
            };
        });
    }, [remoteSequences, (campaign as any).steps, (campaign as any).sequences]);

    const [steps, setSteps] = useState<StepItem[]>(initialSteps);
    const [initialSnapshot, setInitialSnapshot] = useState<string>(JSON.stringify(initialSteps));
    const [hasUserEdited, setHasUserEdited] = useState(false);
    const [saving, setSaving] = useState(false);

    // Sync remote data into local state as long as user hasn't made unsaved manual edits
    useEffect(() => {
        if (!hasUserEdited && initialSteps.length > 0) {
            setSteps(initialSteps);
            setInitialSnapshot(JSON.stringify(initialSteps));
        }
    }, [initialSteps, hasUserEdited]);

    const isDirty = useMemo(() => {
        return JSON.stringify(steps) !== initialSnapshot;
    }, [steps, initialSnapshot]);

    const updateStep = (index: number, patch: Partial<StepItem>) => {
        setHasUserEdited(true);
        setSteps((prev) =>
            prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step))
        );
    };

    const addFollowUpStep = () => {
        setHasUserEdited(true);
        const nextNum = steps.length + 1;
        const newStep: StepItem = {
            id: `stp_${Date.now()}_${nextNum}`,
            stepNumber: nextNum,
            name: `Follow-up ${nextNum - 1}`,
            subject: "", // follow-ups thread on same subject
            body_plain: "Hi {{firstName}},\n\nJust bumping this up in case it slipped past.\n\nBest,\nHaji",
            body_html: "<p>Hi {{firstName}},</p><p>Just bumping this up in case it slipped past.</p><p>Best,<br/>Haji</p>",
            wait_after: 3,
        };
        setSteps((prev) => [...prev, newStep]);
        toast.success(`Follow-up ${nextNum - 1} added!`);
    };

    const removeStep = (index: number) => {
        if (steps.length <= 1) {
            toast.error("Campaign must have at least one email template step.");
            return;
        }
        setHasUserEdited(true);
        setSteps((prev) => {
            const filtered = prev.filter((_, idx) => idx !== index);
            return filtered.map((s, idx) => ({
                ...s,
                stepNumber: idx + 1,
                name: idx === 0 ? "First email" : `Follow-up ${idx}`,
                wait_after: idx === 0 ? 0 : (s.wait_after || 3),
            }));
        });
        toast("Step removed.");
    };

    const handleSave = async () => {
        if (saving) return;

        // Validation: First email needs a subject
        if (steps.length > 0 && !steps[0].subject.trim()) {
            toast.error("Please provide a subject line for the first email.");
            return;
        }

        setSaving(true);
        try {
            await saveStepsMutation.mutateAsync(steps);
            setHasUserEdited(false);
            setInitialSnapshot(JSON.stringify(steps));
            toast.success("Email templates updated & synced with Smartlead successfully!");
        } catch (err: any) {
            console.error("Failed to save steps:", err);
            toast.error(err?.message || "Failed to save email templates.");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setHasUserEdited(false);
        setSteps(JSON.parse(initialSnapshot));
        toast("Changes discarded.");
    };

    // Keyboard shortcut for Cmd/Ctrl+S
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleSave]);

    if (isLoading && steps.length === 0) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto py-8">
                <div className="h-8 w-64 bg-slate-100 rounded-md animate-pulse" />
                <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {/* Top Header Card */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="size-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-medium">
                            <MailIcon className="w-4 h-4" />
                        </div>
                        <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                            Email Sequence Templates
                        </h2>
                        {isDirty ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <AlertCircleIcon className="w-3 h-3" /> Unsaved changes
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2Icon className="w-3 h-3" /> All changes synced
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500 leading-relaxed max-w-2xl">
                        Edit the email templates and follow-ups for <strong>{campaign.name}</strong>. Variables like{" "}
                        <code className="px-1.5 py-0.5 rounded bg-slate-100 text-sky-700 font-mono text-[11px] font-medium">{"{{firstName}}"}</code>{" "}
                        and{" "}
                        <code className="px-1.5 py-0.5 rounded bg-slate-100 text-sky-700 font-mono text-[11px] font-medium">{"{{company}}"}</code>{" "}
                        will be automatically filled from enrolled leads.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {showFlowToggle && onSwitchToFlow && (
                        <button
                            type="button"
                            onClick={onSwitchToFlow}
                            className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors bg-white hover:bg-slate-50 shadow-2xs"
                        >
                            <LayersIcon className="w-3.5 h-3.5 text-slate-500" />
                            Flow Canvas
                        </button>
                    )}

                    <PermissionButton
                        permission="MANAGE_CAMPAIGNS"
                        type="button"
                        onClick={addFollowUpStep}
                        className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors bg-white hover:bg-slate-50 shadow-2xs"
                    >
                        <PlusIcon className="w-3.5 h-3.5 text-sky-600" />
                        Add Follow-up
                    </PermissionButton>

                    <PermissionButton
                        permission="MANAGE_CAMPAIGNS"
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !isDirty}
                        className={cn(
                            "h-8 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 transition-all shadow-xs",
                            isDirty
                                ? "bg-sky-600 hover:bg-sky-700 text-white ring-2 ring-sky-300/50"
                                : "bg-slate-100 text-slate-400 cursor-default"
                        )}
                    >
                        {saving ? (
                            <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                className="inline-block"
                            >
                                <SaveIcon className="w-3.5 h-3.5" />
                            </motion.span>
                        ) : (
                            <SaveIcon className="w-3.5 h-3.5" />
                        )}
                        {saving ? "Saving…" : "Save Changes"}
                    </PermissionButton>
                </div>
            </div>

            {/* Email Steps List */}
            <div className="space-y-6">
                <AnimatePresence initial={false}>
                    {steps.map((seq, i) => (
                        <motion.div
                            key={seq.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 transition-colors"
                        >
                            {/* Card Header Bar */}
                            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <span className="size-6 rounded-full bg-white ring-1 ring-inset ring-slate-300/80 text-[11px] font-bold text-slate-700 inline-flex items-center justify-center tabular-nums shadow-2xs">
                                        {i + 1}
                                    </span>
                                    <div>
                                        <span className="text-[13px] text-slate-900 font-semibold">
                                            {i === 0 ? "First Email (Initial Send)" : `Follow-up ${i}`}
                                        </span>
                                        <span className="text-[11.5px] text-slate-500 ml-2 hidden sm:inline">
                                            {i === 0 ? "• Dispatched immediately when queue is active" : "• Sent as a reply in the same email thread"}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5 ml-auto">
                                    {i > 0 && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[12px] shadow-2xs">
                                            <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-slate-500">Wait</span>
                                            <NumberInput
                                                value={seq.wait_after}
                                                min={1}
                                                max={60}
                                                onChange={(v) => updateStep(i, { wait_after: v })}
                                                className="w-14 h-6 text-center text-[12px]"
                                            />
                                            <span className="text-slate-600 font-medium">
                                                day{seq.wait_after === 1 ? "" : "s"} if no reply
                                            </span>
                                        </div>
                                    )}

                                    {i > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => removeStep(i)}
                                            aria-label="Remove follow-up"
                                            title="Delete this follow-up step"
                                            className="size-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors"
                                        >
                                            <Trash2Icon className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Card Body - Rich Email Editor */}
                            <div className="p-4 sm:p-5">
                                <RichEmailEditor
                                    subject={seq.subject}
                                    onSubjectChange={(v) => updateStep(i, { subject: v })}
                                    bodyHtml={seq.body_html || ""}
                                    bodyPlain={seq.body_plain || ""}
                                    onBodyChange={(html, plain) =>
                                        updateStep(i, { body_html: html, body_plain: plain })
                                    }
                                    isFollowUp={i > 0}
                                    stepIndex={i}
                                    placeholder={
                                        i === 0
                                            ? "Hi {{firstName}},\n\nNoticed {{company}} is ..."
                                            : "Just following up on my previous email..."
                                    }
                                />
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Add Step Dashed Button */}
                <button
                    type="button"
                    onClick={addFollowUpStep}
                    className="w-full py-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 text-slate-500 hover:text-sky-700 text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-all group"
                >
                    <div className="size-6 rounded-full bg-slate-100 group-hover:bg-sky-100 text-slate-500 group-hover:text-sky-600 inline-flex items-center justify-center transition-colors">
                        <PlusIcon className="w-3.5 h-3.5" />
                    </div>
                    Add another follow-up email step to sequence
                </button>
            </div>

            {/* Sticky Floating Save Bar when dirty */}
            <AnimatePresence>
                {isDirty && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900 text-white shadow-xl border border-slate-800"
                    >
                        <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[12.5px] font-medium text-slate-200">
                            You have unsaved email template changes
                        </span>
                        <div className="flex items-center gap-2 ml-2">
                            <button
                                type="button"
                                onClick={handleDiscard}
                                disabled={saving}
                                className="h-7 px-2.5 rounded-full text-slate-400 hover:text-white text-[11.5px] font-medium transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="h-7 px-3.5 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                            >
                                <SaveIcon className="w-3 h-3" />
                                {saving ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
