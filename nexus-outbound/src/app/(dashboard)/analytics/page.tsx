"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Layers,
  Users,
  Send,
  MailOpen,
  MessageSquare,
  Sparkles,
  AlertOctagon,
  CheckCircle2,
  X,
  TrendingUp,
  Download,
  Share2,
  Filter,
  BarChart3,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  Info
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { cn } from "@/lib/utils";

const DAILY_METRICS = [
  { date: "Sep 01", sent: 1840, opened: 1280, replied: 340, positive: 162, bounced: 6 },
  { date: "Sep 02", sent: 2150, opened: 1510, replied: 412, positive: 198, bounced: 9 },
  { date: "Sep 03", sent: 2420, opened: 1690, replied: 450, positive: 215, bounced: 8 },
  { date: "Sep 04", sent: 2680, opened: 1870, replied: 495, positive: 240, bounced: 11 },
  { date: "Sep 05", sent: 2890, opened: 2020, replied: 530, positive: 260, bounced: 12 },
  { date: "Sep 06", sent: 1420, opened: 990, replied: 248, positive: 110, bounced: 4 },
  { date: "Sep 07", sent: 1420, opened: 980, replied: 222, positive: 104, bounced: 5 },
];

const CAMPAIGN_BREAKDOWNS = [
  {
    name: "Q3 RevOps Enterprise",
    sent: 5420,
    opened: 3820,
    openRate: "70.5%",
    replied: 1042,
    replyRate: "19.2%",
    positive: 512,
    posRate: "9.4%",
    bounced: 18,
    status: "Active",
  },
  {
    name: "FinTech Scaleups Tier 1",
    sent: 4180,
    opened: 2940,
    openRate: "70.3%",
    replied: 812,
    replyRate: "19.4%",
    positive: 402,
    posRate: "9.6%",
    bounced: 14,
    status: "Active",
  },
  {
    name: "Sales Leaders 500+",
    sent: 3220,
    opened: 2140,
    openRate: "66.5%",
    replied: 520,
    replyRate: "16.1%",
    positive: 230,
    posRate: "7.1%",
    bounced: 19,
    status: "Active",
  },
  {
    name: "AI Infrastructure Series B+",
    sent: 2000,
    opened: 1440,
    openRate: "72.0%",
    replied: 323,
    replyRate: "16.2%",
    positive: 145,
    posRate: "7.3%",
    bounced: 5,
    status: "Active",
  },
];

