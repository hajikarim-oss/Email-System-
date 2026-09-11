"use client";

import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  Mail,
  MessageSquare,
  Sparkles,
  User,
  X,
  Send,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { GaugeRing } from '@/components/shared/gauge-ring';
import { cn } from '@/lib/utils';

export function LeadDrawer({
  lead,
  open,
  onClose,
  onUpdateCategory,
}: {
  lead: any | null;
  open: boolean;
  onClose: () => void;
  onUpdateCategory: (id: string, category: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'details' | 'notes'>('timeline');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<string[]>([
    "Lead mentioned evaluating outbound tools for Q4 budget cycle.",
  ]);

  if (!open || !lead) return null;

  const initials = lead.name
    ? lead.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'LD';

  const isInterested = lead.sentiment?.toLowerCase().includes('interested');
  const isNeutral = lead.sentiment?.toLowerCase().includes('neutral');

  // Timeline events representing full lead lifecycle
  const timelineEvents = [
    {
      id: "evt-1",
      type: "SENT",
      title: "Step 1: Initial Outreach Dispatched",
      date: "Oct 12, 10:00 AM",
      mailbox: "maya@try-nexus.com (Pool #1)",
      subject: `Quick idea for ${lead.company}'s outbound rhythm`,
      preview: `Hi ${lead.name?.split(' ')[0] || 'there'},\n\nI was reviewing how ${lead.company} is expanding its sales motions this quarter...`,
      status: "Delivered (99.8% Primary Inbox)",
    },
    {
      id: "evt-2",
      type: "OPEN",
      title: "Email Opened (2x)",
      date: lead.firstOpenAt || "Oct 12, 10:14 AM",
      details: "Opened on Apple Mail (macOS) via primary inbox",
    },
    {
      id: "evt-3",
      type: "REPLY",
      title: "Incoming Reply Received",
      date: lead.lastOpenAt || "Oct 14, 09:30 AM",
      sentiment: lead.sentiment || "Interested",
      preview: `Hi, thanks for reaching out. We are currently evaluating our outbound tools for Q4. Do you have 15 mins this Thursday to discuss?`,
      autoStop: "Auto-Stop Triggered: Subsequent follow-ups paused.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col border-l border-[hsl(var(--border))]">
          {/* Header */}
          <div className="border-b border-[hsl(var(--border))] p-6 bg-[hsl(var(--background)/.5)]">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-sm font-extrabold text-[hsl(var(--primary))] border border-[hsl(var(--primary)/.2)]">
                  {initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-[var(--ink)]">{lead.name}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      <ShieldCheck size={11} /> MX Verified
                    </span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    {lead.email} · <span className="font-semibold text-[var(--ink)]">{lead.company}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Health & Score Strip */}
            <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-[hsl(var(--border))] bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <GaugeRing value={98} size={40} strokeWidth={4} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-[hsl(var(--muted-foreground))]">
                    Deliverability
                  </p>
                  <p className="text-xs font-extrabold text-[var(--ink)]">98% Clean</p>
                </div>
              </div>
              <div className="border-l border-[hsl(var(--border))] pl-3">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[hsl(var(--muted-foreground))]">
                  Lifecycle
                </p>
                <p className="text-xs font-extrabold text-emerald-700">Replied / Active</p>
              </div>
              <div className="border-l border-[hsl(var(--border))] pl-3">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[hsl(var(--muted-foreground))]">
                  AI Intent
                </p>
                <p className={cn("text-xs font-extrabold", isInterested ? "text-emerald-700" : "text-slate-700")}>
                  {lead.sentiment || "Interested"}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-5 flex gap-2 border-b border-transparent">
              <button
                onClick={() => setActiveTab('timeline')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors",
                  activeTab === 'timeline'
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-white"
                )}
              >
                <Clock size={13} /> Complete Timeline
              </button>
              <button
                onClick={() => setActiveTab('details')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors",
                  activeTab === 'details'
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-white"
                )}
              >
                <User size={13} /> Lead Info
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors",
                  activeTab === 'notes'
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-white"
                )}
              >
                <MessageSquare size={13} /> Team Notes ({notes.length})
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="eyebrow text-[hsl(var(--primary))] font-extrabold">Chronological Audit Trail</p>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Auto-Stop On Reply: ACTIVE
                  </span>
                </div>

                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[hsl(var(--border))]">
                  {timelineEvents.map((evt) => (
                    <div key={evt.id} className="relative group">
                      <div
                        className={cn(
                          "absolute -left-6 top-1 grid h-5 w-5 place-items-center rounded-full ring-4 ring-white",
                          evt.type === 'SENT'
                            ? "bg-blue-600 text-white"
                            : evt.type === 'OPEN'
                            ? "bg-amber-500 text-white"
                            : "bg-emerald-600 text-white"
                        )}
                      >
                        {evt.type === 'SENT' ? (
                          <Send size={10} />
                        ) : evt.type === 'OPEN' ? (
                          <Flame size={10} />
                        ) : (
                          <CheckCircle2 size={10} />
                        )}
                      </div>

                      <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm hover:border-[hsl(var(--primary)/.4)] transition-colors">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-extrabold text-[var(--ink)]">{evt.title}</p>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{evt.date}</span>
                        </div>

                        {evt.mailbox && (
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                            Mailbox: <span className="font-semibold text-slate-700">{evt.mailbox}</span>
                          </p>
                        )}

                        {evt.subject && (
                          <p className="text-xs font-bold text-slate-800 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            Subj: {evt.subject}
                          </p>
                        )}

                        {evt.preview && (
                          <p className="text-xs text-slate-600 mt-2 whitespace-pre-line leading-relaxed bg-[hsl(var(--background))] p-3 rounded-lg border border-[hsl(var(--border))]">
                            {evt.preview}
                          </p>
                        )}

                        {evt.autoStop && (
                          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50/80 px-2 py-1 rounded-md border border-emerald-200">
                            <CheckCircle size={12} /> {evt.autoStop}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm space-y-3">
                  <h3 className="text-xs font-extrabold text-[var(--ink)] uppercase tracking-wider">Contact Metadata</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Full Name</p>
                      <p className="font-bold text-[var(--ink)]">{lead.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Email Address</p>
                      <p className="font-bold text-[var(--ink)]">{lead.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Company</p>
                      <p className="font-bold text-[var(--ink)]">{lead.company}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Source</p>
                      <p className="font-bold text-[var(--ink)]">{lead.source || 'CSV Import'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Assigned Campaign</p>
                      <p className="font-bold text-[var(--ink)]">{lead.campaign || 'Q4 Outreach Pool'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Pre-Send MX Status</p>
                      <p className="font-bold text-emerald-600">Verified & Clean</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note about this prospect..."
                    className="w-full h-24 p-3 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)] resize-none"
                  />
                  <button
                    onClick={() => {
                      if (note.trim()) {
                        setNotes([...notes, note.trim()]);
                        setNote('');
                      }
                    }}
                    disabled={!note.trim()}
                    className="px-4 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg disabled:opacity-40"
                  >
                    Post Note
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  {notes.map((n, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700">
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-[hsl(var(--border))] p-4 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-600">Category:</span>
              <select
                value={lead.category}
                onChange={(e) => onUpdateCategory(lead.id, e.target.value)}
                className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
              >
                <option value="Prospect">Prospect</option>
                <option value="Champion">Champion</option>
                <option value="Partner">Partner</option>
                <option value="Disqualified">Disqualified</option>
              </select>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
