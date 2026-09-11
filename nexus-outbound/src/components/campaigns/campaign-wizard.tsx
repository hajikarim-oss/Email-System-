"use client";

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Mail,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
  Bot,
  SlidersHorizontal,
  Clock,
  ShieldCheck,
  Play,
  RotateCcw,
} from 'lucide-react';
import { GaugeRing } from '@/components/shared/gauge-ring';
import { cn } from '@/lib/utils';

export function CampaignWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'ai_dynamic' | 'manual_spintax'>('ai_dynamic');
  const [previewIndex, setPreviewIndex] = useState(0);

  // Form State
  const [name, setName] = useState('Q4 Enterprise Reachout');
  const [tag, setTag] = useState('Outbound SaaS');
  const [offerDescription, setOfferDescription] = useState('Scale outbound reachout with 99%+ primary inbox placement and zero spam penalties');
  const [subject, setSubject] = useState('Quick idea for {{company}}\'s outbound motion');
  const [body, setBody] = useState(
    'Hi {{firstName}},\n\nI was reviewing how {{company}} is expanding its outreach motions this quarter. We built a multi-mailbox rotation infrastructure that lets 10-rep teams send 5,000 emails daily with zero spam penalties.\n\nWould you be open to a 10-minute chat next Tuesday to compare notes?\n\nBest,\n{{senderName}}'
  );

  // Follow-up Steps
  const [steps, setSteps] = useState([
    {
      id: 1,
      name: "Step 1: Initial Outreach",
      delay: "Immediate (Day 0)",
      subject: "Quick idea for {{company}}'s outbound motion",
      body: "Hi {{firstName}},\n\nI noticed {{company}} is growing its sales team. We help teams maintain 99%+ primary inbox placement with dynamic per-lead variation.\n\nOpen to comparing notes?\n\nBest,\n{{senderName}}",
    },
    {
      id: 2,
      name: "Step 2: Contextual Follow-Up",
      delay: "3 days after Step 1 (if no reply)",
      subject: "Re: Quick idea for {{company}}'s outbound motion",
      body: "Hi {{firstName}},\n\nCircling back with one quick stat: teams using our GPT-4o-mini dynamic copy engine see a 3.4x decrease in spam complaints.\n\nLet me know if you'd like to see a 3-min video walkthrough.\n\nBest,\n{{senderName}}",
    },
    {
      id: 3,
      name: "Step 3: Gentle Breakup",
      delay: "7 days after Step 2 (if no reply)",
      subject: "Closing the loop on {{company}}",
      body: "Hi {{firstName}},\n\nI assume this isn't a top priority for {{company}} right now. If things change in Q4, my door is always open.\n\nWishing you continued success!\n\nBest,\n{{senderName}}",
    },
  ]);

  // Sample Leads for Real-Time Live Preview
  const sampleLeads = [
    { name: "John Doe", company: "Acme Corp", title: "VP Product" },
    { name: "Jane Smith", company: "Vance Growth", title: "Founder & CEO" },
    { name: "Alex Johnson", company: "Lumina Studio", title: "Head of Influencer" },
  ];

  const currentLead = sampleLeads[previewIndex];

  // Helper to render live preview copy
  const renderPreview = (text: string) => {
    return text
      .replace(/\{\{firstName\}\}/g, currentLead.name.split(' ')[0])
      .replace(/\{\{company\}\}/g, currentLead.company)
      .replace(/\{\{title\}\}/g, currentLead.title);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4 bg-[hsl(var(--background)/.5)]">
          <div>
            <span className="eyebrow text-[hsl(var(--primary))] font-extrabold">Campaign Creation Wizard</span>
            <h2 className="text-lg font-extrabold text-[var(--ink)]">
              {step === 1 && "1. Setup & Deliverability Pool"}
              {step === 2 && "2. AI Dynamic & Spintax Sequence Builder"}
              {step === 3 && "3. 10-Rep Mailbox Quota & Staggered Schedule"}
              {step === 4 && "4. Lead Audience Verification"}
              {step === 5 && "5. Deliverability Safety Review & Launch"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-5 border-b border-[hsl(var(--border))] bg-slate-50 text-[11px] font-extrabold text-slate-500">
          {['Pool & Basics', 'Sequence & Copy', '10-Rep Quota', 'Audience', 'Launch Review'].map((label, idx) => (
            <div
              key={label}
              className={cn(
                'py-2 text-center border-r last:border-r-0 border-[hsl(var(--border))] transition-colors',
                step === idx + 1
                  ? 'bg-white text-[hsl(var(--primary))] font-extrabold border-b-2 border-b-[hsl(var(--primary))]'
                  : step > idx + 1
                  ? 'text-emerald-700 bg-emerald-50/50'
                  : ''
              )}
            >
              Step {idx + 1}: {label}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-extrabold uppercase text-slate-600">Campaign Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full mt-1.5 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-extrabold uppercase text-slate-600">Workspace Tag</label>
                  <input
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="w-full mt-1.5 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold text-[var(--ink)] uppercase tracking-wider">
                      Connected Mailbox Pool (100 Active Senders)
                    </h3>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Safe sending load: 35-40 emails/day per domain.
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <ShieldCheck size={14} /> 99.8% Pool Health
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Rep Pool Size</p>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">10 Seats Assigned</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Sending Windows</p>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">9:00 AM - 5:30 PM EST</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Random Jitter</p>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">120s - 360s Delay</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DUAL-MODE SEQUENCE BUILDER */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Mode Switcher */}
              <div className="flex items-center justify-between rounded-xl bg-slate-100 p-1.5 border border-slate-200">
                <button
                  onClick={() => setMode('ai_dynamic')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 text-xs font-extrabold rounded-lg transition-all',
                    mode === 'ai_dynamic'
                      ? 'bg-white text-[hsl(var(--primary))] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Bot size={15} /> Mode B: GPT-4o-mini Dynamic Generator (Spam-Proof)
                </button>
                <button
                  onClick={() => setMode('manual_spintax')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 text-xs font-extrabold rounded-lg transition-all',
                    mode === 'manual_spintax'
                      ? 'bg-white text-[hsl(var(--primary))] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <SlidersHorizontal size={15} /> Mode A: Plaintext + Merge Tags + Spintax
                </button>
              </div>

              {/* Multi-Step Tabs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
                  <div className="flex gap-2">
                    {steps.map((st, i) => (
                      <span
                        key={st.id}
                        className="px-3 py-1 bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] text-xs font-extrabold rounded-lg border border-[hsl(var(--primary)/.2)]"
                      >
                        {st.name} ({st.delay})
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Auto-Stop On Reply: Enabled
                  </span>
                </div>

                {/* Offer Input (For AI Mode) */}
                {mode === 'ai_dynamic' && (
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-[hsl(var(--primary))]">
                      <Sparkles size={14} /> Core Value Proposition / Offer
                    </div>
                    <input
                      value={offerDescription}
                      onChange={(e) => setOfferDescription(e.target.value)}
                      placeholder="e.g. Help high-volume reachout teams scale to 5,000 daily emails with zero spam penalties"
                      className="w-full p-2.5 text-xs rounded-lg border border-blue-200 bg-white outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                    />
                  </div>
                )}

                {/* Subject & Body */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-extrabold uppercase text-slate-600">Email Subject</label>
                      <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full mt-1 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none font-bold"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold uppercase text-slate-600">Message Body</label>
                        <span className="text-[10px] text-slate-400">Merge tags: {'{{firstName}}'} {'{{company}}'} {'{{title}}'}</span>
                      </div>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full mt-1 h-44 p-3 text-xs rounded-xl border border-[hsl(var(--border))] outline-none leading-relaxed resize-none"
                      />
                    </div>
                  </div>

                  {/* Real-time Live Lead Preview Drawer */}
                  <div className="rounded-xl border border-[hsl(var(--border))] bg-slate-50 p-4 space-y-3 flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                        <Sparkles size={13} className="text-[hsl(var(--primary))]" />
                        Live Lead Preview ({previewIndex + 1}/{sampleLeads.length})
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPreviewIndex((prev) => (prev === 0 ? sampleLeads.length - 1 : prev - 1))}
                          className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewIndex((prev) => (prev === sampleLeads.length - 1 ? 0 : prev + 1))}
                          className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-bold text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
                      Simulated Recipient: <span className="text-slate-900">{currentLead.name}</span> ({currentLead.title} @ {currentLead.company})
                    </div>

                    <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 space-y-2 overflow-y-auto">
                      <p className="text-xs font-bold text-slate-800 border-b pb-1.5">
                        Subj: {renderPreview(subject)}
                      </p>
                      <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                        {renderPreview(body)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <span>Fingerprint: 100% Unique Human Form</span>
                      <span>Spam Risk: 0.1%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: 10-REP MAILBOX QUOTA */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--ink)]">10-Rep Team Sending Architecture</h3>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Daily target: 500 emails/rep (5,000 total sends/day across 100 secondary inboxes).
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                    5,000 Sends / Day Max
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-xs font-extrabold text-slate-700">Per-Rep Sending Allocation</p>
                    <p className="text-2xl font-extrabold text-[var(--ink)]">500 <span className="text-xs font-normal text-slate-500">emails / day / seat</span></p>
                    <p className="text-[11px] text-slate-500">Distributed across 10 secondary inboxes per rep (50 emails/inbox/day).</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-xs font-extrabold text-slate-700">Circuit Breaker Deliverability Guard</p>
                    <p className="text-2xl font-extrabold text-emerald-700">&lt; 1.5% <span className="text-xs font-normal text-slate-500">bounce threshold</span></p>
                    <p className="text-[11px] text-slate-500">Auto-pauses flagged mailboxes instantly and reroutes pending sends.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: AUDIENCE & VERIFICATION */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[var(--ink)] uppercase tracking-wider">
                    Audience Verification & Contact Selection
                  </h3>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    142 Verified Leads In Pool
                  </span>
                </div>

                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  All contacts in this campaign have passed pre-send MX record verification and duplicate suppression.
                </p>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Company</th>
                        <th className="p-2.5">Deliverability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sampleLeads.map((ld, i) => (
                        <tr key={i}>
                          <td className="p-2.5 font-bold text-slate-800">{ld.name}</td>
                          <td className="p-2.5 text-slate-600">{ld.name.toLowerCase().replace(' ', '.')}@{ld.company.toLowerCase().replace(' ', '')}.com</td>
                          <td className="p-2.5 text-slate-600">{ld.company}</td>
                          <td className="p-2.5 font-bold text-emerald-600">99% Clean</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: LAUNCH REVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                  <ShieldCheck size={18} /> Ready for Production Launch
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Your 10-rep sending cluster is calibrated with staggered delays, GPT-4o-mini dynamic copy generation, and automatic stop-on-reply triggers.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-white rounded-xl border border-[hsl(var(--border))] text-xs">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Sequence Steps</p>
                  <p className="text-base font-extrabold text-[var(--ink)] mt-0.5">3 Multi-Touch Steps</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[hsl(var(--border))] text-xs">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Copy Fingerprint</p>
                  <p className="text-base font-extrabold text-emerald-700 mt-0.5">100% Unique / Per-Lead</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[hsl(var(--border))] text-xs">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Estimated Inbox Placement</p>
                  <p className="text-base font-extrabold text-blue-700 mt-0.5">99.4% Primary Inbox</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-[hsl(var(--border))] px-6 py-4 bg-[hsl(var(--background)/.5)]">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <ChevronLeft size={15} /> {step === 1 ? 'Cancel' : 'Previous Step'}
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg hover:bg-[hsl(var(--primary)/.9)] shadow-sm"
            >
              Next Step <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={() => {
                if (onCreated) onCreated();
                onClose();
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm"
            >
              <Play size={14} /> Launch Campaign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
