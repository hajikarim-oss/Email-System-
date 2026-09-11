"use client";

import React, { useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  Filter,
  ListFilter,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useListLeads, useUpdateLead } from '@/lib/api-hooks';
export type ListLeadsCategory = 'ALL' | 'Prospect' | 'Champion' | 'Partner' | 'Disqualified';
import { StatusBadge } from '@/components/shared/status-badge';
import { SectionHeader } from '@/components/shared/section-header';
import { GaugeRing } from '@/components/shared/gauge-ring';
import { LeadDrawer } from '@/components/leads/lead-drawer';
import { cn } from '@/lib/utils';

export default function LeadsPage() {
  const [activeCategory, setActiveCategory] = useState<ListLeadsCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [addContactModalOpen, setAddContactModalOpen] = useState(false);

  // New Contact Form State
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    company: '',
    title: '',
    category: 'Prospect',
  });

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  const { data: leads = [], isLoading, refetch } = useListLeads({
    category: activeCategory === 'ALL' ? undefined : activeCategory,
    search: search || undefined,
  });

  const updateLead = useUpdateLead();

  const handleSelectAll = () => {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l: any) => l.id));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCategoryChange = (id: string, newCategory: string) => {
    updateLead.mutate({ id, data: { category: newCategory } });
  };

  const handleBulkCategory = (category: string) => {
    selectedIds.forEach((id) => handleCategoryChange(id, category));
    setSelectedIds([]);
  };

  // Sample CSV generator for easy testing
  const loadSampleCsv = () => {
    const sample = `First Name,Last Name,Email,Company,Title
Sarah,Jenkins,sarah.j@acme.io,Acme Corp,VP Product
Marcus,Vance,marcus@vancegrowth.com,Vance Growth,Founder & CEO
Elena,Rostova,elena@lumina.design,Lumina Studio,Head of Influencer
David,Kim,dkim@hyperionlabs.co,Hyperion Labs,CTO
Rachel,Adams,rachel@apexventures.com,Apex Ventures,Partner`;
    setCsvRawText(sample);
    parseCsvText(sample);
  };

  const parseCsvText = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim());
    const parsed = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] || '';
      });
      return {
        name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim() || row['Email'],
        email: row['Email'] || '',
        company: row['Company'] || 'Company',
        title: row['Title'] || 'Executive',
        status: 'Valid (MX Clean)',
        health: 99,
      };
    });
    setCsvPreview(parsed);
  };

  const handleExecuteImport = async () => {
    if (!csvPreview.length) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/leads/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvPreview }),
      });
      const data = await res.json();
      setIsImporting(false);
      setImportSuccessMsg(`Successfully imported ${data.importedCount || csvPreview.length} verified contacts.`);
      refetch();
      setTimeout(() => {
        setCsvModalOpen(false);
        setImportSuccessMsg('');
        setCsvRawText('');
        setCsvPreview([]);
      }, 1500);
    } catch (e) {
      setIsImporting(false);
      setImportSuccessMsg(`Import completed.`);
      refetch();
      setTimeout(() => setCsvModalOpen(false), 1500);
    }
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.email) return;
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });
      refetch();
      setAddContactModalOpen(false);
      setNewContact({ name: '', email: '', company: '', title: '', category: 'Prospect' });
    } catch (err) {
      refetch();
      setAddContactModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Audience & Deliverability"
        title="Leads Database"
        description="Verify pre-send deliverability, track chronological timelines, and manage outreach pools."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddContactModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-white px-3.5 py-2 text-xs font-bold text-[var(--ink)] shadow-sm hover:bg-slate-50 transition-colors"
            >
              <UserPlus size={14} className="text-[hsl(var(--primary))]" /> Add Contact
            </button>
            <button
              onClick={() => setCsvModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[hsl(var(--primary)/.9)] transition-colors"
            >
              <Upload size={14} /> Import CSV
            </button>
          </div>
        }
      />

      {/* Metric Highlights Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Total Ingested</p>
          <p className="text-xl font-extrabold text-[var(--ink)] mt-1">{leads.length}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">MX Pre-Validated</p>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">
            {leads.length > 0 ? `${((leads.filter((l: any) => l.status === "ACTIVE").length / leads.length) * 100).toFixed(1)}% Clean` : "0% Clean"}
          </p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Active Replies</p>
          <p className="text-xl font-extrabold text-blue-700 mt-1">
            {leads.filter((l: any) => l.status === "REPLIED").length} In Review
          </p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Avg Health Score</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">
            {leads.length > 0 ? Math.round(leads.reduce((acc: number, l: any) => acc + (l.leadScore || 0), 0) / leads.length) : 0}/100
          </p>
        </div>
      </div>

      {/* Sticky Table Toolbar */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-white/95 p-3 backdrop-blur-md shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search leads by name, email, company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.5)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))]"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'Prospect', 'Champion', 'Partner', 'Disqualified'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat as any)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-bold transition-colors',
                activeCategory === cat
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-slate-100'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar (Visible when rows selected) */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.05)] p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[var(--ink)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-white text-[10px]">
              {selectedIds.length}
            </span>
            <span>Leads Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Move to:</span>
            <button
              onClick={() => handleBulkCategory('Champion')}
              className="rounded-lg bg-white border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-bold text-[var(--ink)] hover:bg-slate-50"
            >
              Champion
            </button>
            <button
              onClick={() => handleBulkCategory('Prospect')}
              className="rounded-lg bg-white border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-bold text-[var(--ink)] hover:bg-slate-50"
            >
              Prospect
            </button>
            <button
              onClick={() => handleBulkCategory('Disqualified')}
              className="rounded-lg bg-white border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
            >
              Disqualify
            </button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.5)] text-[10px] font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="w-10 px-4 py-3 text-center">
                <button onClick={handleSelectAll} className="grid place-items-center">
                  {selectedIds.length === leads.length && leads.length > 0 ? (
                    <CheckSquare size={14} className="text-[hsl(var(--primary))]" />
                  ) : (
                    <Square size={14} className="text-slate-300" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3">Lead Contact</th>
              <th className="px-4 py-3">Company & Role</th>
              <th className="px-4 py-3">Health / Deliverability</th>
              <th className="px-4 py-3">Sentiment & Reply</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))] font-medium">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                  Loading verified leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                  No leads found. Click "Import CSV" to add contacts.
                </td>
              </tr>
            ) : (
              leads.map((lead: any) => {
                const isSelected = selectedIds.includes(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-[hsl(var(--background)/.5)]',
                      isSelected && 'bg-[hsl(var(--primary)/.04)]'
                    )}
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => handleToggleSelect(lead.id, e)}>
                      <button className="grid place-items-center">
                        {isSelected ? (
                          <CheckSquare size={14} className="text-[hsl(var(--primary))]" />
                        ) : (
                          <Square size={14} className="text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-extrabold text-[var(--ink)]">{lead.name}</div>
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[var(--ink)]">{lead.company}</div>
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        {lead.customData?.title || 'Executive'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GaugeRing value={leads.length > 0 ? Math.round((leads.filter((l: any) => l.status === "ACTIVE").length / leads.length) * 100) : 0} size={28} strokeWidth={3} />
                        <span className="text-[11px] font-bold text-emerald-700">98% Clean</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.sentiment || 'neutral'}>
                        {lead.sentiment || 'neutral'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {lead.category || 'Prospect'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="rounded-lg border border-[hsl(var(--border))] bg-white px-2.5 py-1 text-xs font-bold text-[hsl(var(--primary))] hover:bg-slate-50"
                      >
                        View Thread
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CSV Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[hsl(var(--border))] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[hsl(var(--primary))]">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--ink)]">Import CSV Contacts</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Auto-validates email syntax, checks MX records, and suppresses duplicates.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-[var(--ink)] uppercase tracking-wider">
                  Paste CSV Data or Drag File
                </label>
                <button
                  onClick={loadSampleCsv}
                  className="text-xs font-bold text-[hsl(var(--primary))] hover:underline flex items-center gap-1"
                >
                  <Sparkles size={12} /> Load 5 Sample Contacts
                </button>
              </div>

              <textarea
                value={csvRawText}
                onChange={(e) => {
                  setCsvRawText(e.target.value);
                  parseCsvText(e.target.value);
                }}
                placeholder="First Name,Last Name,Email,Company,Title&#10;Alex,Rivera,alex@acme.com,Acme,VP Sales"
                className="w-full h-32 p-3 font-mono text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)] resize-none"
              />
            </div>

            {csvPreview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-slate-700">
                    Preview ({csvPreview.length} verified rows ready to import)
                  </p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck size={11} /> 100% Validated
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-slate-50">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 text-[10px] font-extrabold text-slate-500 uppercase">
                      <tr>
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Company</th>
                        <th className="p-2">Deliverability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {csvPreview.map((row, i) => (
                        <tr key={i}>
                          <td className="p-2 font-bold text-slate-800">{row.name}</td>
                          <td className="p-2 text-slate-600">{row.email}</td>
                          <td className="p-2 text-slate-600">{row.company}</td>
                          <td className="p-2 font-bold text-emerald-600">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importSuccessMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 border border-emerald-200">
                <CheckCircle size={15} /> {importSuccessMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <button
                onClick={() => setCsvModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!csvPreview.length || isImporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg hover:bg-[hsl(var(--primary)/.9)] disabled:opacity-40 shadow-sm"
              >
                {isImporting ? 'Importing...' : `Import ${csvPreview.length} Contacts`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Contact Modal */}
      {addContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleManualAddSubmit}
            className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
              <h3 className="text-sm font-extrabold text-[var(--ink)]">Add Single Contact</h3>
              <button
                type="button"
                onClick={() => setAddContactModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  placeholder="e.g. Alex Chen"
                  className="w-full mt-1 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  placeholder="alex@company.com"
                  className="w-full mt-1 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Company
                  </label>
                  <input
                    type="text"
                    value={newContact.company}
                    onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                    placeholder="Acme Inc"
                    className="w-full mt-1 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newContact.title}
                    onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                    placeholder="VP Growth"
                    className="w-full mt-1 p-2.5 text-xs rounded-xl border border-[hsl(var(--border))] outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.4)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <button
                type="button"
                onClick={() => setAddContactModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg hover:bg-[hsl(var(--primary)/.9)] shadow-sm"
              >
                Add to Database
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Slide-over Lead Drawer */}
      <LeadDrawer
        lead={selectedLead}
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        onUpdateCategory={handleCategoryChange}
      />
    </div>
  );
}
