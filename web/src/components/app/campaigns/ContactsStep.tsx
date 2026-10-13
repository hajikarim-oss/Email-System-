import React from "react";
import { AlertCircleIcon, CheckIcon, ClockIcon, DatabaseIcon, FileSpreadsheetIcon, Loader2Icon, MessageSquareIcon, PlusIcon, RefreshCwIcon, SearchIcon, ShieldAlertIcon, SkipForwardIcon, SlidersHorizontalIcon, Trash2Icon, UploadCloudIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import Papa from "papaparse";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHeaders } from "@/lib/api/standaloneMock";
import Request from "@/lib/api/client/Request";

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
    hasSent?: boolean; sentStatus?: "SENT" | "NOT_SENT"; totalOutbound?: number; lastContactedAt?: string | null;
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

function deduplicateContacts(contacts: ContactDraftItem[]): ContactDraftItem[] {
    const seen = new Set<string>();
    const out: ContactDraftItem[] = [];
    for (const c of contacts) {
        const k = (c.email || "").toLowerCase().trim();
        if (k && !seen.has(k)) {
            seen.add(k);
            out.push(c);
        }
    }
    return out;
}

export function ContactsStep({ selectedContacts, onChangeSelected }: ContactsStepProps) {
    const selectedContactsRef = React.useRef(selectedContacts);
    React.useEffect(() => {
        selectedContactsRef.current = selectedContacts;
    }, [selectedContacts]);

    // Clean up any existing duplicate bloat on mount
    const cleanedUpBloatRef = React.useRef(false);
    React.useEffect(() => {
        if (!cleanedUpBloatRef.current && selectedContacts.length > 0) {
            cleanedUpBloatRef.current = true;
            const deduped = deduplicateContacts(selectedContacts);
            if (deduped.length !== selectedContacts.length) {
                onChangeSelected(deduped);
            }
        }
    }, [selectedContacts, onChangeSelected]);

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
            
            let j: any = null;
            try {
                const r = await fetch(`/api/intelligence/contacts?${p.toString()}`, { headers: authHeaders() });
                if (r.ok) {
                    j = await r.json();
                }
            } catch {
                // Ignore, will fallback to Request
            }

            if (!j || !j.data || j.data.length === 0) {
                j = await Request<any>({
                    method: "GET",
                    url: `/contacts?limit=50&page=${page}${search.trim() ? `&query=${encodeURIComponent(search.trim())}` : ""}${state && state !== "all" ? `&outreach_state=${encodeURIComponent(state)}` : ""}`,
                    authorization: true,
                });
            }

            const rawData = j?.data || [];
            const mapped: NormalizedContact[] = rawData.map((c: any) => ({
                id: c.id, 
                email: c.email, 
                first_name: c.first_name || (c.name ? c.name.split(" ")[0] : "") || "", 
                last_name: c.last_name || (c.name ? c.name.split(" ").slice(1).join(" ") : "") || "",
                company: c.company || c.company_name || "", 
                role: c.role || c.title || (c.custom_fields as any)?.role || (c.custom_fields as any)?.title || "",
                is_email_handler: c.is_email_handler, 
                outreach_state: c.temporal_state?.outreach_state || c.outreach_state || "COLD_REENGAGEMENT",
                days_since_last_contact: c.temporal_state?.days_since_last_contact ?? c.days_since_last_contact,
                last_subject: c.last_message_context?.subject || c.last_subject, 
                last_body_hook: c.last_message_context?.body_hook,
                last_campaign: c.last_message_context?.campaign || c.campaign,
            }));
            setDbContacts(prev => append ? [...prev, ...mapped] : mapped);
            setDbTotal(j?.total || mapped.length || 0); 
            setDbHasMore(j?.pagination?.has_more ?? (mapped.length === 50));
        } catch (err) { 
            console.warn("Could not load contacts:", err);
            toast.error("Could not load contacts"); 
        } finally { 
            setDbLoading(false); 
        }
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
    const [warnFilter, setWarnFilter] = React.useState<"all" | "sent" | "not_sent" | "quarantined">("all");
    const [warnSearch, setWarnSearch] = React.useState("");

    const sentWarnings = React.useMemo(() => historyWarnings.filter(w => w.hasSent && !w.quarantined), [historyWarnings]);
    const notSentWarnings = React.useMemo(() => historyWarnings.filter(w => !w.hasSent && !w.quarantined), [historyWarnings]);
    const quarWarnings = React.useMemo(() => historyWarnings.filter(w => w.quarantined), [historyWarnings]);

    const skipAllSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            sentWarnings.forEach(w => next.add(w.email.toLowerCase()));
            return next;
        });
        toast(`Ignored ${sentWarnings.length} contacts with sent emails`);
    };

    const skipAllNotSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            notSentWarnings.forEach(w => next.add(w.email.toLowerCase()));
            return next;
        });
        toast(`Ignored ${notSentWarnings.length} uncontacted / not-sent contacts`);
    };

    const selectAllSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            sentWarnings.forEach(w => next.delete(w.email.toLowerCase()));
            return next;
        });
        toast.success(`Selected ${sentWarnings.length} sent contacts`);
    };

    const selectAllNotSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            notSentWarnings.forEach(w => next.delete(w.email.toLowerCase()));
            return next;
        });
        toast.success(`Selected ${notSentWarnings.length} not-sent contacts`);
    };

    const displayedWarnings = React.useMemo(() => {
        return historyWarnings.filter(w => {
            if (warnFilter === "sent" && (!w.hasSent || w.quarantined)) return false;
            if (warnFilter === "not_sent" && (w.hasSent || w.quarantined)) return false;
            if (warnFilter === "quarantined" && !w.quarantined) return false;
            if (warnSearch.trim()) {
                const q = warnSearch.toLowerCase().trim();
                const matchEmail = w.email.toLowerCase().includes(q);
                const matchName = (w.name || "").toLowerCase().includes(q);
                const matchCamp = (w.lastCampaign || "").toLowerCase().includes(q);
                if (!matchEmail && !matchName && !matchCamp) return false;
            }
            return true;
        });
    }, [historyWarnings, warnFilter, warnSearch]);

    const batchCheck = React.useCallback(async (toAdd: ContactDraftItem[]) => {
        if (!toAdd.length) return;
        setChecking(true);
        try {
            const r = await fetch("/api/intelligence/check-batch", { 
                method: "POST", 
                headers: { "Content-Type": "application/json", ...authHeaders() }, 
                body: JSON.stringify({ emails: toAdd.map(c => c.email) }) 
            });
            if (!r.ok) throw new Error("Database check failed");
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
                quarantined: false,
                hasSent: Boolean(d.hasSent ?? (d.totalOutbound > 0 || d.sentStatus === "SENT" || d.lastContactedAt != null)),
                sentStatus: d.sentStatus || (d.hasSent ? "SENT" : "NOT_SENT"),
                totalOutbound: Number(d.totalOutbound) || 0,
                lastContactedAt: d.lastContactedAt || null,
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
                quarantineReason: q.reason,
                hasSent: false,
                sentStatus: "NOT_SENT",
                totalOutbound: 0,
                lastContactedAt: null,
            }));
            const all = [...dupes, ...quar];
            setLastCheckStats({
                totalChecked: toAdd.length,
                historyCount: dupes.length,
                sentCount: dupes.filter(d => d.hasSent).length,
                quarantinedCount: quar.length,
                cleanCount: Math.max(0, toAdd.length - (dupes.length + quar.length)),
                checkedAt: new Date(),
            });

            setPendingContacts(deduplicateContacts(toAdd));

            if (all.length > 0) {
                setHistoryWarnings(all);
                // Pre-ignore quarantined leads by default to safeguard sender deliverability
                const preIgnored = new Set<string>(quar.map(q => q.email.toLowerCase().trim()));
                setIgnoredEmails(preIgnored);
                setShowWarn(true);
                toast(`⚠️ Auto-check: ${all.length} of ${toAdd.length} contacts have prior history`, { id: "outreach-check-toast" });
            } else {
                setHistoryWarnings([]);
                const nextSelected = deduplicateContacts([...selectedContactsRef.current, ...toAdd]);
                onChangeSelected(nextSelected);
                toast.success(`✓ Auto-check passed! All ${toAdd.length} clean contacts automatically queued.`, { id: "outreach-check-toast" });
            }
        } catch (err: any) {
            console.error("Batch check error:", err);
            toast.error("Database cross-check error. Click Re-check to try again.");
        } finally {
            setChecking(false);
        }
    }, [onChangeSelected]);

    const toggleIgnore = (email: string) => {
        const key = email.toLowerCase().trim();
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const skipAllFlagged = () => {
        setIgnoredEmails(new Set(historyWarnings.map(w => w.email.toLowerCase().trim())));
        toast("All flagged contacts skipped");
    };

    const selectAllFlagged = () => {
        setIgnoredEmails(new Set());
        toast.success("All flagged contacts selected");
    };

    const confirmWarn = () => {
        const kept = pendingContacts.filter(c => !ignoredEmails.has(c.email.toLowerCase().trim()));
        onChangeSelected(deduplicateContacts([...selectedContactsRef.current, ...kept]));
        const sk = pendingContacts.length - kept.length;
        if (kept.length) toast.success(`Added ${kept.length}${sk ? `, skipped ${sk}` : ""}`); else toast(`Skipped ${sk}`);
        setShowWarn(false);
    };

    const cancelWarn = () => {
        setShowWarn(false);
    };

    const toggleDb = async (c: NormalizedContact) => {
        if (isSel(c.email)) { onChangeSelected(selectedContacts.filter(s => s.email.toLowerCase() !== c.email.toLowerCase())); return; }
        await batchCheck([{ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, company: c.company, role: c.role, source: "database" }]);
    };
    const toggleAll = () => {
        const allSel = dbContacts.length > 0 && dbContacts.every(c => isSel(c.email));
        if (allSel) { const v = new Set(dbContacts.map(c => c.email.toLowerCase())); onChangeSelected(selectedContacts.filter(s => !v.has(s.email.toLowerCase()))); }
        else { const ex = new Set(selectedContacts.map(s => s.email.toLowerCase())); batchCheck(dbContacts.filter(c => !ex.has(c.email.toLowerCase())).map(c => ({ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, company: c.company, role: c.role, source: "database" as const }))); }
    };

    interface CsvColumnMapping {
        email: string;
        firstName: string;
        lastName: string;
        fullName: string;
        company: string;
        role: string;
    }

    const [csvFile, setCsvFile] = React.useState<File | null>(null);
    const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
    const [csvRawData, setCsvRawData] = React.useState<string[][]>([]);
    const [csvMapping, setCsvMapping] = React.useState<CsvColumnMapping>({
        email: "",
        firstName: "",
        lastName: "",
        fullName: "",
        company: "",
        role: "",
    });
    const [csvRows, setCsvRows] = React.useState<Array<{ email: string; first_name?: string; last_name?: string; company?: string; role?: string }>>([]);
    const [csvError, setCsvError] = React.useState("");
    const [isDragging, setIsDragging] = React.useState(false);
    const [showMappingEditor, setShowMappingEditor] = React.useState(false);
    const [lastCheckStats, setLastCheckStats] = React.useState<{
        totalChecked: number;
        historyCount: number;
        sentCount: number;
        quarantinedCount: number;
        cleanCount: number;
        checkedAt: Date;
    } | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);

    const cleanHeaderKey = (h: string) => (h || "").toLowerCase().trim().replace(/[\s\-_.]+/g, "");

    const extractEmailAddress = (val: string): string => {
        const trimmed = (val || "").trim();
        const match = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return match ? match[0].toLowerCase() : "";
    };

    const splitFullName = (raw: string): { first: string; last: string } => {
        const trimmed = (raw || "").trim();
        if (!trimmed) return { first: "", last: "" };
        if (trimmed.includes(",")) {
            const parts = trimmed.split(",").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) return { first: parts[1], last: parts[0] };
        }
        const clean = trimmed.replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "");
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length <= 1) return { first: parts[0] || "", last: "" };
        return { first: parts[0], last: parts.slice(1).join(" ") };
    };

    const detectMapping = (headers: string[], rows: string[][]): CsvColumnMapping => {
        const mapping: CsvColumnMapping = {
            email: "",
            firstName: "",
            lastName: "",
            fullName: "",
            company: "",
            role: "",
        };

        // 1. Email detection - prioritized header names
        const emailPrio = [
            (c: string) => c === "toemail" || c === "leademail" || c === "contactemail" || c === "workemail" || c === "primaryemail",
            (c: string) => c === "email" || c === "emailaddress" || c === "recipientemail" || c === "corporateemail" || c === "businessemail",
            (c: string) => c.includes("email"),
            (c: string) => c === "mail" || c === "mailto" || c === "mailid" || c === "directemail",
            (c: string) => c.includes("mail") && !c.includes("mailbox") && !c.includes("domain") && !c.includes("status"),
            (c: string) => c === "fromemail" || c === "from_email",
        ];

        for (const test of emailPrio) {
            const idx = headers.findIndex(h => test(cleanHeaderKey(h)));
            if (idx !== -1) {
                mapping.email = headers[idx];
                break;
            }
        }

        // Content-based email detection if header not found
        if (!mapping.email && rows.length > 0) {
            let bestCol = -1;
            let maxEmails = 0;
            const sampleLimit = Math.min(rows.length, 100);
            for (let c = 0; c < headers.length; c++) {
                let emailCount = 0;
                for (let r = 0; r < sampleLimit; r++) {
                    const cell = rows[r]?.[c] || "";
                    if (extractEmailAddress(cell)) emailCount++;
                }
                if (emailCount > maxEmails) {
                    maxEmails = emailCount;
                    bestCol = c;
                }
            }
            if (bestCol !== -1 && maxEmails > 0) {
                mapping.email = headers[bestCol];
            }
        }

        // 2. First Name
        const fnIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "firstname" || c === "fname" || c === "first" || c === "givenname" || c === "forename" || (c.includes("first") && c.includes("name"));
        });
        if (fnIdx !== -1) mapping.firstName = headers[fnIdx];

        // 3. Last Name
        const lnIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "lastname" || c === "lname" || c === "last" || c === "surname" || c === "familyname" || (c.includes("last") && c.includes("name"));
        });
        if (lnIdx !== -1) mapping.lastName = headers[lnIdx];

        // 4. Full Name (fallback if no first name)
        const nameIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "name" || c === "fullname" || c === "contactname" || c === "leadname" || c === "toname" || c === "prospectname" || c === "personname" || c === "displayname" || c === "prospect";
        });
        if (nameIdx !== -1) mapping.fullName = headers[nameIdx];

        // 5. Company
        const coIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "company" || c === "companyname" || c === "organization" || c === "org" || c === "organizationname" || c === "business" || c === "businessname" || c === "account" || c === "accountname" || c === "firm" || c === "employer" || c === "brand" || c === "brandname";
        });
        if (coIdx !== -1) mapping.company = headers[coIdx];

        // 6. Role / Title
        const rIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "role" || c === "title" || c === "jobtitle" || c === "position" || c === "job" || c === "designation" || c === "headline" || c === "occupation" || c === "worktitle" || c === "seniority";
        });
        if (rIdx !== -1) mapping.role = headers[rIdx];

        return mapping;
    };

    const buildContactsFromMapping = (
        headers: string[],
        rows: string[][],
        mapping: CsvColumnMapping
    ): Array<{ email: string; first_name?: string; last_name?: string; company?: string; role?: string }> => {
        if (!mapping.email) return [];
        const eIdx = headers.indexOf(mapping.email);
        if (eIdx === -1) return [];

        const fnIdx = mapping.firstName ? headers.indexOf(mapping.firstName) : -1;
        const lnIdx = mapping.lastName ? headers.indexOf(mapping.lastName) : -1;
        const nameIdx = mapping.fullName ? headers.indexOf(mapping.fullName) : -1;
        const coIdx = mapping.company ? headers.indexOf(mapping.company) : -1;
        const rIdx = mapping.role ? headers.indexOf(mapping.role) : -1;

        const seenEmails = new Set<string>();
        const results: Array<{ email: string; first_name?: string; last_name?: string; company?: string; role?: string }> = [];

        for (const row of rows) {
            const rawEmail = row[eIdx] || "";
            const email = extractEmailAddress(rawEmail);
            if (!email || seenEmails.has(email)) continue;
            seenEmails.add(email);

            let first_name = fnIdx !== -1 ? (row[fnIdx] || "").trim() : "";
            let last_name = lnIdx !== -1 ? (row[lnIdx] || "").trim() : "";

            if (!first_name && !last_name && nameIdx !== -1) {
                const split = splitFullName(row[nameIdx] || "");
                first_name = split.first;
                last_name = split.last;
            } else if (!first_name && nameIdx !== -1) {
                first_name = (row[nameIdx] || "").trim();
            }

            const company = coIdx !== -1 ? (row[coIdx] || "").trim() : "";
            const role = rIdx !== -1 ? (row[rIdx] || "").trim() : "";

            results.push({ email, first_name, last_name, company, role });
        }
        return results;
    };

    const processCsvFile = (file: File) => {
        setCsvFile(file);
        setCsvError("");
        setChecking(true);
        Papa.parse<string[]>(file, {
            skipEmptyLines: "greedy",
            complete: async (results) => {
                const data = results.data;
                if (!data || data.length < 1) {
                    setCsvError("The selected CSV file appears to be empty.");
                    setCsvRows([]);
                    setCsvHeaders([]);
                    setCsvRawData([]);
                    setChecking(false);
                    return;
                }

                // Check whether row 0 is header or data
                let headerRowIdx = 0;
                const row0Emails = data[0].filter(c => extractEmailAddress(c)).length;
                let detectedHeaders: string[] = [];
                let dataRows: string[][] = [];

                if (row0Emails > 0 && !data[0].some(c => cleanHeaderKey(c).includes("email") || cleanHeaderKey(c).includes("name"))) {
                    // Headerless CSV
                    detectedHeaders = data[0].map((_, i) => `Column ${i + 1}`);
                    dataRows = data;
                } else {
                    for (let r = 0; r < Math.min(data.length, 5); r++) {
                        const matchCount = data[r].filter(c => {
                            const k = cleanHeaderKey(c);
                            return k.includes("email") || k.includes("mail") || k.includes("name") || k.includes("company") || k.includes("title") || k.includes("role");
                        }).length;
                        if (matchCount > 0) {
                            headerRowIdx = r;
                            break;
                        }
                    }

                    detectedHeaders = data[headerRowIdx].map((h, i) => {
                        const t = (h || "").trim();
                        return t || `Column ${i + 1}`;
                    });
                    dataRows = data.slice(headerRowIdx + 1);
                }

                setCsvHeaders(detectedHeaders);
                setCsvRawData(dataRows);

                const detectedMap = detectMapping(detectedHeaders, dataRows);
                setCsvMapping(detectedMap);

                const parsed = buildContactsFromMapping(detectedHeaders, dataRows, detectedMap);
                setCsvRows(parsed);

                if (!detectedMap.email) {
                    setCsvError("Could not automatically identify an email column. Please pick the Email column below.");
                    setShowMappingEditor(true);
                    setChecking(false);
                } else if (parsed.length === 0) {
                    setCsvError("Found column '" + detectedMap.email + "', but no valid email addresses were found in rows.");
                    setShowMappingEditor(true);
                    setChecking(false);
                } else {
                    setCsvError("");
                    // AUTOMATIC CROSS-CHECK:
                    // Immediately cross-check all contacts against database outreach & suppression history
                    const toAdd: ContactDraftItem[] = parsed.map(row => ({
                        email: row.email,
                        first_name: row.first_name || "",
                        last_name: row.last_name || "",
                        company: row.company || "",
                        role: row.role || "",
                        source: "csv" as const,
                    }));
                    await batchCheck(toAdd);
                }
            },
            error: (err) => {
                setCsvError(`Failed to parse CSV: ${err.message}`);
                setCsvRows([]);
                setChecking(false);
            }
        });
    };

    const handleMappingChange = (field: keyof CsvColumnMapping, value: string) => {
        const nextMap = { ...csvMapping, [field]: value };
        setCsvMapping(nextMap);
        const nextRows = buildContactsFromMapping(csvHeaders, csvRawData, nextMap);
        setCsvRows(nextRows);
        if (field === "email") {
            if (value && nextRows.length > 0) {
                setCsvError("");
                const toAdd: ContactDraftItem[] = nextRows.map(r => ({
                    email: r.email,
                    first_name: r.first_name || "",
                    last_name: r.last_name || "",
                    company: r.company || "",
                    role: r.role || "",
                    source: "csv" as const
                }));
                batchCheck(toAdd);
            } else if (!value) {
                setCsvError("Please select an Email column.");
            }
        }
    };

    // Auto-check on mount or state restoration if CSV rows exist but haven't been cross-checked yet
    const autoCheckedCsvRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (subTab === "csv" && csvFile && csvRows.length > 0 && !checking && !lastCheckStats) {
            const key = `${csvFile.name}:${csvRows.length}`;
            if (autoCheckedCsvRef.current !== key) {
                autoCheckedCsvRef.current = key;
                const toAdd: ContactDraftItem[] = csvRows.map(r => ({
                    email: r.email,
                    first_name: r.first_name || "",
                    last_name: r.last_name || "",
                    company: r.company || "",
                    role: r.role || "",
                    source: "csv" as const
                }));
                batchCheck(toAdd);
            }
        }
    }, [subTab, csvFile, csvRows, checking, lastCheckStats, batchCheck]);

    const crossCheckCsv = () => {
        if (!csvRows.length) return;
        const toAdd: ContactDraftItem[] = csvRows.map(r => ({
            email: r.email,
            first_name: r.first_name || "",
            last_name: r.last_name || "",
            company: r.company || "",
            role: r.role || "",
            source: "csv" as const
        }));
        batchCheck(toAdd);
    };

    const importCsv = () => {
        crossCheckCsv();
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
                    return <button key={tab} type="button" onClick={()=>setSubTab(tab)} className={cn("h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",subTab===tab?"bg-[#FFF9DB] text-slate-900 font-semibold":"text-slate-600 hover:bg-slate-100")}>{icon}{lbl}{cnt>0&&<span className="px-1.5 rounded-full text-[10px] bg-[#18181B] text-white font-semibold">{cnt}</span>}</button>;
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

                    {/* Toolbar: Filter by Sent/Not Sent, Quick Actions, Search */}
                    <div className="px-4 py-2.5 bg-amber-50/50 border-b border-amber-200/70 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-[11.5px]">
                            <p className="text-amber-900/90 leading-tight">
                                Review prior history below. Filter by sent status or ignore specific segments:
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {sentWarnings.length > 0 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={skipAllSent}
                                            className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-100/80 text-rose-800 hover:bg-rose-200 border border-rose-300 transition-colors cursor-pointer"
                                            title="Exclude contacts that were already sent an email"
                                        >
                                            Ignore Sent ({sentWarnings.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={selectAllSent}
                                            className="px-2 py-1 rounded text-[11px] font-medium bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                        >
                                            Select Sent
                                        </button>
                                    </>
                                )}
                                {notSentWarnings.length > 0 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={skipAllNotSent}
                                            className="px-2 py-1 rounded text-[11px] font-semibold bg-amber-200/70 text-amber-900 hover:bg-amber-300 border border-amber-400 transition-colors cursor-pointer"
                                            title="Exclude contacts enrolled but never actually sent an email"
                                        >
                                            Ignore Not Sent ({notSentWarnings.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={selectAllNotSent}
                                            className="px-2 py-1 rounded text-[11px] font-medium bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                        >
                                            Select Not Sent
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Filter Tabs + Search */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-amber-200/50 border border-amber-300/70">
                                <button
                                    type="button"
                                    onClick={() => setWarnFilter("all")}
                                    className={cn(
                                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                                        warnFilter === "all" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-amber-950 hover:bg-amber-100/60"
                                    )}
                                >
                                    All ({historyWarnings.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setWarnFilter("sent")}
                                    className={cn(
                                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1",
                                        warnFilter === "sent" ? "bg-blue-600 text-white font-bold shadow-xs" : "text-blue-900 hover:bg-blue-100/60"
                                    )}
                                >
                                    <span>📤 Sent ({sentWarnings.length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setWarnFilter("not_sent")}
                                    className={cn(
                                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1",
                                        warnFilter === "not_sent" ? "bg-amber-600 text-white font-bold shadow-xs" : "text-amber-950 hover:bg-amber-100/60"
                                    )}
                                >
                                    <span>⏳ Not Sent ({notSentWarnings.length})</span>
                                </button>
                                {quarWarnings.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setWarnFilter("quarantined")}
                                        className={cn(
                                            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1",
                                            warnFilter === "quarantined" ? "bg-rose-600 text-white font-bold shadow-xs" : "text-rose-900 hover:bg-rose-100/60"
                                        )}
                                    >
                                        <span>🚫 Quarantined ({quarWarnings.length})</span>
                                    </button>
                                )}
                            </div>

                            <div className="relative min-w-[180px] flex-1 sm:flex-initial">
                                <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"/>
                                <input
                                    type="text"
                                    value={warnSearch}
                                    onChange={e => setWarnSearch(e.target.value)}
                                    placeholder="Search flagged..."
                                    className="w-full pl-8 pr-2.5 py-1 rounded-md text-[11px] bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Scrollable contact cards */}
                    <div className="px-4 py-3 space-y-2.5 max-h-[320px] overflow-y-auto bg-slate-50/40">
                        {displayedWarnings.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-slate-500 text-[12px]">
                                No flagged contacts match current filter ({warnFilter}{warnSearch ? ` with query "${warnSearch}"` : ""}).
                            </div>
                        ) : (
                            displayedWarnings.map(w => {
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
                                                        <>
                                                            {w.hasSent ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                                                                    📤 Sent {(w.totalOutbound || 0) > 0 ? `(${w.totalOutbound} mail${(w.totalOutbound || 0) > 1 ? "s" : ""})` : ""}
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                                                                    ⏳ Not Sent Yet
                                                                </span>
                                                            )}
                                                            <OBadge state={w.outreachState}/>
                                                        </>
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
                                                                <MessageSquareIcon className="w-3 h-3 mt-0.5 shrink-0 text-slate-900"/>
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
                            })
                        )}
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
                            {(() => {
                                const willAdd = pendingContacts.filter(c => !ignoredEmails.has(c.email.toLowerCase().trim())).length;
                                const willSkip = pendingContacts.length - willAdd;
                                return (
                                    <>
                                        <p className="text-[12px] font-semibold text-slate-900">
                                            {willAdd} of {pendingContacts.length} contacts will be added
                                        </p>
                                        {willSkip > 0 && (
                                            <p className="text-[10.5px] text-rose-600 font-medium">
                                                {willSkip} contact{willSkip !== 1 ? "s" : ""} will be skipped
                                            </p>
                                        )}
                                    </>
                                );
                            })()}
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
                                className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
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
                            <div className="relative flex-1"><SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400"/><input type="text" value={dbSearch} onChange={e=>setDbSearch(e.target.value)} placeholder="Search name, email, company..." className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
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
                                return(<div key={c.id} onClick={()=>toggleDb(c)} className={cn("px-3 py-2 flex items-start justify-between gap-3 cursor-pointer select-none transition-colors",sel?"bg-[#FFF9DB]/50 hover:bg-[#FFF9DB]":"hover:bg-slate-50")}>
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                        <input type="checkbox" checked={sel} onChange={()=>{}} className="mt-0.5 rounded border-slate-300 text-slate-900 cursor-pointer"/>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap"><p className="text-[12px] font-medium text-slate-900 truncate">{c.first_name||c.last_name?`${c.first_name} ${c.last_name}`.trim():c.email}</p>{hist&&<OBadge state={c.outreach_state!}/>}</div>
                                            <p className="text-[11px] text-slate-400 truncate">{c.email}{c.company&&!c.is_email_handler&&` · ${c.company}`}</p>
                                            {hist&&c.last_subject&&(<div className="mt-1 flex items-start gap-1 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1" onClick={e=>e.stopPropagation()}><ClockIcon className="w-3 h-3 mt-0.5 shrink-0 text-amber-500"/><span><strong>{c.days_since_last_contact!=null?`${c.days_since_last_contact}d ago`:"Prior"} · </strong>{c.last_campaign&&<em>{c.last_campaign} · </em>}{c.last_subject}</span></div>)}
                                        </div>
                                    </div>
                                    {c.role&&<span className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{c.role}</span>}
                                </div>);
                            })}{dbHasMore&&(<div className="px-3 py-2 bg-slate-50 border-t border-slate-100"><button type="button" onClick={e=>{e.stopPropagation();loadMore();}} disabled={dbLoading} className="w-full text-[11.5px] text-slate-900 hover:text-black font-medium flex items-center justify-center gap-1.5 py-0.5 disabled:opacity-50">{dbLoading&&<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>}Load more</button></div>)}</> )}
                        </div>
                    </div>
                )}

                {subTab==="csv"&&(
                    <div className="space-y-3">
                        {!csvFile ? (
                            <div 
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    const f = e.dataTransfer.files?.[0];
                                    if (f) processCsvFile(f);
                                }}
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "border-2 border-dashed rounded-lg p-7 text-center transition-all bg-slate-50/50 cursor-pointer select-none",
                                    isDragging ? "border-slate-900 bg-[#FFF9DB]/40 ring-2 ring-[#FFE600]" : "border-slate-200 hover:border-slate-900"
                                )}
                            >
                                <UploadCloudIcon className="w-8 h-8 text-slate-400 mx-auto mb-2"/>
                                <span className="text-[12.5px] font-semibold text-slate-900 hover:text-black">Click to select CSV file</span>
                                <span className="text-[12px] text-slate-500"> or drag and drop</span>
                                <input 
                                    ref={fileInputRef} 
                                    type="file" 
                                    accept=".csv,text/csv,application/vnd.ms-excel,text/plain" 
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) processCsvFile(f); }} 
                                    className="hidden"
                                />
                                <p className="text-[11px] text-slate-400 mt-1.5">
                                    Columns auto-detected: email (required), first_name, last_name, company, role / title
                                </p>
                            </div>
                        ) : (
                            <div className="border border-slate-200 rounded-lg bg-white p-3.5 space-y-3 shadow-xs">
                                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100 flex-wrap">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                                            <FileSpreadsheetIcon className="w-4 h-4"/>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] font-semibold text-slate-900 truncate">
                                                {csvFile.name}
                                            </p>
                                            <p className="text-[11px] text-slate-400">
                                                {(csvFile.size / 1024).toFixed(1)} KB · {csvRawData.length} row{csvRawData.length === 1 ? "" : "s"} · <span className="text-emerald-700 font-semibold">{csvRows.length} valid contact{csvRows.length === 1 ? "" : "s"} detected</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowMappingEditor(!showMappingEditor)}
                                            className={cn(
                                                "h-7 px-2.5 rounded text-[11px] font-medium border inline-flex items-center gap-1.5 transition-colors cursor-pointer",
                                                showMappingEditor ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                            )}
                                        >
                                            <SlidersHorizontalIcon className="w-3 h-3"/>
                                            {showMappingEditor ? "Hide Columns" : "Map Columns"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCsvFile(null);
                                                setCsvRows([]);
                                                setCsvHeaders([]);
                                                setCsvRawData([]);
                                                setCsvError("");
                                                if (fileInputRef.current) fileInputRef.current.value = "";
                                            }}
                                            className="h-7 px-2 rounded text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded transition-colors cursor-pointer inline-flex items-center gap-1"
                                            title="Remove file"
                                        >
                                            <Trash2Icon className="w-3 h-3"/>
                                            Change
                                        </button>
                                    </div>
                                </div>

                                {showMappingEditor && (
                                    <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-md space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11.5px] font-semibold text-slate-900">Map CSV Columns</p>
                                            <span className="text-[10.5px] text-slate-500">Match columns from your file to contact fields</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Email Address *</label>
                                                <select
                                                    value={csvMapping.email}
                                                    onChange={(e) => handleMappingChange("email", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- Select Email Column --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">First Name</label>
                                                <select
                                                    value={csvMapping.firstName}
                                                    onChange={(e) => handleMappingChange("firstName", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None / Auto-Split --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Last Name</label>
                                                <select
                                                    value={csvMapping.lastName}
                                                    onChange={(e) => handleMappingChange("lastName", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Full Name (Auto-Split)</label>
                                                <select
                                                    value={csvMapping.fullName}
                                                    onChange={(e) => handleMappingChange("fullName", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Company</label>
                                                <select
                                                    value={csvMapping.company}
                                                    onChange={(e) => handleMappingChange("company", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Role / Job Title</label>
                                                <select
                                                    value={csvMapping.role}
                                                    onChange={(e) => handleMappingChange("role", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {csvError && (
                                    <div className="flex items-center gap-2 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11.5px] font-medium">
                                        <AlertCircleIcon className="w-4 h-4 shrink-0"/>
                                        <span>{csvError}</span>
                                    </div>
                                )}

                                {csvRows.length > 0 && (
                                    <div className="space-y-2.5">
                                        {checking && (
                                            <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 flex items-center gap-3 text-[11.5px] text-amber-950 shadow-xs animate-pulse">
                                                <Loader2Icon className="w-4 h-4 animate-spin text-amber-700 shrink-0"/>
                                                <div>
                                                    <p className="font-semibold text-amber-900">
                                                        Auto Cross-Checking {csvRows.length} Contacts with Database...
                                                    </p>
                                                    <p className="text-[10.5px] text-amber-800/80 mt-0.5">
                                                        Scanning prior campaigns, message history, reply states, and suppressions
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {!checking && lastCheckStats && (
                                            <div className={cn(
                                                "rounded-lg border p-3 flex items-center justify-between gap-3 text-[11.5px] transition-all",
                                                lastCheckStats.historyCount > 0 || lastCheckStats.quarantinedCount > 0
                                                    ? "bg-amber-50/80 border-amber-200 text-amber-950"
                                                    : "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                                            )}>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className={cn(
                                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border",
                                                        lastCheckStats.historyCount > 0 || lastCheckStats.quarantinedCount > 0
                                                            ? "bg-amber-100 border-amber-300 text-amber-800"
                                                            : "bg-emerald-100 border-emerald-300 text-emerald-800"
                                                    )}>
                                                        {lastCheckStats.historyCount > 0 || lastCheckStats.quarantinedCount > 0 ? (
                                                            <ShieldAlertIcon className="w-4 h-4"/>
                                                        ) : (
                                                            <CheckIcon className="w-4 h-4"/>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold">
                                                            {lastCheckStats.historyCount > 0 || lastCheckStats.quarantinedCount > 0
                                                                ? `Auto-Check: ${lastCheckStats.historyCount + lastCheckStats.quarantinedCount} of ${lastCheckStats.totalChecked} contacts have previous history`
                                                                : `Auto-Check: All ${lastCheckStats.totalChecked} contacts are clean with no prior history`}
                                                        </p>
                                                        <p className="text-[10.5px] opacity-80 mt-0.5">
                                                            {lastCheckStats.cleanCount} clean contacts · {lastCheckStats.sentCount} previously sent · {lastCheckStats.quarantinedCount} quarantined
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {(lastCheckStats.historyCount > 0 || lastCheckStats.quarantinedCount > 0) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowWarn(true)}
                                                            className="h-7 px-2.5 rounded text-[11px] font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/60 cursor-pointer transition-colors shadow-xs"
                                                        >
                                                            Review Flagged ({lastCheckStats.historyCount + lastCheckStats.quarantinedCount})
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={crossCheckCsv}
                                                        disabled={checking}
                                                        className="h-7 px-2 rounded text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer transition-colors inline-flex items-center gap-1 shadow-xs"
                                                        title="Re-run database cross-check"
                                                    >
                                                        <RefreshCwIcon className={cn("w-3 h-3 text-slate-500", checking && "animate-spin")}/>
                                                        Re-check
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between text-[11.5px] text-slate-600 gap-2 flex-wrap">
                                            <span>
                                                Preview: <strong>{csvRows.length} contacts</strong> detected in file
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {checking ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-100/80 border border-amber-200 text-amber-900 font-semibold text-[11px]">
                                                        <Loader2Icon className="w-3.5 h-3.5 animate-spin"/>
                                                        Auto-checking database...
                                                    </span>
                                                ) : csvCnt > 0 ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
                                                        <CheckIcon className="w-3.5 h-3.5 text-emerald-600"/>
                                                        {csvCnt} Contacts Queued
                                                    </span>
                                                ) : historyWarnings.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowWarn(true)}
                                                        className="h-7 px-3 rounded bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <ShieldAlertIcon className="w-3.5 h-3.5"/>
                                                        Review Prior History ({historyWarnings.length})
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={crossCheckCsv}
                                                        disabled={checking}
                                                        className="h-7 px-3 rounded bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                                                    >
                                                        <CheckIcon className="w-3.5 h-3.5"/>
                                                        Queue {csvRows.length} Contacts
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={crossCheckCsv}
                                                    disabled={checking}
                                                    className="h-7 px-2.5 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium shadow-xs cursor-pointer inline-flex items-center gap-1 transition-colors disabled:opacity-60"
                                                    title="Re-run database cross-check"
                                                >
                                                    <RefreshCwIcon className={cn("w-3 h-3 text-slate-600", checking && "animate-spin")}/>
                                                    Re-check
                                                </button>
                                            </div>
                                        </div>
                                        <div className="border border-slate-200 rounded-md overflow-hidden bg-white text-[11.5px]">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-2.5 py-1.5">Email</th>
                                                        <th className="px-2.5 py-1.5">First Name</th>
                                                        <th className="px-2.5 py-1.5">Last Name</th>
                                                        <th className="px-2.5 py-1.5">Company</th>
                                                        <th className="px-2.5 py-1.5">Role</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {csvRows.slice(0, 5).map((r, i) => (
                                                        <tr key={i} className="hover:bg-slate-50/50">
                                                            <td className="px-2.5 py-1 font-medium text-slate-900">{r.email}</td>
                                                            <td className="px-2.5 py-1 text-slate-600">{r.first_name || "-"}</td>
                                                            <td className="px-2.5 py-1 text-slate-600">{r.last_name || "-"}</td>
                                                            <td className="px-2.5 py-1 text-slate-600">{r.company || "-"}</td>
                                                            <td className="px-2.5 py-1 text-slate-600">{r.role || "-"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {csvRows.length > 5 && (
                                                <div className="px-2.5 py-1 text-[10.5px] text-slate-400 bg-slate-50/40 border-t border-slate-100">
                                                    + {csvRows.length - 5} more contacts in CSV
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {subTab==="manual"&&(
                    <form onSubmit={addManual} className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-[11px] font-medium text-slate-700">Email Address *</label><input type="email" value={mEmail} onChange={e=>setMEmail(e.target.value)} placeholder="name@company.com" required className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">First Name</label><input type="text" value={mFirst} onChange={e=>setMFirst(e.target.value)} placeholder="e.g. Haji" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Last Name</label><input type="text" value={mLast} onChange={e=>setMLast(e.target.value)} placeholder="e.g. Karim" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Company</label><input type="text" value={mCo} onChange={e=>setMCo(e.target.value)} placeholder="e.g. TheBoredMonkey" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div className="col-span-2"><label className="text-[11px] font-medium text-slate-700">Role / Job Title</label><div className="flex items-center gap-2"><input type="text" value={mRole} onChange={e=>setMRole(e.target.value)} placeholder="e.g. Head of Growth" className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/><button type="submit" disabled={checking} className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60">{checking?<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>:<PlusIcon className="w-3.5 h-3.5"/>}Add Contact</button></div></div>
                        </div>
                    </form>
                )}
                </>
            )}

            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                    <UsersIcon className="w-4 h-4 text-slate-900"/>
                    <span className="font-semibold text-slate-900">{selectedContacts.length} Contact{selectedContacts.length===1?"":"s"} Queued:</span>
                    <span className="text-slate-500 text-[11px]">{dbCnt} from DB · {csvCnt} from CSV · {manCnt} Manual</span>
                </div>
                {selectedContacts.length>0&&<button type="button" onClick={()=>onChangeSelected([])} className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors">Clear all</button>}
            </div>
        </div>
    );
}
