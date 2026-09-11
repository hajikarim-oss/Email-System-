"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Pause, Square, Play, CheckCircle2, Send, Eye,
  MessageSquare, XCircle, ExternalLink, RefreshCw, Users,
  Activity, Zap, Clock, History, ChevronDown, ChevronRight,
  UserX, TestTube, Wifi, Copy, Check, Minus, Filter,
  Upload, Download, Search, Mail, Link2, BookOpen, Settings,
  MoreVertical, Calendar, TrendingUp, AlertTriangle, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGetCampaign, useCampaignControl, useLeadControl,
  useCampaignEvents, useWebhookTest, useWebhookHealth,
  useCampaignSync,
} from "@/lib/api-hooks";

export default function CampaignWorkflowPage() {
  const params = useParams();
  const campaignId = (params?.id as string) || "";

  const { data: d, isLoading, refetch } = useGetCampaign(campaignId);
  const campaignCtrl = useCampaignControl();
  const leadCtrl = useLeadControl();
  const { data: evData, refetch: refetchEv } = useCampaignEvents(campaignId);
  const whTest = useWebhookTest();
  const { data: whHealth, refetch: refetchWh } = useWebhookHealth();
  const campaignSync = useCampaignSync();

  const [tab, setTab] = useState<"overview" | "leads" | "sequences" | "emails" | "settings">("overview");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; leadId?: string; leadEmail?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [whConfiguring, setWhConfiguring] = useState(false);
  const [whMessage, setWhMessage] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<"all" | "active" | "replied" | "failed" | "scheduled">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?unread=true&limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.warn("Failed to fetch notifications:", e);
    }
  };

  // Mark notifications as read
  const markAsRead = async (ids?: string[]) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { notificationIds: ids } : { markAll: true }),
      });
      fetchNotifications();
    } catch (e) {
      console.warn("Failed to mark notifications:", e);
    }
  };

  // Fetch notifications on mount and every 30s
  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30000);
    return () => clearInterval(t);
  }, []);

  const dRef = useRef(d);
  dRef.current = d;
  const syncRef = useRef(campaignSync);
  syncRef.current = campaignSync;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const refetchEvRef = useRef(refetchEv);
  refetchEvRef.current = refetchEv;

  useEffect(() => {
    if (!d || d.status === "draft") return;
    const t = setInterval(() => {
      const data = dRef.current;
      if (data?.providerCampaignId && (data.status === "active" || data.status === "paused")) {
        syncRef.current.mutate(campaignId, {
          onSuccess: () => { refetchRef.current(); refetchEvRef.current(); },
          onError: () => { refetchRef.current(); refetchEvRef.current(); },
        });
      } else {
        refetchRef.current();
        refetchEvRef.current();
      }
    }, 30000);
    return () => clearInterval(t);
  }, [campaignId, d?.status]);

  const doAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.leadId) {
        await leadCtrl.mutateAsync({ campaignId, leadId: confirm.leadId, action: confirm.action as "stop" | "resume" });
        flash(`Lead ${confirm.action === "stop" ? "stopped" : "resumed"}`);
      } else {
        await campaignCtrl.mutateAsync({ id: campaignId, action: confirm.action as "pause" | "resume" | "stop" });
        flash(`Campaign ${confirm.action === "pause" ? "paused" : confirm.action === "resume" ? "restarted" : "stopped"}`);
      }
      await campaignSync.mutateAsync(campaignId);
      refetch();
      refetchEv();
    } catch (e) { flash(`Error: ${(e as Error).message}`); }
    setConfirm(null);
  };

  const testWh = async (type: string) => {
    try {
      const r = await whTest.mutateAsync({ eventType: type });
      flash(`Test sent — HTTP ${r.statusCode}`);
    } catch (e) { flash(`Test failed: ${(e as Error).message}`); }
  };

  const configWh = async () => {
    setWhConfiguring(true); setWhMessage(null);
    try {
      const r = await fetch("/api/webhooks/smartlead/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId }) });
      const j = await r.json();
      setWhMessage(r.ok ? j.message : j.error);
    } catch { setWhMessage("Network error"); }
    setWhConfiguring(false);
  };

  const copyUrl = () => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/smartlead`); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAllLeads = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map((l: any) => l.id)));
    }
  };

  if (isLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-[3px] border-[#0b57d0] border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">Loading campaign...</p>
      </div>
    </div>
  );

  const status = d?.status || "draft";
  const smartleadStatus = d?.smartleadStatus || "";
  const isLaunched = !!d?.providerCampaignId;
  const isActive = status === "active";
  const isPaused = status === "paused";
  const leads = d?.leadsList || [];
  const steps = d?.stepsList || [];
  const events = evData?.events || [];
  const counts = evData?.counts || {};

  // Filter leads
  const filteredLeads = leads.filter((lead: any) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = `${lead.firstName || ""} ${lead.lastName || ""}`.toLowerCase().includes(q);
      const matchEmail = lead.email.toLowerCase().includes(q);
      const matchCompany = (lead.company || "").toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchCompany) return false;
    }
    // Status filter
    if (leadFilter === "active") return lead.leadStatus === "active" || lead.leadStatus === "sent";
    if (leadFilter === "replied") return lead.leadStatus === "replied" || lead.hasReplied;
    if (leadFilter === "failed") return lead.leadStatus === "bounced" || lead.leadStatus === "unsubscribed" || lead.hasBounced;
    if (leadFilter === "scheduled") return (lead.stepsSent?.length || 0) < steps.length && !lead.hasReplied && !lead.hasBounced;
    return true;
  });

  // Calculate lead counts for filters
  const leadCounts = {
    all: leads.length,
    active: leads.filter((l: any) => l.leadStatus === "active" || l.leadStatus === "sent").length,
    replied: leads.filter((l: any) => l.leadStatus === "replied" || l.hasReplied).length,
    failed: leads.filter((l: any) => l.leadStatus === "bounced" || l.leadStatus === "unsubscribed" || l.hasBounced).length,
    scheduled: leads.filter((l: any) => (l.stepsSent?.length || 0) < steps.length && !l.hasReplied && !l.hasBounced).length,
  };

  // Calculate next email time (placeholder - in real app would come from Smartlead)
  const getNextEmailTime = () => {
    if (!isActive) return null;
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 9 && hour < 17) return "In 5m";
    return "Tomorrow 9AM";
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" />{toast}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {confirm.leadId ? `${confirm.action === "stop" ? "Stop" : "Resume"} Lead` : `${confirm.action === "pause" ? "Pause" : confirm.action === "resume" ? "Restart" : "Stop"} Campaign`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {confirm.leadEmail && `Email: ${confirm.leadEmail}. `}
              {confirm.action === "stop" ? "This will permanently stop sending to this target." : confirm.action === "pause" ? "Sending will be paused until you restart." : "Sending will resume on Smartlead's schedule."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={doAction} className={cn("px-4 py-1.5 text-xs font-bold text-white rounded-lg",
                confirm.action === "stop" ? "bg-red-600 hover:bg-red-700" : confirm.action === "pause" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"
              )}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link href="/campaigns" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                <ArrowLeft size={16} />
              </Link>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">{d?.name || "Campaign"}</h1>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide",
                    isActive ? "bg-emerald-100 text-emerald-700" : isPaused ? "bg-amber-100 text-amber-700" : status === "completed" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"
                  )}>{status}</span>
                  {d?.providerCampaignId && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-600 border border-indigo-100">
                      Smartlead ID: {d.providerCampaignId}
                    </span>
                  )}
                  {smartleadStatus && smartleadStatus !== "UNKNOWN" && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200">
                      SL: {smartleadStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {d?.owner && <span>Owner: {d.owner}</span>}
                  <span className="mx-1.5">·</span><span>{leads.length} leads</span>
                  <span className="mx-1.5">·</span><span>{steps.length} steps</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  <Bell size={15} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={() => markAsRead()} className="text-[10px] font-semibold text-[#0b57d0] hover:underline">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <Bell size={20} className="mx-auto text-slate-200 mb-2" />
                          <p className="text-[11px] text-slate-400">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div
                            key={n.id}
                            className={cn(
                              "px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer",
                              !n.read && "bg-blue-50/50"
                            )}
                            onClick={() => {
                              if (!n.read) markAsRead([n.id]);
                              if (n.campaignId) window.location.href = `/campaigns/${n.campaignId}/workflow`;
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div className={cn(
                                "h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                n.type === "reply" ? "bg-emerald-100" : n.type === "bounce" ? "bg-red-100" : "bg-slate-100"
                              )}>
                                {n.type === "reply" ? (
                                  <MessageSquare size={11} className="text-emerald-600" />
                                ) : n.type === "bounce" ? (
                                  <XCircle size={11} className="text-red-600" />
                                ) : (
                                  <Bell size={11} className="text-slate-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-slate-900">{n.title}</p>
                                <p className="text-[10px] text-slate-500 truncate">{n.message}</p>
                                {n.campaignName && (
                                  <p className="text-[9px] text-slate-400 mt-0.5">
                                    Campaign: {n.campaignName}
                                    {n.clientEmail && ` · To: ${n.clientEmail}`}
                                  </p>
                                )}
                                <p className="text-[9px] text-slate-300 mt-0.5">
                                  {new Date(n.createdAt).toLocaleString()}
                                </p>
                              </div>
                              {!n.read && (
                                <span className="h-2 w-2 rounded-full bg-[#0b57d0] shrink-0 mt-1" />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => { refetch(); refetchEv(); refetchWh(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                <RefreshCw size={13} /> Refresh
              </button>
              {isLaunched && (
                <button
                  onClick={() => campaignSync.mutate(campaignId, {
                    onSuccess: (data) => {
                      setToast(`Synced: ${data.leadsUpdated} leads updated from Smartlead`);
                      refetch();
                    },
                  })}
                  disabled={campaignSync.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} className={campaignSync.isPending ? "animate-spin" : ""} />
                  {campaignSync.isPending ? "Syncing..." : "Sync from Smartlead"}
                </button>
              )}
              {isLaunched && (isActive || isPaused) && (
                <>
                  {isActive && (
                    <button onClick={() => setConfirm({ action: "pause" })} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                      <Pause size={13} /> Pause
                    </button>
                  )}
                  {isPaused && (
                    <button onClick={() => setConfirm({ action: "resume" })} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">
                      <Play size={13} /> Restart
                    </button>
                  )}
                  <button onClick={() => setConfirm({ action: "stop" })} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors">
                    <Square size={13} /> Stop
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ─── STATS BAR ─── */}
          <div className="grid grid-cols-6 gap-3">
            <StatBarCard icon={<Calendar size={14} />} label="Follow-ups Today" value="0" accent="#0b57d0" />
            <StatBarCard icon={<Zap size={14} />} label="Webhooks" value={isLaunched ? "Enabled" : "Disabled"} accent={isLaunched ? "#059669" : "#dc2626"} isText />
            <StatBarCard icon={<TrendingUp size={14} />} label="Sending Capacity" value={`${Math.round((d?.sent || 0) / Math.max(leads.length, 1) * 100)}% Used`} accent="#7c3aed" isText />
            <StatBarCard icon={<BookOpen size={14} />} label="Active Sequences" value={steps.length.toString()} accent="#0b57d0" />
            <StatBarCard icon={<Send size={14} />} label="Emails Sent (30m)" value={(d?.sent || 0).toString()} accent="#059669" />
            <StatBarCard icon={<Clock size={14} />} label="Next Email In" value={getNextEmailTime() || "—" } accent="#d97706" isText />
          </div>
        </div>

        {/* ─── TABS ─── */}
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex gap-0 border-b border-slate-200">
            {[
              { id: "overview", label: "Analytics", icon: <Activity size={13} /> },
              { id: "leads", label: `Lead List (${leads.length})`, icon: <Users size={13} /> },
              { id: "emails", label: `Email Accounts (${d?.mailboxIds?.length || 0})`, icon: <Mail size={13} /> },
              { id: "sequences", label: `Sequences (${steps.length})`, icon: <BookOpen size={13} /> },
              { id: "settings", label: "Settings", icon: <Settings size={13} /> },
            ].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={cn("flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors -mb-px",
                  tab === t.id ? "border-[#0b57d0] text-[#0b57d0]" : "border-transparent text-slate-500 hover:text-slate-700"
                )}>{t.icon}{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="max-w-[1400px] mx-auto px-6 py-5">

        {/* ═══════ OVERVIEW / ANALYTICS ═══════ */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Stat Cards */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard icon={<Send size={16} />} label="Sent" value={d?.sent || 0} subtext={`of ${leads.length} leads`} accent="#0b57d0" bg="#eff6ff" />
              <StatCard icon={<Eye size={16} />} label="Opens" value={d?.opens || 0} rate={d?.openRate} subtext="unique opens" accent="#059669" bg="#ecfdf5" />
              <StatCard icon={<MessageSquare size={16} />} label="Replies" value={d?.replies || 0} rate={d?.replyRate} subtext="unique replies" accent="#7c3aed" bg="#f5f3ff" />
              <StatCard icon={<XCircle size={16} />} label="Bounces" value={d?.bounces || 0} rate={d?.bounceRate} subtext="total bounces" accent="#dc2626" bg="#fef2f2" />
              <StatCard icon={<ExternalLink size={16} />} label="Clicks" value={d?.clicks || 0} rate={d?.clickRate} subtext="link clicks" accent="#d97706" bg="#fffbeb" />
            </div>

            {/* Sending Progress Bar */}
            {leads.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">Sending Progress</span>
                  <span className="text-[10px] font-semibold text-slate-400">{d?.sent || 0} / {leads.length} emails sent</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#0b57d0] to-blue-400 transition-all duration-500"
                    style={{ width: `${leads.length > 0 ? Math.min(((d?.sent || 0) / leads.length) * 100, 100) : 0}%` }} />
                </div>
                <div className="flex gap-4 mt-2.5">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Opened {d?.opens || 0}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Replied {d?.replies || 0}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Bounced {d?.bounces || 0}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Clicked {d?.clicks || 0}</span>
                </div>
              </div>
            )}

            {/* Sequence Steps */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-900 mb-3">Sequence Steps</h3>
              <div className="space-y-2">
                {steps.map((step: any, idx: number) => (
                  <div key={step.id}>
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1 pl-4">
                        <div className="w-px h-3 bg-slate-200" />
                        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> Wait {step.delayDays}d
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-[#f8fafc] p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0b57d0]/10 text-[11px] font-black text-[#0b57d0]">
                        {step.stepNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{step.subject || "(no subject)"}</p>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0",
                        step.stepNumber === 1 ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                      )}>{step.stepNumber === 1 ? "COLD" : `FOLLOW-UP`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-900 mb-3">Recent Activity</h3>
              {events.length === 0 ? (
                <div className="py-8 text-center">
                  <Activity size={24} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400">No events yet. Events appear as emails are sent and engaged.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {events.slice(0, 15).map((ev: any) => (
                    <div key={ev.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50">
                      <EventDot type={ev.eventType} />
                      <span className="text-xs font-medium text-slate-900 truncate">{ev.lead?.email || "—"}</span>
                      <span className="text-[10px] text-slate-400 ml-auto whitespace-nowrap">{formatTime(ev.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ LEADS ═══════ */}
        {tab === "leads" && (
          <div className="space-y-4">
            {/* Filters + Search + Actions */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {/* Status Filters */}
                {(["all", "active", "replied", "failed", "scheduled"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setLeadFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      leadFilter === f
                        ? "bg-[#0b57d0] text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)} ({leadCounts[f]})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search leads by name, email, or CSV..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/20 focus:border-[#0b57d0]"
                  />
                </div>
                <button className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <Filter size={14} />
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0b57d0] text-white text-xs font-bold hover:bg-[#0a4bb8] transition-colors">
                  <Upload size={13} /> Upload New CSV
                </button>
                <button className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* Lead Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[40px_2fr_2.5fr_1.5fr_1.5fr_1fr_0.8fr_1fr_0.8fr_60px] gap-2 px-4 py-2.5 bg-[#f8fafc] border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <input
                  type="checkbox"
                  checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                  onChange={toggleAllLeads}
                  className="rounded border-slate-300"
                />
                <span>Lead Info</span>
                <span>Last Message</span>
                <span>Reply Details</span>
                <span>Sequence Progress</span>
                <span>Next Step</span>
                <span>Status</span>
                <span>Source</span>
                <span className="text-right">Actions</span>
                <span></span>
              </div>

              {/* Lead Rows */}
              {filteredLeads.map((lead: any) => {
                const isExpanded = expandedLead === lead.id;
                const isStopped = lead.leadStatus === "unsubscribed" || lead.leadStatus === "bounced";
                const progress = steps.length > 0 ? ((lead.stepsSent?.length || 0) / steps.length) * 100 : 0;
                const nextStep = steps.find((s: any) => !lead.stepsSent?.includes(s.stepNumber));

                return (
                  <React.Fragment key={lead.id}>
                    <div className={cn(
                      "grid grid-cols-[40px_2fr_2.5fr_1.5fr_1.5fr_1fr_0.8fr_1fr_0.8fr_60px] gap-2 px-4 py-3 items-center border-b border-slate-100 hover:bg-slate-50/50 transition-colors",
                      isExpanded && "bg-slate-50"
                    )}>
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleLeadSelection(lead.id)}
                        className="rounded border-slate-300"
                      />

                      {/* Lead Info */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#0b57d0] to-blue-400 flex items-center justify-center text-[10px] font-bold text-white">
                          {(lead.firstName?.[0] || lead.email[0]).toUpperCase()}
                          {(lead.lastName?.[0] || "").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {lead.firstName || ""} {lead.lastName || ""}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">{lead.email}</p>
                        </div>
                      </div>

                      {/* Last Message */}
                      <div className="min-w-0">
                        {(lead.stepsSent?.length || 0) > 0 ? (
                          <p className="text-[11px] text-slate-600 truncate">
                            Hey {lead.firstName || "there"}, I hope this message finds you in good...
                          </p>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </div>

                      {/* Reply Details */}
                      <div className="min-w-0">
                        {lead.hasReplied ? (
                          <span className="text-[11px] text-emerald-600 font-medium">Replied</span>
                        ) : lead.hasBounced ? (
                          <span className="text-[11px] text-red-600 font-medium">Bounced</span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </div>

                      {/* Sequence Progress */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-[#0b57d0]" : "bg-slate-300"
                            )}
                            style={{ width: progress > 0 ? `${Math.max(progress, 5)}%` : "0%" }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{Math.round(progress)}%</span>
                      </div>

                      {/* Next Step */}
                      <div className="min-w-0">
                        {nextStep ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                              <Clock size={10} className="text-slate-400" />
                              {progress === 0
                                ? (isLaunched ? "Queued" : "Not started")
                                : nextStep.delayDays <= 0 ? "Now" : `In ${nextStep.delayDays * 24}h`
                              }
                            </span>
                            <span className="text-[9px] text-slate-400">
                              Step {(lead.stepsSent?.length || 0) + 1} of {steps.length} scheduled
                            </span>
                          </div>
                        ) : progress >= 100 ? (
                          <span className="text-[10px] font-semibold text-emerald-600">Complete</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </div>

                      {/* Status */}
                      <div>
                        {lead.hasReplied ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                            <MessageSquare size={9} /> Replied
                          </span>
                        ) : lead.hasBounced || lead.leadStatus === "bounced" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                            <XCircle size={9} /> Failed
                          </span>
                        ) : lead.leadStatus === "unsubscribed" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            <UserX size={9} /> Stopped
                          </span>
                        ) : (lead.stepsSent?.length || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            <CheckCircle2 size={9} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                            <Clock size={9} /> Scheduled
                          </span>
                        )}
                      </div>

                      {/* Source */}
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Upload size={10} /> Manual
                      </span>

                      {/* Actions */}
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        {isLaunched && (
                          isStopped ? (
                            <button onClick={() => setConfirm({ action: "resume", leadId: lead.id, leadEmail: lead.email })}
                              className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">
                              Resume
                            </button>
                          ) : (
                            <button onClick={() => setConfirm({ action: "stop", leadId: lead.id, leadEmail: lead.email })}
                              className="text-[10px] font-bold text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                              Stop
                            </button>
                          )
                        )}
                      </div>

                      {/* Expand/Collapse */}
                      <button
                        onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                        className="flex items-center justify-center text-slate-400 hover:text-slate-600"
                      >
                        {isExpanded ? <ChevronDown size={14} className="rotate-180" /> : <ChevronRight size={14} />}
                      </button>
                    </div>

                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <div className="bg-[#f8fafc] border-b border-slate-200 px-6 py-4">
                        <div className="grid grid-cols-4 gap-4 mb-4">
                          <MiniStat label="Opens" value={lead.eventCount > 0 ? events.filter((e: any) => e.leadId === lead.id && e.eventType === "opened").length : 0} color="emerald" />
                          <MiniStat label="Clicks" value={events.filter((e: any) => e.leadId === lead.id && e.eventType === "clicked").length} color="amber" />
                          <MiniStat label="Replies" value={events.filter((e: any) => e.leadId === lead.id && e.eventType === "replied").length} color="violet" />
                          <MiniStat label="Bounces" value={events.filter((e: any) => e.leadId === lead.id && e.eventType === "bounced").length} color="red" />
                        </div>

                        {/* Step Progress */}
                        {steps.length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Step Progress</p>
                            <div className="flex gap-1.5">
                              {steps.map((s: any) => {
                                const sent = lead.stepsSent?.includes(s.stepNumber);
                                return (
                                  <div key={s.id} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold border",
                                    sent ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-400"
                                  )}>
                                    {sent ? <CheckCircle2 size={10} /> : <Minus size={10} />}
                                    Step {s.stepNumber}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Event Timeline */}
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Event Timeline</p>
                          {lead.recentEvents?.length > 0 ? (
                            <div className="space-y-1">
                              {lead.recentEvents.map((ev: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 bg-white rounded-md border border-slate-100 px-2.5 py-1.5">
                                  <EventDot type={ev.type} />
                                  <span className="text-[10px] font-medium text-slate-700">{ev.type.replace("EMAIL_", "").toLowerCase()}</span>
                                  <span className="text-[9px] text-slate-400 ml-auto">{formatTime(ev.at)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400">No events for this lead yet.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredLeads.length === 0 && (
                <div className="py-12 text-center">
                  <Users size={24} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400">
                    {searchQuery || leadFilter !== "all" ? "No leads match your filters" : "No leads in this campaign"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ SEQUENCES ═══════ */}
        {tab === "sequences" && (
          <div className="space-y-4">
            {steps.map((step: any, idx: number) => (
              <div key={step.id}>
                {idx > 0 && (
                  <div className="flex items-center gap-2 py-2 pl-6">
                    <div className="w-px h-4 bg-slate-200" />
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Clock size={11} /> Wait {step.delayDays} days
                    </span>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0b57d0]/10 text-xs font-black text-[#0b57d0]">
                      {step.stepNumber}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">{step.subject || "(no subject)"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {step.stepNumber === 1 ? "Cold Email" : `Follow-up #${step.stepNumber - 1}`}
                        <span className="mx-1.5">·</span>
                        Delay: {step.delayDays} days
                      </p>
                    </div>
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold",
                      step.stepNumber === 1 ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                    )}>
                      {step.stepNumber === 1 ? "COLD" : "FOLLOW-UP"}
                    </span>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg border border-slate-100 p-4">
                    <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-4">{step.bodyHtml || "No content"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════ EMAIL ACCOUNTS ═══════ */}
        {tab === "emails" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-900 mb-3">Linked Email Accounts</h3>
              <p className="text-[11px] text-slate-500 mb-4">
                These email accounts are used to send campaigns. Smartlead manages sending rotation and warmup.
              </p>
              <div className="space-y-2">
                {(d as any)?.mailboxes?.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-[#f8fafc] rounded-lg border border-slate-100">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Mail size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-900">{m.senderEmail || m.email}</p>
                      <p className="text-[10px] text-slate-500">Smartlead ID: {m.providerMailboxId || "Not linked"}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold",
                      m.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {m.status || "Unknown"}
                    </span>
                  </div>
                )) || (
                  <p className="text-xs text-slate-400 py-4 text-center">No email accounts linked</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ SETTINGS ═══════ */}
        {tab === "settings" && (
          <div className="space-y-4">
            {/* Webhook Settings */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-900">Webhook Endpoint</h3>
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isLaunched ? "bg-emerald-500" : "bg-red-500")} />
                  <span className={cn("text-[10px] font-semibold", isLaunched ? "text-emerald-600" : "text-red-600")}>
                    {isLaunched ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <code className="flex-1 bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-700 font-mono">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/smartlead` : "/api/webhooks/smartlead"}
                </code>
                <button onClick={copyUrl} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50">
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={configWh} disabled={whConfiguring}
                  className="px-4 py-1.5 rounded-lg bg-[#0b57d0] text-white text-[11px] font-bold hover:bg-[#0a4bb8] disabled:opacity-50 transition-colors">
                  {whConfiguring ? "Configuring..." : "Auto-Configure in Smartlead"}
                </button>
                <button onClick={() => refetchWh()} className="px-4 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  <Wifi size={12} className="inline mr-1" /> Check Health
                </button>
              </div>
              {whMessage && <p className="mt-2 text-[10px] text-slate-600">{whMessage}</p>}
            </div>

            {/* Test Webhook */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-900 mb-1">Test Webhook</h3>
              <p className="text-[10px] text-slate-500 mb-3">Send a test event to verify the receiver is working.</p>
              <div className="flex flex-wrap gap-1.5">
                {["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "EMAIL_REPLIED", "EMAIL_BOUNCED", "LEAD_UNSUBSCRIBED"].map((t) => (
                  <button key={t} onClick={() => testWh(t)} disabled={whTest.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                    <TestTube size={10} /> {t.replace("EMAIL_", "").replace("LEAD_", "")}
                  </button>
                ))}
              </div>
              {whTest.data && (
                <pre className="mt-3 bg-[#f8fafc] border border-slate-200 rounded-lg p-3 text-[10px] text-slate-600 font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(whTest.data, null, 2)}
                </pre>
              )}
            </div>

            {/* Campaign Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-900 mb-3">Campaign Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Campaign ID</p>
                  <p className="text-xs text-slate-700 font-mono">{campaignId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Smartlead Campaign ID</p>
                  <p className="text-xs text-slate-700 font-mono">{d?.providerCampaignId || "Not launched"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Created</p>
                  <p className="text-xs text-slate-700">{d?.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Last Updated</p>
                  <p className="text-xs text-slate-700">{d?.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatBarCard({ icon, label, value, accent, isText }: {
  icon: React.ReactNode; label: string; value: string; accent: string; isText?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-white">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}10`, color: accent }}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-slate-500">{label}</p>
        <p className={cn("font-bold", isText ? "text-xs" : "text-sm")} style={{ color: accent }}>{value}</p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, rate, subtext, accent, bg }: {
  icon: React.ReactNode; label: string; value: number; rate?: number; subtext: string; accent: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg, color: accent }}>{icon}</div>
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black" style={{ color: accent }}>{value}</span>
        {rate !== undefined && <span className="text-[11px] font-medium text-slate-400">{rate.toFixed(1)}%</span>}
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">{subtext}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = { emerald: "text-emerald-600", amber: "text-amber-600", violet: "text-violet-600", red: "text-red-600" };
  return (
    <div className="bg-white rounded-lg border border-slate-100 px-3 py-2">
      <p className="text-[9px] font-bold text-slate-500 uppercase">{label}</p>
      <p className={cn("text-lg font-black", colors[color] || "text-slate-900")}>{value}</p>
    </div>
  );
}

function EventDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    sent: "bg-blue-500", opened: "bg-emerald-500", clicked: "bg-amber-500",
    replied: "bg-violet-500", bounced: "bg-red-500", unsubscribed: "bg-slate-400",
  };
  return <span className={cn("w-2 h-2 rounded-full shrink-0", colors[type] || "bg-slate-300")} />;
}

function formatTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
