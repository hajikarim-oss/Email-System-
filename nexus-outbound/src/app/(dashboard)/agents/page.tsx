"use client";

import React, { useState } from "react";
import {
  Bot,
  Sparkles,
  Search,
  Filter,
  Plus,
  Play,
  Calendar,
  MessageSquare,
  Zap,
  ArrowRight,
  CheckCircle2,
  SlidersHorizontal,
  ExternalLink,
  HelpCircle,
  X,
  Share2,
  Users,
  Clock,
  ShieldCheck,
  Send,
  Workflow
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentTemplate {
  id: string;
  title: string;
  category: "Sentiment Routing" | "Alerts" | "Enrichment" | "Calendar" | "Deliverability";
  description: string;
  usersCount: string;
  setupTime: string;
  integrations: string[];
  active?: boolean;
  isPopular?: boolean;
}

const TEMPLATES: AgentTemplate[] = [
  {
    id: "agent-1",
    title: "Positive Lead Alert Notifier",
    category: "Alerts",
    description: "Posts a Slack or Teams alert whenever a lead is moved into a positive sentiment category by GPT-4o-mini.",
    usersCount: "2,895 users",
    setupTime: "5 minutes",
    integrations: ["Slack", "Webhook"],
    isPopular: true,
  },
  {
    id: "agent-2",
    title: "Positive Reply Slack Notifier",
    category: "Alerts",
    description: "Posts an instant Slack message every time AI classifies an incoming reply as interested or meeting requested.",
    usersCount: "2,798 users",
    setupTime: "1 minute",
    integrations: ["Slack"],
    isPopular: true,
  },
  {
    id: "agent-3",
    title: "AI Icebreaker & Prospect Researcher",
    category: "Enrichment",
    description: "Researches prospect's website and recent company news before Step 1 sends to craft a tailored 1-sentence opening hook.",
    usersCount: "3,410 users",
    setupTime: "2 minutes",
    integrations: ["Perplexity", "OpenAI"],
  },
  {
    id: "agent-4",
    title: "Auto-Meeting Slot Coordinator",
    category: "Calendar",
    description: "Extracts prospect availability from email body and automatically suggests 3 open Google Meet / Calendly times.",
    usersCount: "1,950 users",
    setupTime: "3 minutes",
    integrations: ["Google Calendar", "Calendly"],
  },
  {
    id: "agent-5",
    title: "Out-of-Office Smart Rescheduler",
    category: "Deliverability",
    description: "Detects OOO auto-replies, extracts return date, and pauses sequence until the prospect is back in office.",
    usersCount: "4,120 users",
    setupTime: "1 minute",
    integrations: ["Nexus Router"],
    isPopular: true,
  },
  {
    id: "agent-6",
    title: "HubSpot / Salesforce Bi-Directional Sync",
    category: "Sentiment Routing",
    description: "Creates CRM contact and opportunity records automatically when reply sentiment hits 80%+ positive score.",
    usersCount: "1,620 users",
    setupTime: "4 minutes",
    integrations: ["HubSpot", "Salesforce"],
  },
];

export default function SmartAgentStudioPage() {
  const [activeTab, setActiveTab] = useState<"templates" | "my-agents" | "automations">("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedIntegration, setSelectedIntegration] = useState("all");
  const [naturalLanguagePrompt, setNaturalLanguagePrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [deployedAgents, setDeployedAgents] = useState<string[]>(["agent-1", "agent-2", "agent-5"]);
  const [testSuccess, setTestSuccess] = useState(false);

  const filteredTemplates = TEMPLATES.filter((t) => {
    const matchSearch =
      searchQuery === "" ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchCat =
      selectedCategory === "all" ||
      t.category.toLowerCase().includes(selectedCategory.toLowerCase());

    const matchInt =
      selectedIntegration === "all" ||
      t.integrations.some((i) => i.toLowerCase().includes(selectedIntegration.toLowerCase()));

    return matchSearch && matchCat && matchInt;
  });

  const handleDeploy = (agentId: string) => {
    if (!deployedAgents.includes(agentId)) {
      setDeployedAgents((prev) => [...prev, agentId]);
    }
    setTestSuccess(true);
    setTimeout(() => {
      setTestSuccess(false);
      setSelectedTemplate(null);
    }, 2000);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] w-full bg-[#f6f8fc]">
      {/* ------------------------------------------------------------------------- */}
      {/* LEFT AGENT NAV (Referenced in Image 9) */}
      {/* ------------------------------------------------------------------------- */}
      <aside className="w-56 shrink-0 border-r border-[#e0e5ec] bg-[#f8fafc] p-4 flex flex-col justify-between hidden md:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Bot size={16} />
            </span>
            <span className="text-sm font-bold text-slate-900">SmartAgent</span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("templates")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeTab === "templates"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <Workflow size={15} className="text-[#0b57d0]" />
              <span>Explore Templates</span>
            </button>

            <button
              onClick={() => setActiveTab("my-agents")}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeTab === "my-agents"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Bot size={15} className="text-slate-500" />
                <span>My Agents</span>
              </div>
              <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-extrabold text-blue-800">
                {deployedAgents.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("automations")}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                activeTab === "automations"
                  ? "bg-[#d3e3fd] text-[#001d35] font-bold"
                  : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Zap size={15} className="text-slate-500" />
                <span>Automations</span>
              </div>
              <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800">
                Beta
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom SmartAssistant Tooltip Card (Image 9) */}
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
            <Sparkles size={14} className="text-purple-600" />
            <span>SmartAssistant</span>
          </div>
          <p className="mt-1 text-[11px] text-purple-800 leading-relaxed">
            Chat with AI to trigger workflows, adjust sending quotas, or synthesize weekly outreach summaries in real-time.
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------------------- */}
      {/* MAIN TEMPLATES & STUDIO AREA */}
      {/* ------------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 md:p-8 space-y-6">
        {/* Top Header Controls (Referenced in Image 9) */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Explore our pre-built <span className="text-purple-600">AI Agents</span> templates
            </h1>
            <p className="mt-1 text-xs text-slate-500 max-w-xl">
              Quickly start with ready-to-use agent templates designed for high-conversion outreach workflows. Just pick one and customize it as needed.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => alert("Suggestion submitted. What custom agent workflow would you like?")}
              className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50/60 px-3.5 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-all shadow-2xs"
            >
              <Sparkles size={14} />
              <span>Suggest Templates</span>
            </button>

            <button
              onClick={() => alert("Schedule feedback modal opened.")}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-2xs"
            >
              <Calendar size={14} />
              <span>Schedule Feedback Call</span>
            </button>
          </div>
        </div>

        {/* Natural Language Prompt Builder (Referenced in Image 4) */}
        <div className="rounded-2xl border border-purple-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-2">
            <Sparkles size={15} className="text-purple-600" />
            <span>What do you want to get done, today?</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={naturalLanguagePrompt}
              onChange={(e) => setNaturalLanguagePrompt(e.target.value)}
              placeholder="e.g. When a VP of Sales replies positively, notify #enterprise-leads Slack channel and tag the team lead..."
              className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-4 py-2.5 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none transition-all"
            />
            <button
              onClick={() => {
                if (!naturalLanguagePrompt.trim()) {
                  alert("Please enter what you want your AI agent to do.");
                  return;
                }
                alert(`Synthesizing custom agent: "${naturalLanguagePrompt}"... Deployed!`);
                setNaturalLanguagePrompt("");
              }}
              className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 shadow-2xs transition-all"
            >
              <Bot size={15} />
              <span>Build Agent</span>
            </button>
          </div>
        </div>

        {/* Filters & Search Row (Image 9) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search templates (e.g. Slack, Positive, OOO, HubSpot)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="Alerts">Slack &amp; Alerts</option>
              <option value="Enrichment">Lead Enrichment</option>
              <option value="Calendar">Meeting Booking</option>
              <option value="Deliverability">Deliverability &amp; OOO</option>
            </select>

            {/* Integration Filter */}
            <select
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="all">All Integrations</option>
              <option value="Slack">Slack</option>
              <option value="HubSpot">HubSpot</option>
              <option value="Salesforce">Salesforce</option>
              <option value="Google">Google Calendar</option>
            </select>
          </div>
        </div>

        {/* Prebuilt Templates Grid (Cards from Image 9) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => {
            const isDeployed = deployedAgents.includes(template.id);

            return (
              <div
                key={template.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all"
              >
                <div>
                  {/* Top Integration Flow Icons (e.g. Nexus -> Slack) */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-2xs">
                        <Send size={16} />
                      </div>
                      <ArrowRight size={14} className="text-slate-400" />
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4A154B] text-white shadow-2xs font-bold text-xs">
                        #
                      </div>
                    </div>

                    {isDeployed && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live &amp; Active
                      </span>
                    )}
                  </div>

                  {/* Template Title & Description */}
                  <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    {template.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                {/* Bottom Meta & Action */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Users size={12} className="text-slate-400" />
                      {template.usersCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      {template.setupTime}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedTemplate(template)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#f8fafc] border border-slate-200 py-2 text-xs font-bold text-slate-800 hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all shadow-2xs"
                  >
                    <span>{isDeployed ? "Configure Agent" : "Use Template"}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template Configuration Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">{selectedTemplate.title}</h3>
              </div>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600">{selectedTemplate.description}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Slack Webhook URL / Channel</label>
                <input
                  type="text"
                  defaultValue="https://hooks.slack.com/services/T00/B00/XXXXX"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 font-mono text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Sentiment Trigger Threshold</label>
                <select className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none">
                  <option>Positive Replies (Score ≥ 80)</option>
                  <option>Meeting Requested Only</option>
                  <option>Pricing Inquiry &amp; Positive</option>
                </select>
              </div>
            </div>

            {testSuccess && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span>Agent active &amp; test webhook payload delivered to Slack!</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeploy(selectedTemplate.id)}
                className="rounded-xl bg-[#0b57d0] px-4 py-2 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs"
              >
                Deploy AI Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
