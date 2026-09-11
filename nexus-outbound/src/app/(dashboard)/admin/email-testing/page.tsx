"use client";

import React, { useState } from "react";
import { Mail, Users, Rocket, Check, AlertCircle, Loader2 } from "lucide-react";

export default function EmailTestingPage() {
  const [mailboxes, setMailboxes] = useState<Array<{ email: string; status: string }>>([]);
  const [leads, setLeads] = useState<Array<{ email: string; firstName: string; lastName: string; company: string }>>([]);
  const [newLead, setNewLead] = useState({ email: "", firstName: "", lastName: "", company: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSeedData = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `Seeded ${data.results.mailboxes} mailboxes, ${data.results.leads} leads, ${data.results.campaigns} campaigns` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to seed data" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to seed data" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddLead = async () => {
    if (!newLead.email) {
      setMessage({ type: "error", text: "Email is required" });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/leads/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLead),
      });
      const data = await res.json();
      if (data.id) {
        setLeads([...leads, { email: data.email, firstName: data.firstName, lastName: data.lastName, company: newLead.company }]);
        setNewLead({ email: "", firstName: "", lastName: "", company: "" });
        setMessage({ type: "success", text: "Lead added successfully" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add lead" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to add lead" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMailbox = async () => {
    const email = prompt("Enter sender email address:");
    if (!email) return;
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.id) {
        setMailboxes([...mailboxes, { email: data.email, status: data.status }]);
        setMessage({ type: "success", text: `Mailbox ${email} created. Connect via Smartlead OAuth to start sending.` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to create mailbox" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to create mailbox" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="eyebrow mb-2 text-[hsl(var(--primary))]">
          Email Transaction Testing
        </p>
        <h1 className="text-[28px] font-extrabold tracking-[-.055em] text-[var(--ink)] md:text-[34px]">
          Test Email Setup
        </h1>
        <p className="mt-1.5 text-[13px] text-[hsl(var(--muted-foreground))]">
          Configure mailboxes, leads, and campaigns for email transaction testing.
        </p>
      </div>

      {/* Message Alert */}
      {message.text && (
        <div className={`flex items-center gap-2 rounded-xl p-4 text-sm font-bold ${
          message.type === "success" 
            ? "bg-[hsl(var(--mint-soft))] text-[hsl(var(--primary))]" 
            : "bg-red-50 text-red-600"
        }`}>
          {message.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <button
          onClick={handleSeedData}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm font-bold text-[var(--ink)] shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
          Seed Test Data
        </button>
        <button
          onClick={handleCreateMailbox}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm font-bold text-[var(--ink)] shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Mail size={16} />
          Add Mailbox
        </button>
        <button
          onClick={() => {
            const email = prompt("Enter test lead email:");
            if (email) setNewLead({ ...newLead, email });
          }}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm font-bold text-[var(--ink)] shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Users size={16} />
          Quick Add Lead
        </button>
      </div>

      {/* Mailboxes Section */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--ink)]">Sender Mailboxes</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Connect email accounts via Smartlead OAuth for sending
            </p>
          </div>
          <button
            onClick={handleCreateMailbox}
            className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-bold text-white"
          >
            + Add Mailbox
          </button>
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {mailboxes.map((mb) => (
            <div key={mb.email} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--primary))]">
                  <Mail size={14} />
                </span>
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">{mb.email}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Status: {mb.status}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-extrabold capitalize tracking-wide ${
                mb.status === "active"
                  ? "bg-[hsl(169_48%_91%)] text-[hsl(169_70%_28%)]"
                  : "bg-[hsl(39_90%_91%)] text-[hsl(31_75%_34%)]"
              }`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {mb.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Leads Section */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--ink)]">Test Leads</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Recipients for email transaction testing
            </p>
          </div>
        </div>

        {/* Add Lead Form */}
        <div className="mb-4 rounded-lg bg-[hsl(var(--background))] p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="email"
              placeholder="Email *"
              value={newLead.email}
              onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
              className="rounded-md border border-[hsl(var(--input))] bg-white px-3 py-2 text-xs text-[var(--ink)]"
            />
            <input
              type="text"
              placeholder="First Name"
              value={newLead.firstName}
              onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
              className="rounded-md border border-[hsl(var(--input))] bg-white px-3 py-2 text-xs text-[var(--ink)]"
            />
            <input
              type="text"
              placeholder="Company"
              value={newLead.company}
              onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
              className="rounded-md border border-[hsl(var(--input))] bg-white px-3 py-2 text-xs text-[var(--ink)]"
            />
            <button
              onClick={handleAddLead}
              disabled={loading || !newLead.email}
              className="rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Add Lead
            </button>
          </div>
        </div>

        {/* Leads List */}
        <div className="divide-y divide-[hsl(var(--border))]">
          {leads.map((lead) => (
            <div key={lead.email} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--primary))]">
                  <Users size={14} />
                </span>
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    {lead.email} • {lead.company}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-extrabold capitalize tracking-wide bg-[hsl(169_48%_91%)] text-[hsl(169_70%_28%)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Active
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Campaign Section */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <div className="mb-4">
          <h2 className="text-sm font-extrabold text-[var(--ink)]">Test Campaign</h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Pre-configured campaign with 3-step email sequence
          </p>
        </div>
        <div className="rounded-lg bg-[hsl(var(--background))] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--ink)]">No campaign configured</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Create a campaign to start testing
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-extrabold capitalize tracking-wide bg-[hsl(169_48%_91%)] text-[hsl(169_70%_28%)]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Active
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
              <span className="font-bold">Step 1:</span> Initial outreach (Day 0)
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
              <span className="font-bold">Step 2:</span> Follow-up with case study (Day 3)
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
              <span className="font-bold">Step 3:</span> Final touch (Day 5)
            </div>
          </div>
        </div>
      </section>

      {/* Simulation Section */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--ink)]">Email Transaction Simulation</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Simulate email sending and webhook events for testing
            </p>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              setMessage({ type: "", text: "" });
              try {
                const res = await fetch("/api/test/email-transaction", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "simulate" }),
                });
                const data = await res.json();
                if (data.success) {
                  setMessage({ 
                    type: "success", 
                    text: `Simulated: ${data.results.sent} sent, ${data.results.opened} opened, ${data.results.replied} replied, ${data.results.bounced} bounced` 
                  });
                } else {
                  setMessage({ type: "error", text: data.error || "Simulation failed" });
                }
              } catch {
                setMessage({ type: "error", text: "Simulation failed" });
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {loading ? "Simulating..." : "Run Simulation"}
          </button>
        </div>
        <div className="rounded-lg bg-[hsl(var(--background))] p-4">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            This will simulate sending emails to your test leads and generate webhook events for opens, replies, and bounces.
            Use this to test the complete email transaction flow without actually sending emails.
          </p>
        </div>
      </section>

      {/* Instructions */}
      <section className="panel-shadow rounded-xl border border-[hsl(var(--border))] bg-white p-6">
        <h2 className="mb-4 text-sm font-extrabold text-[var(--ink)]">Setup Instructions</h2>
        <div className="space-y-3 text-xs text-[hsl(var(--muted-foreground))]">
          <p><span className="font-bold text-[var(--ink)]">1. Smartlead Connection:</span> Ensure your Smartlead API key is configured in .env.local</p>
          <p><span className="font-bold text-[var(--ink)]">2. Mailbox Setup:</span> Add your sender email accounts and connect them via Smartlead OAuth</p>
          <p><span className="font-bold text-[var(--ink)]">3. Lead Import:</span> Add test lead email addresses (your own emails for testing)</p>
          <p><span className="font-bold text-[var(--ink)]">4. Campaign Launch:</span> Create a campaign and assign mailboxes and leads</p>
          <p><span className="font-bold text-[var(--ink)]">5. Testing:</span> Run the simulation to test email transactions, or send real emails via Smartlead</p>
          <p><span className="font-bold text-[var(--ink)]">6. Monitoring:</span> Check the dashboard for email event statistics and lead engagement</p>
        </div>
      </section>
    </div>
  );
}
