import React from "react";
import { CheckIcon, ClockIcon, DatabaseIcon, FileSpreadsheetIcon, Loader2Icon, MessageSquareIcon, PlusIcon, SearchIcon, ShieldAlertIcon, SkipForwardIcon, UploadCloudIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export interface ContactDraftItem {
    id?: string; email: string; first_name?: string; last_name?: string; company?: string; role?: string;
    source: "database" | "csv" | "manual";
}
interface NormalizedContact {
    id: string; email: string; first_name: string; last_name: string; company: string; role: string;
    is_email_handler?: boolean; outreach_state?: string; days_since_last_contact?: number | null;
    last_subject?: string; last_body_hook?: string; last_campaign?: string;
}
interface HistoryWarning {
    email: string; name: string; outreachState: string | null; daysSinceLastContact: number | null;
    lastSubject: string | null; lastMessage: string | null; quarantined?: boolean; quarantineReason?: string;
    lastCampaign?: string | null; campaigns?: string[];
}
interface ContactsStepProps { selectedContacts: ContactDraftItem[]; onChangeSelected: (c: ContactDraftItem[]) => void; }

const SM: Record<string, { label: string; color: string; bg: string }> = {
    DORMANT_REPLIED:   { label: "Replied (Dormant)",   color: "#059669", bg: "#d1fae5" },
    WARM_STALE:        { label: "Warm - Stale",        color: "#d97706", bg: "#fef3c7" },
    COLD_REENGAGEMENT: { label: "Cold - Re-engage",    color: "#7c3aed", bg: "#ede9fe" },
    BURNED:            { label: "Burned / Suppressed", color: "#dc2626", bg: "#fee2e2" },
    NEVER_REACHED:     { label: "Never Reached",       color: "#6b7280", bg: "#f3f4f6" },
    NEVER_CONTACTED:   { label: "Never Contacted",     color: "#6b7280", bg: "#f3f4f6" },
};
function OBadge({ state }: { state: string | null }) {
    const m = SM[state || ""] || { label: state || "Unknown", color: "#6b7280", bg: "#f3f4f6" };
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

export function ContactsStep({ selectedContacts, onChangeSelected }: ContactsStepProps) {
    const [subTab, setSubTab] = React.useState<"database" | "csv" | "manual">("database");
    const [dbContacts, setDbContacts] = React.useState<NormalizedContact[]>([]);
    const [dbTotal, setDbTotal] = React.useState(0);
    const [dbPage, setDbPage] = React.useState(1);
    const [dbLoading, setDbLoading] = React.useState(false);
    const [dbHasMore, setDbHasMore] = React.useState(false);
    const [dbSearch, setDbSearch] = React.useState("");
    const [dbOutreachFilter, setDbOutreachFilter] = React.useState("all");
    const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchDb = React.useCallback(async (search: string, state: string, page: number, append = false) => {
        setDbLoading(true);
        try {
            const p = new URLSearchParams({ limit: "50", page: String(page) });
            if (search.trim()) p.set("query", search.trim());
            if (state && state !== "all") p.set("outreach_state", state);
            const r = await fetch(`/api/intelligence/contacts?${p.toString()}`);
            if (!r.ok) throw new Error();
            const j = await r.json();
            const mapped: NormalizedContact[] = (j.data || []).map((c: any) => ({
                id: c.id, email: c.email, first_name: c.first_name || "", last_name: c.last_name || "",
                company: c.company || "", role: (c.custom_fields as any)?.role || (c.custom_fields as any)?.title || "",
                is_email_handler: c.is_email_handler, outreach_state: c.temporal_state?.outreach_state,
                days_since_last_contact: c.temporal_state?.days_since_last_contact,
                last_subject: c.last_message_context?.subject, last_body_hook: c.last_message_context?.body_hook,
                last_campaign: c.last_message_context?.campaign,
            }));
            setDbContacts(prev => append ? [...prev, ...mapped] : mapped);
            setDbTotal(j.total || 0); setDbHasMore(j.pagination?.has_more || false);
        } catch { toast.error("Could not load contacts"); } finally { setDbLoading(false); }
    }, []);

    React.useEffect(() => { fetchDb("", "all", 1, false); }, [fetchDb]);
    React.useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setDbPage(1); fetchDb(dbSearch, dbOutreachFilter, 1, false); }, 350);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [dbSearch, dbOutreachFilter, fetchDb]);

    const loadMore = () => { const n = dbPage + 1; setDbPage(n); fetchDb(dbSearch, dbOutreachFilter, n, true); };
    const isSel = (email: string) => selectedContacts.some(s => s.email.toLowerCase() === email.toLowerCase());

    const [historyWarnings, setHistoryWarnings] = React.useState<HistoryWarning[]>([]);
    const [pendingContacts, setPendingContacts] = React.useState<ContactDraftItem[]>([]);
    const [showWarn, setShowWarn] = React.useState(false);
    const [checking, setChecking] = React.useState(false);
    const [ignoredEmails, setIgnoredEmails] = React.useState<Set<string>>(new Set());

    const batchCheck = React.useCallback(async (toAdd: ContactDraftItem[]) => {
        if (!toAdd.length) return;
        setChecking(true);
        try {
            const r = await fetch("/api/intelligence/check-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails: toAdd.map(c => c.email) }) });
            if (!r.ok) throw new Error();
            const j = await r.json();
            const dupes: HistoryWarning[] = (j.duplicates || []).map((d: any) => ({
                email: d.email,
                name: d.name,
                outreachState: d.outreachState,
                daysSinceLastContact: d.daysSinceLastContact,
                lastSubject: d.lastSubject,
                lastMessage: d.lastMessage,
                lastCampaign: d.lastCampaign,
                campaigns: d.campaigns || [],
                quarantined: false
            }));
            const quar: HistoryWarning[] = (j.quarantined || []).map((q: any) => ({
                email: q.email,
                name: q.name || q.email,
                outreachState: "BURNED",
                daysSinceLastContact: null,
                lastSubject: null,
                lastMessage: null,
                lastCampaign: null,
                campaigns: [],
                quarantined: true,
                quarantineReason: q.reason
            }));
            const all = [...dupes, ...quar];
            if (all.length > 0) {
                setHistoryWarnings(all);
                setPendingContacts(toAdd);
                // Pre-ignore quarantined leads by default to safeguard sender deliverability
                const preIgnored = new Set<string>(quar.map(q => q.email.toLowerCase()));
                setIgnoredEmails(preIgnored);
                setShowWarn(true);
            } else {
                onChangeSelected([...selectedContacts, ...toAdd]);
                toast.success(`Added ${toAdd.length} contact${toAdd.length !== 1 ? "s" : ""}`);
            }
        } catch {
            onChangeSelected([...selectedContacts, ...toAdd]);
            toast.success(`Added ${toAdd.length} contact${toAdd.length !== 1 ? "s" : ""}`);
        }
        finally { setChecking(false); }
    }, [selectedContacts, onChangeSelected]);

    const toggleIgnore = (email: string) => setIgnoredEmails(prev => { const n = new Set(prev); if (n.has(email)) n.delete(email); else n.add(email); return n; });
    const skipAllFlagged = () => {
        setIgnoredEmails(new Set(historyWarnings.map(w => w.email.toLowerCase())));
        toast("All flagged contacts skipped");
    };
    const selectAllFlagged = () => {
        setIgnoredEmails(new Set());
        toast.success("All flagged contacts selected");
    };
    const confirmWarn = () => {
        const kept = pendingContacts.filter(c => !ignoredEmails.has(c.email.toLowerCase()));
        onChangeSelected([...selectedContacts, ...kept]);
        const sk = pendingContacts.length - kept.length;
        if (kept.length) toast.success(`Added ${kept.length}${sk ? `, skipped ${sk}` : ""}`); else toast(`Skipped ${sk}`);
        setShowWarn(false); setHistoryWarnings([]); setPendingContacts([]); setIgnoredEmails(new Set());
    };
    const cancelWarn = () => { setShowWarn(false); setHistoryWarnings([]); setPendingContacts([]); setIgnoredEmails(new Set()); };

    const toggleDb = async (c: NormalizedContact) => {
        if (isSel(c.email)) { onChangeSelected(selectedContacts.filter(s => s.email.toLowerCase() !== c.email.toLowerCase())); return; }
        await batchCheck([{ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, company: c.company, role: c.role, source: "database" }]);
    };
    const toggleAll = () => {
        const allSel = dbContacts.length > 0 && dbContacts.every(c => isSel(c.email));
        if (allSel) { const v = new Set(dbContacts.map(c => c.email.toLowerCase())); onChangeSelected(selectedContacts.filter(s => !v.has(s.email.toLowerCase()))); }
        else { const ex = new Set(selectedContacts.map(s => s.email.toLowerCase())); batchCheck(dbContacts.filter(c => !ex.has(c.email.toLowerCase())).map(c => ({ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, company: c.company, role: c.role, source: "database" as const }))); }
    };

    const [csvFile, setCsvFile] = React.useState<File | null>(null);
    const [csvRows, setCsvRows] = React.useState<Array<{ email: string; first_name?: string; last_name?: string; company?: string; role?: string }>>([]);
    const [csvError, setCsvError] = React.useState("");
    const parseCsv = (text: string) => {
        try {
            const lines = text.split(/\r\n|\n/).filter(l => l.trim());
            if (lines.length < 2) { setCsvError("CSV must have a header and at least one contact."); return []; }
            const hdrs = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
            const eIdx = hdrs.findIndex(h => h.includes("email") || h.includes("mail"));
            if (eIdx === -1) { setCsvError("No email column found."); return []; }
            const fnIdx = hdrs.findIndex(h => h.includes("first") || h === "name");
            const lnIdx = hdrs.findIndex(h => h.includes("last"));
            const coIdx = hdrs.findIndex(h => h.includes("company") || h.includes("org"));
            const rIdx = hdrs.findIndex(h => h.includes("role") || h.includes("title") || h.includes("position"));
            const parsed: typeof csvRows = [];
            for (let i = 1; i < lines.length; i++) {
                const vals: string[] = []; let inQ = false, cur = "";
                for (const ch of lines[i]) { if (ch === '"' || ch === "'") { inQ = !inQ; } else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; } else { cur += ch; } }
                vals.push(cur.trim());
                const email = (vals[eIdx] || "").replace(/^["']|["']$/g, "");
                if (email && email.includes("@")) parsed.push({ email, first_name: fnIdx !== -1 ? (vals[fnIdx] || "").replace(/^["']|["']$/g, "") : "", last_name: lnIdx !== -1 ? (vals[lnIdx] || "").replace(/^["']|["']$/g, "") : "", company: coIdx !== -1 ? (vals[coIdx] || "").replace(/^["']|["']$/g, "") : "", role: rIdx !== -1 ? (vals[rIdx] || "").replace(/^["']|["']$/g, "") : "" });
            }
            if (!parsed.length) { setCsvError("No valid emails found."); return []; }
            setCsvRows(parsed); setCsvError("");
            return parsed;
        } catch (e) { setCsvError(`Parse error: ${(e as Error).message}`); return []; }
    };
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setCsvFile(f);
        const r = new FileReader();
        r.onload = ev => {
            const parsed = parseCsv(ev.target?.result as string);
            if (parsed && parsed.length > 0) {
                const ex = new Set(selectedContacts.map(s => s.email.toLowerCase()));
                const toAdd = parsed.filter(row => !ex.has(row.email.toLowerCase())).map(row => ({
                    email: row.email,
                    first_name: row.first_name || "",
                    last_name: row.last_name || "",
                    company: row.company || "",
                    role: row.role || "",
                    source: "csv" as const,
                }));
                if (toAdd.length > 0) {
                    batchCheck(toAdd);
                }
            }
        };
        r.readAsText(f);
    };
    const importCsv = () => {
        if (!csvRows.length) return;
        const ex = new Set(selectedContacts.map(s => s.email.toLowerCase()));
        const toAdd = csvRows.filter(r => !ex.has(r.email.toLowerCase())).map(r => ({
            email: r.email,
            first_name: r.first_name || "",
            last_name: r.last_name || "",
            company: r.company || "",
            role: r.role || "",
            source: "csv" as const
        }));
        if (!toAdd.length) {
            toast("All contacts in CSV are already queued");
            return;
        }
        batchCheck(toAdd);
    };

    const [mEmail, setMEmail] = React.useState(""); const [mFirst, setMFirst] = React.useState(""); const [mLast, setMLast] = React.useState(""); const [mCo, setMCo] = React.useState(""); const [mRole, setMRole] = React.useState("");
    const addManual = async (e: React.FormEvent) => { e.preventDefault(); const em = mEmail.trim(); if (!em || !em.includes("@")) { toast.error("Valid email required"); return; } if (isSel(em)) { toast.error("Already queued"); return; } setMEmail(""); setMFirst(""); setMLast(""); setMCo(""); setMRole(""); await batchCheck([{ email: em, first_name: mFirst.trim(), last_name: mLast.trim(), company: mCo.trim(), role: mRole.trim(), source: "manual" }]); };

    const dbCnt = selectedContacts.filter(s => s.source === "database").length;
    const csvCnt = selectedContacts.filter(s => s.source === "csv").length;
    const manCnt = selectedContacts.filter(s => s.source === "manual").length;

    return (
        <div className="max-w-[640px] space-y-4">
            <div>
                <p className="text-[13.5px] text-slate-900 font-semibold">Who should receive this campaign?</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">Select contacts from your existing database, upload a CSV list, or add contacts manually.</p>
            </div>
            <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                {(["database","csv","manual"] as const).map(tab => {
                    const cnt = tab==="database"?dbCnt:tab==="csv"?csvCnt:manCnt;
                    const icon = tab==="database"?<DatabaseIcon className="w-3.5 h-3.5"/>:tab==="csv"?<FileSpreadsheetIcon className="w-3.5 h-3.5"/>:<UserPlusIcon className="w-3.5 h-3.5"/>;
                    const lbl = tab==="database"?"From Database":tab==="csv"?"Upload CSV":"Add Manually";
                    return <button key={tab} type="button" onClick={()=>setSubTab(tab)} className={cn("h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",subTab===tab?"bg-sky-50 text-sky-700 font-semibold":"text-slate-600 hover:bg-slate-100")}>{icon}{lbl}{cnt>0&&<span className="px-1.5 rounded-full text-[10px] bg-sky-600 text-white font-semibold">{cnt}</span>}</button>;
                })}
            </div>

            {showWarn ? (
                <div className="border-2 border-amber-300 rounded-xl bg-white overflow-hidden shadow-sm transition-all">
                    {/* Highlight Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-amber-100/90 via-amber-50 to-white border-b border-amber-200/80 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-300/80 flex items-center justify-center shrink-0">
                                <ShieldAlertIcon className="w-4 h-4 text-amber-700"/>
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[13px] font-bold text-amber-950">Prior Outreach Detected</span>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-200/70 text-amber-900 border border-amber-300/80">
                                        {historyWarnings.length} of {pendingContacts.length} have history
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={selectAllFlagged}
                                className="h-6 px-2.5 rounded text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors shadow-xs"
                            >
                                Select All
                            </button>
                            <button
                                type="button"
                                onClick={skipAllFlagged}
                                className="h-6 px-2.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer transition-colors shadow-xs"
                            >
                                Skip All Flagged ({historyWarnings.length})
                            </button>
                            <button type="button" onClick={cancelWarn} className="text-amber-700 hover:text-amber-950 p-1 cursor-pointer ml-1">
                                <XIcon className="w-4 h-4"/>
                            </button>
                        </div>
                    </div>

                    <p className="px-4 py-2 bg-amber-50/40 text-[11.5px] text-amber-900/90 border-b border-amber-100">
                        Review prior history and campaign touches below. Use <strong>Select ✓</strong> to include or <strong>Ignore ✗</strong> to skip, or click <strong>Skip All Flagged</strong> to exclude them all at once.
                    </p>

                    {/* Scrollable contact cards */}
                    <div className="px-4 py-3 space-y-2.5 max-h-[300px] overflow-y-auto bg-slate-50/40">
                        {historyWarnings.map(w => {
                            const ig = ignoredEmails.has(w.email.toLowerCase());
                            return (
                                <div
                                    key={w.email}
                                    className={cn(
                                        "rounded-lg border p-3 transition-all",
                                        ig
                                            ? "bg-slate-50 border-slate-200 opacity-55 border-l-4 border-l-slate-300"
                                            : w.quarantined
                                            ? "bg-red-50/60 border-red-200 shadow-xs border-l-4 border-l-red-500"
                                            : "bg-white border-amber-200 shadow-xs border-l-4 border-l-amber-500"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[12px] font-semibold text-slate-900">{w.name}</span>
                                                <span className="text-[10.5px] text-slate-500 font-mono">{w.email}</span>
                                                {w.quarantined ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                                        🚫 Quarantined
                                                    </span>
                                                ) : (
                                                    <OBadge state={w.outreachState}/>
                                                )}
                                                {w.lastCampaign && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                                        Used in {w.lastCampaign}{w.campaigns && w.campaigns.length > 1 ? ` (+${w.campaigns.length - 1} more)` : ""}
                                                    </span>
                                                )}
                                            </div>
                                            {w.quarantined && w.quarantineReason && (
                                                <p className="mt-1 text-[11px] text-red-700 font-medium">
                                                    <strong>Suppression reason:</strong> {w.quarantineReason}
                                                </p>
                                            )}
                                            {!w.quarantined && (
                                                <div className="mt-1.5 space-y-1">
                                                    {w.daysSinceLastContact != null && (
                                                        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-600">
                                                            <ClockIcon className="w-3 h-3 shrink-0 text-amber-600"/>
                                                            <span>Last contacted <strong>{w.daysSinceLastContact} days ago</strong></span>
                                                        </div>
                                                    )}
                                                    {w.lastSubject && (
                                                        <div className="flex items-start gap-1.5 text-[10.5px] text-slate-700">
                                                            <MessageSquareIcon className="w-3 h-3 mt-0.5 shrink-0 text-sky-600"/>
                                                            <span><strong>Subject:</strong> {w.lastSubject}</span>
                                                        </div>
                                                    )}
                                                    {w.lastMessage && (
                                                        <p className="text-[11px] text-slate-600 pl-3 py-1 italic bg-amber-50/80 border-l-2 border-amber-400 rounded-r font-normal leading-snug">
                                                            "{w.lastMessage}"
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => { if (ig) toggleIgnore(w.email.toLowerCase()); }}
                                                className={cn(
                                                    "h-7 px-2.5 rounded text-[10.5px] font-semibold inline-flex items-center gap-1 border transition-all cursor-pointer",
                                                    !ig
                                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                                        : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                                                )}
                                            >
                                                <CheckIcon className="w-3 h-3"/>
                                                {!ig ? "Selected ✓" : "Select"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { if (!ig) toggleIgnore(w.email.toLowerCase()); }}
                                                className={cn(
                                                    "h-7 px-2.5 rounded text-[10.5px] font-semibold inline-flex items-center gap-1 border transition-all cursor-pointer",
                                                    ig
                                                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                                        : "bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:text-rose-700"
                                                )}
                                            >
                                                <XIcon className="w-3 h-3"/>
                                                {ig ? "Ignored ✗" : "Ignore"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {(() => {
                            const n = pendingContacts.filter(c => !historyWarnings.some(w => w.email.toLowerCase() === c.email.toLowerCase())).length;
                            return n > 0 ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2 text-[11.5px] text-emerald-800 font-medium flex items-center gap-2">
                                    ✅ <strong>{n}</strong> clean contact{n !== 1 ? "s" : ""} with no prior history — will be added automatically.
                                </div>
                            ) : null;
                        })()}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-amber-200 bg-amber-50/60 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[12px] font-semibold text-slate-900">
                                {pendingContacts.length - ignoredEmails.size} of {pendingContacts.length} contacts will be added
                            </p>
                            {ignoredEmails.size > 0 && (
                                <p className="text-[10.5px] text-rose-600 font-medium">
                                    {ignoredEmails.size} contact{ignoredEmails.size !== 1 ? "s" : ""} will be skipped
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={skipAllFlagged}
                                className="h-8 px-3 rounded-md border border-rose-200 bg-white hover:bg-rose-50 text-[11.5px] text-rose-700 font-medium cursor-pointer transition-colors"
                            >
                                Skip All Flagged
                            </button>
                            <button
                                type="button"
                                onClick={cancelWarn}
                                className="h-8 px-3 rounded-md border border-slate-200 bg-white text-[11.5px] text-slate-600 hover:bg-slate-50 font-medium cursor-pointer transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmWarn}
                                className="h-8 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                            >
                                <CheckIcon className="w-3.5 h-3.5"/>
                                Confirm and Add
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                {subTab==="database"&&(
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1"><SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400"/><input type="text" value={dbSearch} onChange={e=>setDbSearch(e.target.value)} placeholder="Search name, email, company..." className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/></div>
                            <select value={dbOutreachFilter} onChange={e=>setDbOutreachFilter(e.target.value)} className="h-8 px-2 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none"><option value="all">All States</option><option value="NEVER_REACHED">Never Reached</option><option value="DORMANT_REPLIED">Replied (Dormant)</option><option value="WARM_STALE">Warm - Stale</option><option value="COLD_REENGAGEMENT">Cold - Re-engage</option><option value="BURNED">Burned</option></select>
                            <button type="button" onClick={toggleAll} className="h-8 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50 text-[11.5px] text-slate-700 font-medium shrink-0">{dbContacts.every(c=>isSel(c.email))&&dbContacts.length>0?"Deselect All":`Select All (${dbContacts.length}${dbHasMore?"+":""})`}</button>
                        </div>
                        {dbTotal>0&&<p className="text-[11px] text-slate-400">{dbTotal.toLocaleString()} contacts in database</p>}
                        <div className="border border-slate-200 rounded-md overflow-hidden bg-white max-h-[260px] overflow-y-auto divide-y divide-slate-100">
                            {dbLoading&&!dbContacts.length?(<div className="py-8 flex items-center justify-center gap-2 text-[12px] text-slate-400"><Loader2Icon className="w-4 h-4 animate-spin"/>Loading contacts...</div>)
                            :!dbContacts.length?(<div className="py-8 text-center text-[12px] text-slate-400">No contacts matched.</div>)
                            :(<>{dbContacts.map(c=>{
                                const sel=isSel(c.email);
                                const hist=c.outreach_state&&c.outreach_state!=="NEVER_REACHED"&&c.outreach_state!=="NEVER_CONTACTED";
                                return(<div key={c.id} onClick={()=>toggleDb(c)} className={cn("px-3 py-2 flex items-start justify-between gap-3 cursor-pointer select-none transition-colors",sel?"bg-sky-50/50 hover:bg-sky-50":"hover:bg-slate-50")}>
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                        <input type="checkbox" checked={sel} onChange={()=>{}} className="mt-0.5 rounded border-slate-300 text-sky-600 cursor-pointer"/>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap"><p className="text-[12px] font-medium text-slate-900 truncate">{c.first_name||c.last_name?`${c.first_name} ${c.last_name}`.trim():c.email}</p>{hist&&<OBadge state={c.outreach_state!}/>}</div>
                                            <p className="text-[11px] text-slate-400 truncate">{c.email}{c.company&&!c.is_email_handler&&` · ${c.company}`}</p>
                                            {hist&&c.last_subject&&(<div className="mt-1 flex items-start gap-1 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1" onClick={e=>e.stopPropagation()}><ClockIcon className="w-3 h-3 mt-0.5 shrink-0 text-amber-500"/><span><strong>{c.days_since_last_contact!=null?`${c.days_since_last_contact}d ago`:"Prior"} · </strong>{c.last_campaign&&<em>{c.last_campaign} · </em>}{c.last_subject}</span></div>)}
                                        </div>
                                    </div>
                                    {c.role&&<span className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{c.role}</span>}
                                </div>);
                            })}{dbHasMore&&(<div className="px-3 py-2 bg-slate-50 border-t border-slate-100"><button type="button" onClick={e=>{e.stopPropagation();loadMore();}} disabled={dbLoading} className="w-full text-[11.5px] text-sky-600 hover:text-sky-700 font-medium flex items-center justify-center gap-1.5 py-0.5 disabled:opacity-50">{dbLoading&&<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>}Load more</button></div>)}</> )}
                        </div>
                    </div>
                )}

                {subTab==="csv"&&(
                    <div className="space-y-3">
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-sky-400 transition-colors bg-slate-50/50">
                            <UploadCloudIcon className="w-8 h-8 text-slate-400 mx-auto mb-2"/>
                            <label className="cursor-pointer"><span className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">Click to select CSV file</span><span className="text-[12px] text-slate-500"> or drag and drop</span><input type="file" accept=".csv" onChange={handleFile} className="hidden"/></label>
                            <p className="text-[11px] text-slate-400 mt-1">Columns auto-detected: email, first_name, last_name, company, role</p>
                        </div>
                        {csvError&&<p className="text-[11.5px] text-rose-600 font-medium">{csvError}</p>}
                        {csvRows.length>0&&(
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11.5px] text-slate-600">
                                    <span>Ready to import <strong>{csvRows.length} contacts</strong> from <code className="font-mono text-slate-800">{csvFile?.name}</code></span>
                                    <button type="button" onClick={importCsv} disabled={checking} className="h-7 px-3 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium inline-flex items-center gap-1 disabled:opacity-60">{checking?<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>:<CheckIcon className="w-3.5 h-3.5"/>}Import Contacts</button>
                                </div>
                                <div className="border border-slate-200 rounded-md overflow-hidden bg-white text-[11.5px]">
                                    <table className="w-full text-left"><thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200"><tr><th className="px-2.5 py-1.5">Email</th><th className="px-2.5 py-1.5">First Name</th><th className="px-2.5 py-1.5">Company</th><th className="px-2.5 py-1.5">Role</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">{csvRows.slice(0,4).map((r,i)=><tr key={i} className="hover:bg-slate-50/50"><td className="px-2.5 py-1 font-medium text-slate-900">{r.email}</td><td className="px-2.5 py-1 text-slate-600">{r.first_name||"-"}</td><td className="px-2.5 py-1 text-slate-600">{r.company||"-"}</td><td className="px-2.5 py-1 text-slate-600">{r.role||"-"}</td></tr>)}</tbody></table>
                                    {csvRows.length>4&&<div className="px-2.5 py-1 text-[10.5px] text-slate-400 bg-slate-50/40 border-t border-slate-100">+ {csvRows.length-4} more contacts in CSV</div>}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {subTab==="manual"&&(
                    <form onSubmit={addManual} className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-[11px] font-medium text-slate-700">Email Address *</label><input type="email" value={mEmail} onChange={e=>setMEmail(e.target.value)} placeholder="name@company.com" required className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">First Name</label><input type="text" value={mFirst} onChange={e=>setMFirst(e.target.value)} placeholder="e.g. Haji" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Last Name</label><input type="text" value={mLast} onChange={e=>setMLast(e.target.value)} placeholder="e.g. Karim" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Company</label><input type="text" value={mCo} onChange={e=>setMCo(e.target.value)} placeholder="e.g. TheBoredMonkey" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/></div>
                            <div className="col-span-2"><label className="text-[11px] font-medium text-slate-700">Role / Job Title</label><div className="flex items-center gap-2"><input type="text" value={mRole} onChange={e=>setMRole(e.target.value)} placeholder="e.g. Head of Growth" className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"/><button type="submit" disabled={checking} className="h-8 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60">{checking?<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>:<PlusIcon className="w-3.5 h-3.5"/>}Add Contact</button></div></div>
                        </div>
                    </form>
                )}
                </>
            )}

            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                    <UsersIcon className="w-4 h-4 text-sky-600"/>
                    <span className="font-semibold text-slate-900">{selectedContacts.length} Contact{selectedContacts.length===1?"":"s"} Queued:</span>
                    <span className="text-slate-500 text-[11px]">{dbCnt} from DB · {csvCnt} from CSV · {manCnt} Manual</span>
                </div>
                {selectedContacts.length>0&&<button type="button" onClick={()=>onChangeSelected([])} className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors">Clear all</button>}
            </div>
        </div>
    );
}
