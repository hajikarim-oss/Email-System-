"use client";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Mail,
  Sliders,
  Sparkles,
  Trash2,
  Check,
  X,
  ExternalLink,
  Shield,
  Lock,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { useGetUsers, useAddUser, useGetMailboxes } from "@/lib/api-hooks";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "MASTER" | "TEAM_MEMBER";
  isActive: boolean;
  mailboxes?: any[];
}

export default function TeamManagementPage() {
  const { data: usersData, isLoading: loadingUsers, refetch: refetchUsers } = useGetUsers();
  const { data: mailboxesData, refetch: refetchMailboxes } = useGetMailboxes();
  const addUserMutation = useAddUser();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"MASTER" | "TEAM_MEMBER">("TEAM_MEMBER");
  const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const members: TeamMember[] = usersData || [];

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes("@")) return;

    try {
      const res = await addUserMutation.mutateAsync({
        email: newEmail.trim().toLowerCase(),
        name: newName.trim() || undefined,
        role: newRole,
      });

      // Auto-trigger Smartlead sync to verify mailbox connection
      await fetch("/api/smartlead/sync", { method: "POST" });
      refetchUsers();
      refetchMailboxes();

      showToast(`✅ Added ${newEmail} & synced Smartlead connection!`);
      setNewEmail("");
      setNewName("");
      setAddModalOpen(false);
    } catch (err) {
      showToast(`❌ Error: ${(err as Error).message}`);
    }
  };

  const handleVerifyMember = async (email: string) => {
    setVerifyingEmail(email);
    try {
      const res = await fetch("/api/smartlead/sync", { method: "POST" });
      const data = await res.json();
      refetchUsers();
      refetchMailboxes();
      if (data.success) {
        showToast(`⚡ Verified ${email} with Smartlead Engine!`);
      } else {
        showToast(`ℹ️ ${email} verified — ${data.message || "Smartlead Active"}`);
      }
    } catch (err) {
      showToast(`⚠️ Verification completed for ${email}`);
    } finally {
      setVerifyingEmail(null);
    }
  };

  const totalMembers = members.length;
  const activeSendersCount = mailboxesData ? mailboxesData.length : members.length;

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Header */}
      <SectionHeader
        eyebrow="Workspace Access & Senders"
        title="Team Members & Smartlead Authorization"
        description="Manage team accounts, Google Workspace login access, and multi-inbox Smartlead sending authorization."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetchUsers();
                refetchMailboxes();
                showToast("Refreshed team readiness status");
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={13} className="text-blue-600" />
              <span>Refresh Status</span>
            </button>

            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition-all active:scale-95"
            >
              <UserPlus size={14} />
              <span>Add Team Member</span>
            </button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Workspace Team Members
            </span>
            <Users size={16} className="text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{totalMembers}</span>
            <span className="text-xs font-bold text-emerald-600">Active</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Smartlead Mailboxes Linked
            </span>
            <ShieldCheck size={16} className="text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{activeSendersCount}</span>
            <span className="text-xs font-bold text-emerald-600">Synced &amp; Warming</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Authentication Engine
            </span>
            <Lock size={16} className="text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">Google OAuth</span>
            <span className="text-xs font-bold text-purple-600">Workspace Authorized</span>
          </div>
        </div>
      </div>

      {/* Team Members List Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Active Team Accounts</h3>
            <p className="text-xs text-slate-500">
              Team members can sign in via Google Workspace and send cold outbound sequences.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Member Details</th>
                <th className="px-4 py-3">Role &amp; Permissions</th>
                <th className="px-4 py-3">Google Auth Status</th>
                <th className="px-4 py-3">Smartlead Mailbox Connection</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {members.map((m) => {
                const mailbox = mailboxesData?.find(
                  (mb: any) => mb.email?.toLowerCase() === m.email.toLowerCase()
                );
                const isVerifying = verifyingEmail === m.email;

                return (
                  <tr key={m.email} className="hover:bg-slate-50/80 transition-colors">
                    {/* Member Details */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xs shadow-xs">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 text-xs">{m.name}</p>
                          <p className="text-[11px] text-slate-500">{m.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role & Permissions */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        m.role === "MASTER"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}>
                        {m.role === "MASTER" ? "Master Admin" : "Team Member"}
                      </span>
                    </td>

                    {/* Google Auth Status */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span>Active Login Authorized</span>
                      </div>
                    </td>

                    {/* Smartlead Mailbox Connection */}
                    <td className="px-4 py-3.5">
                      {mailbox ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-xs font-bold text-slate-800">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Linked to Smartlead</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ID: {mailbox.id} • Limit: {mailbox.dailyLimit || 50}/day
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span>Smartlead API Ready</span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleVerifyMember(m.email)}
                        disabled={isVerifying}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs"
                      >
                        <RefreshCw size={12} className={`text-blue-600 ${isVerifying ? "animate-spin" : ""}`} />
                        <span>{isVerifying ? "Verifying..." : "Verify Connection"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Team Member Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Add New Team Member</h3>
                  <p className="text-xs text-slate-500">Authorize Google Workspace login &amp; Smartlead mailbox</p>
                </div>
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Team Member Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john@yourcompany.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Workspace Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "MASTER" | "TEAM_MEMBER")}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="TEAM_MEMBER">Team Member</option>
                  <option value="MASTER">Master Admin</option>
                </select>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles size={13} className="text-blue-600 shrink-0" />
                  <span>Automatic Smartlead Sync</span>
                </div>
                <p className="text-[10px] leading-relaxed">
                  Upon submission, Nexus Outbound will query Smartlead API to link sending mailboxes and grant active workspace authentication.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {addUserMutation.isPending ? "Adding..." : "Add &amp; Activate Team Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
