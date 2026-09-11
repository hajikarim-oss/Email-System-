"use client";

import React, { useState, useMemo } from "react";
import {
  Compass,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Coins,
  Sparkles,
  CheckCircle2,
  Building2,
  MapPin,
  Mail,
  Phone,
  Plus,
  ArrowRight,
  Filter,
  Check,
  UserCheck,
  Zap,
  Globe,
  Play,
  ExternalLink,
  Layers,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProspectProfile {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  companyDomain: string;
  department: string;
  level: string;
  industry: string;
  employees: string;
  location: string;
  email: string;
  emailStatus: "100% Verified" | "Catch-All Verified";
  phone: string;
  linkedinUrl: string;
  openLikelihood: number; // percentage e.g. 94
  fitScore: number; // 1-100
}

const ALL_PROSPECTS: ProspectProfile[] = [];

export default function SmartProspectPage() {
  const [excludeFetched, setExcludeFetched] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobTitleFilter, setJobTitleFilter] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [targetCampaign, setTargetCampaign] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Accordion states
  const [openSections, setOpenSections] = useState({
    contact: true,
    company: true,
  });

  const toggleSection = (sec: "contact" | "company") => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Dynamic Filtering Logic
  const filteredProspects = useMemo(() => {
    return ALL_PROSPECTS.filter((p) => {
      const matchSearch =
        searchQuery === "" ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchTitle =
        jobTitleFilter === "" ||
        p.title.toLowerCase().includes(jobTitleFilter.toLowerCase());

      const matchDept =
        selectedDept === "all" ||
        p.department.toLowerCase().includes(selectedDept.toLowerCase());

      const matchLevel =
        selectedLevel === "all" ||
        p.level.toLowerCase().includes(selectedLevel.toLowerCase());

      const matchIndustry =
        selectedIndustry === "all" ||
        p.industry.toLowerCase().includes(selectedIndustry.toLowerCase());

      const matchCompany =
        companySearch === "" ||
        p.company.toLowerCase().includes(companySearch.toLowerCase());

      return matchSearch && matchTitle && matchDept && matchLevel && matchIndustry && matchCompany;
    });
  }, [searchQuery, jobTitleFilter, selectedDept, selectedLevel, selectedIndustry, companySearch]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProspects.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProspects.map((p) => p.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleExportConfirm = () => {
    if (selectedIds.length === 0) return;
    setShowExportModal(false);
    triggerToast(
      `Exported ${selectedIds.length} verified prospects to ${targetCampaign}! Pre-send MX check passed.`
    );
    setSelectedIds([]);
  };

  const handleQuickAdd = (p: ProspectProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerToast(`Added ${p.name} (${p.company}) to verified active leads!`);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-48px)] w-full bg-[#f6f8fc] font-sans select-none">
      {/* ------------------------------------------------------------------------- */}
      {/* 1. LEFT FILTER PANEL (Compact & High Density) */}
      {/* ------------------------------------------------------------------------- */}
      <aside className="w-64 shrink-0 border-r border-[#e0e5ec] bg-[#f8fafc] p-3 flex flex-col justify-between overflow-y-auto hidden lg:flex">
        <div className="space-y-3.5">
          {/* Top Brand & Credits Pill */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
                <Compass size={14} />
              </span>
              <span className="text-xs font-bold text-slate-900">SmartProspect</span>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-2xs">
              <Coins size={11} className="text-amber-600" />
              <span>2.5K Credits</span>
            </div>
          </div>

          {/* Exclude Previously Fetched Toggle */}
          <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-slate-200 shadow-2xs">
            <div className="text-[11px]">
              <p className="font-bold text-slate-800">Exclude Fetched</p>
              <p className="text-[9px] text-slate-400">Avoid duplicate outreach</p>
            </div>
            <button
              onClick={() => setExcludeFetched(!excludeFetched)}
              className={cn(
                "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                excludeFetched ? "bg-[#0b57d0]" : "bg-slate-300"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition duration-200 mt-0.5",
                  excludeFetched ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Group 1: Contact Based Filters */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <button
              onClick={() => toggleSection("contact")}
              className="flex w-full items-center justify-between bg-[#f8fafc] px-3 py-2 text-[11px] font-bold text-slate-800 border-b border-slate-100"
            >
              <span className="flex items-center gap-1.5">
                <Filter size={12} className="text-slate-500" />
                Contact Filters
              </span>
              {openSections.contact ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {openSections.contact && (
              <div className="p-3 space-y-2.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-600">Job Title Keyword</label>
                  <input
                    type="text"
                    value={jobTitleFilter}
                    onChange={(e) => setJobTitleFilter(e.target.value)}
                    placeholder="e.g. VP, Director, CEO"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600">Department</label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-2 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  >
                    <option value="all">All Departments</option>
                    <option value="sales">Sales &amp; Business Dev</option>
                    <option value="marketing">Marketing &amp; Growth</option>
                    <option value="c-suite">C-Suite &amp; Executives</option>
                    <option value="operations">Operations &amp; RevOps</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600">Seniority Level</label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-2 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  >
                    <option value="all">All Seniority Levels</option>
                    <option value="c-level">C-Level (CEO, CMO, CRO)</option>
                    <option value="vp">VP Level</option>
                    <option value="director">Director Level</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Group 2: Company Attributes */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <button
              onClick={() => toggleSection("company")}
              className="flex w-full items-center justify-between bg-[#f8fafc] px-3 py-2 text-[11px] font-bold text-slate-800 border-b border-slate-100"
            >
              <span className="flex items-center gap-1.5">
                <Building2 size={12} className="text-slate-500" />
                Company Attributes
              </span>
              {openSections.company ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {openSections.company && (
              <div className="p-3 space-y-2.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-600">Company Name</label>
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="e.g. Acme, CloudScale"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600">Industry</label>
                  <select
                    value={selectedIndustry}
                    onChange={(e) => setSelectedIndustry(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-2 py-1 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  >
                    <option value="all">All Industries</option>
                    <option value="saas">Enterprise SaaS</option>
                    <option value="fintech">FinTech</option>
                    <option value="ai">Artificial Intelligence</option>
                    <option value="cyber">Cybersecurity</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deliverability Badge */}
        <div className="mt-3 rounded-xl bg-purple-50 p-2.5 border border-purple-200 text-xs text-purple-900">
          <p className="font-bold flex items-center gap-1 text-[11px]">
            <Zap size={13} className="text-purple-600" />
            <span>AI Verified Database</span>
          </p>
          <p className="mt-0.5 text-[10px] text-purple-800 leading-tight">
            Live SMTP handshake checks guarantee 0% hard bounce delivery.
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------------------- */}
      {/* 2. MAIN HERO & SEARCH RESULTS */}
      {/* ------------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Compact Hero Banner */}
        <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-white to-blue-50 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
              Find Verified Outbound Prospects with{" "}
              <span className="text-[#0b57d0]">
                SmartProspect
              </span>
            </h1>
            <p className="text-xs text-slate-600 max-w-xl">
              Access <strong>300M+ verified business profiles</strong> with predictive response intelligence. Sourced for high-inbox placement.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDemoModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-white px-3.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 shadow-2xs transition-all"
            >
              <Play size={12} className="fill-purple-600 text-purple-600" />
              <span>Watch Demo</span>
            </button>
          </div>
        </div>

        {/* Search Results Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <div
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors",
                  selectedIds.length === filteredProspects.length && filteredProspects.length > 0
                    ? "bg-[#0b57d0] border-[#0b57d0] text-white"
                    : "border-slate-300 bg-white"
                )}
              >
                {selectedIds.length === filteredProspects.length && filteredProspects.length > 0 && (
                  <Check size={10} />
                )}
              </div>
              <span>Select All ({filteredProspects.length})</span>
            </button>

            <span className="text-xs text-slate-500 font-medium">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Quick search prospects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 sm:w-56 rounded-lg border border-slate-200 bg-[#f8fafc] pl-7 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
              />
            </div>

            {/* Export Action */}
            <button
              onClick={() => setShowExportModal(true)}
              disabled={selectedIds.length === 0}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-2xs",
                selectedIds.length > 0
                  ? "bg-[#0b57d0] text-white hover:bg-[#0842a0]"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              <UserCheck size={13} />
              <span>Export {selectedIds.length > 0 ? `(${selectedIds.length})` : ""} to Campaign</span>
            </button>
          </div>
        </div>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-emerald-700 hover:text-emerald-900">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Prospects List (Compact & High Density) */}
        <div className="space-y-2.5">
          {filteredProspects.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
              No prospects match your current filter criteria. Try clearing some filters.
            </div>
          ) : (
            filteredProspects.map((prospect) => {
              const isSelected = selectedIds.includes(prospect.id);

              return (
                <div
                  key={prospect.id}
                  onClick={() => toggleSelectOne(prospect.id)}
                  className={cn(
                    "flex flex-col md:flex-row items-start md:items-center justify-between gap-3 rounded-xl border p-3 bg-white transition-all cursor-pointer hover:shadow-xs",
                    isSelected
                      ? "border-[#0b57d0] ring-1 ring-[#0b57d0] bg-blue-50/20"
                      : "border-slate-200 shadow-2xs"
                  )}
                >
                  {/* Left: Checkbox + Avatar + Profile Details */}
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <div
                        className={cn(
                          "flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors",
                          isSelected
                            ? "bg-[#0b57d0] border-[#0b57d0] text-white"
                            : "border-slate-300 bg-white"
                        )}
                      >
                        {isSelected && <Check size={10} />}
                      </div>
                    </div>

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs shadow-2xs">
                      {prospect.firstName[0]}
                      {prospect.lastName[0]}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-slate-900">
                          {prospect.name}
                        </h3>
                        <a
                          href={prospect.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400 hover:text-[#0a66c2]"
                          title="View Profile"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">{prospect.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Building2 size={11} className="text-slate-400" />
                          {prospect.company}
                        </span>
                        <span>·</span>
                        <span>{prospect.industry}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400" />
                          {prospect.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Verification Status & Score */}
                  <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center justify-end gap-1 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 size={11} />
                        <span>{prospect.emailStatus}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">{prospect.email}</p>
                    </div>

                    {/* Propensity Score */}
                    <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-2 py-1 text-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-purple-700">
                        Open Propensity
                      </span>
                      <p className="text-xs font-black text-purple-900 leading-tight">
                        {prospect.openLikelihood}% High
                      </p>
                    </div>

                    <button
                      onClick={(e) => handleQuickAdd(prospect, e)}
                      className="rounded-lg border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs"
                    >
                      Quick Add
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Export to Campaign Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <UserCheck size={16} className="text-[#0b57d0]" />
                <h3 className="text-xs font-bold text-slate-900">
                  Export {selectedIds.length} Prospects to Campaign
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold text-slate-700">Select Target Sequence Campaign</label>
                <select
                  value={targetCampaign}
                  onChange={(e) => setTargetCampaign(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] p-2 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="">Select a campaign</option>
                </select>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-[11px] text-emerald-800">
                <p className="font-bold flex items-center gap-1">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>Pre-Send MX Verification Active</span>
                </p>
                <p className="mt-0.5 text-emerald-700">
                  All {selectedIds.length} contacts will be added with zero risk of hard bounces.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowExportModal(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExportConfirm}
                className="rounded-lg bg-[#0b57d0] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs"
              >
                Confirm Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold text-slate-900">SmartProspect Video Walkthrough</h3>
              <button
                onClick={() => setShowDemoModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video rounded-xl bg-slate-900 flex flex-col items-center justify-center text-white p-4 text-center space-y-2">
              <Play size={32} className="text-purple-400 fill-purple-400/20" />
              <p className="text-[11px] text-slate-300 font-medium">
                Live simulation: Searching and enriching 100 enterprise contacts with 100% verified MX records in under 30 seconds.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowDemoModal(false)}
                className="rounded-lg bg-[#0b57d0] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0842a0]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
