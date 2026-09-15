import React from "react";
import {
    CheckIcon,
    DatabaseIcon,
    FileSpreadsheetIcon,
    FilterIcon,
    PlusIcon,
    SearchIcon,
    ShieldAlertIcon,
    Trash2Icon,
    UploadCloudIcon,
    UserPlusIcon,
    UsersIcon,
    XIcon,
} from "lucide-react";
import coreData from "@/lib/api/coreData.json";
import { TextInput } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { checkContactHistory } from "@/lib/intelligence/conversationMemory";
import { CollisionAlertBadge } from "@/components/app/intelligence/CollisionAlertBadge";

export interface ContactDraftItem {
    id?: string;
    email: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    role?: string;
    source: "database" | "csv" | "manual";
}

interface NormalizedContact {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    company: string;
    role: string;
    custom_fields?: Record<string, string>;
}

function loadLocalContacts(): any[] {
    try {
        const item = localStorage.getItem("tbm_core_data_v4_contacts");
        if (item) {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    return (coreData as any).contacts || [];
}

interface ContactsStepProps {
    selectedContacts: ContactDraftItem[];
    onChangeSelected: (contacts: ContactDraftItem[]) => void;
}

export function ContactsStep({ selectedContacts, onChangeSelected }: ContactsStepProps) {
    const [subTab, setSubTab] = React.useState<"database" | "csv" | "manual">("database");

    const [dbContacts] = React.useState<NormalizedContact[]>(() => {
        const raw = loadLocalContacts();
        return raw.map((c: any) => ({
            id: c.id || `cnt_${Math.random()}`,
            email: c.email || "",
            first_name: c.first_name || "",
            last_name: c.last_name || "",
            company: c.company_name || c.company || c.custom_fields?.company || "",
            role: c.title || c.role || c.custom_fields?.role || c.custom_fields?.title || "",
            custom_fields: c.custom_fields || {},
        }));
    });

    // ── Tab 1: Database Search & Filter ────────────────────────────────────
    const [dbSearch, setDbSearch] = React.useState("");
    const [companyFilter, setCompanyFilter] = React.useState<string>("all");

    const filteredDbContacts = React.useMemo(() => {
        const q = dbSearch.trim().toLowerCase();
        return dbContacts.filter((c) => {
            const fullName = `${c.first_name} ${c.last_name}`.trim().toLowerCase();
            const email = (c.email || "").toLowerCase();
            const company = (c.company || "").toLowerCase();
            const role = (c.role || "").toLowerCase();

            const matchesSearch =
                !q ||
                fullName.includes(q) ||
                c.first_name.toLowerCase().includes(q) ||
                c.last_name.toLowerCase().includes(q) ||
                email.includes(q) ||
                company.includes(q) ||
                role.includes(q);

            const matchesCompany =
                companyFilter === "all" ||
                (companyFilter === "has_company" && !!c.company.trim());

            return matchesSearch && matchesCompany;
        });
    }, [dbContacts, dbSearch, companyFilter]);

    const isContactSelected = (email: string) => {
        return selectedContacts.some((sc) => sc.email.toLowerCase() === email.toLowerCase());
    };

    const toggleContact = (contact: NormalizedContact) => {
        if (isContactSelected(contact.email)) {
            onChangeSelected(
                selectedContacts.filter(
                    (sc) => sc.email.toLowerCase() !== contact.email.toLowerCase()
                )
            );
        } else {
            onChangeSelected([
                ...selectedContacts,
                {
                    id: contact.id,
                    email: contact.email,
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    company: contact.company,
                    role: contact.role || contact.custom_fields?.role || contact.custom_fields?.title || "",
                    source: "database",
                },
            ]);
        }
    };

    const toggleSelectAllFiltered = () => {
        const allSelected = filteredDbContacts.length > 0 && filteredDbContacts.every((c) => isContactSelected(c.email));
        if (allSelected) {
            const filteredEmails = new Set(filteredDbContacts.map((c) => c.email.toLowerCase()));
            onChangeSelected(
                selectedContacts.filter((sc) => !filteredEmails.has(sc.email.toLowerCase()))
            );
        } else {
            const existingEmails = new Set(selectedContacts.map((sc) => sc.email.toLowerCase()));
            const toAdd: ContactDraftItem[] = [];
            filteredDbContacts.forEach((c) => {
                if (!existingEmails.has(c.email.toLowerCase())) {
                    toAdd.push({
                        id: c.id,
                        email: c.email,
                        first_name: c.first_name,
                        last_name: c.last_name,
                        company: c.company,
                        role: c.role || c.custom_fields?.role || c.custom_fields?.title || "",
                        source: "database",
                    });
                }
            });
            onChangeSelected([...selectedContacts, ...toAdd]);
        }
    };

    // ── Tab 2: Upload CSV ──────────────────────────────────────────────────
    const [csvFile, setCsvFile] = React.useState<File | null>(null);
    const [csvRows, setCsvRows] = React.useState<Array<{
        email: string;
        first_name?: string;
        last_name?: string;
        company?: string;
        role?: string;
    }>>([]);
    const [csvError, setCsvError] = React.useState<string>("");

    const parseCsvText = (text: string) => {
        try {
            const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
            if (lines.length < 2) {
                setCsvError("CSV file must contain at least a header row and one contact row.");
                return;
            }

            // Parse header columns
            const rawHeaders = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
            const emailIdx = rawHeaders.findIndex((h) => h.includes("email") || h.includes("mail"));
            if (emailIdx === -1) {
                setCsvError("Could not find an 'email' column header in your CSV.");
                return;
            }

            const fnIdx = rawHeaders.findIndex((h) => h.includes("first") || h === "name");
            const lnIdx = rawHeaders.findIndex((h) => h.includes("last"));
            const compIdx = rawHeaders.findIndex((h) => h.includes("company") || h.includes("org"));
            const roleIdx = rawHeaders.findIndex((h) => h.includes("role") || h.includes("title") || h.includes("position"));

            const parsed: Array<{ email: string; first_name?: string; last_name?: string; company?: string; role?: string }> = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                // Handle quoted fields
                const values: string[] = [];
                let inQuote = false;
                let current = "";
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"' || char === "'") {
                        inQuote = !inQuote;
                    } else if (char === "," && !inQuote) {
                        values.push(current.trim());
                        current = "";
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim());

                const email = (values[emailIdx] || "").replace(/^["']|["']$/g, "");
                if (email && email.includes("@")) {
                    parsed.push({
                        email,
                        first_name: fnIdx !== -1 ? (values[fnIdx] || "").replace(/^["']|["']$/g, "") : "",
                        last_name: lnIdx !== -1 ? (values[lnIdx] || "").replace(/^["']|["']$/g, "") : "",
                        company: compIdx !== -1 ? (values[compIdx] || "").replace(/^["']|["']$/g, "") : "",
                        role: roleIdx !== -1 ? (values[roleIdx] || "").replace(/^["']|["']$/g, "") : "",
                    });
                }
            }

            if (parsed.length === 0) {
                setCsvError("No valid email addresses found in the CSV rows.");
                return;
            }

            setCsvRows(parsed);
            setCsvError("");
        } catch (err) {
            setCsvError(`CSV Parsing error: ${(err as Error).message}`);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFile(file);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            parseCsvText(text);
        };
        reader.readAsText(file);
    };

    const handleImportCsv = () => {
        if (csvRows.length === 0) return;
        const existingEmails = new Set(selectedContacts.map((sc) => sc.email.toLowerCase()));
        const toAdd: ContactDraftItem[] = [];

        csvRows.forEach((r) => {
            if (!existingEmails.has(r.email.toLowerCase())) {
                toAdd.push({
                    email: r.email,
                    first_name: r.first_name || "",
                    last_name: r.last_name || "",
                    company: r.company || "",
                    role: r.role || "",
                    source: "csv",
                });
                existingEmails.add(r.email.toLowerCase());
            }
        });

        onChangeSelected([...selectedContacts, ...toAdd]);
        toast.success(`Imported ${toAdd.length} contacts from CSV.`);
        setCsvRows([]);
        setCsvFile(null);
    };

    // ── Tab 3: Manual Entry ────────────────────────────────────────────────
    const [manualEmail, setManualEmail] = React.useState("");
    const [manualFirst, setManualFirst] = React.useState("");
    const [manualLast, setManualLast] = React.useState("");
    const [manualCompany, setManualCompany] = React.useState("");
    const [manualRole, setManualRole] = React.useState("");

    const handleAddManual = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = manualEmail.trim();
        if (!trimmedEmail || !trimmedEmail.includes("@")) {
            toast.error("Please provide a valid email address");
            return;
        }

        if (isContactSelected(trimmedEmail)) {
            toast.error("This contact is already in your campaign list");
            return;
        }

        onChangeSelected([
            ...selectedContacts,
            {
                email: trimmedEmail,
                first_name: manualFirst.trim(),
                last_name: manualLast.trim(),
                company: manualCompany.trim(),
                role: manualRole.trim(),
                source: "manual",
            },
        ]);

        toast.success(`Added ${trimmedEmail}`);
        setManualEmail("");
        setManualFirst("");
        setManualLast("");
        setManualCompany("");
        setManualRole("");
    };

    const removeContact = (email: string) => {
        onChangeSelected(
            selectedContacts.filter((sc) => sc.email.toLowerCase() !== email.toLowerCase())
        );
    };

    const dbSelectedCount = selectedContacts.filter((s) => s.source === "database").length;
    const csvSelectedCount = selectedContacts.filter((s) => s.source === "csv").length;
    const manualSelectedCount = selectedContacts.filter((s) => s.source === "manual").length;
    const collisionCount = selectedContacts.filter((s) => checkContactHistory(s.email, s.first_name, s.last_name) !== null).length;

    return (
        <div className="max-w-[640px] space-y-4">
            <div>
                <p className="text-[13.5px] text-slate-900 font-semibold">Who should receive this campaign?</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5 leading-relaxed">
                    Select contacts from your existing database, upload a CSV list, or add contacts manually.
                </p>
            </div>

            {/* Sub-Tab Navigation Bar */}
            <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                <button
                    type="button"
                    onClick={() => setSubTab("database")}
                    className={cn(
                        "h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",
                        subTab === "database"
                            ? "bg-sky-50 text-sky-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-100"
                    )}
                >
                    <DatabaseIcon className="w-3.5 h-3.5" />
                    From Database
                    {dbSelectedCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-600 text-white font-semibold tabular-nums">
                            {dbSelectedCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("csv")}
                    className={cn(
                        "h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",
                        subTab === "csv"
                            ? "bg-sky-50 text-sky-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-100"
                    )}
                >
                    <FileSpreadsheetIcon className="w-3.5 h-3.5" />
                    Upload CSV
                    {csvSelectedCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-600 text-white font-semibold tabular-nums">
                            {csvSelectedCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("manual")}
                    className={cn(
                        "h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-2 transition-colors",
                        subTab === "manual"
                            ? "bg-sky-50 text-sky-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-100"
                    )}
                >
                    <UserPlusIcon className="w-3.5 h-3.5" />
                    Add Manually
                    {manualSelectedCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-600 text-white font-semibold tabular-nums">
                            {manualSelectedCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Tab 1 Content: From Database */}
            {subTab === "database" && (
                <div className="space-y-3">
                    {/* Search & Filter Bar */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                value={dbSearch}
                                onChange={(e) => setDbSearch(e.target.value)}
                                placeholder="Search by name, email, or company..."
                                className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                            />
                        </div>

                        <select
                            value={companyFilter}
                            onChange={(e) => setCompanyFilter(e.target.value)}
                            className="h-8 px-2 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none"
                        >
                            <option value="all">All Contacts</option>
                            <option value="has_company">Has Company</option>
                        </select>

                        <button
                            type="button"
                            onClick={toggleSelectAllFiltered}
                            className="h-8 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50 text-[11.5px] text-slate-700 font-medium shrink-0 transition-colors"
                        >
                            {filteredDbContacts.every((c) => isContactSelected(c.email))
                                ? "Deselect All"
                                : `Select All (${filteredDbContacts.length})`}
                        </button>
                    </div>

                    {/* Contacts List */}
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white max-h-[260px] overflow-y-auto divide-y divide-slate-100">
                        {filteredDbContacts.length === 0 ? (
                            <div className="py-8 text-center text-[12px] text-slate-400">
                                No contacts matched your search filter.
                            </div>
                        ) : (
                            filteredDbContacts.map((contact) => {
                                const selected = isContactSelected(contact.email);
                                const collision = checkContactHistory(contact.email, contact.first_name, contact.last_name);
                                return (
                                    <div
                                        key={contact.id}
                                        onClick={() => toggleContact(contact)}
                                        className={cn(
                                            "px-3 py-2 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",
                                            selected ? "bg-sky-50/50 hover:bg-sky-50" : "hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => {}} // Controlled via row click
                                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[12px] font-medium text-slate-900 truncate">
                                                        {contact.first_name || contact.last_name
                                                            ? `${contact.first_name} ${contact.last_name}`.trim()
                                                            : contact.email}
                                                    </p>
                                                    {collision && (
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <CollisionAlertBadge record={collision} compact />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    {contact.email}
                                                    {contact.company && ` · ${contact.company}`}
                                                </p>
                                            </div>
                                        </div>

                                        {(contact.role || contact.custom_fields?.role) && (
                                            <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                                                {contact.role || contact.custom_fields?.role}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Tab 2 Content: Upload CSV */}
            {subTab === "csv" && (
                <div className="space-y-3">
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-sky-400 transition-colors bg-slate-50/50">
                        <UploadCloudIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <label className="cursor-pointer">
                            <span className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                                Click to select CSV file
                            </span>
                            <span className="text-[12px] text-slate-500"> or drag and drop</span>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                        <p className="text-[11px] text-slate-400 mt-1">
                            Columns auto-detected: email, first_name, last_name, company, role
                        </p>
                    </div>

                    {csvError && (
                        <p className="text-[11.5px] text-rose-600 leading-relaxed font-medium">
                            {csvError}
                        </p>
                    )}

                    {csvRows.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11.5px] text-slate-600">
                                <span>
                                    Ready to import <strong>{csvRows.length} contacts</strong> from{" "}
                                    <code className="font-mono text-slate-800">{csvFile?.name}</code>
                                </span>
                                <button
                                    type="button"
                                    onClick={handleImportCsv}
                                    className="h-7 px-3 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium inline-flex items-center gap-1 transition-colors"
                                >
                                    <CheckIcon className="w-3.5 h-3.5" />
                                    Import Contacts
                                </button>
                            </div>

                            {/* Preview Table */}
                            <div className="border border-slate-200 rounded-md overflow-hidden bg-white text-[11.5px]">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-2.5 py-1.5">Email</th>
                                            <th className="px-2.5 py-1.5">First Name</th>
                                            <th className="px-2.5 py-1.5">Company</th>
                                            <th className="px-2.5 py-1.5">Role</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {csvRows.slice(0, 4).map((r, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                <td className="px-2.5 py-1 font-medium text-slate-900">{r.email}</td>
                                                <td className="px-2.5 py-1 text-slate-600">{r.first_name || "—"}</td>
                                                <td className="px-2.5 py-1 text-slate-600">{r.company || "—"}</td>
                                                <td className="px-2.5 py-1 text-slate-600">{r.role || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {csvRows.length > 4 && (
                                    <div className="px-2.5 py-1 text-[10.5px] text-slate-400 bg-slate-50/40 border-t border-slate-100">
                                        + {csvRows.length - 4} more contacts in CSV
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 3 Content: Manual Entry */}
            {subTab === "manual" && (
                <form onSubmit={handleAddManual} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[11px] font-medium text-slate-700">Email Address *</label>
                            <input
                                type="email"
                                value={manualEmail}
                                onChange={(e) => setManualEmail(e.target.value)}
                                placeholder="name@company.com"
                                required
                                className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-slate-700">First Name</label>
                            <input
                                type="text"
                                value={manualFirst}
                                onChange={(e) => setManualFirst(e.target.value)}
                                placeholder="e.g. Haji"
                                className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-slate-700">Last Name</label>
                            <input
                                type="text"
                                value={manualLast}
                                onChange={(e) => setManualLast(e.target.value)}
                                placeholder="e.g. Karim"
                                className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-slate-700">Company</label>
                            <input
                                type="text"
                                value={manualCompany}
                                onChange={(e) => setManualCompany(e.target.value)}
                                placeholder="e.g. TheBoredMonkey"
                                className="w-full h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="text-[11px] font-medium text-slate-700">Role / Job Title</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={manualRole}
                                    onChange={(e) => setManualRole(e.target.value)}
                                    placeholder="e.g. Head of Growth / Founder"
                                    className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                                />
                                <button
                                    type="submit"
                                    className="h-8 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" />
                                    Add Contact
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            {/* Persistent Selected Contacts Summary Footer */}
            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                    <UsersIcon className="w-4 h-4 text-sky-600" />
                    <span className="font-semibold text-slate-900">
                        {selectedContacts.length} Contact{selectedContacts.length === 1 ? "" : "s"} Queued:
                    </span>
                    <span className="text-slate-500 text-[11px]">
                        {dbSelectedCount} from DB · {csvSelectedCount} from CSV · {manualSelectedCount} Manual
                    </span>
                </div>

                {selectedContacts.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onChangeSelected([])}
                        className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors"
                    >
                        Clear selection
                    </button>
                )}

                {collisionCount > 0 && (
                    <div className="w-full text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded p-2 flex items-center gap-2 mt-1">
                        <ShieldAlertIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                            <strong>Collision Shield:</strong> {collisionCount} selected contact{collisionCount === 1 ? " was" : "s were"} previously contacted by another team member. Hover over contact badge to inspect prior conversation summary.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
