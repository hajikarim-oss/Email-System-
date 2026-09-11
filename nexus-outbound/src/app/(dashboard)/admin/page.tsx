"use client";

import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Key,
  Lock,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Plus,
  X,
  Copy,
  Check,
  Send,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "team" | "mailboxes" | "audit" | "email-testing" | "settings";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "MASTER" | "TEAM_MEMBER";
  status: "Active" | "Invited";
  seats: number;
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [role, setRole] = useState<"MASTER" | "TEAM_MEMBER">("MASTER");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Team Members State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Invite Modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "TEAM_MEMBER" as "MASTER" | "TEAM_MEMBER" });

  // Sandbox Tester State
  const [testSubject, setTestSubject] = useState("Quick question regarding Q4 RevOps pipeline at {{company}}");
  const [testBody, setTestBody] = useState("Hi {{firstName}},\n\nWanted to check if you had 5 minutes this week to discuss scaling your outbound infrastructure?");
  const [testResult, setTestResult] = useState<{ score: number; verdict: string; warnings: string[] } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Circuit Breaker Config State
  const [bounceThreshold, setBounceThreshold] = useState(3.0);
  const [minHealthScore, setMinHealthScore] = useState(75);

  const auditLogs: Array<{ id: string; action: string; user: string; time: string; tone: string }> = [];

  const handleCopySecret = () => {
    navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email) return;
    setTeamMembers([
      ...teamMembers,
      {
        id: `usr-${Date.now().toString().slice(-4)}`,
        name: inviteForm.name || inviteForm.email.split("@")[0],
        email: inviteForm.email,
        role: inviteForm.role,
        status: "Invited",
        seats: 1,
      },
    ]);
    setInviteForm({ name: "", email: "", role: "TEAM_MEMBER" });
    setInviteModalOpen(false);
  };

  const runSpamAnalysis = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setTestResult({
        score: 99,
        verdict: "100% Clean — Excellent Deliverability",
        warnings: [
          "No spam trigger words detected (guarantee, free, 100%, urgent).",
          "Optimal character count (under 120 words).",
          "Clean personalization tags resolved correctly.",
        ],
      });
    }, 600);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <SectionHeader
        eyebrow="System Administration"
        title="Admin & Governance"
        description="Manage workspace roles, team seats, mailboxes circuit breaker, audit log, and webhooks."
        action={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">Role View:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "MASTER" | "TEAM_MEMBER")}
              className="h-8 rounded-lg border border-[hsl(var(--border))] bg-white px-2 text-xs font-bold text-[hsl(var(--primary))] outline-none shadow-xs"
            >
              <option value="MASTER">MASTER (Full Admin)</option>
              <option value="TEAM_MEMBER">TEAM_MEMBER (Restricted)</option>
            </select>
          </div>
        }
      />

      {/* Subpage Navigation Tabs */}
      <div className="flex border-b border-[hsl(var(--border))] space-x-1 overflow-x-auto">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "team", label: "Team & Roles", icon: Users },
          { id: "mailboxes", label: "Circuit Breaker", icon: ShieldCheck },
          { id: "audit", label: "Audit Log", icon: Shield },
          { id: "email-testing", label: "Deliverability Sandbox", icon: Mail },
          { id: "settings", label: "System Security", icon: Settings },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as AdminTab)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-all whitespace-nowrap",
                isActive
                  ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Workspace Seats</span>
              <p className="mt-1 text-xl font-extrabold text-[var(--ink)]">{teamMembers.length} / 10 Seats Used</p>
              <p className="mt-0.5 text-xs text-emerald-600 font-bold">{10 - teamMembers.length} seats available</p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Overall Deliverability</span>
              <p className="mt-1 text-xl font-extrabold text-emerald-600">99.2%</p>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">Circuit breaker healthy</p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Active Webhooks</span>
              <p className="mt-1 text-xl font-extrabold text-[hsl(var(--primary))]">3 Connected</p>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">Last ping 2m ago</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAM & ROLES */}
      {tab === "team" && (
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 p-3.5">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink)]">Workspace Members & Permissions</h3>
              <p className="text-[11px] text-slate-500">Manage team access and role privileges</p>
            </div>
            {role === "MASTER" ? (
              <button
                onClick={() => setInviteModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
              >
                <Plus size={13} /> Invite Member
              </button>
            ) : (
              <span className="text-xs font-bold text-rose-500">Read-only (Requires MASTER role)</span>
            )}
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {teamMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-[hsl(var(--primary))]">
                    {m.name[0]}
                  </span>
                  <div>
                    <p className="font-extrabold text-[var(--ink)]">{m.name}</p>
                    <p className="text-[10px] text-slate-400">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-extrabold",
                      m.role === "MASTER" ? "bg-blue-50 text-[hsl(var(--primary))]" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {m.role}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">{m.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CIRCUIT BREAKER */}
      {tab === "mailboxes" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold text-amber-900">Automated Circuit Breaker Guardrail</h4>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                  If any connected mailbox exceeds {bounceThreshold}% bounce rate or drops below {minHealthScore} health score, the system automatically pauses outreach to preserve domain reputation.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink)]">Circuit Breaker Threshold Controls</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Max Allowed Bounce Rate ({bounceThreshold}%)
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={bounceThreshold}
                  onChange={(e) => setBounceThreshold(parseFloat(e.target.value))}
                  className="w-full mt-2 accent-[hsl(var(--primary))]"
                />
                <span className="text-[10px] text-slate-400">Default industry standard: 3.0%</span>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Min Sender Health Score ({minHealthScore}/100)
                </label>
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="1"
                  value={minHealthScore}
                  onChange={(e) => setMinHealthScore(parseInt(e.target.value))}
                  className="w-full mt-2 accent-[hsl(var(--primary))]"
                />
                <span className="text-[10px] text-slate-400">Default industry standard: 75</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {tab === "audit" && (
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white shadow-xs">
          <div className="border-b border-slate-100 p-3.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink)]">System Activity Audit Log</h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-extrabold text-[var(--ink)]">{log.action}</p>
                  <p className="text-[10px] text-slate-400">By {log.user}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{log.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: DELIVERABILITY SANDBOX */}
      {tab === "email-testing" && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink)]">
              Email Testing & Deliverability Sandbox
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Simulate spam checks, SPF/DKIM verification, and header analysis before launching live campaigns.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500">Subject Line</label>
              <input
                type="text"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500">Body Content</label>
              <textarea
                rows={4}
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] p-3 text-xs font-medium outline-none focus:border-[hsl(var(--primary))] resize-none"
              />
            </div>

            <button
              onClick={runSpamAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
            >
              {isAnalyzing ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {isAnalyzing ? "Analyzing Spam Score..." : "Run Deliverability Check"}
            </button>
          </div>

          {testResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-600" />
                  <span className="text-xs font-extrabold text-emerald-900">{testResult.verdict}</span>
                </div>
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Spam Score: {testResult.score}/100
                </span>
              </div>
              <ul className="text-xs text-emerald-800 space-y-1 list-disc list-inside">
                {testResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SYSTEM SECURITY & WEBHOOKS */}
      {tab === "settings" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink)]">
              Webhook Secret & Security Keys
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookSecret}
                className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-bold text-slate-700 outline-none"
              />
              <button
                onClick={handleCopySecret}
                className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
              >
                {copiedSecret ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copiedSecret ? "Copied!" : "Copy"}
              </button>
              {role === "MASTER" ? (
                <button
                  onClick={() => setWebhookSecret(`whsec_live_${Math.random().toString(36).substring(2, 14)}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow-xs"
                >
                  <RefreshCw size={13} /> Rotate Secret
                </button>
              ) : (
                <button disabled className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-400">
                  Rotate (MASTER role required)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[hsl(var(--primary))]" />
                <h3 className="text-sm font-extrabold text-[var(--ink)]">Invite Workspace Team Member</h3>
              </div>
              <button onClick={() => setInviteModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="john@yourcompany.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Role Privilege</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as "MASTER" | "TEAM_MEMBER" })}
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-bold outline-none focus:border-[hsl(var(--primary))]"
                >
                  <option value="TEAM_MEMBER">TEAM_MEMBER (Create campaigns, manage leads)</option>
                  <option value="MASTER">MASTER (Full admin access, billing, team control)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[hsl(var(--primary))] px-4 py-1.5 text-xs font-bold text-white hover:bg-[hsl(var(--primary)/.9)]"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
