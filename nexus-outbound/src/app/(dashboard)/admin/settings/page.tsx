"use client";

import React, { useState, useEffect } from "react";
import { Check, Clock3, CircleCheck, Key, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useHealthCheck } from "@/lib/api-hooks";

export default function SettingsPage() {
  const health = useHealthCheck();
  const [saved, setSaved] = useState(false);
  const [smartleadKey, setSmartleadKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const ready = health.data?.status === "ok";

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.smartleadApiKey) setSmartleadKey(data.smartleadApiKey);
      })
      .catch(() => {});
  }, []);

  const handleSaveKey = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smartleadApiKey: smartleadKey }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/smartlead/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`✅ ${data.message}`);
      } else {
        setSyncResult(`❌ ${data.error || data.message}`);
      }
    } catch {
      setSyncResult("❌ Sync failed");
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="eyebrow mb-2 text-[hsl(var(--primary))]">
          Workspace Controls
        </p>
        <h1 className="text-[28px] font-extrabold tracking-[-.055em] text-[var(--ink)] md:text-[34px]">
          Settings
        </h1>
        <p className="mt-1.5 text-[13px] text-[hsl(var(--muted-foreground))]">
          A small set of controls for a focused outbound workspace.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="text-sm font-extrabold text-[var(--ink)]">
                Provider readiness
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Connections powering your sending operation.
              </p>
            </div>
            <CircleCheck className="text-[hsl(var(--primary))]" size={20} />
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {[
              ["Email provider", "Smartlead API Connected", true],
              ["AI drafting", "OpenAI gpt-4o Ready", true],
              ["Workspace API", ready ? "Healthy" : "Checking", ready],
            ].map(([name, state, ok]) => (
              <div
                className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                key={name as string}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg ${
                      ok
                        ? "bg-[hsl(var(--mint-soft))] text-[hsl(var(--primary))]"
                        : "bg-[hsl(39_90%_91%)] text-[hsl(31_75%_34%)]"
                    }`}
                  >
                    {ok ? <Check size={15} /> : <Clock3 size={15} />}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[var(--ink)]">
                      {name}
                    </p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      Nexus managed connection
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[var(--ink)]">
                  {state as string}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
          <p className="text-sm font-extrabold text-[var(--ink)]">
            Workspace profile
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            The basics, kept intentionally simple.
          </p>
          <div className="mt-6 space-y-4">
            <label className="block text-xs font-bold text-[var(--ink)]">
              Workspace name
              <input
                defaultValue="Northstar Outbound"
                className="mt-2 h-9 w-full rounded-md border border-[hsl(var(--input))] bg-white px-3 text-xs text-[var(--ink)]"
              />
            </label>
            <label className="block text-xs font-bold text-[var(--ink)]">
              Timezone
              <select
                defaultValue="America/New_York"
                className="mt-2 h-9 w-full rounded-md border border-[hsl(var(--input))] bg-white px-3 text-xs text-[var(--ink)]"
              >
                <option value="America/New_York">
                  Eastern Time · New York
                </option>
                <option value="America/Los_Angeles">
                  Pacific Time · Los Angeles
                </option>
                <option value="Europe/London">GMT · London</option>
              </select>
            </label>
            <div className="flex items-center gap-3">
              <button
                className="mt-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white shadow-sm"
                onClick={() => setSaved(true)}
              >
                Save preferences
              </button>
              {saved && (
                <span className="text-[11px] font-bold text-[hsl(var(--primary))]">
                  <Check size={12} className="mr-1 inline" /> Saved just now
                </span>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Smartlead API Key Section */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-[hsl(var(--primary))]" />
            <p className="text-sm font-extrabold text-[var(--ink)]">
              Smartlead API Key
            </p>
          </div>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Each team member can use their own Smartlead workspace. Add your API key to sync your email accounts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={smartleadKey}
              onChange={(e) => setSmartleadKey(e.target.value)}
              placeholder="Enter your Smartlead API key"
              className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 pr-10 text-xs text-[var(--ink)] font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={handleSaveKey}
            disabled={saving}
            className="h-10 rounded-lg bg-[hsl(var(--primary))] px-4 text-xs font-bold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Key"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !smartleadKey}
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Accounts"}
          </button>
        </div>

        {syncResult && (
          <p className="mt-3 text-xs font-bold text-[var(--ink)]">{syncResult}</p>
        )}

        <p className="mt-3 text-[10px] text-slate-400">
          Find your API key at{" "}
          <a href="https://app.smartlead.ai/settings" target="_blank" className="underline text-[hsl(var(--primary))]">
            app.smartlead.ai/settings
          </a>
        </p>
      </section>
    </div>
  );
}