export default function PerformanceAnalyticsPage() {
  const [activeVersion, setActiveVersion] = useState<"new" | "old">("new");
  const [selectedDateRange, setSelectedDateRange] = useState("Past 7 Days");
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [showBanner, setShowBanner] = useState(true);

  const [metrics, setMetrics] = useState({
    sent: 0,
    opened: 0,
    openRate: "0.00",
    replied: 0,
    replyRate: "0.00",
    positive: 0,
    posRate: "0.00",
    bounced: 0,
    bounceRate: "0.00",
    chart: [] as Array<{ date: string; sent: number; opens: number; replies: number; positive: number }>,
  });

  React.useEffect(() => {
    fetch("/api/dashboard/overview")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setMetrics({
            sent: data.messagesSent || 0,
            opened: data.totalOpened || 0,
            openRate: (data.openRate || 0).toFixed(2),
            replied: data.replies || 0,
            replyRate: (data.replyRate || 0).toFixed(2),
            positive: data.positiveReplies || 0,
            posRate: (data.positiveReplyRate || 0).toFixed(2),
            bounced: data.bounces || 0,
            bounceRate: (data.bounceRate || 0).toFixed(2),
            chart: data.chart || [],
          });
        }
      })
      .catch((err) => console.error("Failed to load analytics:", err));
  }, []);

  const totals = metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* ------------------------------------------------------------------------- */}
      {/* 1. TOP CONTROLS & NAVIGATION BAR (Referenced in Image 7) */}
      {/* ------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        {/* Left Tabs */}
        <div className="flex items-center gap-6">
          <div className="relative">
            <span className="text-sm font-bold text-[#0b57d0]">Performance Metrics</span>
            <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-[#0b57d0]" />
          </div>

          {/* New / Old Version Switch */}
          <div className="flex items-center rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
            <button
              onClick={() => setActiveVersion("old")}
              className={cn(
                "rounded-lg px-2.5 py-1 transition-all",
                activeVersion === "old" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
              )}
            >
              Old Version
            </button>
            <button
              onClick={() => setActiveVersion("new")}
              className={cn(
                "rounded-lg px-2.5 py-1 transition-all flex items-center gap-1.5",
                activeVersion === "new" ? "bg-white text-[#0b57d0] font-bold shadow-2xs" : "text-slate-500"
              )}
            >
              <span>New Version</span>
              <span className="rounded-full bg-purple-100 px-1.5 py-0.2 text-[9px] font-extrabold text-purple-700">
                Beta Release
              </span>
            </button>
          </div>
        </div>

        {/* Right Action: Share Feedback */}
        <button
          onClick={() => alert("Feedback modal opened. Thank you for building with Nexus Outbound.")}
          className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs transition-all"
        >
          <Share2 size={14} />
          <span>Share Feedback &amp; Ideas</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 2. FILTER CONTROLS (Date Range, Campaigns, Clients) */}
      {/* ------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Calendar size={15} className="text-slate-500" />
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="2026-09-04 - 2026-09-07">2026-09-04 – 2026-09-07 (Last 4 Days)</option>
              <option value="2026-09-01 - 2026-09-07">2026-09-01 – 2026-09-07 (Last 7 Days)</option>
              <option value="2026-08-08 - 2026-09-07">Last 30 Days</option>
              <option value="2026-Q3">Q3 2026 Year-to-Date</option>
            </select>
          </div>

          {/* Campaign Selector */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Layers size={15} className="text-slate-500" />
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="all">All Campaigns (4 Active)</option>
              <option value="q3-revops">Q3 RevOps Enterprise</option>
              <option value="fintech">FinTech Scaleups Tier 1</option>
              <option value="sales-leaders">Sales Leaders 500+</option>
              <option value="ai-infra">AI Infrastructure Series B+</option>
            </select>
          </div>

          {/* Client / Team Member Selector */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Users size={15} className="text-slate-500" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="all">All Clients &amp; SDRs</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert("Exporting full analytics CSV report...")}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 3. ALERT / CONFIRMATION BANNER (Exact style from Image 7) */}
      {/* ------------------------------------------------------------------------- */}
      {showBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
            <span className="font-medium">
              <strong>Awesome!</strong> All data is loaded successfully and ready for you to explore across 5,000 daily outreach channels.
            </span>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* 4. THE 5 REFINED METRIC CARDS (Exact Cards from Image 7) */}
      {/* ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Emails Sent */}
        <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-b from-purple-50/50 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-purple-800 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <Send size={15} className="text-purple-600" />
              <span>Emails Sent</span>
            </div>
            <span className="text-[10px] text-slate-400">ⓘ</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {totals.sent.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.sent.toLocaleString()} Leads (Active + Inactive)
          </p>
        </div>

        {/* Card 2: Opened */}
        <div className="rounded-2xl border border-pink-200/80 bg-gradient-to-b from-pink-50/50 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-pink-800 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <MailOpen size={15} className="text-pink-600" />
              <span>Opened</span>
            </div>
            <span className="text-[10px] text-slate-400">ⓘ</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {totals.opened.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-semibold text-pink-700">
            {totals.openRate}% Open Rate
          </p>
        </div>

        {/* Card 3: Replied */}
        <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-b from-cyan-50/50 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-cyan-800 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={15} className="text-cyan-600" />
              <span>Replied</span>
            </div>
            <span className="text-[10px] text-slate-400">ⓘ</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {totals.replied.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-semibold text-cyan-700">
            {totals.replyRate}% Reply Rate
          </p>
        </div>

        {/* Card 4: Positive Reply */}
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={15} className="text-emerald-600" />
              <span>Positive Reply</span>
            </div>
            <span className="text-[10px] text-slate-400">ⓘ</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {totals.positive.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            {totals.posRate}% Positive Reply Rate
          </p>
        </div>

        {/* Card 5: Bounced */}
        <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-b from-rose-50/50 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-rose-800 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <AlertOctagon size={15} className="text-rose-600" />
              <span>Bounced</span>
            </div>
            <span className="text-[10px] text-slate-400">ⓘ</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {totals.bounced}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-600">
            {totals.bounceRate}% Bounce Rate (Ultra-Safe)
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 5. EMAIL ENGAGEMENT METRICS CHART */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-slate-900">
                Email Engagement Metrics
              </h2>
              <span className="text-xs text-slate-400">ⓘ</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily delivery timeline &amp; response velocity (UTC)
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-pink-600">
              <span className="h-2.5 w-2.5 rounded-full bg-pink-500" /> Opens
            </span>
            <span className="flex items-center gap-1.5 text-cyan-600">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" /> Replies
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Positive
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DAILY_METRICS} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="openGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="replyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  borderColor: "#334155",
                  borderRadius: "0.75rem",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#sentGrad)" name="Emails Sent" />
              <Area type="monotone" dataKey="opened" stroke="#ec4899" strokeWidth={2.5} fillOpacity={1} fill="url(#openGrad)" name="Opened" />
              <Area type="monotone" dataKey="replied" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#replyGrad)" name="Replied" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* 6. CAMPAIGN BREAKDOWN TABLE */}
      {/* ------------------------------------------------------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Campaign Performance Breakdown</h3>
            <p className="text-xs text-slate-500">Live comparative stats per active outreach sequence</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            4 Active Campaigns
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8fafc] text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Campaign Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Opened</th>
                <th className="px-4 py-3 text-right">Replied</th>
                <th className="px-4 py-3 text-right">Positive</th>
                <th className="px-6 py-3 text-right">Bounced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CAMPAIGN_BREAKDOWNS.map((camp) => (
                <tr key={camp.name} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-slate-900">{camp.name}</td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {camp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-800">{camp.sent.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right text-pink-700 font-semibold">{camp.openRate} ({camp.opened})</td>
                  <td className="px-4 py-3.5 text-right text-cyan-700 font-semibold">{camp.replyRate} ({camp.replied})</td>
                  <td className="px-4 py-3.5 text-right text-emerald-700 font-extrabold">{camp.posRate} ({camp.positive})</td>
                  <td className="px-6 py-3.5 text-right text-slate-500">{camp.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
