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
    DownloadCloudIcon,
    BriefcaseIcon,
    ArrowUpRightIcon,
} from "lucide-react";
import toast from "react-hot-toast";

interface ApolloSearchResultItem {
    id: string;
    first_name: string;
    last_name_obfuscated?: string;
    title?: string;
    has_email: boolean;
    has_direct_phone?: string;
    has_city?: boolean;
    has_country?: boolean;
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

    // Search state
    const [page, setPage] = useState<number>(1);
    const [searchResults, setSearchResults] = useState<ApolloSearchResultItem[]>([]);
    const [totalResults, setTotalResults] = useState<number>(0);
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());

    // Saving / enriching state
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveProgress, setSaveProgress] = useState<string>("");

    // Saved database leads state
    const [savedLeads, setSavedLeads] = useState<SavedLeadItem[]>([]);
    const [totalSaved, setTotalSaved] = useState<number>(0);
    const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
    const [savedSearchQuery, setSavedSearchQuery] = useState<string>("");

    // Fetch saved leads from DB
    const fetchSavedLeads = async () => {
        setIsLoadingSaved(true);
        try {
            const queryParam = savedSearchQuery ? `&search=${encodeURIComponent(savedSearchQuery)}` : "";
            const res = await fetch(`/api/apollo/saved?limit=100${queryParam}`);
            const data = await res.json();
            setSavedLeads(data.leads || []);
            setTotalSaved(data.total || 0);
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
            };

            if (keywords.trim()) payload.q_keywords = keywords.trim();
            if (titles.length > 0) payload.person_titles = titles;
            if (location.trim()) payload.person_locations = [location.trim()];
            if (domainFilter.trim()) payload.q_organization_domains = domainFilter.trim();
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
            toast.success(`Found ${Number(data.total).toLocaleString()} matching prospects`);
        } catch (err: any) {
            toast.error(err.message || "Failed to search Apollo");
        } finally {
            setIsSearching(false);
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

            toast.success(`Successfully saved ${data.savedCount} leads into your database!`);
            setSelectedPersonIds(new Set());
            fetchSavedLeads();
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
                eyebrow="Apollo Intelligence"
                subtitle="Search, enrich verified contacts, and store permanently in PostgreSQL"
            >
                <div className="flex items-center gap-2">
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
                                View Stored Leads ({totalSaved})
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
                <Stat label="Total Saved in DB" value={totalSaved} accent />
                <Stat
                    label="Apollo API Status"
                    value="Connected"
                    sub="Official mixed_people API active"
                />
                <Stat
                    label="Current Search Results"
                    value={totalResults > 0 ? totalResults.toLocaleString() : "—"}
                />
                <Stat
                    label="Storage Mode"
                    value="Permanent Cache"
                    sub="Zero repeat API credit consumption"
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
                    Stored Database Leads ({totalSaved})
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
                                <div className="flex items-center gap-2">
                                    {TITLE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => handlePresetChange(preset.label)}
                                            className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                                                selectedPreset === preset.label
                                                    ? "bg-stone-900 text-white"
                                                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1">
                                        Job Titles (comma-separated)
                                    </label>
                                    <input
                                        type="text"
                                        value={customTitles}
                                        onChange={(e) => setCustomTitles(e.target.value)}
                                        placeholder="Founder, CEO, CMO..."
                                        className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1">
                                        Location / Country
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            placeholder="India, United States..."
                                            className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-stone-600 mb-1">
                                        Company Domain or Name (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={domainFilter}
                                        onChange={(e) => setDomainFilter(e.target.value)}
                                        placeholder="thewholetruthfoods.com or brand name"
                                        className="w-full text-xs rounded-md border border-stone-200 px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                    />
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
                                        {selectedPersonIds.size > 0 && (
                                            <button
                                                onClick={() => handleEnrichAndSave()}
                                                disabled={isSaving}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-700 text-white hover:bg-emerald-800 transition disabled:opacity-50"
                                            >
                                                {isSaving ? (
                                                    <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <DownloadCloudIcon className="w-3.5 h-3.5" />
                                                )}
                                                {isSaving
                                                    ? saveProgress || "Saving..."
                                                    : `Enrich & Save Selected (${selectedPersonIds.size}) to DB`}
                                            </button>
                                        )}
                                        <span className="text-xs text-stone-500">
                                            Page {page} of {Math.ceil(totalResults / 25)}
                                        </span>
                                    </div>
                                </div>

                                <div className="divide-y divide-stone-100">
                                    {searchResults.map((person) => {
                                        const isSelected = selectedPersonIds.has(person.id);
                                        return (
                                            <div
                                                key={person.id}
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
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => handleEnrichAndSave([person.id])}
                                                        disabled={isSaving}
                                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded border border-stone-200 bg-white hover:bg-stone-100 text-stone-800 transition"
                                                    >
                                                        <DownloadCloudIcon className="w-3.5 h-3.5 text-stone-600" />
                                                        Save to DB
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination */}
                                <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between">
                                    <button
                                        onClick={() => handleSearch(Math.max(1, page - 1))}
                                        disabled={page <= 1 || isSearching}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-stone-200 bg-white text-stone-700 disabled:opacity-50"
                                    >
                                        <ChevronLeftIcon className="w-3.5 h-3.5" />
                                        Previous
                                    </button>
                                    <span className="text-xs text-stone-600">
                                        Showing page {page} of {Math.ceil(totalResults / 25)}
                                    </span>
                                    <button
                                        onClick={() => handleSearch(page + 1)}
                                        disabled={page >= Math.ceil(totalResults / 25) || isSearching}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-stone-200 bg-white text-stone-700 disabled:opacity-50"
                                    >
                                        Next
                                        <ChevronRightIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Saved Leads in Database Tab */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <SearchIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={savedSearchQuery}
                                    onChange={(e) => setSavedSearchQuery(e.target.value)}
                                    placeholder="Filter by name, email, company, domain..."
                                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-stone-200 bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400"
                                />
                            </div>
                            <span className="text-xs text-stone-500 font-medium">
                                Showing {savedLeads.length} of {totalSaved} stored leads
                            </span>
                        </div>

                        <div className="bg-white rounded-lg border border-stone-200/80 shadow-xs overflow-hidden">
                            {isLoadingSaved ? (
                                <div className="p-8 text-center text-xs text-stone-500">
                                    Loading stored leads...
                                </div>
                            ) : savedLeads.length === 0 ? (
                                <div className="p-12 text-center">
                                    <DatabaseIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-stone-700">No leads saved yet</p>
                                    <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                                        Use the "Apollo Lead Search" tab to search decision-makers and click "Enrich & Save to DB".
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-stone-100">
                                    {savedLeads.map((lead) => (
                                        <div
                                            key={lead.id}
                                            className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50/70 transition"
                                        >
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
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </PageBody>
        </Page>
    );
}
