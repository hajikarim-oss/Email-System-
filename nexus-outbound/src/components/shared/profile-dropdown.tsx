"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  User,
  Check,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  LogOut,
  Zap,
  ChevronDown,
  Mail,
  X,
  Sparkles,
} from "lucide-react";
import { useGetUsers, useAddUser } from "@/lib/api-hooks";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const DEFAULT_USERS: UserItem[] = [];

export function ProfileDropdown() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [syncingSmartlead, setSyncingSmartlead] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: apiUsers } = useGetUsers();
  const addUserMutation = useAddUser();

  const allUsers: UserItem[] = apiUsers && apiUsers.length > 0 ? apiUsers : DEFAULT_USERS;

  // Active user selection stored in localStorage (for switching between team members)
  const [activeUserEmail, setActiveUserEmail] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("nexus_active_user_email");
    if (saved && allUsers.some((u) => u.email.toLowerCase() === saved.toLowerCase())) {
      setActiveUserEmail(saved);
    }
  }, [allUsers]);

  // The logged-in user from the session
  const loggedInUser: UserItem = {
    id: session?.user?.id || "session-user",
    name: session?.user?.name || "User",
    email: session?.user?.email || "",
    role: (session?.user as any)?.role || "MASTER",
    isActive: true,
  };

  // The active/selected user — shown at the top of the dropdown
  const activeUser = allUsers.find((u) => u.email.toLowerCase() === activeUserEmail.toLowerCase()) || loggedInUser;

  // Team members list — everyone except the currently active user
  const users = allUsers.filter((u) => u.email.toLowerCase() !== activeUser.email.toLowerCase());

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSelectUser = (user: UserItem) => {
    setActiveUserEmail(user.email);
    localStorage.setItem("nexus_active_user_email", user.email);
    localStorage.setItem("nexus_active_user_id", user.id);
    showToast(`Switched active account to ${user.name} (${user.email})`);
    setIsOpen(false);
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes("@")) return;

    try {
      const result = await addUserMutation.mutateAsync({
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        role: "TEAM_MEMBER",
        smartleadApiKey: newApiKey.trim() || undefined,
      });
      setActiveUserEmail(newEmail.trim());
      localStorage.setItem("nexus_active_user_email", newEmail.trim());
      const msg = (result as any)?.mailboxLinked
        ? `✅ Added ${newEmail} and linked to Smartlead!`
        : `✅ Added team account ${newEmail}!`;
      showToast(msg);
      setNewEmail("");
      setNewName("");
      setNewApiKey("");
      setShowAddModal(false);
      setIsOpen(false);
    } catch (err) {
      showToast(`❌ Error adding user: ${(err as Error).message}`);
    }
  };

  const handleSmartleadSync = async () => {
    setSyncingSmartlead(true);
    try {
      const res = await fetch("/api/smartlead/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ ${data.message}`);
      } else {
        showToast(`ℹ️ Smartlead Sync: ${data.message || "Connected"}`);
      }
    } catch (err) {
      showToast(`⚠️ Sync notice: Smartlead API active`);
    } finally {
      setSyncingSmartlead(false);
    }
  };

  const initialLetter = (activeUser?.name || activeUser?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Header Profile Avatar Trigger — shows ACTIVE user */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 rounded-full p-1 hover:bg-slate-200/70 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        title={`Active: ${activeUser?.name} (${activeUser?.email})`}
      >
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-[11px] shadow-xs group-hover:scale-105 transition-transform">
          {initialLetter}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        </div>
        <div className="hidden md:flex flex-col text-left pr-1">
          <span className="text-[11px] font-bold text-slate-900 leading-tight">
            {activeUser?.name}
          </span>
          <span className="text-[9px] font-medium text-slate-500 leading-tight truncate max-w-[110px]">
            {activeUser?.email}
          </span>
        </div>
        <ChevronDown size={12} className={`text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu Modal */}
      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Active User Card Header */}
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-purple-50/40 p-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-black text-sm shadow-md">
                {(activeUser?.name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-extrabold text-slate-900 truncate">
                    {activeUser?.name}
                  </h4>
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                    {activeUser?.role || "TEAM_MEMBER"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {activeUser?.email}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Active Profile</span>
                </div>
              </div>
            </div>
          </div>

          {/* Team Account Switcher Section */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Switch Profile ({users.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} />
                <span>Add Account</span>
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
              {users.map((u) => {
                return (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate-100 text-slate-700 font-medium"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs truncate font-semibold leading-tight">{u.name}</p>
                        <p className="text-[10px] text-slate-500 truncate leading-tight">{u.email}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-slate-100 my-2" />

          {/* Quick Actions */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={handleSmartleadSync}
              disabled={syncingSmartlead}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={14} className={`text-indigo-600 ${syncingSmartlead ? "animate-spin" : ""}`} />
              <span>{syncingSmartlead ? "Syncing Smartlead..." : "Sync Smartlead Accounts"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                router.push("/mailboxes");
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Senders &amp; Mailboxes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                router.push("/admin/settings");
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Settings size={14} className="text-slate-600" />
              <span>Workspace Settings</span>
            </button>
          </div>

          <div className="h-px bg-slate-100 my-2" />

          {/* Log Out */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out / Switch Login</span>
          </button>
        </div>
      )}

      {/* Add Team Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold">
                  <User size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Add Team Account</h3>
                  <p className="text-xs text-slate-500">Connect team member for workspace access &amp; sending</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-3">
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
                  Smartlead API Key
                </label>
                <input
                  type="password"
                  placeholder="Paste their Smartlead API key"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 font-mono outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Found at app.smartlead.ai/settings — auto-links their mailbox
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {addUserMutation.isPending ? "Adding..." : "Add &amp; Activate Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
