import React, { useState, useEffect } from "react";
import {
    Page,
    PageTopbar,
    PageBody,
    StatStrip,
    Stat,
    TopbarAction,
} from "@/components/layout/Page";
import {
    SearchIcon,
    DatabaseIcon,
    CheckCircle2Icon,
    RefreshCwIcon,
    FilterIcon,
    UsersIcon,
    BuildingIcon,
    MapPinIcon,
    MailIcon,
    LinkedinIcon,
    SparklesIcon,
    ExternalLinkIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    DownloadCloudIcon,
    BriefcaseIcon,
    ArrowUpRightIcon,
    PlusIcon,
    FileTextIcon,
    LayersIcon,
    XIcon,
    Trash2Icon,
    CopyIcon,
    GlobeIcon,
    ClockIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { NewCampaignDialog } from "@/components/app/campaigns/NewCampaignDialog";
import type { ContactDraftItem } from "@/components/app/campaigns/ContactsStep";

interface ApolloSearchResultItem {
    id: string;
    first_name: string;
    last_name_obfuscated?: string;
    title?: string;
    has_email: boolean;
    has_direct_phone?: string;
    has_city?: boolean;
    has_country?: boolean;
    alreadyInDb?: boolean;
    justAutoStored?: boolean;
    status?: string;
    last_contacted_at?: string;
    last_outcome?: string;
    outreach_state?: string;
    reply_classification?: string;
    days_since_last_contact?: number | null;
    organization?: {
        name?: string;
        has_industry?: boolean;
        has_phone?: boolean;
        has_city?: boolean;
        has_country?: boolean;
        has_employee_count?: boolean;
    };
}

interface SavedLeadItem {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    designation: string;
    categoryKey: string;
    domain: string;
    brandId: string;
    brandName: string;
    status?: string;
    lastContactedAt?: string;
    lastOutcome?: string;
    outreachState?: string;
    replyClassification?: string;
    daysSinceLastContact?: number | null;
    customData?: {
        linkedin_url?: string;
        city?: string;
        state?: string;
        country?: string;
        companyRevenue?: string;
        companyEmployees?: number;
        companyTechnologies?: string[];
        email_status?: string;
    };
    createdAt: string;
    thesisId?: string | null;
}

const TITLE_PRESETS = [
    { label: "Founders & C-Suite", titles: ["Founder", "Co-Founder", "CEO", "Managing Director"] },
    { label: "Marketing & Growth", titles: ["Chief Marketing Officer", "CMO", "VP Marketing", "Head of Growth", "Director of Marketing"] },
    { label: "E-commerce & Brand", titles: ["Head of E-Commerce", "Brand Director", "VP Brand", "Head of Digital"] },
    { label: "Custom", titles: [] },
];

const LOCATION_PRESETS = ["India", "United States", "United Kingdom", "Singapore", "Bengaluru", "Mumbai", "Delhi"];

const SIZE_PRESETS = [
    { label: "1 - 10", value: "1,10" },
    { label: "11 - 50", value: "11,50" },
    { label: "51 - 200", value: "51,200" },
    { label: "201 - 500", value: "201,500" },
    { label: "500+", value: "501,10000" },
];

export default function ApolloLeadExplorerPage() {
    const [activeTab, setActiveTab] = useState<"search" | "saved">("search");

    // Search filters
    const [selectedPreset, setSelectedPreset] = useState<string>("Founders & C-Suite");
    const [customTitles, setCustomTitles] = useState<string>("Founder, Co-Founder, CEO");
    const [keywords, setKeywords] = useState<string>("");
    const [location, setLocation] = useState<string>("India");
    const [domainFilter, setDomainFilter] = useState<string>("");
    const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
    const [autoStore, setAutoStore] = useState<boolean>(false);

    // Search state
    const [page, setPage] = useState<number>(1);
    const [searchResults, setSearchResults] = useState<ApolloSearchResultItem[]>([]);
    const [totalResults, setTotalResults] = useState<number>(0);
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());

    // Saving / enriching state
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveProgress, setSaveProgress] = useState<string>("");

    // Saved database leads state
    const [savedLeads, setSavedLeads] = useState<SavedLeadItem[]>([]);
    const [totalSaved, setTotalSaved] = useState<number>(0);
    const [totalDatabaseContacts, setTotalDatabaseContacts] = useState<number>(51744);
    const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
    const [savedSearchQuery, setSavedSearchQuery] = useState<string>("");
    const [selectedSavedLeadIds, setSelectedSavedLeadIds] = useState<Set<string>>(new Set());

    // Batch & View state for recently selected contacts (shows new ones every time)
    const [currentBatchLeads, setCurrentBatchLeads] = useState<SavedLeadItem[]>([]);
    const [recentlySelectedView, setRecentlySelectedView] = useState<"batch" | "all">("batch");

    // Search Templates / Lead Personas state
    const [searchTemplates, setSearchTemplates] = useState<{ id: string; name: string; titles: string; location: string; domain?: string }[]>(() => {
        try {
            const raw = localStorage.getItem("tbm_lead_search_templates");
            return raw ? JSON.parse(raw) : [
                { id: "founders_india", name: "Founders & C-Suite", titles: "Founder, Co-Founder, CEO, Managing Director", location: "India" },
                { id: "growth_marketing", name: "Marketing & Growth", titles: "Chief Marketing Officer, CMO, VP Marketing, Head of Growth", location: "India" },
                { id: "ecommerce_brand", name: "E-commerce & Brand", titles: "Head of E-Commerce, Brand Director, VP Brand", location: "India", domain: "ecommerce, d2c" },
                { id: "fashion_apparel", name: "Fashion & Apparel", titles: "Chief Marketing Officer, CMO, VP Marketing, Head of Growth", location: "India", domain: "fashion" },
            ];
        } catch {
            return [];
        }
    });
    const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);
    const [newTemplateName, setNewTemplateName] = useState<string>("");

    // Campaign creation modal state
    const [isNewCampaignOpen, setIsNewCampaignOpen] = useState<boolean>(false);
    const [campaignInitialContacts, setCampaignInitialContacts] = useState<ContactDraftItem[]>([]);

    // Apollo Templates state
    const [apolloTemplates, setApolloTemplates] = useState<any[]>([]);
    const [apolloSequences, setApolloSequences] = useState<any[]>([]);
    const [showTemplatesModal, setShowTemplatesModal] = useState<boolean>(false);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
    const [selectedSequence, setSelectedSequence] = useState<any | null>(null);
    const [isLoadingSequence, setIsLoadingSequence] = useState<boolean>(false);

    const fetchApolloTemplates = async () => {
        setIsLoadingTemplates(true);
        setSelectedSequence(null);
        try {
            const res = await fetch("/api/apollo/templates");
            const data = await res.json();
            setApolloTemplates(data.templates || []);
            setApolloSequences(data.sequences || []);
            setShowTemplatesModal(true);
        } catch {
            toast.error("Failed to load Apollo templates");
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    const handleSelectSequence = async (seq: any) => {
        if (selectedSequence?.id === seq.id) {
            setSelectedSequence(null);
            return;
        }
        setIsLoadingSequence(true);
        try {
            const res = await fetch(`/api/apollo/sequence?id=${seq.id}`);
            const data = await res.json();
            setSelectedSequence(data);
        } catch {
            toast.error("Failed to load sequence email steps");
        } finally {
            setIsLoadingSequence(false);
        }
    };

    const copyToClipboard = (text: string, label: string = "Copy") => {
        navigator.clipboard.writeText(text);
        toast.success(`Copied ${label} to clipboard!`);
    };

    const toggleSelectSavedLead = (id: string) => {
        setSelectedSavedLeadIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const displayedSavedLeads =
        recentlySelectedView === "batch" && currentBatchLeads.length > 0
            ? currentBatchLeads
            : savedLeads;

    const selectAllSavedLeads = () => {
        if (selectedSavedLeadIds.size === displayedSavedLeads.length) {
            setSelectedSavedLeadIds(new Set());
        } else {
            setSelectedSavedLeadIds(new Set(displayedSavedLeads.map((l) => l.id)));
        }
    };

    const handleCreateCampaign = () => {
        const pool = displayedSavedLeads;
        const selected = pool.filter((l) => selectedSavedLeadIds.has(l.id));
        if (selected.length === 0) {
            toast.error("Please select at least one contact to create a campaign");
            return;
        }

        const draftContacts: ContactDraftItem[] = selected.map((l) => ({
            id: l.id,
            email: l.email,
            first_name: l.firstName,
            last_name: l.lastName,
            company: l.brandName || l.domain,
            role: l.designation,
            source: "database",
        }));

        setCampaignInitialContacts(draftContacts);
        setIsNewCampaignOpen(true);
    };

    const handleDeleteLead = async (leadId: string) => {
        try {
            const res = await fetch(`/api/apollo/lead?id=${leadId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Contact removed from database");
                fetchSavedLeads();
            } else {
                toast.error("Failed to delete contact");
            }
        } catch {
            toast.error("Failed to delete contact");
        }
    };

    // Fetch saved leads from DB
    const fetchSavedLeads = async () => {
        setIsLoadingSaved(true);
        try {
            const queryParam = savedSearchQuery ? `&search=${encodeURIComponent(savedSearchQuery)}` : "";
            const res = await fetch(`/api/apollo/saved?limit=100${queryParam}`);
            const data = await res.json();
            setSavedLeads(data.leads || []);
            setTotalSaved(data.total || 0);
            if (data.totalDatabaseContacts) {
                setTotalDatabaseContacts(data.totalDatabaseContacts);
            }
        } catch {
            toast.error("Failed to load saved leads from database");
        } finally {
            setIsLoadingSaved(false);
        }
    };

    useEffect(() => {
        fetchSavedLeads();
    }, [savedSearchQuery]);

    // Handle Title Preset Selection
    const handlePresetChange = (presetName: string) => {
        setSelectedPreset(presetName);
        const preset = TITLE_PRESETS.find((p) => p.label === presetName);
        if (preset && preset.titles.length > 0) {
            setCustomTitles(preset.titles.join(", "));
        }
    };

    const handleApplySearchTemplate = (tpl: any) => {
        setSelectedPreset(tpl.name);
        setCustomTitles(tpl.titles || "");
        if (tpl.location) setLocation(tpl.location);
        if (tpl.domain !== undefined) setDomainFilter(tpl.domain);
        toast.success(`Loaded "${tpl.name}" search template`);
    };

    const handleSaveSearchTemplate = () => {
        if (!newTemplateName.trim()) {
            toast.error("Please enter a template name");
            return;
        }
        const newTpl = {
            id: `tpl_${Date.now()}`,
            name: newTemplateName.trim(),
            titles: customTitles,
            location: location,
            domain: domainFilter,
        };
        const updated = [...searchTemplates, newTpl];
        setSearchTemplates(updated);
        try {
            localStorage.setItem("tbm_lead_search_templates", JSON.stringify(updated));
        } catch {}
        setNewTemplateName("");
        setIsSavingTemplate(false);
        toast.success(`Saved "${newTpl.name}" lead search template!`);
    };

    const toggleSize = (sizeVal: string) => {
        setSelectedSizes((prev) =>
            prev.includes(sizeVal) ? prev.filter((s) => s !== sizeVal) : [...prev, sizeVal]
        );
    };

    // Run Apollo Search
    const handleSearch = async (targetPage = 1) => {
        setIsSearching(true);
        setPage(targetPage);
        setSelectedPersonIds(new Set());

        try {
            const titles = customTitles
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const payload: any = {
                page: targetPage,
                per_page: 25,
                autoVerifyAndStore: autoStore,
            };

            if (keywords.trim()) payload.q_keywords = keywords.trim();
            if (titles.length > 0) payload.person_titles = titles;
            if (location.trim()) payload.person_locations = [location.trim()];
            
            // Clean domain / company / industry fuzzy input
            let cleanFuzzy = domainFilter.trim().replace(/\s+(or|and)\s+brand\s+name/gi, "").trim();
            if (cleanFuzzy) payload.q_organization_domains = cleanFuzzy;
            if (selectedSizes.length > 0) payload.organization_num_employees_ranges = selectedSizes;

            const res = await fetch("/api/apollo/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Search failed");
            }

            const data = await res.json();
            setSearchResults(data.people || []);
            setTotalResults(data.total || 0);

            if (data.autoStoredCount > 0) {
                toast.success(`Deduplicated & auto-stored ${data.autoStoredCount} new verified contacts into Contacts!`);
                fetchSavedLeads();
            } else {
                toast.success(`Found ${Number(data.total).toLocaleString()} matching prospects`);
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to search Apollo");
        } finally {
            setIsSearching(false);
        }
    };

    // Load More Leads Below (Infinite Expansion)
    const handleLoadMore = async () => {
        const nextPage = page + 1;
        setIsLoadingMore(true);

        try {
            const titles = customTitles
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const payload: any = {
                page: nextPage,
                per_page: 25,
            };

            if (keywords.trim()) payload.q_keywords = keywords.trim();
            if (titles.length > 0) payload.person_titles = titles;
            if (location.trim()) payload.person_locations = [location.trim()];
            let cleanFuzzy = domainFilter.trim().replace(/\s+(or|and)\s+brand\s+name/gi, "").trim();
            if (cleanFuzzy) payload.q_organization_domains = cleanFuzzy;
            if (selectedSizes.length > 0) payload.organization_num_employees_ranges = selectedSizes;

            const res = await fetch("/api/apollo/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.people && data.people.length > 0) {
                setSearchResults((prev) => [...prev, ...data.people]);
                setPage(nextPage);
                toast.success(`Loaded ${data.people.length} more contacts below`);
            } else {
                toast("No more contacts available");
            }
        } catch {
            toast.error("Failed to load more contacts");
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Selection toggle
    const toggleSelectPerson = (id: string) => {
        setSelectedPersonIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllOnPage = () => {
        if (selectedPersonIds.size === searchResults.length) {
            setSelectedPersonIds(new Set());
        } else {
            setSelectedPersonIds(new Set(searchResults.map((p) => p.id)));
        }
    };

    // Enrich and Save Batch
    const handleEnrichAndSave = async (idsToSave?: string[]) => {
        const ids = idsToSave || Array.from(selectedPersonIds);
        if (ids.length === 0) {
            toast.error("Please select at least one contact to save");
            return;
        }

        setIsSaving(true);
        setSaveProgress(`Enriching & saving ${ids.length} contacts...`);

        try {
            const res = await fetch("/api/apollo/enrich-and-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ personIds: ids }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");

            if (data.savedCount === 0 && data.errors && data.errors.length > 0) {
                const firstErr = data.errors[0]?.error || "Enrichment failed";
                toast.error(firstErr, { duration: 7000 });
                return;
            }

            if (data.errors && data.errors.length > 0) {
                toast.success(`Loaded ${data.savedCount} contacts from database! (${data.errors.length} new leads skipped: Apollo credit limit reached)`, { duration: 6000 });
            } else {
                const allExisting = data.saved && data.saved.length > 0 && data.saved.every((s: any) => s.alreadyStored);
                if (allExisting) {
                    toast.success(`Loaded ${data.savedCount} contacts from your database! (0 Apollo credits consumed)`);
                } else {
                    toast.success(`Successfully saved ${data.savedCount} leads into your database!`);
                }
            }
            setSelectedPersonIds(new Set());
            await fetchSavedLeads();

            // Set current batch to the newly saved leads, pre-select all, and automatically switch tab!
            if (data.saved && data.saved.length > 0) {
                const batchItems: SavedLeadItem[] = data.saved.map((s: any) => ({
                    id: s.leadId || s.id,
                    email: s.email,
                    firstName: s.firstName || s.first_name,
                    lastName: s.lastName || s.last_name,
                    designation: s.designation || s.title,
                    brandId: s.brandId,
                    brandName: s.brandName || s.company,
                    domain: s.domain,
                    categoryKey: s.categoryKey,
                    customData: {
                        apolloId: s.apolloId,
                        city: s.city,
                        country: s.country,
                        linkedin_url: s.linkedin_url,
                        companyEmployees: s.companyEmployees,
                        companyTechnologies: s.companyTechnologies,
                    },
                    createdAt: new Date().toISOString(),
                }));

                setCurrentBatchLeads(batchItems);
                setRecentlySelectedView("batch");
                setSelectedSavedLeadIds(new Set(batchItems.map((b) => b.id)));
                setActiveTab("saved");
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to enrich and save");
        } finally {
            setIsSaving(false);
            setSaveProgress("");
        }
    };

    return (
        <Page>
            <PageTopbar
                eyebrow="Apollo Contacts Explorer"
                subtitle="Search Apollo, verify emails & phone numbers, deduplicate, and store permanently into Contacts"
            >
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchApolloTemplates}
                        disabled={isLoadingTemplates}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition"
                    >
                        {isLoadingTemplates ? (
                            <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <FileTextIcon className="w-3.5 h-3.5 text-stone-500" />
                        )}
                        Apollo Email Sequences
                    </button>
                    <button
                        onClick={() => {
                            if (activeTab === "search") handleSearch(page);
                            else fetchSavedLeads();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition"
                    >
                        <RefreshCwIcon className="w-3.5 h-3.5" />
                        Refresh
                    </button>
                    <button
                        onClick={() => setActiveTab(activeTab === "search" ? "saved" : "search")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-stone-900 text-white hover:bg-stone-800 transition"
                    >
                        {activeTab === "search" ? (
                            <>
                                <DatabaseIcon className="w-3.5 h-3.5" />
                                Recently Selected Contacts ({recentlySelectedView === "batch" && currentBatchLeads.length > 0 ? currentBatchLeads.length : totalSaved})
                            </>
                        ) : (
                            <>
                                <SearchIcon className="w-3.5 h-3.5" />
                                Search Apollo
                            </>
                        )}
                    </button>
                </div>
            </PageTopbar>

            <StatStrip>
                <Stat
                    label="Contacts in DB"
                    value={totalDatabaseContacts.toLocaleString()}
                    sub="Searched 1st before Apollo"
                    accent
                />
                <Stat
                    label="Apollo Enriched in DB"
                    value={totalSaved}
                    sub="Saved via Apollo API"
                />
                <Stat
                    label="Apollo API Status"
                    value="Connected"
                    sub="Official mixed_people active"
                />
                <Stat
                    label="Search Mode"
                    value="Local-First"
                    sub="DB matches top, Apollo 2nd"
                />
            </StatStrip>

            {/* Tab Selector */}
            <div className="border-b border-stone-200 bg-white px-6 pt-3 flex gap-6">
                <button
                    onClick={() => setActiveTab("search")}
                    className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
                        activeTab === "search"
                            ? "border-stone-900 text-stone-900"
                            : "border-transparent text-stone-500 hover:text-stone-800"
                    }`}
                >
                    <SearchIcon className="w-4 h-4" />
                    Apollo Lead Search
                </button>
                <button
                    onClick={() => setActiveTab("saved")}
                    className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
                        activeTab === "saved"
                            ? "border-stone-900 text-stone-900"
                            : "border-transparent text-stone-500 hover:text-stone-800"
                    }`}
                >
                    <DatabaseIcon className="w-4 h-4" />
                    Recently Selected Contacts ({recentlySelectedView === "batch" && currentBatchLeads.length > 0 ? currentBatchLeads.length : totalSaved})
                </button>
            </div>

            <PageBody className="p-6">
                {activeTab === "search" ? (
                    <div className="space-y-6">
                        {/* Search Filter Box */}
                        <div className="bg-white rounded-lg border border-stone-200/80 p-5 shadow-xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
                                <div className="flex items-center gap-2">
                                    <FilterIcon className="w-4 h-4 text-stone-600" />
                                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                                        Prospect Filters
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] text-stone-400 font-medium mr-1">Search Templates:</span>
                                    {searchTemplates.map((tpl) => (
                                        <button
                                            key={tpl.id}
                                            onClick={() => handleApplySearchTemplate(tpl)}
                                            className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                                                selectedPreset === tpl.name
                                                    ? "bg-stone-900 text-white shadow-2xs"
                                                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                            }`}
                                        >
                                            {tpl.name}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setIsSavingTemplate(!isSavingTemplate)}
                                        className="px-2.5 py-1 text-xs rounded-full font-medium border border-dashed border-stone-300 text-stone-600 hover:border-stone-500 hover:text-stone-900 transition flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-3 h-3 text-amber-500" />
                                        Save Template
                                    </button>
                                </div>
                            </div>

                            {/* Save Search Template Bar */}
                            {isSavingTemplate && (
                                <div className="flex items-center gap-2 p-2.5 bg-stone-50 rounded-md border border-stone-200 text-xs">
                                    <span className="font-semibold text-stone-700 shrink-0">Name this Search Template:</span>
                                    <input
                                        type="text"
                                        value={newTemplateName}
                                        onChange={(e) => setNewTemplateName(e.target.value)}
                                        placeholder="e.g. P&G Decision Makers, D2C Founders..."
                                        className="flex-1 px-3 py-1 text-xs rounded border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
                                    />
                                    <button
                                        onClick={handleSaveSearchTemplate}
                                        className="px-3 py-1 bg-stone-900 text-white rounded font-semibold hover:bg-stone-800 transition"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setIsSavingTemplate(false)}
                                        className="px-2 py-1 text-stone-500 hover:text-stone-700"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1">
                                        Job Titles (comma-separated)
                                    </label>
                                    <input
                                        type="text"
                                        value={customTitles}
                                        onChange={(e) => setCustomTitles(e.target.value)}
                                        placeholder="Chief Marketing Officer, CMO, VP Marketing, Head of Growth"
                                        className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1">
                                        Location / Country
                                    </label>
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        placeholder="India, United States, Mumbai..."
                                        className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1 flex items-center justify-between">
                                        <span>Company, Industry, or Category (fuzzy search)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={domainFilter}
                                        onChange={(e) => setDomainFilter(e.target.value)}
                                        placeholder="e.g. fashion, food, d2c, tata cliq, thewholetruthfoods.com"
                                        className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
                                    {domainFilter.trim() && (
                                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                                            {/^(food|beverage|fmcg|drink|snack)/i.test(domainFilter.trim()) ? (
                                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    🥗 Targeting Apollo Industry: <b>Food & Beverages</b>
                                                </span>
                                            ) : /^(fashion|apparel|clothing|streetwear|shoes|footwear)/i.test(domainFilter.trim()) ? (
                                                <span className="text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    👗 Targeting Apollo Industry: <b>Apparel & Fashion</b>
                                                </span>
                                            ) : /^(procter|p&g|pg\b|unilever|hul\b|itc\b|nestle|pepsi|coca|coke|mondelez|cadbury|loreal)/i.test(domainFilter.trim()) ? (
                                                <span className="text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    🏢 Enterprise Brand: <b>{domainFilter.trim()}</b> (Auto-mapped to official domain & local DB)
                                                </span>
                                            ) : /^(retail|ecommerce|d2c|e-commerce)/i.test(domainFilter.trim()) ? (
                                                <span className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    🛍️ Targeting Apollo Industry: <b>Retail & E-Commerce</b>
                                                </span>
                                            ) : /^(saas|software|tech|fintech|it)/i.test(domainFilter.trim()) ? (
                                                <span className="text-cyan-700 bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    💻 Targeting Apollo Industry: <b>Software & Technology</b>
                                                </span>
                                            ) : domainFilter.includes('.') ? (
                                                <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded font-medium">
                                                    🌐 Targeting Domain: <b>{domainFilter.trim()}</b>
                                                </span>
                                            ) : (
                                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                                                    🏢 Targeting Specific Company: <b>{domainFilter.trim()}</b>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-stone-500 font-medium">Company Size:</span>
                                    {SIZE_PRESETS.map((sz) => (
                                        <button
                                            key={sz.value}
                                            onClick={() => toggleSize(sz.value)}
                                            className={`px-2 py-0.5 text-xs rounded font-medium border transition ${
                                                selectedSizes.includes(sz.value)
                                                    ? "bg-stone-900 border-stone-900 text-white"
                                                    : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                                            }`}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={autoStore}
                                            onChange={(e) => setAutoStore(e.target.checked)}
                                            className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                                        />
                                        <span className="text-xs font-medium text-stone-700 flex items-center gap-1">
                                            <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
                                            Auto-verify & store into Contacts
                                        </span>
                                    </label>

                                    <button
                                        onClick={() => handleSearch(1)}
                                        disabled={isSearching}
                                        className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition shadow-xs"
                                    >
                                        {isSearching ? (
                                            <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <SearchIcon className="w-3.5 h-3.5" />
                                        )}
                                        Search Apollo Network
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Search Results Table */}
                        {searchResults.length > 0 && (
                            <div className="bg-white rounded-lg border border-stone-200/80 shadow-xs overflow-hidden">
                                <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/60 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={
                                                searchResults.length > 0 &&
                                                selectedPersonIds.size === searchResults.length
                                            }
                                            onChange={selectAllOnPage}
                                            className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                                        />
                                        <span className="text-xs font-semibold text-stone-700">
                                            {selectedPersonIds.size} of {searchResults.length} selected
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {selectedPersonIds.size > 0 && (() => {
                                            const selectedList = searchResults.filter((p) => selectedPersonIds.has(p.id));
                                            const allSelectedInDb = selectedList.length > 0 && selectedList.every((p) => p.alreadyInDb);
                                            return (
                                                <button
                                                    onClick={() => handleEnrichAndSave()}
                                                    disabled={isSaving}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition disabled:opacity-50 text-white ${
                                                        allSelectedInDb ? "bg-stone-900 hover:bg-black" : "bg-emerald-700 hover:bg-emerald-800"
                                                    }`}
                                                >
                                                    {isSaving ? (
                                                        <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                                                    ) : allSelectedInDb ? (
                                                        <DatabaseIcon className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <DownloadCloudIcon className="w-3.5 h-3.5" />
                                                    )}
                                                    {isSaving
                                                        ? saveProgress || "Processing..."
                                                        : allSelectedInDb
                                                        ? `Select & Review in Contacts (${selectedPersonIds.size})`
                                                        : `Verify & Store Selected in Contacts (${selectedPersonIds.size})`}
                                                </button>
                                            );
                                        })()}
                                        <span className="text-xs text-stone-500">
                                            Page {page} of {Math.ceil(totalResults / 25)}
                                        </span>
                                    </div>
                                </div>

                                <div className="divide-y divide-stone-100">
                                    {searchResults.map((person, idx) => {
                                        const isSelected = selectedPersonIds.has(person.id);
                                        const showLocalDbHeader = idx === 0 && person.alreadyInDb;
                                        const showApolloHeader = !person.alreadyInDb && (idx === 0 || searchResults[idx - 1]?.alreadyInDb);

                                        return (
                                            <React.Fragment key={person.id}>
                                                {showLocalDbHeader && (
                                                    <div className="bg-emerald-50/80 border-b border-emerald-200/80 px-4 py-2 flex items-center justify-between text-xs text-emerald-900 font-semibold">
                                                        <div className="flex items-center gap-1.5">
                                                            <CheckCircle2Icon className="w-4 h-4 text-emerald-600" />
                                                            <span>Local Contacts Match ({searchResults.filter((p) => p.alreadyInDb).length} found in your 51k+ saved database • 0 Credits)</span>
                                                        </div>
                                                        <span className="text-[11px] text-emerald-700 font-normal">Surfaced 1st with full un-obfuscated details</span>
                                                    </div>
                                                )}
                                                {showApolloHeader && (
                                                    <div className="bg-stone-100/80 border-b border-stone-200 px-4 py-2 flex items-center justify-between text-xs text-stone-700 font-semibold">
                                                        <div className="flex items-center gap-1.5">
                                                            <GlobeIcon className="w-4 h-4 text-stone-500" />
                                                            <span>Apollo Network Prospects (Auto-Stored & Cached into Database)</span>
                                                        </div>
                                                        <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                                            <CheckCircle2Icon className="w-3 h-3 text-emerald-600" />
                                                            Persisted permanently to DB • 0 Credits
                                                        </span>
                                                    </div>
                                                )}
                                                <div
                                                    className={`p-4 flex items-center justify-between hover:bg-stone-50/70 transition ${
                                                        isSelected ? "bg-stone-50" : ""
                                                    }`}
                                                >
                                                <div className="flex items-center gap-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelectPerson(person.id)}
                                                        className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                                                    />

                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold text-stone-900">
                                                                {person.first_name}{" "}
                                                                {person.last_name_obfuscated || ""}
                                                            </span>
                                                            {person.has_email && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                                                                    <MailIcon className="w-2.5 h-2.5" />
                                                                    Email Available
                                                                </span>
                                                            )}
                                                            {person.has_direct_phone === "Yes" && (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                                                                    Direct Phone
                                                                </span>
                                                            )}
                                                            {person.alreadyInDb && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                                    <CheckCircle2Icon className="w-2.5 h-2.5" />
                                                                    In Contacts
                                                                </span>
                                                            )}
                                                            {person.justAutoStored && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                                    <SparklesIcon className="w-2.5 h-2.5 text-amber-600" />
                                                                    Auto-Stored in DB
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-stone-600 mt-0.5 flex items-center gap-3">
                                                            <span className="font-medium text-stone-800">
                                                                {person.title || "Unknown Title"}
                                                            </span>
                                                            {person.organization?.name && (
                                                                <span className="flex items-center gap-1 text-stone-500">
                                                                    <BuildingIcon className="w-3 h-3" />
                                                                    {person.organization.name}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Factor 1: Last Time Contacted & Contact Status */}
                                                        {person.alreadyInDb && (
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                                                                {/* Last Contacted */}
                                                                {person.last_contacted_at ? (
                                                                    <span className="inline-flex items-center gap-1 text-stone-600 font-medium bg-stone-100/90 px-2 py-0.5 rounded border border-stone-200/80">
                                                                        <ClockIcon className="w-3 h-3 text-stone-500" />
                                                                        Last Contacted:{" "}
                                                                        <b className="text-stone-800">
                                                                            {person.days_since_last_contact != null
                                                                                ? `${person.days_since_last_contact}d ago`
                                                                                : new Date(person.last_contacted_at).toLocaleDateString()}
                                                                        </b>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                                                        Never Contacted (Fresh Lead)
                                                                    </span>
                                                                )}

                                                                {/* Status of Last Contact */}
                                                                {person.status === "REPLIED" || person.reply_classification === "POSITIVE" ? (
                                                                    <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                                                        <CheckCircle2Icon className="w-3 h-3 text-emerald-600" />
                                                                        Status: Replied ({person.last_outcome || "Positive"})
                                                                    </span>
                                                                ) : person.status === "BOUNCED" ? (
                                                                    <span className="inline-flex items-center gap-1 text-rose-800 font-semibold bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                                                        Status: Bounced
                                                                    </span>
                                                                ) : person.last_outcome === "opened" ? (
                                                                    <span className="inline-flex items-center gap-1 text-blue-800 font-semibold bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                                                                        Status: Opened
                                                                    </span>
                                                                ) : person.last_outcome === "delivered" ? (
                                                                    <span className="inline-flex items-center gap-1 text-indigo-800 font-semibold bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300">
                                                                        Status: Delivered
                                                                    </span>
                                                                ) : person.outreach_state === "IN_SEQUENCE" ? (
                                                                    <span className="inline-flex items-center gap-1 text-purple-800 font-semibold bg-purple-100 px-2 py-0.5 rounded border border-purple-300">
                                                                        Status: In Sequence
                                                                    </span>
                                                                ) : person.outreach_state === "DO_NOT_CONTACT_RECENTLY" ? (
                                                                    <span className="inline-flex items-center gap-1 text-amber-800 font-semibold bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                                        Status: Contacted Recently
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-stone-600 font-medium bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                                                        Status: {person.status || "Active in DB"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {person.alreadyInDb ? (
                                                        <button
                                                            onClick={() => handleEnrichAndSave([person.id])}
                                                            disabled={isSaving}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-300 transition shadow-2xs cursor-pointer"
                                                            title="Stored in local database. Click to select and review in Contacts."
                                                        >
                                                            <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600" />
                                                            Synced (Review in Contacts)
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleEnrichAndSave([person.id])}
                                                            disabled={isSaving}
                                                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded border border-stone-200 bg-white hover:bg-stone-100 text-stone-800 transition shadow-xs"
                                                        >
                                                            <DownloadCloudIcon className="w-3.5 h-3.5 text-stone-600" />
                                                            Verify & Store in Contacts
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                                </div>

                                {/* Pagination & Load More */}
                                <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleSearch(Math.max(1, page - 1))}
                                            disabled={page <= 1 || isSearching}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-stone-200 bg-white text-stone-700 disabled:opacity-50"
                                        >
                                            <ChevronLeftIcon className="w-3.5 h-3.5" />
                                            Previous Page
                                        </button>
                                        <button
                                            onClick={() => handleSearch(page + 1)}
                                            disabled={page >= Math.ceil(totalResults / 25) || isSearching}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-stone-200 bg-white text-stone-700 disabled:opacity-50"
                                        >
                                            Next Page
                                            <ChevronRightIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Load More Below Button */}
                                    {searchResults.length < totalResults && (
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={isLoadingMore}
                                            className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-md border border-stone-900 bg-stone-900 text-white hover:bg-stone-800 shadow-xs transition"
                                        >
                                            {isLoadingMore ? (
                                                <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <ChevronDownIcon className="w-3.5 h-3.5 text-amber-300" />
                                            )}
                                            Load More Contacts Below ({searchResults.length} of {totalResults.toLocaleString()})
                                        </button>
                                    )}

                                    <span className="text-xs text-stone-500">
                                        Showing {searchResults.length} of {totalResults.toLocaleString()} leads (Page {page})
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Recently Selected Contacts Tab */
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3 flex-1">
                                {/* Batch vs All Switcher */}
                                <div className="flex items-center gap-1 p-0.5 rounded-md bg-stone-100 border border-stone-200 text-xs">
                                    {currentBatchLeads.length > 0 && (
                                        <button
                                            onClick={() => {
                                                setRecentlySelectedView("batch");
                                                setSelectedSavedLeadIds(new Set(currentBatchLeads.map((b) => b.id)));
                                            }}
                                            className={`px-3 py-1 rounded font-medium transition ${
                                                recentlySelectedView === "batch"
                                                    ? "bg-white text-stone-900 shadow-2xs font-semibold"
                                                    : "text-stone-600 hover:text-stone-900"
                                            }`}
                                        >
                                            Current Search Batch ({currentBatchLeads.length})
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setRecentlySelectedView("all");
                                            setSelectedSavedLeadIds(new Set(savedLeads.map((s) => s.id)));
                                        }}
                                        className={`px-3 py-1 rounded font-medium transition ${
                                            recentlySelectedView === "all" || currentBatchLeads.length === 0
                                                ? "bg-white text-stone-900 shadow-2xs font-semibold"
                                                : "text-stone-600 hover:text-stone-900"
                                        }`}
                                    >
                                        All Stored Contacts ({savedLeads.length})
                                    </button>
                                </div>

                                <div className="relative flex-1 max-w-xs">
                                    <SearchIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={savedSearchQuery}
                                        onChange={(e) => setSavedSearchQuery(e.target.value)}
                                        placeholder="Filter by name, email, company..."
                                        className="w-full pl-9 pr-3 py-1 text-xs rounded-md border border-stone-200 bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedSavedLeadIds.size > 0 && (
                                    <button
                                        onClick={handleCreateCampaign}
                                        className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-md bg-stone-900 text-white hover:bg-stone-800 shadow-md transition"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5 text-amber-300" />
                                        Create Campaign with Selected ({selectedSavedLeadIds.size})
                                    </button>
                                )}
                                <span className="text-xs text-stone-500 font-medium">
                                    {displayedSavedLeads.length} contacts showing
                                </span>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg border border-stone-200/80 shadow-xs overflow-hidden">
                            {displayedSavedLeads.length > 0 && (
                                <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/60 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={
                                                displayedSavedLeads.length > 0 &&
                                                selectedSavedLeadIds.size === displayedSavedLeads.length
                                            }
                                            onChange={selectAllSavedLeads}
                                            className="rounded border-stone-300 text-stone-900 focus:ring-stone-500 cursor-pointer"
                                        />
                                        <span className="text-xs font-semibold text-stone-700">
                                            {selectedSavedLeadIds.size} of {displayedSavedLeads.length} contacts selected
                                        </span>
                                    </div>

                                    {selectedSavedLeadIds.size > 0 && (
                                        <button
                                            onClick={handleCreateCampaign}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-stone-900 text-white hover:bg-stone-800 transition shadow-xs"
                                        >
                                            <PlusIcon className="w-3.5 h-3.5 text-amber-300" />
                                            Launch Campaign
                                        </button>
                                    )}
                                </div>
                            )}

                            {isLoadingSaved ? (
                                <div className="p-8 text-center text-xs text-stone-500">
                                    Loading stored leads...
                                </div>
                            ) : displayedSavedLeads.length === 0 ? (
                                <div className="p-12 text-center">
                                    <DatabaseIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-stone-700">
                                        {recentlySelectedView === "batch"
                                            ? "No contacts in this search batch yet"
                                            : "No stored contacts yet"}
                                    </p>
                                    <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                                        Use the "Apollo Lead Search" tab to search decision-makers and click "Verify & Store in Contacts".
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-stone-100">
                                    {displayedSavedLeads.map((lead) => {
                                        const isSelected = selectedSavedLeadIds.has(lead.id);
                                        return (
                                            <div
                                                key={lead.id}
                                                className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50/70 transition ${
                                                    isSelected ? "bg-stone-50/90" : ""
                                                }`}
                                            >
                                                <div className="flex items-start md:items-center gap-3.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelectSavedLead(lead.id)}
                                                        className="mt-1 md:mt-0 rounded border-stone-300 text-stone-900 focus:ring-stone-500 cursor-pointer"
                                                    />

                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold text-stone-900">
                                                                {lead.firstName} {lead.lastName}
                                                            </span>
                                                            <span className="text-xs text-stone-500">
                                                                ({lead.designation})
                                                            </span>
                                                            {lead.categoryKey && (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-stone-100 text-stone-700 border border-stone-200">
                                                                    {lead.categoryKey}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                                                            <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50 flex items-center gap-1">
                                                                <MailIcon className="w-3 h-3" />
                                                                {lead.email}
                                                            </span>

                                                            <span className="font-medium text-stone-800 flex items-center gap-1">
                                                                <BuildingIcon className="w-3 h-3 text-stone-500" />
                                                                {lead.brandName || lead.domain}
                                                            </span>

                                                            {lead.customData?.city && (
                                                                <span className="text-stone-500 flex items-center gap-1">
                                                                    <MapPinIcon className="w-3 h-3 text-stone-400" />
                                                                    {lead.customData.city}, {lead.customData.country}
                                                                </span>
                                                            )}

                                                            {lead.customData?.companyEmployees && (
                                                                <span className="text-stone-500">
                                                                    {lead.customData.companyEmployees} employees
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Factor 1: Last Time Contacted & Contact Status in Saved view */}
                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                                            {lead.lastContactedAt ? (
                                                                <span className="inline-flex items-center gap-1 text-stone-600 font-medium bg-stone-100/90 px-2 py-0.5 rounded border border-stone-200/80">
                                                                    <ClockIcon className="w-3 h-3 text-stone-500" />
                                                                    Last Contacted:{" "}
                                                                    <b className="text-stone-800">
                                                                        {lead.daysSinceLastContact != null
                                                                            ? `${lead.daysSinceLastContact}d ago`
                                                                            : new Date(lead.lastContactedAt).toLocaleDateString()}
                                                                    </b>
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                                                    Never Contacted (Fresh Lead)
                                                                </span>
                                                            )}

                                                            {lead.status === "REPLIED" || lead.replyClassification === "POSITIVE" ? (
                                                                <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                                                    <CheckCircle2Icon className="w-3 h-3 text-emerald-600" />
                                                                    Status: Replied ({lead.lastOutcome || "Positive"})
                                                                </span>
                                                            ) : lead.status === "BOUNCED" ? (
                                                                <span className="inline-flex items-center gap-1 text-rose-800 font-semibold bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                                                    Status: Bounced
                                                                </span>
                                                            ) : lead.lastOutcome === "opened" ? (
                                                                <span className="inline-flex items-center gap-1 text-blue-800 font-semibold bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                                                                    Status: Opened
                                                                </span>
                                                            ) : lead.lastOutcome === "delivered" ? (
                                                                <span className="inline-flex items-center gap-1 text-indigo-800 font-semibold bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300">
                                                                    Status: Delivered
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-stone-600 font-medium bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                                                    Status: {lead.status || "Active in DB"}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {lead.customData?.companyTechnologies &&
                                                            lead.customData.companyTechnologies.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 pt-1">
                                                                    {lead.customData.companyTechnologies
                                                                        .slice(0, 5)
                                                                        .map((tech) => (
                                                                            <span
                                                                                key={tech}
                                                                                className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded"
                                                                            >
                                                                                {tech}
                                                                            </span>
                                                                        ))}
                                                                </div>
                                                            )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {lead.customData?.linkedin_url && (
                                                        <a
                                                            href={lead.customData.linkedin_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1.5 text-stone-500 hover:text-blue-600 rounded border border-stone-200 hover:bg-white transition"
                                                            title="View LinkedIn Profile"
                                                        >
                                                            <LinkedinIcon className="w-4 h-4" />
                                                        </a>
                                                    )}

                                                    <a
                                                        href={`/app/brain/theses`}
                                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-stone-900 text-white hover:bg-stone-800 transition"
                                                    >
                                                        <SparklesIcon className="w-3.5 h-3.5 text-amber-300" />
                                                        {lead.thesisId ? "View Thesis" : "Generate Thesis"}
                                                    </a>

                                                    <button
                                                        onClick={() => handleDeleteLead(lead.id)}
                                                        className="p-1.5 text-stone-400 hover:text-red-600 rounded border border-transparent hover:border-red-200 hover:bg-red-50 transition"
                                                        title="Delete contact from database"
                                                    >
                                                        <Trash2Icon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </PageBody>

            {/* Campaign Creation Dialog with Pre-Loaded Contacts */}
            <NewCampaignDialog
                open={isNewCampaignOpen}
                onClose={() => setIsNewCampaignOpen(false)}
                initialContacts={campaignInitialContacts}
            />

            {/* Apollo Stored Templates & Sequences Modal */}
            {showTemplatesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
                            <div className="flex items-center gap-2">
                                <FileTextIcon className="w-4 h-4 text-stone-800" />
                                <h3 className="text-sm font-semibold text-stone-900">
                                    Stored Apollo Templates & Sequences
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowTemplatesModal(false)}
                                className="p-1 text-stone-400 hover:text-stone-700 rounded-md transition"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-6">
                            {/* Templates */}
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                                    Email Templates ({apolloTemplates.length})
                                </h4>
                                <div className="space-y-3">
                                    {apolloTemplates.map((t) => (
                                        <div
                                            key={t.id}
                                            className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition space-y-2"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-stone-900">
                                                    {t.name}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => copyToClipboard(t.bodyText, "template body")}
                                                        className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 bg-white"
                                                    >
                                                        <CopyIcon className="w-3 h-3" />
                                                        Copy
                                                    </button>
                                                    <span className="text-[10px] text-stone-400 font-mono">
                                                        {new Date(t.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            {t.subject && (
                                                <div className="text-xs text-stone-700 flex items-center justify-between">
                                                    <div>
                                                        <span className="font-medium text-stone-500">Subject: </span>
                                                        {t.subject}
                                                    </div>
                                                    <button
                                                        onClick={() => copyToClipboard(t.subject, "subject line")}
                                                        className="text-[10px] text-stone-400 hover:text-stone-700"
                                                    >
                                                        Copy subject
                                                    </button>
                                                </div>
                                            )}
                                            <div className="text-xs text-stone-600 bg-white p-2.5 rounded border border-stone-100 font-mono text-[11px] whitespace-pre-wrap">
                                                {t.bodyText}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Sequences */}
                            {apolloSequences.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                            Sequences & Outreach Playbooks ({apolloSequences.length})
                                        </h4>
                                        <span className="text-[11px] text-stone-400">
                                            Click any sequence to inspect its email copy
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                        {apolloSequences.slice(0, 10).map((s) => {
                                            const isSelected = selectedSequence?.id === s.id;
                                            return (
                                                <div
                                                    key={s.id}
                                                    onClick={() => handleSelectSequence(s)}
                                                    className={`p-3 rounded-lg border cursor-pointer transition text-left ${
                                                        isSelected
                                                            ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                                                            : "border-stone-200 bg-white hover:bg-stone-50 text-stone-900"
                                                    }`}
                                                >
                                                    <span className={`text-xs font-semibold block truncate ${isSelected ? "text-white" : "text-stone-900"}`}>
                                                        {s.name}
                                                    </span>
                                                    <div className="flex items-center justify-between mt-1">
                                                        <span className={`text-[11px] ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                                                            {s.numSteps} touchpoint{s.numSteps === 1 ? "" : "s"}
                                                        </span>
                                                        <span className={`text-[10px] font-medium ${isSelected ? "text-amber-300" : "text-stone-400"}`}>
                                                            {isSelected ? "Active View" : "View Steps →"}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Selected Sequence Steps Detail */}
                                    {isLoadingSequence && (
                                        <div className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-lg border border-dashed border-stone-200">
                                            <RefreshCwIcon className="w-4 h-4 animate-spin mx-auto mb-1 text-stone-400" />
                                            Loading email touches from Apollo...
                                        </div>
                                    )}

                                    {selectedSequence && !isLoadingSequence && (
                                        <div className="p-4 rounded-lg border border-stone-300 bg-stone-50/70 space-y-4">
                                            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                                                <div>
                                                    <h5 className="text-xs font-bold text-stone-900">
                                                        {selectedSequence.name}
                                                    </h5>
                                                    <p className="text-[11px] text-stone-500">
                                                        {selectedSequence.steps?.length || 0} sequential outreach email{selectedSequence.steps?.length === 1 ? "" : "s"}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedSequence(null)}
                                                    className="text-xs text-stone-500 hover:text-stone-800"
                                                >
                                                    Close sequence
                                                </button>
                                            </div>

                                            <div className="space-y-3">
                                                {selectedSequence.steps?.map((st: any) => (
                                                    <div
                                                        key={st.stepId}
                                                        className="p-3.5 rounded-md bg-white border border-stone-200 shadow-2xs space-y-2"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-900 text-white">
                                                                    Step {st.stepNumber}
                                                                </span>
                                                                <span className="text-[11px] text-stone-500">
                                                                    {st.waitDays === 0
                                                                        ? "Immediate (Day 0)"
                                                                        : `Wait ${st.waitDays} days`}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => copyToClipboard(st.bodyText, `Step ${st.stepNumber} email body`)}
                                                                className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 bg-stone-50"
                                                            >
                                                                <CopyIcon className="w-3 h-3" />
                                                                Copy Step {st.stepNumber}
                                                            </button>
                                                        </div>

                                                        {st.subject && (
                                                            <div className="text-xs font-semibold text-stone-800">
                                                                <span className="text-stone-500 font-normal">Subject: </span>
                                                                {st.subject}
                                                            </div>
                                                        )}

                                                        <div className="text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded border border-stone-100 font-mono text-[11px] whitespace-pre-wrap">
                                                            {st.bodyText || st.bodyHtml || "(No body content)"}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/60 flex justify-end">
                            <button
                                onClick={() => setShowTemplatesModal(false)}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-stone-900 text-white hover:bg-stone-800 transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Page>
    );
}

