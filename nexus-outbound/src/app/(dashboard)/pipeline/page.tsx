"use client";

import React, { useState, useMemo } from "react";
import {
  Kanban,
  Plus,
  Search,
  Filter,
  Columns,
  Sparkles,
  DollarSign,
  TrendingUp,
  Mail,
  Phone,
  Calendar,
  MoreVertical,
  CheckCircle2,
  Clock,
  ArrowRight,
  Info,
  X,
  ChevronRight,
  User,
  Building2,
  Flame,
  MessageSquareText,
  ExternalLink,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineLead {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  dealValue: number;
  stage: "new" | "sent" | "replied" | "meeting" | "won";
  sentiment?: "Positive" | "Meeting Requested" | "Interested" | "Pricing Inquiry" | "Neutral";
  lastActivity: string;
  campaign: string;
  score: number; // 1-100
  assignedRep: string;
}

const INITIAL_LEADS: PipelineLead[] = [];

const STAGES = [
  { id: "new", title: "New Lead", color: "border-t-blue-500", pillBg: "bg-blue-50 text-blue-700" },
  { id: "sent", title: "Email Sent", color: "border-t-teal-500", pillBg: "bg-teal-50 text-teal-700" },
  { id: "replied", title: "Reply Received", color: "border-t-amber-500", pillBg: "bg-amber-50 text-amber-700" },
  { id: "meeting", title: "Meeting Booked", color: "border-t-purple-500", pillBg: "bg-purple-50 text-purple-700" },
  { id: "won", title: "Closed Won", color: "border-t-emerald-500", pillBg: "bg-emerald-50 text-emerald-700" },
] as const;

export default function SmartFunnelPipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>(INITIAL_LEADS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [activeLead, setActiveLead] = useState<PipelineLead | null>(null);
  const [activeCrmTab, setActiveCrmTab] = useState<"funnel" | "all-leads" | "calls">("funnel");
  const [quickNote, setQuickNote] = useState("");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        searchQuery === "" ||
        lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCampaign =
        selectedCampaign === "all" || lead.campaign === selectedCampaign;

      return matchSearch && matchCampaign;
    });
  }, [leads, searchQuery, selectedCampaign]);

  const moveStage = (id: string, newStage: PipelineLead["stage"]) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage: newStage } : l))
    );
    if (activeLead && activeLead.id === id) {
      setActiveLead((prev) => prev ? { ...prev, stage: newStage } : null);
    }
  };

  const totalFunnelValue = useMemo(() => {
    return filteredLeads.reduce((sum, l) => sum + l.dealValue, 0);
  }, [filteredLeads]);

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] w-full bg-[#f6f8fc]">
      {/* ------------------------------------------------------------------------- */}
      {/* LEFT CRM SUB-NAV (Referenced in Image 6) */}
      {/* ------------------------------------------------------------------------- */}
      <aside className="w-56 shrink-0 border-r border-[#e0e5ec] bg-[#f8fafc] p-4 flex flex-col justify-between hidden md:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Kanban size={16} />
            </span>
            <span className="text-sm font-bold text-[#1f1f1f]">CRM Pipeline</span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveCrmTab("funnel")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeCrmTab === "funnel"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <DollarSign size={15} className="text-[#0b57d0]" />
              <span>Smart Funnel</span>
            </button>

            <button
              onClick={() => setActiveCrmTab("all-leads")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeCrmTab === "all-leads"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <User size={15} className="text-slate-500" />
              <span>All Leads ({leads.length})</span>
            </button>

            <button
              onClick={() => setActiveCrmTab("calls")}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeCrmTab === "calls"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Phone size={15} className="text-slate-500" />
                <span>Calls</span>
              </div>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                New
              </span>
            </button>
          </nav>

          {/* Custom CRMs Group */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Custom CRM
              </span>
              <button className="text-slate-400 hover:text-slate-700">
                <Plus size={14} />
              </button>
            </div>
            <p className="px-2 text-[11px] text-slate-500 leading-relaxed">
              Create unlimited CRMs based on pre-defined filters and AI sentiment tags.
            </p>
          </div>
        </div>

        {/* Bottom Summary Metric */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Pipeline Value
          </p>
          <p className="mt-1 text-base font-extrabold text-[#001d35]">
            ${totalFunnelValue.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
            <TrendingUp size={12} />
            <span>+$38,000 this week</span>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------------- */}
      {/* MAIN FUNNEL VIEW */}
      {/* ------------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e0e5ec] bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-[#1f1f1f]">Smart Funnel</h1>
            <p className="text-xs text-slate-500">
              AI-automated lead pipeline with real-time sentiment synchronization
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search lead or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8.5 w-52 sm:w-64 rounded-xl border border-slate-200 bg-[#f8fafc] pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#0b57d0] focus:outline-none transition-all"
              />
            </div>

            {/* Campaign Filter */}
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="h-8.5 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 text-xs font-medium text-slate-700 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="all">All Campaigns</option>
              <option value="Q3 RevOps Enterprise">Q3 RevOps Enterprise</option>
              <option value="FinTech Scaleups Tier 1">FinTech Scaleups Tier 1</option>
              <option value="Sales Leaders 500+">Sales Leaders 500+</option>
              <option value="AI Infrastructure Series B+">AI Infrastructure Series B+</option>
            </select>

            {/* Add Column Button */}
            <button
              onClick={() => alert("Custom column creator opened. Add custom lifecycle stages.")}
              className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0842a0] shadow-2xs transition-all"
            >
              <Plus size={14} />
              <span>Add Column</span>
            </button>
          </div>
        </div>

        {/* Info Banner (Exact phrasing from Image 6) */}
        {!bannerDismissed && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-2.5 text-xs text-purple-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-purple-600 shrink-0" />
              <span>
                <strong>Note:</strong> Leads will automatically move between columns based on their associated category &amp; GPT-4o-mini sentiment analysis. Each lead is unique across the entire funnel.
              </span>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="rounded-lg p-1 text-purple-600 hover:bg-purple-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* KANBAN BOARD */}
        {/* ------------------------------------------------------------------------- */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 min-w-[1100px] h-full items-start">
            {STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
              const stageValue = stageLeads.reduce((sum, l) => sum + l.dealValue, 0);

              return (
                <div
                  key={stage.id}
                  className="flex flex-col w-72 shrink-0 rounded-2xl border border-slate-200 bg-white/90 shadow-2xs overflow-hidden max-h-[calc(100vh-210px)]"
                >
                  {/* Column Header (Chevron style like Image 6) */}
                  <div
                    className={cn(
                      "flex items-center justify-between border-t-4 px-4 py-3 bg-[#f8fafc] border-b border-slate-200",
                      stage.color
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xs font-bold text-slate-800">
                          {stage.title}
                        </h2>
                        <span className="text-[10px] text-slate-400 font-normal">ⓘ</span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                        {stageLeads.length} Leads · ${stageValue.toLocaleString()}
                      </p>
                    </div>

                    <button className="text-slate-400 hover:text-slate-700">
                      <MoreVertical size={15} />
                    </button>
                  </div>

                  {/* Cards List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fbfcfd]">
                    {stageLeads.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400">
                        No leads in this stage
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          onClick={() => setActiveLead(lead)}
                          className={cn(
                            "group relative rounded-xl border p-3.5 bg-white transition-all cursor-pointer hover:shadow-md hover:border-[#0b57d0]/40",
                            activeLead?.id === lead.id
                              ? "border-[#0b57d0] ring-1 ring-[#0b57d0] shadow-sm"
                              : "border-slate-200 shadow-2xs"
                          )}
                        >
                          {/* Top Row: Name & Deal Value */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#0b57d0] transition-colors">
                                {lead.name}
                              </h3>
                              <p className="text-[11px] text-slate-500 font-medium">
                                {lead.title}
                              </p>
                            </div>
                            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                              ${(lead.dealValue / 1000).toFixed(0)}k
                            </span>
                          </div>

                          {/* Company & Campaign */}
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                            <Building2 size={13} className="text-slate-400 shrink-0" />
                            <span className="font-semibold truncate">{lead.company}</span>
                          </div>

                          {/* Sentiment Tag */}
                          {lead.sentiment && (
                            <div className="mt-2.5 flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold",
                                  lead.sentiment === "Meeting Requested"
                                    ? "bg-purple-100 text-purple-800"
                                    : lead.sentiment === "Interested" || lead.sentiment === "Positive"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                )}
                              >
                                <Sparkles size={11} />
                                {lead.sentiment}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Score: <strong>{lead.score}</strong>
                              </span>
                            </div>
                          )}

                          {/* Last Activity Preview */}
                          <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500 line-clamp-1">
                            {lead.lastActivity}
                          </div>

                          {/* Quick Stage Move Actions on Hover */}
                          <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-slate-50">
                            <span className="text-[10px] text-slate-400">
                              Rep: {lead.assignedRep}
                            </span>
                            <div className="flex items-center gap-1">
                              {stage.id !== "won" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextIdx = STAGES.findIndex((s) => s.id === stage.id) + 1;
                                    if (nextIdx < STAGES.length) {
                                      moveStage(lead.id, STAGES[nextIdx].id);
                                    }
                                  }}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#0b57d0] transition-colors"
                                  title="Advance to next stage"
                                >
                                  <ArrowRight size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* RIGHT LEAD DETAIL DRAWER */}
      {/* ------------------------------------------------------------------------- */}
      {activeLead && (
        <aside className="w-84 shrink-0 border-l border-[#e0e5ec] bg-white p-5 flex flex-col justify-between shadow-lg overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="space-y-5">
            {/* Top Close */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Lead Overview
              </span>
              <button
                onClick={() => setActiveLead(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            {/* Profile Info */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm shadow-xs">
                {activeLead.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{activeLead.name}</h3>
                <p className="text-xs text-slate-500">{activeLead.title}</p>
                <p className="text-xs font-semibold text-[#0b57d0]">{activeLead.company}</p>
              </div>
            </div>

            {/* Deal Value & Stage Selector */}
            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Deal Value:</span>
                <span className="font-bold text-slate-900">${activeLead.dealValue.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Current Stage:</span>
                <select
                  value={activeLead.stage}
                  onChange={(e) => moveStage(activeLead.id, e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="new">New Lead</option>
                  <option value="sent">Email Sent</option>
                  <option value="replied">Reply Received</option>
                  <option value="meeting">Meeting Booked</option>
                  <option value="won">Closed Won</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Owner:</span>
                <span className="font-semibold text-slate-800">{activeLead.assignedRep}</span>
              </div>
            </div>

            {/* AI Action Box */}
            <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 mb-1.5">
                <Bot size={15} className="text-purple-600" />
                <span>AI Next Recommended Step</span>
              </div>
              <p className="text-[11px] text-purple-800 leading-relaxed">
                Prospect requested meeting link on Thursday. AI has pre-drafted a confirmed invite for Thursday 2:00 PM EST with Zoom link.
              </p>
              <button
                onClick={() => alert(`Draft opened for ${activeLead.name}. Redirecting to Inbox.`)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800 transition-colors shadow-2xs"
              >
                <MessageSquareText size={13} />
                <span>Send AI Meeting Confirmation</span>
              </button>
            </div>

            {/* Contact Details */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-700">Contact Information</span>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail size={14} className="text-slate-400" />
                <span className="truncate">{activeLead.email}</span>
              </div>
              {activeLead.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone size={14} className="text-slate-400" />
                  <span>{activeLead.phone}</span>
                </div>
              )}
            </div>

            {/* Quick Note Input */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Internal Team Note</span>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="Log call outcome or add deal notes..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0b57d0] focus:outline-none"
              />
              <button
                onClick={() => {
                  if (quickNote) {
                    alert(`Note saved for ${activeLead.name}`);
                    setQuickNote("");
                  }
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Save Note
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
