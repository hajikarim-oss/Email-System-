import React, { useState, useEffect } from "react";
import {
    PlusIcon,
    CopyIcon,
    TrashIcon,
    PencilIcon,
    SparklesIcon,
    FileTextIcon,
    CheckIcon,
    ExternalLinkIcon,
    Loader2Icon,
    XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { authHeaders } from "@/lib/api/standaloneMock";

interface CreatorTemplate {
    id: string;
    workspaceId: string;
    name: string;
    subject: string;
    bodyHtml: string;
    category: string;
    orderIndex: number;
}

const CREATOR_VARS = [
    { token: "{{.CreatorName}}", label: "Creator Name", sample: "Tanya Singh" },
    { token: "{{.Handle}}", label: "Handle", sample: "@itistanyasingh" },
    { token: "{{.Category}}", label: "Category", sample: "Skincare" },
    { token: "{{.Followers}}", label: "Followers", sample: "1M" },
    { token: "{{.Brand}}", label: "Brand", sample: "Hyphen" },
    { token: "{{.IntakeFormUrl}}", label: "1-Click Intake Link", sample: "https://tbmoutreach.tech/creator/intake/ed097..." },
];

export default function CreatorTemplatesPage() {
    const [templates, setTemplates] = useState<CreatorTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTemplate, setEditingTemplate] = useState<CreatorTemplate | null>(null);
    const [isNew, setIsNew] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [subject, setSubject] = useState("");
    const [bodyHtml, setBodyHtml] = useState("");
    const [category, setCategory] = useState("COLLABORATION");
    const [saving, setSaving] = useState(false);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/creators/templates", { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setTemplates(data || []);
            }
        } catch {
            toast.error("Failed to fetch templates");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const openEdit = (tpl: CreatorTemplate) => {
        setEditingTemplate(tpl);
        setIsNew(false);
        setName(tpl.name);
        setSubject(tpl.subject);
        setBodyHtml(tpl.bodyHtml);
        setCategory(tpl.category || "COLLABORATION");
    };

    const openNew = () => {
        setEditingTemplate({
            id: `tpl_${Date.now()}`,
            workspaceId: "org_troops_outreach",
            name: "New Creator Outreach Pitch",
            subject: "Collab Invitation: {{.Brand}} x {{.Handle}} 💛",
            bodyHtml: "<p>Hi {{.CreatorName}},</p><p>We loved your content on {{.Handle}}! Check details here: <a href=\"{{.IntakeFormUrl}}\">Lock your slot</a></p>",
            category: "COLLABORATION",
            orderIndex: templates.length,
        });
        setIsNew(true);
        setName("New Creator Outreach Pitch");
        setSubject("Collab Invitation: {{.Brand}} x {{.Handle}} 💛");
        setBodyHtml("<p>Hi {{.CreatorName}},</p><p>We loved your content on {{.Handle}}! Check details here: <a href=\"{{.IntakeFormUrl}}\">Lock your slot</a></p>");
        setCategory("COLLABORATION");
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                id: editingTemplate?.id,
                name,
                subject,
                bodyHtml,
                category,
            };

            const res = await fetch("/api/creators/templates", {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast.success(isNew ? "Template created!" : "Template updated!");
                setEditingTemplate(null);
                fetchTemplates();
            } else {
                throw new Error("Failed to save template");
            }
        } catch (err: any) {
            toast.error(err.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this creator template?")) return;
        try {
            const res = await fetch(`/api/creators/templates/${id}`, {
                method: "DELETE",
                headers: authHeaders(),
            });
            if (res.ok) {
                toast.success("Template deleted");
                fetchTemplates();
            }
        } catch {
            toast.error("Failed to delete template");
        }
    };

    const insertToken = (token: string) => {
        setBodyHtml((prev) => prev + ` ${token} `);
    };

    return (
        <div className="flex-1 flex flex-col p-6 max-w-5xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-zinc-800 pb-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Creator Email Templates</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FFE600] text-slate-900 font-semibold">
                            Troops Isolated
                        </span>
                    </h1>
                    <p className="text-xs text-slate-500 pt-0.5">
                        High-converting influencer outreach copy with dynamic 1-click intake merge tags.
                    </p>
                </div>

                <button
                    onClick={openNew}
                    className="h-8 px-3 rounded-md bg-[#18181B] dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>New Template</span>
                </button>
            </div>

            {/* Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((t) => (
                    <div
                        key={t.id}
                        className="p-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
                    >
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                    {t.category}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEdit(t)}
                                        className="size-7 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
                                        title="Edit template"
                                    >
                                        <PencilIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(t.id)}
                                        className="size-7 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                                        title="Delete template"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</h3>
                            <p className="text-xs text-slate-500 font-medium">Subject: {t.subject}</p>
                            <div
                                className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-3 bg-slate-50 dark:bg-zinc-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800"
                                dangerouslySetInnerHTML={{ __html: t.bodyHtml }}
                            />
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-400">
                            <span>Includes dynamic <code>&#123;&#123;.IntakeFormUrl&#125;&#125;</code></span>
                            <button
                                onClick={() => openEdit(t)}
                                className="font-semibold text-[#5E43EC] hover:underline cursor-pointer"
                            >
                                Customize Copy →
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit / Create Modal */}
            {editingTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                            <h2 className="font-bold text-base text-slate-900 dark:text-white">
                                {isNew ? "Create Creator Template" : "Edit Creator Template"}
                            </h2>
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="size-7 rounded-lg text-slate-400 hover:text-slate-800 flex items-center justify-center"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                                    Template Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-slate-900"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                                    Subject Line
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-slate-900 font-medium"
                                    required
                                />
                            </div>

                            {/* Creator Variable Tokens Toolbar */}
                            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
                                <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block">
                                    ⚡ Click to Insert Creator Merge Tokens:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {CREATOR_VARS.map((v) => (
                                        <button
                                            key={v.token}
                                            type="button"
                                            onClick={() => insertToken(v.token)}
                                            className="px-2 py-1 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-[11px] font-mono hover:bg-[#FFE600] hover:text-slate-900 hover:border-amber-400 transition-colors cursor-pointer"
                                            title={`Sample: ${v.sample}`}
                                        >
                                            {v.token} ({v.label})
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                                    Email Body HTML
                                </label>
                                <textarea
                                    rows={8}
                                    value={bodyHtml}
                                    onChange={(e) => setBodyHtml(e.target.value)}
                                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono focus:ring-1 focus:ring-slate-900 resize-none"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
                                <button
                                    type="button"
                                    onClick={() => setEditingTemplate(null)}
                                    className="h-8 px-3 rounded-md border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="h-8 px-4 rounded-md bg-[#18181B] dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                                >
                                    {saving ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                                    <span>Save Template</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

