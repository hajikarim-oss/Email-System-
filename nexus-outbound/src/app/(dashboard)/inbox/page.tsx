"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Inbox,
  Send,
  FileText,
  Plus,
  Search,
  SlidersHorizontal,
  RefreshCw,
  MoreVertical,
  ArrowLeft,
  Trash2,
  Check,
  Sparkles,
  Calendar,
  X,
  ShieldCheck,
  Zap,
  Bot,
  Pencil,
  Building2,
  Mail,
  Phone,
  Layers,
  ArrowRight,
  UserCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Eye,
  ExternalLink,
  Users,
  MailOpen,
  MessageSquare,
  AlertOctagon,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Download,
  FileSpreadsheet
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import { cn } from "@/lib/utils";

interface ClientLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company: string;
  title: string;
  step: string;
  status: "sent" | "scheduled" | "replied" | "paused";
  sentiment?: "Positive" | "Meeting Requested" | "Interested" | "Question";
  lastActivity: string;
  dealValue?: number;
}

interface CampaignItem {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "draft";
  type: "inbox" | "sent" | "drafts";
  leadsCount: number;
  sentCount: number;
  openRate: string;
  replyRate: string;
  positiveRate: string;
  jitter: string;
  createdAt: string;
  owner: string;
  leads: ClientLead[];
}

const INITIAL_CAMPAIGNS: CampaignItem[] = [];

const DAILY_METRICS: Array<{ date: string; sent: number; opened: number; replied: number; positive: number }> = [];

export default function CampaignInboxPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading campaign hub...</div>}>
      <CampaignInboxContent />
    </Suspense>
  );
}

function CampaignInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const currentUser = session?.user?.name || "User";

  const [campaigns, setCampaigns] = useState<CampaignItem[]>(INITIAL_CAMPAIGNS);
  const [activeTab, setActiveTab] = useState<"all" | "inbox" | "sent" | "drafts">("inbox");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChart, setShowChart] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [overviewData, setOverviewData] = useState<{
    totalLeads: number;
    messagesSent: number;
    totalOpened: number;
    openRate: number;
    replies: number;
    replyRate: number;
    positiveReplies: number;
    positiveReplyRate: number;
    bounces: number;
    bounceRate: number;
    chart: Array<{ date: string; sent: number; opens: number; replies: number; positive: number }>;
  }>({
    totalLeads: 0,
    messagesSent: 0,
    totalOpened: 0,
    openRate: 0,
    replies: 0,
    replyRate: 0,
    positiveReplies: 0,
    positiveReplyRate: 0,
    bounces: 0,
    bounceRate: 0,
    chart: [],
  });

  // Fetch live overview telemetry from backend API
  const fetchOverviewMetrics = async () => {
    try {
      const res = await fetch("/api/dashboard/overview");
      if (res.ok) {
        const data = await res.json();
        setOverviewData({
          totalLeads: data.totalLeads || 0,
          messagesSent: data.messagesSent || 0,
          totalOpened: data.totalOpened || 0,
          openRate: data.openRate || 0,
          replies: data.replies || 0,
          replyRate: data.replyRate || 0,
          positiveReplies: data.positiveReplies || 0,
          positiveReplyRate: data.positiveReplyRate || 0,
          bounces: data.bounces || 0,
          bounceRate: data.bounceRate || 0,
          chart: Array.isArray(data.chart) ? data.chart : [],
        });
      }
    } catch (e) {
      console.error("Failed to load live metrics:", e);
    }
  };

  useEffect(() => {
    fetchOverviewMetrics();
    const interval = setInterval(fetchOverviewMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  // Create Campaign Modal State
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [newCampaignNameInput, setNewCampaignNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  // Campaign Deletion Guardrail State
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignItem | null>(null);

  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    try {
      await fetch(`/api/campaigns/${campaignToDelete.id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete campaign from database:", e);
    }
    const updated = campaigns.filter((c) => c.id !== campaignToDelete.id);
    saveCampaignsList(updated);
    if (selectedCampaignId === campaignToDelete.id) {
      setSelectedCampaignId(null);
    }
    setCampaignToDelete(null);
  };

  // Load campaigns from database API on mount
  const fetchCampaignsFromDb = async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: CampaignItem[] = data.map((c: any) => ({
            id: c.id,
            name: c.name,
            status: c.status.toLowerCase() as "active" | "paused" | "completed" | "draft",
            type: c.status.toLowerCase() === "draft" ? "drafts" : c.status.toLowerCase() === "completed" ? "sent" : "inbox",
            leadsCount: typeof c.leadsCount === "number" ? c.leadsCount : Array.isArray(c.leads) ? c.leads.length : 0,
            sentCount: c.sent || 0,
            openRate: `${(c.openRate || 0).toFixed(1)}%`,
            replyRate: `${(c.replyRate || 0).toFixed(1)}%`,
            positiveRate: "0.0%",
            jitter: "45s–120s Randomized",
            createdAt: c.updatedAt || "Recently",
            owner: c.owner || currentUser,
            leads: Array.isArray(c.leads) ? c.leads : [],
          }));
          setCampaigns(mapped);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to fetch database campaigns:", e);
    }
    // No localStorage fallback — campaigns are server-owned per user
  };

  useEffect(() => {
    fetchCampaignsFromDb();
  }, []);

  const saveCampaignsList = (newList: CampaignItem[]) => {
    setCampaigns(newList);
  };

  // Edit / Add Client Modal State
  const [editingClient, setEditingClient] = useState<ClientLead | null>(null);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientTitle, setNewClientTitle] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "warning" | "error" | "success" } | null>(null);
  const showToast = (message: string, type: "warning" | "error" | "success" = "warning") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreateCampaignSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isCreatingCampaign) return; // Prevent double-click

    const rawName = newCampaignNameInput.trim();
    const finalName = rawName || `Campaign ${campaigns.length + 1}`;

    // Duplicate check
    const isDuplicate = campaigns.some(
      (c) => c.name.trim().toLowerCase() === finalName.toLowerCase()
    );

    if (isDuplicate) {
      setNameError(`⚠️ A campaign named "${finalName}" already exists. Please choose a unique name.`);
      return;
    }

    setNameError(null);
    setIsCreatingCampaign(true);

    let newId = `camp-${Date.now().toString(36)}`;
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: finalName,
          activeUserId: localStorage.getItem("nexus_active_user_id") || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (created.duplicate) {
          // API found a duplicate — navigate to existing campaign
          setNameError(`⚠️ A campaign named "${finalName}" already exists. Redirecting to it.`);
          setIsCreatingCampaign(false);
          setShowCreateCampaignModal(false);
          setNewCampaignNameInput("");
          router.push(`/campaigns/new?id=${created.id}&name=${encodeURIComponent(created.name)}`);
          return;
        }
        if (created.id) {
          newId = created.id;
        }
      }
    } catch (err) {
      console.error("Failed to persist campaign to database:", err);
    }

    const newCamp: CampaignItem = {
      id: newId,
      name: finalName,
      status: "draft",
      type: "drafts",
      leadsCount: 0,
      sentCount: 0,
      openRate: "0.0%",
      replyRate: "0.0%",
      positiveRate: "0.0%",
      jitter: "45s–120s Randomized",
      createdAt: "Just now",
      owner: currentUser,
      leads: [],
    };

    const updated = [newCamp, ...campaigns];
    saveCampaignsList(updated);
    setShowCreateCampaignModal(false);
    setNewCampaignNameInput("");
    setIsCreatingCampaign(false);
    router.push(`/campaigns/new?id=${newId}&name=${encodeURIComponent(finalName)}`);
  };

  const handleCreateCampaignSkip = async () => {
    if (isCreatingCampaign) return; // Prevent double-click

    let finalName = `Campaign ${campaigns.length + 1}`;
    let counter = 1;
    while (campaigns.some((c) => c.name.trim().toLowerCase() === finalName.toLowerCase())) {
      counter++;
      finalName = `Campaign ${campaigns.length + counter}`;
    }

    setNameError(null);
    setIsCreatingCampaign(true);

    let newId = `camp-${Date.now().toString(36)}`;
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: finalName,
          activeUserId: localStorage.getItem("nexus_active_user_id") || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (created.duplicate) {
          setIsCreatingCampaign(false);
          setShowCreateCampaignModal(false);
          setNewCampaignNameInput("");
          router.push(`/campaigns/new?id=${created.id}&name=${encodeURIComponent(created.name)}`);
          return;
        }
        if (created.id) {
          newId = created.id;
        }
      }
    } catch (err) {
      console.error("Failed to persist campaign to database:", err);
    }

    const newCamp: CampaignItem = {
      id: newId,
      name: finalName,
      status: "draft",
      type: "drafts",
      leadsCount: 0,
      sentCount: 0,
      openRate: "0.0%",
      replyRate: "0.0%",
      positiveRate: "0.0%",
      jitter: "45s–120s Randomized",
      createdAt: "Just now",
      owner: currentUser,
      leads: [],
    };

    const updated = [newCamp, ...campaigns];
    saveCampaignsList(updated);
    setShowCreateCampaignModal(false);
    setNewCampaignNameInput("");
    setIsCreatingCampaign(false);
    router.push(`/campaigns/new?id=${newId}&name=${encodeURIComponent(finalName)}`);
  };

  // Active Selected Campaign
  const activeCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  // Filtered Campaigns List
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchTab =
        activeTab === "all" ||
        (activeTab === "inbox" && c.type === "inbox") ||
        (activeTab === "sent" && c.type === "sent") ||
        (activeTab === "drafts" && (c.type === "drafts" || c.status === "paused"));

      const matchSearch =
        searchQuery === "" ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.owner.toLowerCase().includes(searchQuery.toLowerCase());

      return matchTab && matchSearch;
    });
  }, [campaigns, activeTab, searchQuery]);

  // Handle Client Updates
  const handleSaveClient = () => {
    if (!editingClient || !selectedCampaignId) return;

    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === selectedCampaignId) {
          return {
            ...c,
            leads: c.leads.map((l) => (l.id === editingClient.id ? editingClient : l)),
          };
        }
        return c;
      })
    );
    setEditingClient(null);
  };

  const handleAddClientToCampaign = () => {
    if (!newClientName || !newClientEmail || !selectedCampaignId) {
      alert("Please fill in client name and email.");
      return;
    }

    // Duplicate email check
    const activeCamp = campaigns.find((c) => c.id === selectedCampaignId);
    const cleanEmail = newClientEmail.toLowerCase().trim();
    const isDuplicate = activeCamp?.leads.some(
      (l) => l.email.toLowerCase().trim() === cleanEmail
    );

    if (isDuplicate) {
      showToast(`Lead with email "${newClientEmail}" already exists in this campaign!`, "warning");
      return;
    }

    const newLead: ClientLead = {
      id: `l-${Date.now()}`,
      name: newClientName,
      email: newClientEmail,
      company: newClientCompany || "Enterprise Client",
      title: newClientTitle || "Executive",
      phone: newClientPhone,
      step: "Queued for Step 1",
      status: "scheduled",
      lastActivity: "Added to queue just now",
    };

    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === selectedCampaignId) {
          return {
            ...c,
            leadsCount: c.leadsCount + 1,
            leads: [newLead, ...c.leads],
          };
        }
        return c;
      })
    );

    setShowAddClientModal(false);
    setNewClientName("");
    setNewClientEmail("");
    setNewClientCompany("");
    setNewClientTitle("");
    setNewClientPhone("");
  };

  const handleDeleteClient = (leadId: string) => {
    if (!selectedCampaignId) return;
    if (!confirm("Are you sure you want to remove this client from the campaign?")) return;

    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === selectedCampaignId) {
          return {
            ...c,
            leadsCount: Math.max(0, c.leadsCount - 1),
            leads: c.leads.filter((l) => l.id !== leadId),
          };
        }
        return c;
      })
    );
  };

  const totalLeadsInCampaigns = useMemo(() => {
    return campaigns.reduce((acc, c) => acc + (c.leadsCount || c.leads?.length || 0), 0);
  }, [campaigns]);

  const displayTotalLeads = Math.max(overviewData.totalLeads, totalLeadsInCampaigns);

  const chartData = useMemo(() => {
    if (overviewData.chart && overviewData.chart.length > 0) {
      return overviewData.chart;
    }
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sent: 0,
        opens: 0,
        replies: 0,
        positive: 0,
      };
    });
  }, [overviewData.chart]);

  const handleDownloadReport = () => {
    const reportData = [
      ["Date", "Emails Sent", "Opened", "Replied", "Positive Replies", "Bounces"],
      ...(overviewData.chart || []).map((row) => [row.date, row.sent, row.opens, row.replies, row.positive, 0]),
      [],
      ["Summary Metric", "Total Value", "Rate"],
      ["Total Leads", displayTotalLeads.toString(), "-"],
      ["Total Sent", overviewData.messagesSent.toString(), "100%"],
      ["Total Opened", overviewData.totalOpened.toString(), `${overviewData.openRate}%`],
      ["Total Replied", overviewData.replies.toString(), `${overviewData.replyRate}%`],
      ["Positive Replies", overviewData.positiveReplies.toString(), `${overviewData.positiveReplyRate}%`],
      ["Bounces", overviewData.bounces.toString(), `${overviewData.bounceRate}%`],
    ];

    // Use selected date range for filename if both dates are set
    const dateLabel = startDate && endDate ? `${startDate}_to_${endDate}` : "report";

    const csvContent = reportData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `outreach_analytics_report_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-full w-full font-sans text-[#1f1f1f] select-none space-y-3.5 pb-16">
      {/* ========================================================================= */}
      {/* 0. TOP DEFAULT ANALYTICS & PERFORMANCE METRICS SECTION */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3.5">
        {/* Analytics Top Controls Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <BarChart3 size={16} className="text-[#0b57d0]" />
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                Performance Metrics &amp; Outreach Telemetry
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-800">
              Live Real-Time
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Date Range Selector Calendar */}
            <div className="flex items-center gap-2">
                <Calendar size={13} className="text-[#0b57d0]" />
                <label className="text-xs font-semibold text-slate-700">From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-200 bg-[#f8fafc] px-2 py-1 text-xs" />
                <label className="text-xs font-semibold text-slate-700">To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border border-slate-200 bg-[#f8fafc] px-2 py-1 text-xs" />
            </div>

            {/* Download Report Button */}
            <button
              onClick={handleDownloadReport}
               className={
                 startDate && endDate
                   ? "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-gradient-to-r from-purple-400 to-pink-400 text-white px-2.5 py-1 text-xs font-bold shadow-2xs hover:opacity-90 transition-colors"
                   : "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-gray-200 text-slate-500 px-2.5 py-1 text-xs font-bold cursor-not-allowed"
               }
               title="Download CSV Analytics Report"
               disabled={!(startDate && endDate)}
             >
              <Download size={13} className="text-[#0b57d0]" />
              <span>Download Report</span>
            </button>

            {/* Toggle Engagement Chart Button */}
            <button
              onClick={() => setShowChart(!showChart)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
            >
              <span>{showChart ? "Hide Chart" : "Show Chart"}</span>
              {showChart ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* 5 KPI Metric Cards (Real Dynamic Telemetry) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Card 1: Emails Sent */}
          <div className="rounded-xl border border-purple-200/70 bg-gradient-to-b from-purple-50/40 to-white p-3 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-purple-800 font-semibold mb-1">
              <div className="flex items-center gap-1">
                <Send size={13} className="text-purple-600" />
                <span>Emails Sent</span>
              </div>
              <span className="text-[9px] text-slate-400">ⓘ</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {overviewData.messagesSent.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {displayTotalLeads.toLocaleString()} Leads (Active + Inactive)
            </p>
          </div>

          {/* Card 2: Opened */}
          <div className="rounded-xl border border-pink-200/70 bg-gradient-to-b from-pink-50/40 to-white p-3 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-pink-800 font-semibold mb-1">
              <div className="flex items-center gap-1">
                <MailOpen size={13} className="text-pink-600" />
                <span>Opened</span>
              </div>
              <span className="text-[9px] text-slate-400">ⓘ</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {overviewData.totalOpened.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-pink-700 mt-0.5">
              {overviewData.openRate.toFixed(2)}% Open Rate
            </p>
          </div>

          {/* Card 3: Replied */}
          <div className="rounded-xl border border-cyan-200/70 bg-gradient-to-b from-cyan-50/40 to-white p-3 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-cyan-800 font-semibold mb-1">
              <div className="flex items-center gap-1">
                <MessageSquare size={13} className="text-cyan-600" />
                <span>Replied</span>
              </div>
              <span className="text-[9px] text-slate-400">ⓘ</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {overviewData.replies.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-cyan-700 mt-0.5">
              {overviewData.replyRate.toFixed(2)}% Reply Rate
            </p>
          </div>

          {/* Card 4: Positive Reply */}
          <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/40 to-white p-3 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold mb-1">
              <div className="flex items-center gap-1">
                <Sparkles size={13} className="text-emerald-600" />
                <span>Positive Reply</span>
              </div>
              <span className="text-[9px] text-slate-400">ⓘ</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {overviewData.positiveReplies.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-emerald-700 mt-0.5">
              {overviewData.positiveReplyRate.toFixed(2)}% Positive Reply Rate
            </p>
          </div>

          {/* Card 5: Bounced */}
          <div className="rounded-xl border border-rose-200/70 bg-gradient-to-b from-rose-50/40 to-white p-3 shadow-2xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[11px] text-rose-800 font-semibold mb-1">
              <div className="flex items-center gap-1">
                <AlertOctagon size={13} className="text-rose-600" />
                <span>Bounced</span>
              </div>
              <span className="text-[9px] text-slate-400">ⓘ</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {overviewData.bounces.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
              {overviewData.bounceRate.toFixed(2)}% Bounce Rate
            </p>
          </div>
        </div>

        {/* Expandable Recharts Engagement Area Graph */}
        {showChart && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800">Email Engagement Velocity</span>
                <span className="text-[10px] text-slate-400">(UTC Timezone · Live Telemetry)</span>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="flex items-center gap-1 text-blue-600">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Sent
                </span>
                <span className="flex items-center gap-1 text-pink-600">
                  <span className="h-2 w-2 rounded-full bg-pink-500" /> Opens
                </span>
                <span className="flex items-center gap-1 text-cyan-600">
                  <span className="h-2 w-2 rounded-full bg-cyan-500" /> Replies
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Positive
                </span>
              </div>
            </div>

            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sentGradTop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="openGradTop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      borderRadius: "0.5rem",
                      color: "#ffffff",
                      fontSize: "11px",
                      padding: "4px 8px"
                    }}
                  />
                  <Area type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#sentGradTop)" name="Sent" />
                  <Area type="monotone" dataKey="opens" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#openGradTop)" name="Opens" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. TOP HORIZONTAL ACTION & FOLDER NAVIGATION BAR (Compact & Sleek) */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs">
        {/* Left: Add Campaign Button + Horizontal Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Add Campaign Button */}
          <button
            onClick={() => {
              setNewCampaignNameInput("");
              setShowCreateCampaignModal(true);
            }}
            className="flex h-8.5 items-center gap-1.5 rounded-lg bg-[#0b57d0] px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-[#0842a0] transition-all active:scale-[.98]"
            title="Create New Outreach Campaign"
          >
            <Plus size={15} strokeWidth={2.6} />
            <span>Add Campaign</span>
          </button>

          {/* Horizontal Folder Buttons */}
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold text-slate-700">
            <button
              onClick={() => {
                setActiveTab("all");
                setSelectedCampaignId(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition-all flex items-center gap-1.5 text-xs",
                activeTab === "all" && !selectedCampaignId
                  ? "bg-white text-[#0b57d0] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Layers size={13} />
              <span>All Campaigns ({campaigns.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("inbox");
                setSelectedCampaignId(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition-all flex items-center gap-1.5 text-xs",
                activeTab === "inbox" && !selectedCampaignId
                  ? "bg-white text-[#0b57d0] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Inbox size={13} />
              <span>Replies Inbox ({campaigns.filter(c => c.type === "inbox").length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("sent");
                setSelectedCampaignId(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition-all flex items-center gap-1.5 text-xs",
                activeTab === "sent" && !selectedCampaignId
                  ? "bg-white text-[#0b57d0] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Send size={13} />
              <span>Sent Outbound ({campaigns.filter(c => c.type === "sent").length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("drafts");
                setSelectedCampaignId(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition-all flex items-center gap-1.5 text-xs",
                activeTab === "drafts" && !selectedCampaignId
                  ? "bg-white text-[#0b57d0] font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <FileText size={13} />
              <span>Drafts &amp; Paused ({campaigns.filter(c => c.type === "drafts" || c.status === "paused").length})</span>
            </button>
          </div>
        </div>

        {/* Right: Search Input */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 rounded-lg border border-slate-200 bg-[#f8fafc] pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#0b57d0] focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT VIEW: CAMPAIGN LEVEL LIST vs CLIENTS ADDED LIST */}
      {/* ========================================================================= */}
      {!selectedCampaignId ? (
        /* ----------------------------------------------------------------------- */
        /* VIEW A: CAMPAIGN LEVEL DASHBOARD (Compact Cards) */
        /* ----------------------------------------------------------------------- */
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-xs font-bold text-slate-900">
                Campaign Outbound Sequences ({filteredCampaigns.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Click any campaign to inspect its added client list, edit details, or track live sequential sends.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-200">
              {filteredCampaigns.length} Campaign{filteredCampaigns.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {filteredCampaigns.map((camp) => (
              <div
                key={camp.id}
                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-xs hover:border-[#0b57d0]/40 transition-all space-y-3"
              >
                {/* Top Row: Title, Status, Owner, Created Date */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#0b57d0] font-bold text-xs shadow-2xs">
                      <Send size={13} />
                    </span>
                    <div>
                      <h3
                        onClick={() => setSelectedCampaignId(camp.id)}
                        className="text-xs sm:text-sm font-bold text-slate-900 hover:text-[#0b57d0] cursor-pointer transition-colors"
                      >
                        {camp.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span>Owner: <strong>{camp.owner}</strong></span>
                        <span>·</span>
                        <span>Created: {camp.createdAt}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-600 font-semibold">{camp.jitter}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-extrabold",
                        camp.status === "active"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : camp.status === "paused"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                      )}
                    >
                      {camp.status === "active" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      {camp.status === "draft" ? "DRAFT (In Setup)" : camp.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Metrics Row + Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Performance Indicators */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Clients</span>
                      <p className="text-xs font-extrabold text-slate-900 mt-0.5">
                        {camp.leadsCount}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Sent</span>
                      <p className="text-xs font-extrabold text-slate-900 mt-0.5">
                        {camp.sentCount.toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Open Rate</span>
                      <p className="text-xs font-extrabold text-pink-700 mt-0.5">
                        {camp.openRate}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Reply Rate</span>
                      <p className="text-xs font-extrabold text-cyan-700 mt-0.5">
                        {camp.replyRate}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Positive</span>
                      <p className="text-xs font-extrabold text-emerald-700 mt-0.5">
                        {camp.positiveRate}
                      </p>
                    </div>
                  </div>

                  {/* Campaign Action Buttons (Campaign Level) */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedCampaignId(camp.id)}
                      className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-[#0b57d0] hover:bg-blue-100 transition-all shadow-2xs"
                    >
                      <Users size={13} />
                      <span>Clients List ({camp.leads.length || camp.leadsCount})</span>
                    </button>

                    {camp.status === "draft" ? (
                      <Link
                        href={`/campaigns/new?id=${camp.id}&name=${encodeURIComponent(camp.name)}`}
                        className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-all shadow-2xs"
                      >
                        <Pencil size={12} />
                        <span>Continue Setup</span>
                      </Link>
                    ) : (
                      <Link
                        href={`/campaigns/${camp.id}/workflow`}
                        className="flex items-center gap-1 rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-all shadow-2xs"
                      >
                        <Zap size={13} />
                        <span>Live Workflow</span>
                      </Link>
                    )}

                    <Link
                      href={`/campaigns/new?id=${camp.id}&name=${encodeURIComponent(camp.name)}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
                    >
                      <Pencil size={12} />
                      <span>Edit</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setCampaignToDelete(camp)}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-all shadow-2xs"
                      title="Delete Campaign"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------------------- */
        /* VIEW B: CLIENTS ADDED LIST (When user clicks a specific campaign) */
        /* ----------------------------------------------------------------------- */
        activeCampaign && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Header & Back Breadcrumb */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setSelectedCampaignId(null)}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-slate-200 bg-[#f8fafc] text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Back to All Campaigns"
                >
                  <ArrowLeft size={14} />
                </button>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="font-bold text-[#0b57d0]">
                      Campaign Clients Hub
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-500">{activeCampaign.name}</span>
                  </div>
                  <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
                    Added Clients &amp; Contacts ({activeCampaign.leads.length})
                  </h2>
                </div>
              </div>

              {/* Action Buttons for this Campaign */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddClientModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-[#0b57d0] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs transition-all"
                >
                  <Plus size={13} />
                  <span>Add Client to Campaign</span>
                </button>

                {activeCampaign.status === "draft" ? (
                  <Link
                    href={`/campaigns/new?id=${activeCampaign.id}&name=${encodeURIComponent(activeCampaign.name)}`}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-all shadow-2xs"
                  >
                    <Pencil size={13} />
                    <span>Continue Setup</span>
                  </Link>
                ) : (
                  <Link
                    href={`/campaigns/${activeCampaign.id}/workflow`}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-50 border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-all shadow-2xs"
                  >
                    <Zap size={13} />
                    <span>Live Workflow</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Clients Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-[9px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Client Contact</th>
                      <th className="px-3 py-2.5">Company &amp; Title</th>
                      <th className="px-3 py-2.5">Outreach Step</th>
                      <th className="px-3 py-2.5">Deal Potential</th>
                      <th className="px-3 py-2.5">Last Activity</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeCampaign.leads.map((client) => (
                      <tr key={client.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Client Name & Email */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-[10px] shadow-2xs shrink-0">
                              {((client.name || `${(client as any).firstName || ''} ${(client as any).lastName || ''}`).trim() || client.email || "C")
                                .split(" ")
                                .map((n) => n[0] || "")
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-xs">
                                {client.name || `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || client.email}
                              </p>
                              <p className="font-mono text-[10px] text-slate-500">{client.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Company & Title */}
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800 text-xs">{client.company}</p>
                          <p className="text-[10px] text-slate-500">{client.title}</p>
                        </td>

                        {/* Outreach Step & Status */}
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold",
                              client.status === "replied"
                                ? "bg-purple-100 text-purple-800"
                                : client.status === "sent"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-blue-100 text-blue-800"
                            )}
                          >
                            <Sparkles size={9} />
                            {client.step}
                          </span>
                        </td>

                        {/* Deal Potential */}
                        <td className="px-3 py-3">
                          <span className="font-extrabold text-slate-900 text-xs">
                            ${client.dealValue ? client.dealValue.toLocaleString() : "15,000"}
                          </span>
                        </td>

                        {/* Last Activity */}
                        <td className="px-3 py-3 text-[10px] text-slate-500 max-w-xs truncate">
                          {client.lastActivity}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingClient(client)}
                              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                              title="Edit Client Info"
                            >
                              <Pencil size={11} />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => handleDeleteClient(client.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Client"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* 3. EDIT CLIENT MODAL */}
      {/* ========================================================================= */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-[#0b57d0]" />
                <h3 className="text-sm font-bold text-slate-900">Edit Client Contact</h3>
              </div>
              <button
                onClick={() => setEditingClient(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Client Full Name</label>
                <input
                  type="text"
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Email Address</label>
                <input
                  type="email"
                  value={editingClient.email}
                  onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Company</label>
                  <input
                    type="text"
                    value={editingClient.company}
                    onChange={(e) => setEditingClient({ ...editingClient, company: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Job Title</label>
                  <input
                    type="text"
                    value={editingClient.title}
                    onChange={(e) => setEditingClient({ ...editingClient, title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Phone Number</label>
                <input
                  type="text"
                  value={editingClient.phone || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingClient(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClient}
                className="rounded-xl bg-[#0b57d0] px-4 py-2 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ADD CLIENT TO CAMPAIGN MODAL */}
      {/* ========================================================================= */}
      {showAddClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-[#0b57d0]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Add Client to {activeCampaign?.name}
                </h3>
              </div>
              <button
                onClick={() => setShowAddClientModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Work Email *</label>
                <input
                  type="email"
                  placeholder="e.g. john@enterprise.io"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Company</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={newClientCompany}
                    onChange={(e) => setNewClientCompany(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Job Title</label>
                  <input
                    type="text"
                    placeholder="e.g. VP Operations"
                    value={newClientTitle}
                    onChange={(e) => setNewClientTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 000-0000"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddClientModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClientToCampaign}
                className="rounded-xl bg-[#0b57d0] px-4 py-2 text-xs font-bold text-white hover:bg-[#0842a0] shadow-2xs"
              >
                Add Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. EXACT GOOGLE / SMARTLEAD "CREATE A CAMPAIGN" MODAL POPUP */}
      {/* ========================================================================= */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-[500px] rounded-[24px] bg-white p-7 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 border border-slate-100">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Create a Campaign
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Set up the basic information for your campaign
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateCampaignModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaignSubmit} className="space-y-6 pt-1">
              <div className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={newCampaignNameInput}
                  onChange={(e) => {
                    setNewCampaignNameInput(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Give your campaign a name"
                  className={cn(
                    "w-full rounded-2xl border bg-white px-4.5 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 outline-none transition-all shadow-xs",
                    nameError
                      ? "border-amber-400 focus:border-amber-500 focus:ring-amber-200"
                      : "border-slate-200 focus:border-[#0b57d0] focus:ring-[#0b57d0]/20"
                  )}
                />
                {nameError && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs font-bold text-amber-900 animate-in fade-in">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <span>{nameError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCreateCampaignSkip}
                  disabled={isCreatingCampaign}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Skip
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCreateCampaignModal(false)}
                    disabled={isCreatingCampaign}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingCampaign}
                    className="rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] px-6 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCreatingCampaign ? "Creating..." : "Continue"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CAMPAIGN CONFIRMATION GUARDRAIL MODAL */}
      {campaignToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCampaignToDelete(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Delete Campaign</h3>
                <p className="text-[11px] text-slate-500">Confirm permanent deletion</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-2">
              <p>
                Are you sure you want to delete <strong className="text-slate-900">{campaignToDelete.name}</strong>?
              </p>
              <p className="text-slate-500">
                This will permanently remove all added leads, sequence steps, and campaign settings. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCampaignToDelete(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCampaign}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
              >
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TOAST NOTIFICATION */}
      {/* ========================================================================= */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg text-xs font-bold",
              toast.type === "warning" && "bg-amber-50 border-amber-200 text-amber-900",
              toast.type === "error" && "bg-rose-50 border-rose-200 text-rose-900",
              toast.type === "success" && "bg-emerald-50 border-emerald-200 text-emerald-900"
            )}
          >
            {toast.type === "warning" && <AlertTriangle size={15} className="text-amber-600 shrink-0" />}
            {toast.type === "error" && <AlertOctagon size={15} className="text-rose-600 shrink-0" />}
            {toast.type === "success" && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
