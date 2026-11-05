import React from "react";
import { AlertCircleIcon, CheckIcon, ClockIcon, DatabaseIcon, FileSpreadsheetIcon, Loader2Icon, MessageSquareIcon, PlusIcon, RefreshCwIcon, SearchIcon, ShieldAlertIcon, SlidersHorizontalIcon, Trash2Icon, UploadCloudIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import Papa from "papaparse";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHeaders } from "@/lib/api/standaloneMock";

export interface CreatorDraftItem {
    id?: string;
    email: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    role?: string;
    handle?: string;
    category?: string;
    followers?: string;
    intake_token?: string;
    intake_link?: string;
    avatar_url?: string;
    source: "database" | "csv" | "manual";
}

interface NormalizedCreator {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    handle: string;
    category: string;
    followers: string;
    tier: string;
    intake_token: string;
    intake_status: string;
    avatar_url?: string | null;
    city?: string | null;
}

interface HistoryWarning {
    email: string; name: string; outreachState: string | null; daysSinceLastContact: number | null;
    lastSubject: string | null; lastMessage: string | null; quarantined?: boolean; quarantineReason?: string;
    lastCampaign?: string | null; campaigns?: string[];
    hasSent?: boolean; sentStatus?: "SENT" | "NOT_SENT"; totalOutbound?: number; lastContactedAt?: string | null;
}

interface CreatorsStepProps {
    selectedContacts: CreatorDraftItem[];
    onChangeSelected: (c: CreatorDraftItem[]) => void;
}

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

function deduplicateContacts(contacts: CreatorDraftItem[]): CreatorDraftItem[] {
    const seen = new Set<string>();
    const out: CreatorDraftItem[] = [];
    for (const c of contacts) {
        const k = (c.email || "").toLowerCase().trim();
        if (k && !seen.has(k)) {
            seen.add(k);
            out.push(c);
        }
    }
    return out;
}

