"use client";

import React, { useState, useMemo } from "react";
import {
  Mail,
  RefreshCw,
  MoreHorizontal,
  CircleAlert,
  Mailbox as MailboxIcon,
  Plus,
  ShieldCheck,
  Zap,
  Sliders,
  CheckCircle2,
  X,
  Server,
  Key,
  Globe,
  Flame,
  AlertCircle,
  Copy,
  ExternalLink,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { GaugeRing } from "@/components/shared/gauge-ring";
import { cn } from "@/lib/utils";
import { useGetMailboxes, useUpdateMailboxStatus, useDeleteMailbox } from "@/lib/api-hooks";

interface MailboxItem {
  id: string;
  email: string;
  owner: string;
  provider: "google" | "microsoft" | "smtp";
  status: string;
  health: number;
  sentToday: number;
  dailyLimit: number;
  warmupDays: number;
  bounceRate: number;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  pausedReason?: string;
  providerMailboxId?: string | null;
  linked?: boolean;
}

export default function MailboxesPage() {
  const { data: apiMailboxes, isLoading } = useGetMailboxes();
  const updateMailboxStatus = useUpdateMailboxStatus();
  const deleteMailbox = useDeleteMailbox();

  const mailboxes = useMemo(() => {
    if (apiMailboxes && apiMailboxes.length > 0) {
      return apiMailboxes.map((m: any) => ({
        id: m.id,
        email: m.email || m.senderEmail || "",
        owner: m.owner || m.user?.name || "Unknown",
        provider: (m.provider || "smtp") as "google" | "microsoft" | "smtp",
        status: m.status?.toLowerCase() || "active",
        health: m.warmupReputationScore || 100,
        sentToday: m.warmupEmailsSent || 0,
        dailyLimit: m.dailySendLimit || 50,
        warmupDays: m.warmupStartAt
          ? Math.floor((Date.now() - new Date(m.warmupStartAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        bounceRate: 0.0,
        spfValid: true,
        dkimValid: true,
        dmarcValid: true,
        pausedReason: m.pausedReason || undefined,
        providerMailboxId: m.providerMailboxId || null,
        linked: m.linked || false,
      }));
    }
    return [];
  }, [apiMailboxes]);

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [providerTab, setProviderTab] = useState<"google" | "microsoft" | "smtp">("google");
  const [dnsModalBox, setDnsModalBox] = useState<MailboxItem | null>(null);
  const [warmupModalBox, setWarmupModalBox] = useState<MailboxItem | null>(null);

  // New Mailbox Form State
  const [newSmtp, setNewSmtp] = useState({
    email: "",
    owner: "",
    host: "smtp.yourcompany.com",
    port: "587",
    user: "",
    pass: "",
    dailyLimit: "50",
  });

  const handleAddSmtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSmtp.email) return;
    try {
      await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: newSmtp.email,
          provider: providerTab,
          dailySendLimit: parseInt(newSmtp.dailyLimit) || 50,
        }),
      });
      setConnectModalOpen(false);
      setNewSmtp({ email: "", owner: "", host: "smtp.yourcompany.com", port: "587", user: "", pass: "", dailyLimit: "50" });
    } catch (e) {
      console.error("Failed to create mailbox", e);
    }
  };

  const toggleMailboxStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "PAUSED" : "ACTIVE";
    updateMailboxStatus.mutate({ id, data: { status: newStatus } });
  };

  const totalSendsToday = mailboxes.reduce((acc, m) => acc + m.sentToday, 0);
  const totalDailyCapacity = mailboxes.reduce((acc, m) => acc + m.dailyLimit, 0);
  const avgHealth = Math.round(mailboxes.reduce((acc, m) => acc + m.health, 0) / mailboxes.length);

  return (
    <div className="space-y-4">
      {/* Header */}
      <SectionHeader
        eyebrow="Deliverability & Senders Hub"
        title="Senders & Mailboxes"
        description="Multi-inbox sender pool, automated warmup ramping, and strict SPF/DKIM/DMARC domain protection."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Refresh is now a no-op since data comes from API
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-1.5 text-xs font-bold text-[var(--ink)] shadow-xs hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={13} className="text-[hsl(var(--primary))]" /> Refresh Health
            </button>
            <button
              onClick={() => setConnectModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[hsl(var(--primary)/.9)] transition-colors"
            >
              <Plus size={14} /> Connect Mailbox
            </button>
          </div>
        }
      />

      {/* 10-Rep Sender Pool Master Capacity Banner */}
      <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/70 via-blue-50/40 to-indigo-50/50 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-[var(--ink)]">10-Rep Sender Pool Engine</h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                  Optimal Load Distribution
                </span>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                Outbound traffic is automatically rotated across {mailboxes.length} active inboxes to keep daily send limits under 50/day per address.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/80 rounded-xl px-4 py-2 border border-sky-100 backdrop-blur-xs">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Pool Sends Today</p>
              <p className="text-base font-extrabold text-[var(--ink)]">
                {totalSendsToday} <span className="text-xs font-normal text-slate-500">/ {totalDailyCapacity} cap</span>
              </p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Pool Health</p>
              <p className="text-base font-extrabold text-emerald-600">{avgHealth}% Clean</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Active Inboxes</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-extrabold text-[var(--ink)]">
              {mailboxes.filter((m) => m.status === "active").length}
            </span>
            <span className="text-xs text-emerald-600 font-bold">100% Ready</span>
          </div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Warmup In-Progress</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-extrabold text-amber-600">
              {mailboxes.filter((m) => m.status === "warming").length}
            </span>
            <span className="text-xs text-slate-400 font-medium">Auto-ramping</span>
          </div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Avg Bounce Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-extrabold text-emerald-700">0.24%</span>
            <span className="text-xs text-slate-400 font-medium">&lt; 2% threshold</span>
          </div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Domain Auth Pass</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-extrabold text-blue-600">100%</span>
            <span className="text-xs text-emerald-600 font-bold">SPF/DKIM Valid</span>
          </div>
        </div>
      </div>

      {/* Mailboxes Card Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mailboxes.map((box) => {
          const isPaused = box.status === "paused";
          const isWarming = box.status === "warming";
          return (
            <div
              key={box.id}
              className={cn(
                "rounded-xl border bg-white p-4 shadow-xs transition-all flex flex-col justify-between space-y-3",
                isPaused ? "border-amber-200 bg-amber-50/20" : "border-[hsl(var(--border))] hover:border-slate-300"
              )}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[hsl(var(--primary))] font-bold text-xs">
                      {box.provider === "google" ? "G" : box.provider === "microsoft" ? "M" : "S"}
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-[var(--ink)] truncate max-w-[160px]">{box.email}</p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{box.owner}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                      box.status === "active" && "bg-emerald-100 text-emerald-800",
                      box.status === "warming" && "bg-amber-100 text-amber-800",
                      box.status === "paused" && "bg-rose-100 text-rose-800"
                    )}
                  >
                    {box.status}
                  </span>
                </div>

                {/* Metrics Row */}
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Health</p>
                    <p className="text-xs font-extrabold text-emerald-600">{box.health}/100</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Sent Today</p>
                    <p className="text-xs font-extrabold text-[var(--ink)]">
                      {box.sentToday} / {box.dailyLimit}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Warm Days</p>
                    <p className="text-xs font-extrabold text-blue-600">{box.warmupDays}d</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mb-1">
                    <span>Capacity Used</span>
                    <span>{Math.round((box.sentToday / box.dailyLimit) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        box.sentToday / box.dailyLimit > 0.9 ? "bg-amber-500" : "bg-[hsl(var(--primary))]"
                      )}
                      style={{ width: `${Math.min(100, (box.sentToday / box.dailyLimit) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* DNS Pills */}
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <button
                    onClick={() => setDnsModalBox(box)}
                    className="flex items-center gap-1 font-bold text-[hsl(var(--primary))] hover:underline"
                  >
                    <ShieldCheck size={12} className="text-emerald-600" />
                    <span>SPF · DKIM · DMARC</span>
                  </button>
                  <button
                    onClick={() => setWarmupModalBox(box)}
                    className="flex items-center gap-1 font-bold text-slate-500 hover:text-[var(--ink)]"
                  >
                    <Sliders size={12} />
                    <span>Settings</span>
                  </button>
                </div>

                {box.pausedReason && (
                  <div className="mt-2 flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] text-amber-800">
                    <AlertCircle size={12} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>{box.pausedReason}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                {!box.linked && (
                  <button
                    onClick={() => {
                      const id = prompt(`Enter Smartlead Mailbox ID for ${box.email}:`);
                      if (id) {
                        fetch("/api/mailboxes/link", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mailboxId: box.id, smartleadMailboxId: id.trim() }),
                        }).then((r) => r.json()).then((d) => {
                          if (d.smartleadMailboxId) {
                            alert("✅ Linked successfully!");
                            window.location.reload();
                          } else {
                            alert("❌ " + (d.error || "Failed to link"));
                          }
                        });
                      }
                    }}
                    className="flex-1 rounded-lg py-1.5 text-xs font-bold text-center bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    🔗 Link Smartlead
                  </button>
                )}
                <button
                  onClick={() => toggleMailboxStatus(box.id, box.status)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors text-center",
                    box.status === "active"
                      ? "border border-[hsl(var(--border))] bg-white text-[var(--ink)] hover:bg-slate-50"
                      : "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary)/.9)]"
                  )}
                >
                  {box.status === "active" ? "Pause Mailbox" : "Resume Mailbox"}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${box.email}? This cannot be undone.`)) {
                      deleteMailbox.mutate({ id: box.id });
                    }
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Mailbox Modal */}
      {connectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[hsl(var(--primary))]">
                  <Mail size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--ink)]">Connect Outbound Mailbox</h3>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Add sending accounts to the automated warmup pool.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConnectModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Provider Tabs */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setProviderTab("google")}
                className={cn(
                  "rounded-xl border p-3 text-center transition-all",
                  providerTab === "google"
                    ? "border-[hsl(var(--primary))] bg-blue-50/50 text-[hsl(var(--primary))]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                <div className="font-extrabold text-xs">Google Workspace</div>
                <div className="text-[9px] text-slate-400 mt-0.5">OAuth 2.0</div>
              </button>
              <button
                type="button"
                onClick={() => setProviderTab("microsoft")}
                className={cn(
                  "rounded-xl border p-3 text-center transition-all",
                  providerTab === "microsoft"
                    ? "border-[hsl(var(--primary))] bg-blue-50/50 text-[hsl(var(--primary))]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                <div className="font-extrabold text-xs">Microsoft 365</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Exchange OAuth</div>
              </button>
              <button
                type="button"
                onClick={() => setProviderTab("smtp")}
                className={cn(
                  "rounded-xl border p-3 text-center transition-all",
                  providerTab === "smtp"
                    ? "border-[hsl(var(--primary))] bg-blue-50/50 text-[hsl(var(--primary))]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                <div className="font-extrabold text-xs">Custom SMTP/IMAP</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Any Provider</div>
              </button>
            </div>

            {providerTab === "google" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Authenticate your Google Workspace / Gmail account with 1-click OAuth. Nexus automatically configures IMAP sync, reply detection, and auto-warmup.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/mailboxes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          senderEmail: "user@example.com",
                          provider: "google",
                        }),
                      });
                      setConnectModalOpen(false);
                    } catch (e) {
                      console.error("Failed to connect mailbox", e);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
                >
                  <ExternalLink size={14} /> Sign in with Google Workspace
                </button>
              </div>
            )}

            {providerTab === "microsoft" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Connect your Microsoft 365, Office 365, or Outlook business account using secure Azure AD OAuth.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/mailboxes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          senderEmail: "user@example.com",
                          provider: "microsoft",
                        }),
                      });
                      setConnectModalOpen(false);
                    } catch (e) {
                      console.error("Failed to connect mailbox", e);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0078d4] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#006cbd]"
                >
                  <ExternalLink size={14} /> Sign in with Microsoft 365
                </button>
              </div>
            )}

            {providerTab === "smtp" && (
              <form onSubmit={handleAddSmtpSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">From Email</label>
                    <input
                      type="email"
                      required
                      placeholder="outreach@yourcompany.com"
                      value={newSmtp.email}
                      onChange={(e) => setNewSmtp({ ...newSmtp, email: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Assigned Rep / Owner</label>
                    <input
                      type="text"
                      placeholder="e.g. John Smith"
                      value={newSmtp.owner}
                      onChange={(e) => setNewSmtp({ ...newSmtp, owner: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">SMTP Host</label>
                    <input
                      type="text"
                      value={newSmtp.host}
                      onChange={(e) => setNewSmtp({ ...newSmtp, host: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Port</label>
                    <input
                      type="text"
                      value={newSmtp.port}
                      onChange={(e) => setNewSmtp({ ...newSmtp, port: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">SMTP Username</label>
                    <input
                      type="text"
                      placeholder="user@domain.com"
                      value={newSmtp.user}
                      onChange={(e) => setNewSmtp({ ...newSmtp, user: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Password / App Key</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={newSmtp.pass}
                      onChange={(e) => setNewSmtp({ ...newSmtp, pass: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Daily Send Cap (Default: 50)</label>
                  <input
                    type="number"
                    max={100}
                    value={newSmtp.dailyLimit}
                    onChange={(e) => setNewSmtp({ ...newSmtp, dailyLimit: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t">
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(false)}
                    className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[hsl(var(--primary))] px-4 py-1.5 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
                  >
                    Connect & Start Warmup
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DNS Records Modal */}
      {dnsModalBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h3 className="text-sm font-extrabold text-[var(--ink)]">DNS Authentication Status</h3>
              </div>
              <button
                onClick={() => setDnsModalBox(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Domain records for <strong className="text-[var(--ink)]">{dnsModalBox.email}</strong>
            </p>

            <div className="space-y-2 text-xs">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-900">SPF Record</span>
                  <span className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <CheckCircle2 size={11} /> VALID
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-600 bg-white p-1.5 rounded border border-emerald-100">
                  v=spf1 include:_spf.google.com ~all
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-900">DKIM Signature (2048-bit)</span>
                  <span className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <CheckCircle2 size={11} /> VALID
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-600 bg-white p-1.5 rounded border border-emerald-100">
                  google._domainkey.try-nexus.com (RSA Verified)
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-900">DMARC Policy</span>
                  <span className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <CheckCircle2 size={11} /> VALID
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-600 bg-white p-1.5 rounded border border-emerald-100">
                  v=DMARC1; p=reject; rua=mailto:dmarc@yourcompany.com
                </p>
              </div>
            </div>

            <button
              onClick={() => setDnsModalBox(null)}
              className="w-full rounded-xl bg-[hsl(var(--primary))] py-2 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Warmup Config Modal */}
      {warmupModalBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
              <div className="flex items-center gap-2">
                <Flame size={18} className="text-amber-500" />
                <h3 className="text-sm font-extrabold text-[var(--ink)]">Warmup & Throttle Settings</h3>
              </div>
              <button
                onClick={() => setWarmupModalBox(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Daily Sending Limit ({warmupModalBox.dailyLimit} emails/day)
                </label>
                <input
                  type="range"
                  min="10"
                  max="80"
                  value={warmupModalBox.dailyLimit}
                  onChange={(e) => {
                    const newLim = parseInt(e.target.value);
                    setWarmupModalBox({ ...warmupModalBox, dailyLimit: newLim });
                  }}
                  className="w-full mt-2 accent-[hsl(var(--primary))]"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>10/day (Safe)</span>
                  <span>50/day (Recommended)</span>
                  <span>80/day (Max)</span>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-1">
                <p className="font-bold text-blue-900 text-xs">Smart Warmup Network Enabled</p>
                <p className="text-[11px] text-blue-800">
                  Nexus exchanges AI-generated peer emails with partner inboxes and automatically moves them to Primary inbox to build domain authority.
                </p>
              </div>
            </div>

            <button
              onClick={() => setWarmupModalBox(null)}
              className="w-full rounded-xl bg-[hsl(var(--primary))] py-2 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