export function CreatorsStep({ selectedContacts, onChangeSelected }: CreatorsStepProps) {
    const selectedContactsRef = React.useRef(selectedContacts);
    React.useEffect(() => {
        selectedContactsRef.current = selectedContacts;
    }, [selectedContacts]);

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
    const [dbCreators, setDbCreators] = React.useState<NormalizedCreator[]>([]);
    const [dbTotal, setDbTotal] = React.useState(0);
    const [dbOffset, setDbOffset] = React.useState(0);
    const [dbLoading, setDbLoading] = React.useState(false);
    const [dbHasMore, setDbHasMore] = React.useState(false);
    const [dbSearch, setDbSearch] = React.useState("");
    const [dbCategoryFilter, setDbCategoryFilter] = React.useState("all");
    const [dbTierFilter, setDbTierFilter] = React.useState("all");
    const [dbIntakeFilter, setDbIntakeFilter] = React.useState("all");
    const [categories, setCategories] = React.useState<Array<{ category: string; count: number }>>([]);
    const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        fetch("/api/creators/facets", { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.categories) setCategories(d.categories);
            })
            .catch(() => {});
    }, []);

    const fetchDb = React.useCallback(async (search: string, category: string, tier: string, intakeStatus: string, offset: number, append = false) => {
        setDbLoading(true);
        try {
            const p = new URLSearchParams({
                limit: "50",
                offset: String(offset),
                channel: "email",
            });
            if (search.trim()) p.set("search", search.trim());
            if (category && category !== "all") p.set("category", category);
            if (tier && tier !== "all") p.set("tier", tier);
            if (intakeStatus && intakeStatus !== "all") p.set("intakeStatus", intakeStatus);

            const r = await fetch(`/api/creators?${p.toString()}`, { headers: authHeaders() });
            if (!r.ok) throw new Error("Failed to load creators");
            const j = await r.json();

            const rawData = j?.creators || [];
            const mapped: NormalizedCreator[] = rawData
                .filter((c: any) => Boolean(c.primaryEmail))
                .map((c: any) => {
                    const cleanHandle = (c.handle || "").replace(/^@/, "").trim();
                    const fullName = (c.fullName || cleanHandle || "").trim();
                    const parts = fullName.split(/\s+/);
                    return {
                        id: c.id,
                        email: c.primaryEmail,
                        first_name: parts[0] || cleanHandle,
                        last_name: parts.slice(1).join(" "),
                        handle: cleanHandle ? `@${cleanHandle}` : "",
                        category: c.category || "Creator",
                        followers: c.followersRaw || (c.followersCount ? `${(c.followersCount / 1000).toFixed(1)}K` : ""),
                        tier: c.tier || "micro",
                        intake_token: c.intakeToken || c.id,
                        intake_status: c.intakeStatus || "PENDING",
                        avatar_url: c.avatarUrl || (cleanHandle ? `/creator-avatars/${cleanHandle.toLowerCase()}.jpg` : null),
                        city: c.city || null,
                    };
                });

            setDbCreators(prev => append ? [...prev, ...mapped] : mapped);
            const total = j?.total || mapped.length || 0;
            setDbTotal(total);
            setDbHasMore(offset + rawData.length < total);
        } catch (err) {
            console.warn("Could not load creators:", err);
            toast.error("Could not load creators");
        } finally {
            setDbLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setDbOffset(0);
            fetchDb(dbSearch, dbCategoryFilter, dbTierFilter, dbIntakeFilter, 0, false);
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [dbSearch, dbCategoryFilter, dbTierFilter, dbIntakeFilter, fetchDb]);

    const loadMore = () => {
        const nextOffset = dbOffset + 50;
        setDbOffset(nextOffset);
        fetchDb(dbSearch, dbCategoryFilter, dbTierFilter, dbIntakeFilter, nextOffset, true);
    };

    const isSel = (email: string) => selectedContacts.some(s => s.email.toLowerCase() === email.toLowerCase());

    const [historyWarnings, setHistoryWarnings] = React.useState<HistoryWarning[]>([]);
    const [pendingContacts, setPendingContacts] = React.useState<CreatorDraftItem[]>([]);
    const [showWarn, setShowWarn] = React.useState(false);
    const [checking, setChecking] = React.useState(false);
    const [ignoredEmails, setIgnoredEmails] = React.useState<Set<string>>(new Set());
    const [warnFilter, setWarnFilter] = React.useState<"all" | "sent" | "not_sent" | "quarantined">("all");
    const [warnSearch, setWarnSearch] = React.useState("");

    const syncSelection = React.useCallback((pending: CreatorDraftItem[], ignored: Set<string>) => {
        if (!pending || pending.length === 0) return;
        const kept = pending.filter(c => !ignored.has(c.email.toLowerCase().trim()));
        const pendingEmails = new Set(pending.map(c => c.email.toLowerCase().trim()));
        const base = selectedContactsRef.current.filter(c => !pendingEmails.has(c.email.toLowerCase().trim()));
        onChangeSelected(deduplicateContacts([...base, ...kept]));
    }, [onChangeSelected]);

    const sentWarnings = React.useMemo(() => historyWarnings.filter(w => w.hasSent && !w.quarantined), [historyWarnings]);
    const notSentWarnings = React.useMemo(() => historyWarnings.filter(w => !w.hasSent && !w.quarantined), [historyWarnings]);
    const quarWarnings = React.useMemo(() => historyWarnings.filter(w => w.quarantined), [historyWarnings]);

    const skipAllSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            sentWarnings.forEach(w => next.add(w.email.toLowerCase().trim()));
            syncSelection(pendingContacts, next);
            return next;
        });
        toast(`Ignored ${sentWarnings.length} creators with sent emails`);
    };

    const skipAllNotSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            notSentWarnings.forEach(w => next.add(w.email.toLowerCase().trim()));
            syncSelection(pendingContacts, next);
            return next;
        });
        toast(`Ignored ${notSentWarnings.length} uncontacted / not-sent creators`);
    };

    const selectAllSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            sentWarnings.forEach(w => next.delete(w.email.toLowerCase().trim()));
            syncSelection(pendingContacts, next);
            return next;
        });
        toast.success(`Selected ${sentWarnings.length} sent creators`);
    };

    const selectAllNotSent = () => {
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            notSentWarnings.forEach(w => next.delete(w.email.toLowerCase().trim()));
            syncSelection(pendingContacts, next);
            return next;
        });
        toast.success(`Selected ${notSentWarnings.length} not-sent creators`);
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

    const batchCheck = React.useCallback(async (toAdd: CreatorDraftItem[]) => {
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

            const dedupedToAdd = deduplicateContacts(toAdd);
            setPendingContacts(dedupedToAdd);

            if (all.length > 0) {
                setHistoryWarnings(all);
                const preIgnored = new Set<string>(quar.map(q => q.email.toLowerCase().trim()));
                setIgnoredEmails(preIgnored);
                setShowWarn(true);
                syncSelection(dedupedToAdd, preIgnored);
                toast(`⚠️ Auto-check: ${all.length} of ${toAdd.length} creators have prior history`, { id: "outreach-check-toast" });
            } else {
                setHistoryWarnings([]);
                syncSelection(dedupedToAdd, new Set());
                toast.success(`✓ Auto-check passed! All ${toAdd.length} creators automatically queued.`, { id: "outreach-check-toast" });
            }
        } catch (err: any) {
            console.error("Batch check error:", err);
            // Still add them if batch check fails
            syncSelection(deduplicateContacts(toAdd), new Set());
        } finally {
            setChecking(false);
        }
    }, [syncSelection]);

    const toggleIgnore = (email: string) => {
        const key = email.toLowerCase().trim();
        setIgnoredEmails(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            syncSelection(pendingContacts, next);
            return next;
        });
    };

    const skipAllFlagged = () => {
        const next = new Set(historyWarnings.map(w => w.email.toLowerCase().trim()));
        setIgnoredEmails(next);
        syncSelection(pendingContacts, next);
        toast("All flagged creators skipped");
    };

    const selectAllFlagged = () => {
        const next = new Set<string>();
        setIgnoredEmails(next);
        syncSelection(pendingContacts, next);
        toast.success("All flagged creators selected");
    };

    const confirmWarn = () => {
        syncSelection(pendingContacts, ignoredEmails);
        const keptCount = pendingContacts.filter(c => !ignoredEmails.has(c.email.toLowerCase().trim())).length;
        const sk = pendingContacts.length - keptCount;
        if (keptCount) toast.success(`Enrolled ${keptCount} creators${sk ? `, skipped ${sk}` : ""}`); else toast(`Skipped ${sk}`);
        setShowWarn(false);
    };

    const cancelWarn = () => {
        const pendingEmails = new Set(pendingContacts.map(c => c.email.toLowerCase().trim()));
        onChangeSelected(selectedContactsRef.current.filter(c => !pendingEmails.has(c.email.toLowerCase().trim())));
        setPendingContacts([]);
        setShowWarn(false);
    };

    const creatorToDraft = (c: NormalizedCreator): CreatorDraftItem => {
        const origin = typeof window !== "undefined" ? window.location.origin : "https://app.theboredmonkey.com";
        const intakeLink = `${origin}/creator/intake/${c.intake_token || c.id}`;
        return {
            id: c.id,
            email: c.email,
            first_name: c.first_name,
            last_name: c.last_name,
            company: c.handle,
            role: c.category,
            handle: c.handle,
            category: c.category,
            followers: c.followers,
            intake_token: c.intake_token,
            intake_link: intakeLink,
            avatar_url: c.avatar_url || undefined,
            source: "database",
        };
    };

    const toggleDb = async (c: NormalizedCreator) => {
        if (isSel(c.email)) {
            onChangeSelected(selectedContacts.filter(s => s.email.toLowerCase() !== c.email.toLowerCase()));
            return;
        }
        await batchCheck([creatorToDraft(c)]);
    };

    const toggleAll = () => {
        const allSel = dbCreators.length > 0 && dbCreators.every(c => isSel(c.email));
        if (allSel) {
            const v = new Set(dbCreators.map(c => c.email.toLowerCase()));
            onChangeSelected(selectedContacts.filter(s => !v.has(s.email.toLowerCase())));
        } else {
            const ex = new Set(selectedContacts.map(s => s.email.toLowerCase()));
            batchCheck(dbCreators.filter(c => !ex.has(c.email.toLowerCase())).map(creatorToDraft));
        }
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

        const emailPrio = [
            (c: string) => c === "toemail" || c === "leademail" || c === "contactemail" || c === "workemail" || c === "primaryemail",
            (c: string) => c === "email" || c === "emailaddress" || c === "recipientemail" || c === "corporateemail" || c === "businessemail",
            (c: string) => c.includes("email"),
            (c: string) => c === "mail" || c === "mailto" || c === "mailid" || c === "directemail",
            (c: string) => c.includes("mail") && !c.includes("mailbox") && !c.includes("domain") && !c.includes("status"),
        ];

        for (const test of emailPrio) {
            const idx = headers.findIndex(h => test(cleanHeaderKey(h)));
            if (idx !== -1) {
                mapping.email = headers[idx];
                break;
            }
        }

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

        const fnIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "firstname" || c === "fname" || c === "first" || c === "givenname" || (c.includes("first") && c.includes("name"));
        });
        if (fnIdx !== -1) mapping.firstName = headers[fnIdx];

        const lnIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "lastname" || c === "lname" || c === "last" || c === "surname" || (c.includes("last") && c.includes("name"));
        });
        if (lnIdx !== -1) mapping.lastName = headers[lnIdx];

        const nameIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "name" || c === "fullname" || c === "creatorname" || c === "creator" || c === "displayname";
        });
        if (nameIdx !== -1) mapping.fullName = headers[nameIdx];

        const coIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "handle" || c === "instagram" || c === "ighandle" || c === "username" || c === "company";
        });
        if (coIdx !== -1) mapping.company = headers[coIdx];

        const rIdx = headers.findIndex(h => {
            const c = cleanHeaderKey(h);
            return c === "category" || c === "niche" || c === "genre" || c === "vertical" || c === "role" || c === "title";
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

                let headerRowIdx = 0;
                const row0Emails = data[0].filter(c => extractEmailAddress(c)).length;
                let detectedHeaders: string[] = [];
                let dataRows: string[][] = [];

                if (row0Emails > 0 && !data[0].some(c => cleanHeaderKey(c).includes("email") || cleanHeaderKey(c).includes("name"))) {
                    detectedHeaders = data[0].map((_, i) => `Column ${i + 1}`);
                    dataRows = data;
                } else {
                    for (let r = 0; r < Math.min(data.length, 5); r++) {
                        const matchCount = data[r].filter(c => {
                            const k = cleanHeaderKey(c);
                            return k.includes("email") || k.includes("mail") || k.includes("name") || k.includes("handle") || k.includes("category");
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
                    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.theboredmonkey.com";
                    const toAdd: CreatorDraftItem[] = parsed.map(row => ({
                        email: row.email,
                        first_name: row.first_name || "",
                        last_name: row.last_name || "",
                        company: row.company || "",
                        role: row.role || "",
                        handle: row.company || "",
                        category: row.role || "",
                        intake_link: `${origin}/creator/intake/${encodeURIComponent((row.company || row.email.split("@")[0]).replace(/^@/, ""))}`,
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
                const origin = typeof window !== "undefined" ? window.location.origin : "https://app.theboredmonkey.com";
                const toAdd: CreatorDraftItem[] = nextRows.map(r => ({
                    email: r.email,
                    first_name: r.first_name || "",
                    last_name: r.last_name || "",
                    company: r.company || "",
                    role: r.role || "",
                    handle: r.company || "",
                    category: r.role || "",
                    intake_link: `${origin}/creator/intake/${encodeURIComponent((r.company || r.email.split("@")[0]).replace(/^@/, ""))}`,
                    source: "csv" as const
                }));
                batchCheck(toAdd);
            } else if (!value) {
                setCsvError("Please select an Email column.");
            }
        }
    };

    const crossCheckCsv = () => {
        if (!csvRows.length) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "https://app.theboredmonkey.com";
        const toAdd: CreatorDraftItem[] = csvRows.map(r => ({
            email: r.email,
            first_name: r.first_name || "",
            last_name: r.last_name || "",
            company: r.company || "",
            role: r.role || "",
            handle: r.company || "",
            category: r.role || "",
            intake_link: `${origin}/creator/intake/${encodeURIComponent((r.company || r.email.split("@")[0]).replace(/^@/, ""))}`,
            source: "csv" as const
        }));
        batchCheck(toAdd);
    };

    const [mEmail, setMEmail] = React.useState("");
    const [mFirst, setMFirst] = React.useState("");
    const [mLast, setMLast] = React.useState("");
    const [mHandle, setMHandle] = React.useState("");
    const [mCategory, setMCategory] = React.useState("");

    const addManual = async (e: React.FormEvent) => {
        e.preventDefault();
        const em = mEmail.trim();
        if (!em || !em.includes("@")) { toast.error("Valid email required"); return; }
        if (isSel(em)) { toast.error("Already queued"); return; }
        const origin = typeof window !== "undefined" ? window.location.origin : "https://app.theboredmonkey.com";
        const cleanHandle = mHandle.trim().replace(/^@/, "");
        const token = cleanHandle || em.split("@")[0];
        setMEmail(""); setMFirst(""); setMLast(""); setMHandle(""); setMCategory("");
        await batchCheck([{
            email: em,
            first_name: mFirst.trim(),
            last_name: mLast.trim(),
            company: cleanHandle ? `@${cleanHandle}` : "",
            role: mCategory.trim(),
            handle: cleanHandle ? `@${cleanHandle}` : "",
            category: mCategory.trim(),
            intake_token: token,
            intake_link: `${origin}/creator/intake/${encodeURIComponent(token)}`,
            source: "manual"
        }]);
    };

    const dbCnt = selectedContacts.filter(s => s.source === "database").length;
    const csvCnt = selectedContacts.filter(s => s.source === "csv").length;
    const manCnt = selectedContacts.filter(s => s.source === "manual").length;

    return (
        <div className="w-full space-y-4">
            <div>
                <p className="text-[13.5px] text-slate-900 font-semibold">Which creators should receive this campaign?</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">Select scouted creators from your Troops creator roster, upload a creator CSV, or add creators manually.</p>
            </div>
            <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                {(["database","csv","manual"] as const).map(tab => {
                    const cnt = tab==="database"?dbCnt:tab==="csv"?csvCnt:manCnt;
                    const icon = tab==="database"?<DatabaseIcon className="w-3.5 h-3.5"/>:tab==="csv"?<FileSpreadsheetIcon className="w-3.5 h-3.5"/>:<UserPlusIcon className="w-3.5 h-3.5"/>;
                    const lbl = tab==="database"?"From Creators DB":tab==="csv"?"Upload CSV":"Add Manually";
                    return <button key={tab} type="button" onClick={()=>setSubTab(tab)} className={cn("h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",subTab===tab?"bg-[#FFF9DB] text-slate-900 font-semibold":"text-slate-600 hover:bg-slate-100")}>{icon}{lbl}{cnt>0&&<span className="px-1.5 rounded-full text-[10px] bg-[#18181B] text-white font-semibold">{cnt}</span>}</button>;
                })}
            </div>

            {showWarn ? (
                <div className="border-2 border-amber-300 rounded-xl bg-white overflow-hidden shadow-sm transition-all">
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

                    <div className="px-4 py-3 space-y-2.5 max-h-[320px] overflow-y-auto bg-slate-50/40">
                        {displayedWarnings.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-slate-500 text-[12px]">
                                No flagged creators match current filter.
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
                                                </div>
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
                    </div>

                    <div className="px-4 py-3 border-t border-amber-200 bg-amber-50/60 flex items-center justify-between gap-3">
                        <div>
                            {(() => {
                                const willAdd = pendingContacts.filter(c => !ignoredEmails.has(c.email.toLowerCase().trim())).length;
                                const willSkip = pendingContacts.length - willAdd;
                                return (
                                    <>
                                        <p className="text-[12px] font-semibold text-slate-900">
                                            {willAdd} of {pendingContacts.length} creators will be added
                                        </p>
                                        {willSkip > 0 && (
                                            <p className="text-[10.5px] text-rose-600 font-medium">
                                                {willSkip} creator{willSkip !== 1 ? "s" : ""} will be skipped
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
                                className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer text-[11.5px] inline-flex items-center gap-1.5 transition-colors"
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
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative flex-1 min-w-[180px]">
                                <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400"/>
                                <input
                                    type="text"
                                    value={dbSearch}
                                    onChange={e=>setDbSearch(e.target.value)}
                                    placeholder="Search @handle, name, email, city..."
                                    className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"
                                />
                            </div>
                            <select
                                value={dbCategoryFilter}
                                onChange={e=>setDbCategoryFilter(e.target.value)}
                                className="h-8 px-2 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none"
                            >
                                <option value="all">All Categories</option>
                                {categories.map(cat => (
                                    <option key={cat.category} value={cat.category}>{cat.category} ({cat.count})</option>
                                ))}
                            </select>
                            <select
                                value={dbTierFilter}
                                onChange={e=>setDbTierFilter(e.target.value)}
                                className="h-8 px-2 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none"
                            >
                                <option value="all">All Follower Tiers</option>
                                <option value="nano">Nano (&lt;10K)</option>
                                <option value="micro">Micro (10K–50K)</option>
                                <option value="mid">Mid (50K–200K)</option>
                                <option value="macro">Macro (200K–1M)</option>
                                <option value="mega">Mega (1M+)</option>
                            </select>
                            <select
                                value={dbIntakeFilter}
                                onChange={e=>setDbIntakeFilter(e.target.value)}
                                className="h-8 px-2 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none"
                            >
                                <option value="all">All Intake Statuses</option>
                                <option value="PENDING">Pending Intake</option>
                                <option value="COMPLETED">100% Enriched</option>
                            </select>
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="h-8 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50 text-[11.5px] text-slate-700 font-medium shrink-0 cursor-pointer"
                            >
                                {dbCreators.every(c=>isSel(c.email))&&dbCreators.length>0?"Deselect All":`Select All (${dbCreators.length}${dbHasMore?"+":""})`}
                            </button>
                        </div>
                        {dbTotal>0&&<p className="text-[11px] text-slate-400">{dbTotal.toLocaleString()} email-ready creators in database · Each creator automatically receives their unique <code className="text-amber-700 bg-amber-50 px-1 rounded">{"{{form_link}}"}</code></p>}
                        <div className="border border-slate-200 rounded-md overflow-hidden bg-white max-h-[260px] overflow-y-auto divide-y divide-slate-100">
                            {dbLoading&&!dbCreators.length?(<div className="py-8 flex items-center justify-center gap-2 text-[12px] text-slate-400"><Loader2Icon className="w-4 h-4 animate-spin"/>Loading creators...</div>)
                            :!dbCreators.length?(<div className="py-8 text-center text-[12px] text-slate-400">No email-ready creators matched filters.</div>)
                            :(<>{dbCreators.map(c=>{
                                const sel=isSel(c.email);
                                return(
                                    <div key={c.id} onClick={()=>toggleDb(c)} className={cn("px-3 py-2 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",sel?"bg-[#FFF9DB]/50 hover:bg-[#FFF9DB]":"hover:bg-slate-50")}>
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <input type="checkbox" checked={sel} onChange={()=>{}} className="rounded border-slate-300 text-slate-900 cursor-pointer"/>
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[1.5px] shrink-0">
                                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden text-[10px] font-bold text-slate-800 relative">
                                                    <span>{(c.first_name || c.handle.replace(/^@/, "") || "C").charAt(0).toUpperCase()}</span>
                                                    {c.avatar_url && (
                                                        <img
                                                            src={c.avatar_url}
                                                            alt=""
                                                            className="w-full h-full object-cover absolute inset-0"
                                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-[12px] font-semibold text-slate-900 truncate">{`${c.first_name} ${c.last_name}`.trim() || c.handle}</p>
                                                    <span className="text-[11px] text-amber-700 font-medium">{c.handle}</span>
                                                    {c.followers && <span className="text-[10.5px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">{c.followers}</span>}
                                                </div>
                                                <p className="text-[11px] text-slate-400 truncate">{c.email}{c.city ? ` · ${c.city}` : ""}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {c.intake_status === "COMPLETED" && (
                                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    100% Enriched
                                                </span>
                                            )}
                                            {c.category && (
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                                                    {c.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}{dbHasMore&&(<div className="px-3 py-2 bg-slate-50 border-t border-slate-100"><button type="button" onClick={e=>{e.stopPropagation();loadMore();}} disabled={dbLoading} className="w-full text-[11.5px] text-slate-900 hover:text-black font-medium flex items-center justify-center gap-1.5 py-0.5 disabled:opacity-50 cursor-pointer">{dbLoading&&<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>}Load more creators</button></div>)}</> )}
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
                                <span className="text-[12.5px] font-semibold text-slate-900 hover:text-black">Click to select Creator CSV file</span>
                                <span className="text-[12px] text-slate-500"> or drag and drop</span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) processCsvFile(f); }}
                                    className="hidden"
                                />
                                <p className="text-[11px] text-slate-400 mt-1.5">
                                    Columns auto-detected: email (required), first_name, handle / instagram, category / niche
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
                                                {(csvFile.size / 1024).toFixed(1)} KB · {csvRawData.length} row{csvRawData.length === 1 ? "" : "s"} · <span className="text-emerald-700 font-semibold">{csvRows.length} valid creator{csvRows.length === 1 ? "" : "s"} detected</span>
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
                                            className="h-7 px-2 rounded text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                                        >
                                            <Trash2Icon className="w-3 h-3"/>
                                            Change
                                        </button>
                                    </div>
                                </div>

                                {showMappingEditor && (
                                    <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-md space-y-2.5">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Email Address *</label>
                                                <select
                                                    value={csvMapping.email}
                                                    onChange={(e) => handleMappingChange("email", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- Select Email Column --</option>
                                                    {csvHeaders.map((h, i) => <option key={i} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">Creator Name</label>
                                                <select
                                                    value={csvMapping.fullName}
                                                    onChange={(e) => handleMappingChange("fullName", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => <option key={i} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block font-medium text-slate-700 mb-0.5">IG Handle</label>
                                                <select
                                                    value={csvMapping.company}
                                                    onChange={(e) => handleMappingChange("company", e.target.value)}
                                                    className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none"
                                                >
                                                    <option value="">-- None --</option>
                                                    {csvHeaders.map((h, i) => <option key={i} value={h}>{h}</option>)}
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
                                        <div className="flex items-center justify-between text-[11.5px] text-slate-600 gap-2 flex-wrap">
                                            <span>Preview: <strong>{csvRows.length} creators</strong> detected in file</span>
                                            <button
                                                type="button"
                                                onClick={crossCheckCsv}
                                                disabled={checking}
                                                className="h-7 px-3 rounded bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                                            >
                                                <CheckIcon className="w-3.5 h-3.5"/>
                                                Queue {csvRows.length} Creators
                                            </button>
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
                            <div><label className="text-[11px] font-medium text-slate-700">Email Address *</label><input type="email" value={mEmail} onChange={e=>setMEmail(e.target.value)} placeholder="creator@gmail.com" required className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">First Name</label><input type="text" value={mFirst} onChange={e=>setMFirst(e.target.value)} placeholder="e.g. Moumita" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Last Name</label><input type="text" value={mLast} onChange={e=>setMLast(e.target.value)} placeholder="e.g. Sharma" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div><label className="text-[11px] font-medium text-slate-700">Instagram Handle</label><input type="text" value={mHandle} onChange={e=>setMHandle(e.target.value)} placeholder="e.g. @itsmoumita" className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/></div>
                            <div className="col-span-2"><label className="text-[11px] font-medium text-slate-700">Creator Category / Niche</label><div className="flex items-center gap-2"><input type="text" value={mCategory} onChange={e=>setMCategory(e.target.value)} placeholder="e.g. Lifestyle & Vlogs" className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFE600]/30 focus:border-slate-800"/><button type="submit" disabled={checking} className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 border border-black/10 font-semibold shadow-xs cursor-pointer text-[12px] inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60">{checking?<Loader2Icon className="w-3.5 h-3.5 animate-spin"/>:<PlusIcon className="w-3.5 h-3.5"/>}Add Creator</button></div></div>
                        </div>
                    </form>
                )}
                </>
            )}

            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                    <UsersIcon className="w-4 h-4 text-slate-900"/>
                    <span className="font-semibold text-slate-900">{selectedContacts.length} Creator{selectedContacts.length===1?"":"s"} Queued:</span>
                    <span className="text-slate-500 text-[11px]">{dbCnt} from Creators DB · {csvCnt} from CSV · {manCnt} Manual</span>
                </div>
                {selectedContacts.length>0&&<button type="button" onClick={()=>onChangeSelected([])} className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer">Clear all</button>}
            </div>
        </div>
    );
}

