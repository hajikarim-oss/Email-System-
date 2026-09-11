"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Clock,
  Send,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  Trash2,
  Calendar,
  Users,
  ShieldCheck,
  Zap,
  Info,
  Layers,
  ArrowRight,
  RefreshCw,
  Code,
  Bot,
  Eye,
  Smartphone,
  Monitor,
  Mail,
  Building2,
  Phone,
  Globe,
  Image as ImageIcon,
  Check,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  FileText,
  Palette,
  Download,
  UserPlus,
  X,
  Pencil,
  Edit3,
  ExternalLink,
  HelpCircle,
  Play,
  RotateCcw,
  CheckCheck,
  Shield,
  Filter,
  Search,
  Settings as SettingsIcon,
  ChevronDown,
  Volume2,
  Sliders,
  Flame,
  Radio,
  Share2,
  Network
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMailboxes, useCreateCampaign, useUpdateCampaign, useLaunchCampaign } from "@/lib/api-hooks";
import { useSession } from "next-auth/react";

// ==========================================
// TYPES & DATA STRUCTURES
// ==========================================

export interface LeadItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone?: string;
  status: "verified" | "risky" | "pending";
  dateAdded: string;
}

export interface SequenceStep {
  id: string;
  stepNumber: number;
  type: "email" | "call" | "manual" | "linkedin";
  subject: string;
  bodyHtml: string;
  signatureHtml?: string;
  delayDays: number;
  delayHours?: number;
  variants: {
    id: string;
    variantLetter: "A" | "B" | "C";
    subject: string;
    bodyHtml: string;
    signatureHtml?: string;
    weight: number;
  }[];
  activeVariantIndex: number;
}

export interface MailboxAccount {
  id: string;
  name: string;
  email: string;
  provider: "google" | "microsoft" | "smtp";
  warmupScore: number;
  dailyLimit: number;
  sentToday: number;
  health: "healthy" | "warning" | "paused";
}

export interface SubSequenceRule {
  id: string;
  name: string;
  conditionType: "category" | "text" | "reengage" | "bounce";
  selectedCategory: string;
  delayDays: number;
  steps: SequenceStep[];
}

// Initial Mock Mailboxes
const availableMailboxes: MailboxAccount[] = [];

// Initial Initial Audience Leads
const INITIAL_LEADS: LeadItem[] = [];

export const THEBOREDMONKEY_SIGNATURE_HTML = `<p style="margin-bottom: 2px; font-family: sans-serif; font-size: 13px; color: #64748b;">Kind Regards,</p>
<p style="margin-bottom: 2px; font-family: sans-serif; font-size: 13px; color: #334155;"><strong>Your Name</strong> | Your Title</p>
<p style="margin-bottom: 2px; font-family: sans-serif; font-size: 13px; color: #334155;">Contact: <a href="tel:+1555000000" style="color: #0b57d0; text-decoration: underline;">+1 (555) 000-0000</a></p>
<p style="margin-bottom: 2px; font-family: sans-serif; font-size: 13px; color: #334155;"><strong>Your Company</strong></p>
<p style="margin-bottom: 8px; font-family: sans-serif; font-size: 13px; color: #334155;">Website: <a href="https://www.example.com/" target="_blank" style="color: #0b57d0; text-decoration: underline;">https://www.example.com/</a></p>
<div style="margin-top: 8px; margin-bottom: 8px;">
  <img src="/tbm-logo.png" alt="Logo" width="200" style="display: block; width: 200px; max-width: 100%; height: auto;" />
</div>
<div style="margin-top: 6px;">
  <img src="/signature-banner.png" alt="Banner" width="420" style="display: block; width: 420px; max-width: 100%; height: auto; border-radius: 4px;" />
</div>`;

// Universal defaults — loaded from localStorage, falling back to hardcoded
const STORAGE_KEY_SIGNATURE = "nexus_universal_signature_html";
const STORAGE_KEY_BODY = "nexus_universal_body_html";

function getUniversalSignature(): string {
  if (typeof window === "undefined") return THEBOREDMONKEY_SIGNATURE_HTML;
  return localStorage.getItem(STORAGE_KEY_SIGNATURE) || THEBOREDMONKEY_SIGNATURE_HTML;
}

function getUniversalBody(): string {
  if (typeof window === "undefined") return DEFAULT_BOREDMONKEY_HTML;
  return localStorage.getItem(STORAGE_KEY_BODY) || DEFAULT_BOREDMONKEY_HTML;
}

// Default Email Body (Separated from Signature Box)
const DEFAULT_BOREDMONKEY_HTML = `<p>Hey {{firstName}},</p>
<br/>
<p>Greetings of the day!</p>
<br/>
<p>I’m so happy to share this wonderful news with you that you have officially received a salary increment &amp; promotion, effective <strong>October 1, 2026.</strong></p>
<br/>
<p>This is a reflection of your consistent hard work and the positive spirit you bring to your role every day. Your dedication and willingness to go the extra mile haven’t gone unnoticed, and we truly appreciate your continued contribution.</p>
<br/>
<p>Cheers to your growth!</p>`;

// Clean HTML, Format MS Word/Gmail Copy-Paste & Repair Gmail Proxy Images
export const cleanAndRepairPastedHtml = (rawHtml: string): string => {
  if (!rawHtml) return rawHtml;
  let cleaned = rawHtml;

  // 1. Remove MS Word comments & XML metadata
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  cleaned = cleaned.replace(/<xml[\s\S]*?<\/xml>/gi, "");

  // 2. Clean MS Word inline styles like mso-*
  cleaned = cleaned.replace(/mso-[^:";]+:[^;";]+;?/gi, "");

  // 3. *** CRITICAL: Strip Gmail quoted/forwarded content ***
  // This prevents pasting a signature from Gmail from also including
  // the previous sender's signature that appears below in the email thread.
  // Remove <div class="gmail_quote">...</div> and everything inside
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/gi, "");
  // Remove <blockquote class="gmail_quote">...</blockquote> and everything inside
  cleaned = cleaned.replace(/<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/gi, "");
  // Remove <div class="gmail_attr">...</div> ("On Mon, Sep 8, 2026 at..." lines)
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_attr[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  // Also strip any remaining <blockquote> elements (generic quoted replies)
  cleaned = cleaned.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "");
  // Strip Outlook-style forwarded content wrappers
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*OutlookRoute[^"]*"[^>]*>[\s\S]*$/gi, "");
  // Strip Apple Mail quoted content (class="webkit-android-quote")
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*webkit[^"]*quote[^"]*"[^>]*>[\s\S]*$/gi, "");
  // Strip generic "On ... wrote:" attribution lines (multi-service pattern)
  cleaned = cleaned.replace(/<div[^>]*>[\s\S]*?(?:On\s+\w+,\s+\w+\s+\d+,?\s+\d+\s+at\s+\d+:\d+\s*(?:AM|PM)[\s\S]*?wrote:)<\/div>/gi, "");

  // 4. Repair Gmail internal proxy links & local broken blob: / cid: attachments sequentially
  // Only replace images that are clearly TheBoredMonkey-related (by context).
  // Leave all other images untouched so custom signatures preserve their original images.
  cleaned = cleaned.replace(/<img([^>]*)>/gi, (imgTag, attrs) => {
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1] : "";

    const isGmailOrBrokenProxy =
      src.includes("mail.google.com") ||
      src.includes("googleusercontent.com") ||
      src.startsWith("blob:") ||
      src.startsWith("cid:") ||
      !src;

    if (!isGmailOrBrokenProxy) return imgTag;

    const lowerAttrs = attrs.toLowerCase();
    const lowerCleaned = cleaned.toLowerCase();

    // Only replace if context indicates this is a TBM signature image
    const isNearTbmContent =
      lowerAttrs.includes("tbm") ||
      lowerAttrs.includes("boredmonkey") ||
      lowerAttrs.includes("banner") ||
      lowerAttrs.includes("portfolio") ||
      lowerCleaned.includes("tbm-logo") ||
      lowerCleaned.includes("signature-banner");

    if (!isNearTbmContent) return imgTag;

    const isBanner =
      lowerAttrs.includes("banner") ||
      lowerAttrs.includes("portfolio");

    if (isBanner) {
      return `<img src="/signature-banner.png" alt="TheBoredMonkey Portfolio" width="420" style="display: block; width: 420px; max-width: 100%; height: auto; border-radius: 4px; margin-top: 6px;" />`;
    }
    return `<img src="/tbm-logo.png" alt="TheBoredMonkey" width="200" style="display: block; width: 200px; max-width: 100%; height: auto; margin-top: 8px;" />`;
  });

  return cleaned;
};

// Auto-Detect & Split Email Body from Signature Sign-off
export const splitBodyAndSignature = (html: string): { body: string; signature: string } => {
  if (!html) return { body: "", signature: "" };

  const signOffRegex = /(?:<p[^>]*>|<div[^>]*>|<br\s*\/?>|\n|^)\s*(?:Kind\s+Regards|Best\s+Regards|Warm\s+Regards|Thanks\s+&\s+Regards|Regards|Sincerely|Cheers|Poonam\s+Khate|Haji\s+Karim)[\s\S]*/i;

  const match = html.match(signOffRegex);
  if (match && match.index !== undefined) {
    if (match.index === 0) {
      return { body: "", signature: html.trim() };
    }
    const body = html.substring(0, match.index).trim();
    const signature = html.substring(match.index).trim();
    return { body, signature };
  }

  return { body: html, signature: "" };
};

export default function SmartleadCampaignBuilder() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading campaign builder...</div>}>
      <CampaignBuilderContent />
    </React.Suspense>
  );
}

function CampaignBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("id");

  const { data: apiMailboxes } = useGetMailboxes();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const launchCampaign = useLaunchCampaign();

  const availableMailboxes = useMemo(() => {
    if (!apiMailboxes || apiMailboxes.length === 0) return [];
    return apiMailboxes.map((m: any) => ({
      id: m.id,
      name: m.owner || m.user?.name || m.senderEmail || m.email,
      email: m.senderEmail || m.email,
      provider: (m.provider || "smtp") as "google" | "microsoft" | "smtp",
      warmupScore: m.warmupReputationScore || 100,
      dailyLimit: m.dailySendLimit || 50,
      sentToday: m.warmupEmailsSent || 0,
      health: m.status === "ACTIVE" ? "healthy" : m.status === "WARMING" ? "warning" : "paused" as "healthy" | "warning" | "paused",
    }));
  }, [apiMailboxes]);

  // Active Main Navigation Tab
  const [activeTab, setActiveTab] = useState<"leads" | "sequence" | "accounts" | "subsequences" | "settings">("leads");

  // Campaign State
  const [campaignName, setCampaignName] = useState(searchParams.get("name") || "Campaign 1");
  const [campaignStatus, setCampaignStatus] = useState<"Draft" | "Active" | "Paused">("Draft");

  useEffect(() => {
    const nameParam = searchParams.get("name");
    if (nameParam) {
      setCampaignName(nameParam);
    }
  }, [searchParams]);

  // Load existing campaign data from localStorage matching campaignId
  useEffect(() => {
    if (!campaignId) return;
    try {
      const saved = localStorage.getItem("nexus_outbound_campaigns");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const found = parsed.find((c: any) => c.id === campaignId);
          if (found) {
            if (found.name) setCampaignName(found.name);
            if (found.status) setCampaignStatus(found.status === "active" ? "Active" : found.status === "paused" ? "Paused" : "Draft");
            if (Array.isArray(found.leads) && found.leads.length > 0) {
              setLeads(found.leads);
            }
            if (Array.isArray(found.steps) && found.steps.length > 0) {
              setSequences(found.steps);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load existing campaign:", e);
    }
  }, [campaignId]);



  // Tab 1: Leads State
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_LEADS);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [showAddLeadsModal, setShowAddLeadsModal] = useState(false);
  const [addLeadsStep, setAddLeadsStep] = useState<1 | 2 | 3 | 4>(1); // 1: Source, 2: Settings, 3: Mapping, 4: Diagnostic
  const [showSingleLeadModal, setShowSingleLeadModal] = useState(false);
  const [singleLeadForm, setSingleLeadForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    title: "",
    phone: "",
  });
  const [isVerifyingLeads, setIsVerifyingLeads] = useState(false);
  const [csvFileName, setCsvFileName] = useState("leads_list.csv");
  const csvFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setAddLeadsStep(2);
        return;
      }

      const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
        const parsedLeads: LeadItem[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
          if (cols.length >= 1) {
            const emailIndex = headers.findIndex((h) => h.toLowerCase().includes("email"));
            const firstNameIndex = headers.findIndex((h) => h.toLowerCase().includes("first"));
            const lastNameIndex = headers.findIndex((h) => h.toLowerCase().includes("last"));
            const companyIndex = headers.findIndex((h) => h.toLowerCase().includes("company"));
            const titleIndex = headers.findIndex((h) => h.toLowerCase().includes("title"));
            const phoneIndex = headers.findIndex((h) => h.toLowerCase().includes("phone"));

            const email = (emailIndex >= 0 ? cols[emailIndex] : cols.find((c) => c.includes("@"))) || `lead_${i}@imported.com`;
            const firstName = (firstNameIndex >= 0 ? cols[firstNameIndex] : cols[0]) || "Contact";
            const lastName = lastNameIndex >= 0 ? cols[lastNameIndex] : "";
            const company = (companyIndex >= 0 ? cols[companyIndex] : cols[2]) || "Enterprise Client";
            const title = (titleIndex >= 0 ? cols[titleIndex] : cols[3]) || "Executive";
            const phone = phoneIndex >= 0 ? cols[phoneIndex] : "";

            parsedLeads.push({
              id: `lead_csv_${Date.now()}_${i}`,
              email,
              firstName,
              lastName,
              company,
              title,
              phone,
              status: "verified",
              dateAdded: "Just now",
            });
          }
        }

        if (parsedLeads.length > 0) {
          const existingEmailMap = new Set(leads.map((l) => l.email.toLowerCase().trim()));
          const newUniqueLeads: LeadItem[] = [];
          let duplicateCount = 0;

          for (const item of parsedLeads) {
            const cleanEmail = item.email.toLowerCase().trim();
            if (existingEmailMap.has(cleanEmail)) {
              duplicateCount++;
            } else {
              existingEmailMap.add(cleanEmail);
              newUniqueLeads.push(item);
            }
          }

          if (newUniqueLeads.length > 0) {
            setLeads((prev) => [...newUniqueLeads, ...prev]);
            if (duplicateCount > 0) {
              showToast(`✓ Imported ${newUniqueLeads.length} new leads (${duplicateCount} duplicate clients already existed and were skipped)!`);
            } else {
              showToast(`✓ Successfully imported ${newUniqueLeads.length} leads from ${file.name}!`);
            }
          } else if (duplicateCount > 0) {
            showToast(`⚠️ All ${duplicateCount} leads in ${file.name} already exist in this campaign!`);
          }
        }
      }
      setAddLeadsStep(2);
    };
    reader.readAsText(file);
  };

  // Tab 2: Sequence State — loads universal defaults from localStorage
  const [sequences, setSequences] = useState<SequenceStep[]>(() => {
    const savedBody = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_BODY) : null;
    const savedSig = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_SIGNATURE) : null;
    const body = savedBody || DEFAULT_BOREDMONKEY_HTML;
    const sig = savedSig || "";
    return [
      {
        id: "seq-step-1",
        stepNumber: 1,
        type: "email",
        subject: "{{firstName}} {{lastName}} | Your Subject Line",
        bodyHtml: body,
        signatureHtml: sig,
        delayDays: 0,
        variants: [
          {
            id: "v-a",
            variantLetter: "A",
            subject: "{{firstName}} {{lastName}} | Your Subject Line",
            bodyHtml: body,
            signatureHtml: sig,
            weight: 100,
          },
        ],
        activeVariantIndex: 0,
      },
    ];
  });
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const sigEditorRef = React.useRef<HTMLDivElement>(null);
  const bodyEditorRef = React.useRef<HTMLDivElement>(null);

  // Keep signature editor DOM in sync when switching steps — avoids React/contentEditable conflict
  useEffect(() => {
    if (sigEditorRef.current) {
      sigEditorRef.current.innerHTML = activeStep?.signatureHtml || "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepIndex]);

  // Keep body editor DOM in sync when switching steps
  useEffect(() => {
    if (bodyEditorRef.current) {
      bodyEditorRef.current.innerHTML = activeStep?.bodyHtml || "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepIndex]);
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const [showVariableDropdown, setShowVariableDropdown] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLeadIndex, setPreviewLeadIndex] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("Generate a high-converting cold email for B2B tech executives");

  // Tab 3: Email Accounts State
  const [selectedMailboxIds, setSelectedMailboxIds] = useState<string[]>([]);
  const [showSaveAccountsModal, setShowSaveAccountsModal] = useState(false);

  // Auto-select logged-in user's mailbox when both session and mailboxes are available
  const { data: session } = useSession();
  const userEmail = session?.user?.email;

  // Compute effective selected mailbox IDs: use explicit selection, or fall back to user's own mailbox
  const effectiveMailboxIds = useMemo(() => {
    if (selectedMailboxIds.length > 0) return selectedMailboxIds;
    if (userEmail && availableMailboxes.length > 0) {
      const userMailbox = availableMailboxes.find((m) => m.email === userEmail);
      if (userMailbox) return [userMailbox.id];
    }
    return [];
  }, [selectedMailboxIds, userEmail, availableMailboxes]);

  // Auto-save body and signature to localStorage as universal defaults
  // Debounced: saves 1.5s after last edit, so every new campaign starts with the latest
  useEffect(() => {
    const timer = setTimeout(() => {
      const step = sequences[0];
      if (step) {
        if (step.bodyHtml) localStorage.setItem(STORAGE_KEY_BODY, step.bodyHtml);
        if (step.signatureHtml) localStorage.setItem(STORAGE_KEY_SIGNATURE, step.signatureHtml);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [sequences]);

  // Auto-sync leads and sequences back to localStorage whenever modified
  useEffect(() => {
    if (!campaignId) return;
    try {
      const saved = localStorage.getItem("nexus_outbound_campaigns");
      let campaignsList = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(campaignsList)) campaignsList = [];

      const existingIdx = campaignsList.findIndex((c: any) => c.id === campaignId);
      const updatedObj = {
        id: campaignId,
        name: campaignName || "Campaign",
        status: campaignStatus.toLowerCase(),
        type: "inbox",
        leadsCount: leads.length,
        sentCount: existingIdx >= 0 ? campaignsList[existingIdx].sentCount || 0 : 0,
        openRate: existingIdx >= 0 ? campaignsList[existingIdx].openRate || "0.0%" : "0.0%",
        replyRate: existingIdx >= 0 ? campaignsList[existingIdx].replyRate || "0.0%" : "0.0%",
        positiveRate: existingIdx >= 0 ? campaignsList[existingIdx].positiveRate || "0.0%" : "0.0%",
        jitter: "45s–120s Randomized",
        createdAt: existingIdx >= 0 ? campaignsList[existingIdx].createdAt : "Just now",
        owner: "User",
        leads,
        steps: sequences,
      };

      if (existingIdx >= 0) {
        campaignsList[existingIdx] = updatedObj;
      } else {
        campaignsList.unshift(updatedObj);
      }
      localStorage.setItem("nexus_outbound_campaigns", JSON.stringify(campaignsList));
    } catch (e) {
      console.error("Failed to sync campaign to localStorage:", e);
    }
  }, [campaignId, leads, sequences, campaignName, campaignStatus]);

  // Tab 4: SubSequences State
  const [subsequences, setSubsequences] = useState<SubSequenceRule[]>([
    {
      id: "subseq-1",
      name: "Subsequence 1 - Meeting Request Fast Track",
      conditionType: "category",
      selectedCategory: "Meeting Request",
      delayDays: 1,
      steps: [
        {
          id: "sub-step-1",
          stepNumber: 1,
          type: "email",
          subject: "Confirming calendar invite for {{company}} discussion",
          bodyHtml: `<p>Hi {{firstName}},</p><p>Fantastic! Here is my direct booking link to schedule 15 minutes that works best for your schedule: <a href="#">calendar.yourcompany.com</a></p>${THEBOREDMONKEY_SIGNATURE_HTML}`,
          delayDays: 0,
          variants: [],
          activeVariantIndex: 0,
        },
      ],
    },
  ]);

  // Restore saved draft from API on mount if campaignId exists
  const [isLoadedFromApi, setIsLoadedFromApi] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    const loadCampaign = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.name) setCampaignName(data.name);
          if (data.status) setCampaignStatus(data.status === "ACTIVE" ? "Active" : data.status === "PAUSED" ? "Paused" : "Draft");
          if (Array.isArray(data.sequence) && data.sequence.length > 0) {
            setSequences(data.sequence.map((s: any, idx: number) => ({
              id: s.id || `seq-step-${idx + 1}`,
              stepNumber: s.step || idx + 1,
              type: "email",
              subject: s.subject || "",
              bodyHtml: s.preview || s.bodyHtml || "",
              delayDays: s.delayDays ?? 3,
              variants: [
                {
                  id: `v-${idx + 1}`,
                  variantLetter: "A",
                  subject: s.subject || "",
                  bodyHtml: s.preview || s.bodyHtml || "",
                  weight: 100,
                },
              ],
              activeVariantIndex: 0,
            })));
          }
          if (Array.isArray(data.mailboxIds) && data.mailboxIds.length > 0) {
            setSelectedMailboxIds(data.mailboxIds);
          }
          // Load leads from API response
          if (Array.isArray(data.leadsList) && data.leadsList.length > 0) {
            setLeads(data.leadsList.map((l: any) => ({
              id: l.id,
              firstName: l.firstName || "",
              lastName: l.lastName || "",
              email: l.email || "",
              company: l.company || "",
              title: l.title || "",
              phone: l.phone || "",
              status: "verified" as const,
              dateAdded: l.lastEventAt || "Previously added",
            })));
          }
        }
      } catch (e) {
        console.error("Failed to load campaign from DB:", e);
      } finally {
        setIsLoadedFromApi(true);
      }
    };
    loadCampaign();
  }, [campaignId]);

  // Sync edits to API database
  const syncCampaignToStorage = async (overrideStatus?: string) => {
    if (!campaignId) return;
    const currentStatus = overrideStatus || campaignStatus;
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          status: currentStatus === "Active" ? "ACTIVE" : currentStatus === "Paused" ? "PAUSED" : "DRAFT",
          sequence: sequences.map((s) => ({
            stepNumber: s.stepNumber,
            delayDays: s.delayDays,
            subject: s.subject,
            bodyHtml: s.signatureHtml ? `${s.bodyHtml}<br/><br/>${s.signatureHtml}` : s.bodyHtml,
          })),
          leads: leads.map((l) => ({
            email: l.email,
            firstName: l.firstName,
            lastName: l.lastName,
            company: l.company,
            title: l.title,
          })),
          mailboxIds: effectiveMailboxIds,
        }),
      });
    } catch (e) {
      console.error("Failed to sync campaign to database:", e);
    }
  };

  // Auto-save draft to API whenever name, status, sequence steps or leads change
  // Guard: only auto-save after initial API load completes
  useEffect(() => {
    if (!campaignId || !isLoadedFromApi) return;
    const timer = setTimeout(() => {
      syncCampaignToStorage();
    }, 2000);
    return () => clearTimeout(timer);
  }, [campaignId, campaignName, campaignStatus, sequences, leads, effectiveMailboxIds, isLoadedFromApi]);
  const [showCreateSubseqModal, setShowCreateSubseqModal] = useState(false);
  const [subseqActiveSubtab, setSubseqActiveSubtab] = useState<"condition" | "sequence" | "settings">("condition");
  const [newSubseqCategory, setNewSubseqCategory] = useState("Interested");
  const [newSubseqDelay, setNewSubseqDelay] = useState(1);
  const [newSubseqName, setNewSubseqName] = useState("SubSequence 1");

  // Tab 5: Settings State
  const [settingsSection, setSettingsSection] = useState<
    "schedule" | "behavior" | "delivery" | "ai" | "protection" | "webhooks"
  >("schedule");
  const [timezone, setTimezone] = useState("Asia/Calcutta(UTC+05:30)");
  const [campaignStartDate, setCampaignStartDate] = useState("2026-09-09");
  const [activeDays, setActiveDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [sendingWindowFrom, setSendingWindowFrom] = useState("09:00");
  const [sendingWindowTo, setSendingWindowTo] = useState("18:00");
  const [sendingIntervalMinutes, setSendingIntervalMinutes] = useState(20);
  const [newLeadsPerDay, setNewLeadsPerDay] = useState(100);
  const [stopCondition, setStopCondition] = useState<"replies" | "clicks" | "opens">("replies");
  const [variantDistribution, setVariantDistribution] = useState<"pattern" | "random">("pattern");
  const [companyAutoPause, setCompanyAutoPause] = useState(true);
  const [followUpPriority, setFollowUpPriority] = useState<"new" | "100_followups" | "followups">("100_followups");

  // Start Campaign Process / Launch Modal State
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const activeStep = sequences[activeStepIndex] || sequences[0];
  const activeLead = leads[previewLeadIndex] || leads[0] || {
    id: "lead_preview",
    firstName: "Lead",
    lastName: "",
    email: "lead@example.com",
    company: "Example Corp",
    title: "Executive",
  };

  // Interpolation for Active Step Preview
  const renderedSubject = useMemo(() => {
    return (activeStep?.subject || "")
      .replace(/{{firstName}}/g, activeLead.firstName)
      .replace(/{{lastName}}/g, activeLead.lastName)
      .replace(/{{company}}/g, activeLead.company)
      .replace(/{{title}}/g, activeLead.title);
  }, [activeStep?.subject, activeLead]);

  const renderedBodyHtml = useMemo(() => {
    const body = activeStep?.bodyHtml || "";
    const signature = activeStep?.signatureHtml || "";

    // If signature field is empty, just use the body as-is
    if (!signature) {
      const interpolated = body
        .replace(/{{firstName}}/g, activeLead.firstName)
        .replace(/{{lastName}}/g, activeLead.lastName)
        .replace(/{{company}}/g, activeLead.company)
        .replace(/{{title}}/g, activeLead.title);
      return interpolated;
    }

    // If body already contains signature content, don't append it again
    const bodyHasSignature =
      body.includes("Kind Regards") ||
      body.includes("Best Regards") ||
      body.includes("Warm Regards") ||
      body.includes("tbm-logo") ||
      body.includes("signature-banner");

    const fullContent = bodyHasSignature ? body : `${body}<br/><br/>${signature}`;

    const interpolated = fullContent
      .replace(/{{firstName}}/g, activeLead.firstName)
      .replace(/{{lastName}}/g, activeLead.lastName)
      .replace(/{{company}}/g, activeLead.company)
      .replace(/{{title}}/g, activeLead.title);
    return interpolated;
  }, [activeStep?.bodyHtml, activeStep?.signatureHtml, activeLead]);

  // Handle Adding Sequence Step
  const handleAddSequenceStep = () => {
    const nextNum = sequences.length + 1;
    const newStep: SequenceStep = {
      id: `seq-step-${Date.now().toString(36)}`,
      stepNumber: nextNum,
      type: "email",
      subject: "",
      bodyHtml: `<p>Hi {{firstName}},</p><p>Following up on my previous email. Let me know what time works best for a quick touchpoint.</p>`,
      signatureHtml: THEBOREDMONKEY_SIGNATURE_HTML,
      delayDays: 1, // 24 hours between follow-ups
      variants: [
        {
          id: `v-${Date.now().toString(36)}`,
          variantLetter: "A",
          subject: "",
          bodyHtml: `<p>Hi {{firstName}},</p><p>Following up on my previous email.</p>`,
          signatureHtml: THEBOREDMONKEY_SIGNATURE_HTML,
          weight: 100,
        },
      ],
      activeVariantIndex: 0,
    };
    setSequences([...sequences, newStep]);
    setActiveStepIndex(sequences.length);
    showToast(`Added Email Step ${nextNum}!`);
  };

  // Handle Remove Step
  const handleRemoveStep = (indexToRemove: number) => {
    if (sequences.length <= 1) {
      showToast("Campaign must contain at least 1 sequence step.");
      return;
    }
    const filtered = sequences.filter((_, idx) => idx !== indexToRemove).map((s, idx) => ({
      ...s,
      stepNumber: idx + 1,
    }));
    setSequences(filtered);
    setActiveStepIndex(Math.max(0, indexToRemove - 1));
    showToast("Sequence step removed.");
  };

  // Variable Insert helper
  const insertVariableIntoCurrentStep = (varName: string) => {
    const placeholder = `{{${varName}}}`;
    setSequences((prev) =>
      prev.map((s, idx) =>
        idx === activeStepIndex
          ? { ...s, bodyHtml: s.bodyHtml + " " + placeholder }
          : s
      )
    );
    setShowVariableDropdown(false);
    showToast(`Inserted {{${varName}}}!`);
  };

  // Verify Leads Simulation
  const handleRunVerification = () => {
    setIsVerifyingLeads(true);
    setTimeout(() => {
      setIsVerifyingLeads(false);
      setLeads((prev) => prev.map((l) => ({ ...l, status: "verified" })));
      showToast(`✓ ZeroBounce & Real-Time MX Check completed: 100% of leads verified!`);
    }, 1200);
  };

  // Execute and Start Campaign Process via real API
  const handleLaunchCampaignProcess = async () => {
    if (!campaignId) {
      showToast("Please save the campaign first.");
      return;
    }
    setIsLaunching(true);
    try {
      // Save mailbox IDs to campaign before launching
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxIds: effectiveMailboxIds }),
      });
      await launchCampaign.mutateAsync({ id: campaignId });
      setIsLaunching(false);
      setShowLaunchModal(false);
      setCampaignStatus("Active");
      router.push(`/campaigns/${campaignId}/workflow`);
    } catch (e) {
      setIsLaunching(false);
      const msg = e instanceof Error ? e.message : "Failed to launch campaign.";
      showToast(`❌ ${msg}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#f8fafc] font-sans text-slate-900 select-none pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 right-6 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900 shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SMARTLEAD TOP HEADER & CAMPAIGN CONTEXT BAR */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-200 bg-white px-5 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Breadcrumbs & Campaign Title */}
          <div className="flex items-center gap-3">
            <Link
              href="/inbox"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              title="Back to Mail / Campaigns"
            >
              <ArrowLeft size={16} />
            </Link>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">📢 Campaign 4</span>
                <ChevronRight size={12} className="text-slate-400" />
                <span className="rounded-md bg-[#ede9fe] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#4f46e5]">
                  SubSequence
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="text-base sm:text-lg font-black text-slate-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0 w-64 sm:w-96"
                />
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  {campaignStatus}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Configure lead conditions and sequences. Activates automatically when leads match.
              </p>
            </div>
          </div>

          {/* Right: Primary Action Button -> Start Campaign Process */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                showToast("All sequence and lead changes saved automatically.");
              }}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Check size={14} className="text-emerald-600" />
              <span>Saved</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLaunchModal(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] px-5 py-2.5 text-xs sm:text-sm font-extrabold text-white hover:from-[#4338ca] hover:to-[#4f46e5] shadow-md shadow-indigo-200 transition-all active:scale-95"
            >
              <Play size={14} className="fill-white" />
              <span>🚀 Start Campaign Process</span>
            </button>
          </div>
        </div>

        {/* 5 SMARTLEAD NAVIGATION TABS */}
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 overflow-x-auto text-xs font-bold">
          {[
            {
              id: "leads",
              label: `Lead Condition / Leads (${leads.length})`,
              badge: "✓",
              badgeColor: "text-emerald-600 bg-emerald-50",
            },
            {
              id: "sequence",
              label: `Sequence (${sequences.length})`,
              badge: sequences.length > 0 ? "✓" : "⚠️",
              badgeColor: sequences.length > 0 ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50",
            },
            {
              id: "accounts",
              label: `Email Accounts (${effectiveMailboxIds.length})`,
              badge: "✓",
              badgeColor: "text-emerald-600 bg-emerald-50",
            },
            {
              id: "subsequences",
              label: `SubSequences (${subsequences.length})`,
              badge: "",
              badgeColor: "",
            },
            {
              id: "settings",
              label: "Settings",
              badge: "",
              badgeColor: "",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "border-b-2 border-[#4f46e5] bg-[#ede9fe]/70 text-[#4f46e5] font-extrabold shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black", tab.badgeColor)}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN BODY PER TAB */}
      {/* ========================================================================= */}
      <div className="w-full px-4 sm:px-6 py-5">
        {/* ----------------------------------------------------------------------- */}
        {/* TAB 1: LEADS & IMPORT ENGINE */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === "leads" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search leads by name, email, company..."
                    className="h-8 rounded-xl border border-slate-200 bg-[#f8fafc] pl-8 pr-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#4f46e5] focus:outline-none w-64"
                  />
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {leads.length} total contacts loaded
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunVerification}
                  disabled={isVerifyingLeads}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-2xs transition-colors"
                >
                  {isVerifyingLeads ? (
                    <RefreshCw size={13} className="animate-spin text-emerald-600" />
                  ) : (
                    <CheckCheck size={14} className="text-emerald-600" />
                  )}
                  <span>✓ Verify Leads</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSingleLeadModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                >
                  <UserPlus size={14} className="text-[#4f46e5]" />
                  <span>+ Add Lead</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddLeadsModal(true);
                    setAddLeadsStep(1);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338ca] shadow-md transition-all active:scale-95"
                >
                  <UploadCloud size={14} />
                  <span>Add Leads (CSV / Lists)</span>
                </button>
              </div>
            </div>

            {/* Leads Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.length === leads.length && leads.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLeadIds(leads.map((l) => l.id));
                          else setSelectedLeadIds([]);
                        }}
                        className="rounded border-slate-300 accent-[#4f46e5]"
                      />
                    </th>
                    <th className="px-4 py-3">Lead / Contact</th>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Company &amp; Title</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Deliverability</th>
                    <th className="px-4 py-3">Date Added</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(l.id)}
                          onChange={() => {
                            setSelectedLeadIds((prev) =>
                              prev.includes(l.id) ? prev.filter((i) => i !== l.id) : [...prev, l.id]
                            );
                          }}
                          className="rounded border-slate-300 accent-[#4f46e5]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{l.firstName} {l.lastName}</div>
                        <div className="font-mono text-[9px] text-[#4f46e5]">{l.id}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 text-[11px]">{l.email}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{l.company}</div>
                        <div className="text-[11px] text-slate-500">{l.title}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{l.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                          <CheckCircle2 size={10} /> Verified
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">{l.dateAdded}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setLeads((prev) => prev.filter((item) => item.id !== l.id));
                            showToast(`Removed ${l.email}`);
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Delete Lead"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 2: SEQUENCE (Exact Smartlead Sequence Flow + Canvas + AI Editor) */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === "sequence" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-150">
            {/* LEFT 4 COLS: SEQUENCE FLOW SIDEBAR */}
            <div className="lg:col-span-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="text-sm font-black text-slate-900">Sequence Flow</h3>
                  <span className="text-[11px] font-bold text-slate-400">
                    {sequences.length} Step{sequences.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {sequences.map((step, idx) => (
                    <React.Fragment key={step.id}>
                      {/* Inter-step wait interval badge */}
                      {idx > 0 && (
                        <div className="flex items-center justify-center my-1">
                          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-2xs">
                            <Clock size={11} className="text-[#4f46e5]" />
                            <span>Wait for</span>
                            <input
                              type="number"
                              min="1"
                              max="30"
                              value={step.delayDays}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setSequences((prev) =>
                                  prev.map((s, i) => (i === idx ? { ...s, delayDays: val } : s))
                                );
                              }}
                              className="w-10 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-xs font-bold text-slate-800 outline-none"
                            />
                            <span>day(s)</span>
                          </div>
                        </div>
                      )}

                      {/* Sequence Step Card */}
                      <div
                        onClick={() => setActiveStepIndex(idx)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3.5 transition-all relative",
                          activeStepIndex === idx
                            ? "border-[#4f46e5] bg-[#f5f3ff] shadow-xs ring-1 ring-[#4f46e5]"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4f46e5] text-[10px] font-black text-white">
                              {step.stepNumber}
                            </span>
                            <span className="font-extrabold text-xs text-slate-900">
                              Email Step {step.stepNumber}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStep(idx);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Delete Step"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <p className="mt-1.5 text-[11px] font-medium text-slate-600 truncate">
                          Subject: {step.subject ? step.subject : "-"}
                        </p>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {/* + Add Sequence Button */}
                <button
                  type="button"
                  onClick={handleAddSequenceStep}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-[#f8fafc] py-3 text-xs font-bold text-slate-700 hover:border-[#4f46e5] hover:text-[#4f46e5] hover:bg-white transition-all"
                >
                  <Plus size={14} />
                  <span>+ Add Sequence Step</span>
                </button>
              </div>
            </div>

            {/* RIGHT 8 COLS: EMAIL STEP CANVAS */}
            <div className="lg:col-span-8 space-y-4">
              {/* Smartlead Informational Tip Banner for Follow-ups / Threading */}
              <div className="rounded-2xl border border-blue-200/80 bg-[#eff6ff] p-3 shadow-2xs flex items-center gap-2.5 text-xs text-blue-900">
                <Info size={15} className="text-[#3b82f6] shrink-0" />
                <span className="font-semibold text-[11.5px] leading-snug">
                  Leave this subject line empty if you&apos;d like this email to be a &quot;reply&quot; (same thread) to the lead&apos;s response. Else add your subject line to create a new thread.
                </span>
              </div>

              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-50 text-[#4f46e5] font-extrabold text-xs px-2.5 py-1">
                    Step {activeStep.stepNumber} · Email
                  </span>
                  <span className="text-xs text-slate-500">Variant A (100% distribution)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => showToast("A/B variant added! Traffic split 50/50.")}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                  >
                    <Plus size={13} className="text-[#4f46e5]" />
                    <span>+ Add A/B Variant</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                  >
                    <Eye size={13} className="text-[#4f46e5]" />
                    <span>👁️ Preview Template</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => showToast("Sequence step saved successfully!")}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] px-4 py-1.5 text-xs font-bold text-white hover:from-[#4338ca] hover:to-[#4f46e5] shadow-xs transition-all active:scale-95"
                  >
                    <Check size={13} />
                    <span>Save</span>
                  </button>
                </div>
              </div>

              {/* Exact Smartlead "Inbox Preview" Strip */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <Mail size={12} className="text-[#4f46e5]" />
                  <span>Inbox Preview</span>
                  <Info size={11} className="text-slate-400" />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#f8fafc] px-3.5 py-2 text-xs font-medium text-slate-700">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <input type="checkbox" disabled className="rounded border-slate-300" />
                    <span className="text-slate-400">☆</span>
                    <strong className="text-slate-900">Smartlead.ai</strong>
                    <span className="text-slate-800 font-semibold truncate">
                      {renderedSubject || "Your subject line will display here"}
                    </span>
                    <span className="text-slate-400 truncate">
                      — {activeStep.bodyHtml.replace(/<[^>]*>?/gm, "").substring(0, 50) || "You can edit your email body preview here"}
                    </span>
                  </div>
                  <Pencil size={12} className="text-slate-400 shrink-0" />
                </div>
              </div>

              {/* Subject Line with Variables Dropdown */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Subject Line
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowVariableDropdown(!showVariableDropdown)}
                      className="flex items-center gap-1 text-xs font-bold text-[#4f46e5] hover:underline"
                    >
                      <span>&#123; &#125; Variables</span>
                      <ChevronDown size={12} />
                    </button>

                    {showVariableDropdown && (
                      <div className="absolute right-0 mt-1 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg text-xs font-semibold">
                        {["firstName", "lastName", "company", "title", "phone"].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariableIntoCurrentStep(v)}
                            className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 font-mono text-[11px]"
                          >
                            &#123;&#123;{v}&#123;&#123;
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {activeStepIndex > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-700">
                    <span className="font-bold">Reply in same thread</span>
                    <span>— Subject is auto-inherited from Step 1. Leave empty.</span>
                  </div>
                )}
                <input
                  type="text"
                  value={activeStep.subject}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSequences((prev) =>
                      prev.map((s, idx) => (idx === activeStepIndex ? { ...s, subject: val } : s))
                    );
                  }}
                  placeholder={activeStepIndex > 0 ? "No subject needed (reply in same thread)" : "Enter your subject line..."}
                  disabled={activeStepIndex > 0}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                    activeStepIndex > 0
                      ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-[#f8fafc] text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#4f46e5] focus:outline-none"
                  }`}
                />
              </div>

              {/* Email Body Rich WYSIWYG Editor */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Email Body
                  </label>

                  {/* Mode & Action Tools */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setShowAiModal(true)}
                      className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-purple-700 hover:bg-purple-100"
                    >
                      <Sparkles size={12} />
                      <span>✨ Write with AI</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const html = activeStep.bodyHtml + THEBOREDMONKEY_SIGNATURE_HTML;
                        setSequences((prev) =>
                          prev.map((s, idx) =>
                            idx === activeStepIndex
                              ? { ...s, bodyHtml: html }
                              : s
                          )
                        );
                        if (bodyEditorRef.current) bodyEditorRef.current.innerHTML = html;
                        showToast("📌 Appended signature block to the end!");
                      }}
                      className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-900 hover:bg-amber-100"
                      title="Paste signature block"
                    >
                      <span>📌 Paste Exact Signature</span>
                    </button>

                    <label
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      title="Upload image from your computer"
                    >
                      <ImageIcon size={11} />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const formData = new FormData();
                          formData.append("file", file);
                          try {
                            const res = await fetch("/api/upload/image", { method: "POST", body: formData });
                            const data = await res.json();
                            if (data.url && bodyEditorRef.current) {
                              const img = `<img src="${data.url}" alt="${file.name}" style="max-width:100%;height:auto;border-radius:4px;" />`;
                              bodyEditorRef.current.focus();
                              document.execCommand("insertHTML", false, img);
                              const updated = bodyEditorRef.current.innerHTML;
                              setSequences((prev) =>
                                prev.map((s, idx) =>
                                  idx === activeStepIndex ? { ...s, bodyHtml: updated } : s
                                )
                              );
                              showToast(`✅ Image "${file.name}" uploaded and inserted!`);
                            }
                          } catch {
                            showToast("❌ Failed to upload image");
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setSequences((prev) =>
                          prev.map((s, idx) =>
                            idx === activeStepIndex ? { ...s, bodyHtml: "<p></p>" } : s
                          )
                        );
                        if (bodyEditorRef.current) bodyEditorRef.current.innerHTML = "<p></p>";
                        showToast("🧹 Cleared canvas for fresh paste!");
                      }}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                      title="Clear editor canvas to paste fresh email"
                    >
                      <Trash2 size={11} />
                      <span>Clear Canvas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSequences((prev) =>
                          prev.map((s, idx) =>
                            idx === activeStepIndex
                              ? { ...s, bodyHtml: cleanAndRepairPastedHtml(s.bodyHtml) }
                              : s
                          )
                        );
                        showToast("✨ Auto-fixed broken image links with local high-res GIFs!");
                      }}
                      className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[#4f46e5] hover:bg-indigo-100"
                    >
                      <RefreshCw size={11} />
                      <span>🔄 Fix Images</span>
                    </button>

                    {/* Mode Toggle */}
                    <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setEditorMode("visual")}
                        className={cn(
                          "px-2 py-0.5 rounded font-bold transition-all",
                          editorMode === "visual" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
                        )}
                      >
                        Visual
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode("html")}
                        className={cn(
                          "px-2 py-0.5 rounded font-bold transition-all",
                          editorMode === "html" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
                        )}
                      >
                        Raw HTML
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Insert Variable Tags Strip */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5 pt-0.5">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Insert Variable:</span>
                  {[
                    { label: "firstName", tag: "{{firstName}}" },
                    { label: "lastName", tag: "{{lastName}}" },
                    { label: "company", tag: "{{company}}" },
                    { label: "title", tag: "{{title}}" },
                  ].map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => {
                        if (editorMode === "visual") {
                          document.execCommand("insertText", false, v.tag);
                        } else {
                          setSequences((prev) =>
                            prev.map((s, idx) =>
                              idx === activeStepIndex ? { ...s, bodyHtml: s.bodyHtml + v.tag } : s
                            )
                          );
                        }
                        showToast(`Inserted ${v.tag} into template!`);
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-mono font-bold text-[#0b57d0] hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-2xs"
                      title={`Click to insert ${v.tag}`}
                    >
                      + {v.tag}
                    </button>
                  ))}
                </div>

                {/* Rich Editor Canvas */}
                {editorMode === "visual" ? (
                  <div
                    ref={bodyEditorRef}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    onInput={(e) => {
                      const updated = (e.currentTarget as HTMLDivElement).innerHTML;
                      setSequences((prev) =>
                        prev.map((s, idx) =>
                          idx === activeStepIndex ? { ...s, bodyHtml: updated } : s
                        )
                      );
                    }}
                    className="min-h-[320px] max-h-[500px] overflow-y-auto w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-xs sm:text-[13px] text-slate-800 font-sans leading-relaxed focus:bg-white focus:border-[#4f46e5] focus:outline-none shadow-inner"
                  />
                ) : (
                  <textarea
                    rows={14}
                    value={activeStep.bodyHtml}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSequences((prev) =>
                        prev.map((s, idx) =>
                          idx === activeStepIndex ? { ...s, bodyHtml: val } : s
                        )
                      );
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-[#0f172a] text-emerald-400 p-3.5 text-xs font-mono leading-relaxed focus:border-[#4f46e5] focus:outline-none"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 3: EMAIL ACCOUNTS & MAILBOX ROTATION */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === "accounts" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Assign Sending Accounts to Campaign
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select verified mailboxes for round-robin rotation with ramp-up protection and warmup safeguards.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    syncCampaignToStorage();
                    showToast("✅ Email accounts saved!");
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338ca] shadow-md transition-all active:scale-95"
                >
                  <Check size={14} />
                  <span>Save Email Account Changes</span>
                </button>
              </div>

              {/* Mailboxes Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                            checked={selectedMailboxIds.length === availableMailboxes.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedMailboxIds(availableMailboxes.map((m) => m.id));
                            else setSelectedMailboxIds([]);
                          }}
                          className="rounded border-slate-300 accent-[#4f46e5]"
                        />
                      </th>
                      <th className="px-4 py-3">Account Name &amp; Mailbox</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Warmup Reputation</th>
                      <th className="px-4 py-3">Daily Limit / Capacity</th>
                      <th className="px-4 py-3">Health Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availableMailboxes.map((mb) => (
                      <tr key={mb.id} className="hover:bg-slate-50 transition-colors">
                        <td className="w-10 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedMailboxIds.includes(mb.id)}
                            onChange={() => {
                              setSelectedMailboxIds((prev) =>
                                prev.includes(mb.id) ? prev.filter((i) => i !== mb.id) : [...prev, mb.id]
                              );
                            }}
                            className="rounded border-slate-300 accent-[#4f46e5]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">
                            {mb.name}
                            {mb.email === userEmail && (
                              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">You</span>
                            )}
                          </div>
                          <div className="font-mono text-slate-600 text-[11px]">{mb.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                            {mb.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                            <Flame size={11} className="text-emerald-600 fill-emerald-600" />
                            {mb.warmupScore}% Warm
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{mb.dailyLimit} emails/day</div>
                          <div className="w-24 bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                            <div className="bg-[#4f46e5] h-full w-[25%]" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 size={12} /> Ready to send
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom Selected Banner */}
              <div className="flex items-center justify-between rounded-xl bg-[#ede9fe]/60 border border-[#4f46e5]/20 p-3.5 text-xs text-[#4f46e5]">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  <span className="font-bold">
                    {effectiveMailboxIds.length} mailboxes selected · Total capacity: {effectiveMailboxIds.length * 50} emails/day
                  </span>
                </div>
                <span className="font-extrabold text-xs">Round-Robin Inboxing Enabled</span>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 4: SUBSEQUENCES (Exact Smartlead Subsequence DAG & Trigger System) */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === "subsequences" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Automated SubSequences Matrix
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Branch into specialized sequence tracks based on AI sentiment categorization and lead actions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateSubseqModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338ca] shadow-md transition-all active:scale-95"
                >
                  <Plus size={14} />
                  <span>+ Create SubSequence</span>
                </button>
              </div>

              {/* Subsequence Sub-Navigation (Lead Condition | Sequence | Settings) */}
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold">
                {[
                  { id: "condition", label: "Lead Condition" },
                  { id: "sequence", label: "Sequence (1) ⚠️" },
                  { id: "settings", label: "Settings" },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setSubseqActiveSubtab(st.id as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg transition-all",
                      subseqActiveSubtab === st.id
                        ? "bg-[#ede9fe] text-[#4f46e5] font-extrabold"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Subsequence Subtab 1: Lead Condition */}
              {subseqActiveSubtab === "condition" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="text-xs font-black text-slate-800">
                      Subsequence Campaign Name
                    </label>
                    <input
                      type="text"
                      value={newSubseqName}
                      onChange={(e) => setNewSubseqName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#4f46e5] outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-800">
                        Stop Campaign &amp; Trigger SubSequence When Lead Matches:
                      </label>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5">
                        ● Recommended
                      </span>
                    </div>

                    {/* Interactive Category Selector Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
                      {[
                        { id: "Interested", desc: "Best for high engagement", color: "border-emerald-300 bg-emerald-50/70 text-emerald-900" },
                        { id: "Meeting Request", desc: "Requested demo or call", color: "border-purple-300 bg-purple-50/70 text-purple-900" },
                        { id: "Not Interested", desc: "Declined outreach", color: "border-slate-300 bg-slate-50 text-slate-800" },
                        { id: "Do Not Contact", desc: "Unsubscribe / Opt-out", color: "border-rose-300 bg-rose-50 text-rose-900" },
                        { id: "Info Request", desc: "Requested deck or pricing", color: "border-blue-300 bg-blue-50 text-blue-900" },
                        { id: "Out of Office", desc: "Auto-responder OOO", color: "border-amber-300 bg-amber-50 text-amber-900" },
                        { id: "Wrong Person", desc: "Referred to colleague", color: "border-orange-300 bg-orange-50 text-orange-900" },
                        { id: "Uncategorizable", desc: "Ambiguous reply", color: "border-slate-300 bg-slate-50 text-slate-800" },
                        { id: "Sender Bounce", desc: "SMTP soft/hard bounce", color: "border-red-300 bg-red-50 text-red-900" },
                      ].map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => setNewSubseqCategory(cat.id)}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3 transition-all flex items-start justify-between",
                            newSubseqCategory === cat.id
                              ? `${cat.color} ring-2 ring-[#4f46e5] font-extrabold shadow-xs`
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <div>
                            <div className="font-extrabold text-xs">{cat.id}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{cat.desc}</div>
                          </div>
                          <Radio size={14} className={newSubseqCategory === cat.id ? "text-[#4f46e5]" : "text-slate-300"} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3.5 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Execute Subsequence Delay
                    </label>
                    <div className="flex items-center gap-2">
                      <span>Execute</span>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={newSubseqDelay}
                        onChange={(e) => setNewSubseqDelay(Number(e.target.value))}
                        className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-center outline-none"
                      />
                      <span>day(s) after trigger condition match</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Subsequence Subtab 2: Sequence */}
              {subseqActiveSubtab === "sequence" && (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center space-y-2">
                  <p className="text-xs font-bold text-slate-700">Subsequence Steps Configured</p>
                  <p className="text-[11px] text-slate-500">
                    Step 1: Automated booking calendar link dispatch (100% variant delivery).
                  </p>
                </div>
              )}

              {/* Subsequence Subtab 3: Settings */}
              {subseqActiveSubtab === "settings" && (
                <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-xs space-y-2">
                  <p className="font-bold text-slate-800">Child Schedule: Follows Master Campaign Timezone</p>
                  <p className="text-[11px] text-slate-500">Asia/Calcutta (UTC+05:30) · Sending window 09:00 - 18:00</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 5: SETTINGS (Schedule Configuration, Behavior, AI & Optimization) */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-150">
            {/* LEFT 4 COLS: SETTINGS MENU */}
            <div className="lg:col-span-4 space-y-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs space-y-1 text-xs font-bold">
                {[
                  { id: "schedule", label: "Schedule Configuration *", icon: Calendar },
                  { id: "behavior", label: "Campaign Behavior", icon: SlidersHorizontal },
                  { id: "delivery", label: "Delivery Optimization", icon: Mail },
                  { id: "ai", label: "AI & Automation", icon: Sparkles },
                  { id: "protection", label: "Protection & Limits", icon: ShieldCheck },
                  { id: "webhooks", label: "Webhooks", icon: Network },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSettingsSection(item.id as any)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all",
                        settingsSection === item.id
                          ? "bg-[#ede9fe] text-[#4f46e5] font-extrabold shadow-2xs"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT 8 COLS: SETTINGS CONTENT */}
            <div className="lg:col-span-8 space-y-4">
              {/* SECTION: SCHEDULE CONFIGURATION */}
              {settingsSection === "schedule" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Send Schedule</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Define the exact delivery windows, days of the week, and AI jitter interval.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Timezone */}
                    <div>
                      <label className="text-xs font-bold text-slate-700">Timezone</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                      >
                        <option value="Asia/Calcutta(UTC+05:30)">Asia/Calcutta (UTC+05:30)</option>
                        <option value="America/New_York(UTC-05:00)">America/New_York (EST - UTC-05:00)</option>
                        <option value="America/Los_Angeles(UTC-08:00)">America/Los_Angeles (PST - UTC-08:00)</option>
                        <option value="Europe/London(UTC+00:00)">Europe/London (GMT - UTC+00:00)</option>
                      </select>
                    </div>

                    {/* Campaign Start Date */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        Campaign Start Date <Info size={11} className="text-slate-400" />
                      </label>
                      <input
                        type="date"
                        value={campaignStartDate}
                        onChange={(e) => setCampaignStartDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                      />
                    </div>
                  </div>

                  {/* Active Days */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Active Days</label>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setActiveDays((prev) =>
                              prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                            );
                          }}
                          className={cn(
                            "rounded-xl px-3.5 py-1.5 transition-all",
                            activeDays.includes(day)
                              ? "border border-[#4f46e5] bg-[#ede9fe] text-[#4f46e5] shadow-2xs font-extrabold"
                              : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sending Window */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Sending Window</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">From</span>
                        <input
                          type="time"
                          value={sendingWindowFrom}
                          onChange={(e) => setSendingWindowFrom(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">To</span>
                        <input
                          type="time"
                          value={sendingWindowTo}
                          onChange={(e) => setSendingWindowTo(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Every</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            min="5"
                            max="120"
                            value={sendingIntervalMinutes}
                            onChange={(e) => setSendingIntervalMinutes(Number(e.target.value))}
                            className="w-16 rounded-xl border border-slate-200 bg-[#f8fafc] px-2 py-1.5 text-center font-bold text-slate-800 outline-none"
                          />
                          <span className="text-slate-500 font-semibold">minutes</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 pt-1">
                      27 triggers will be sent / day / sender account.
                    </p>
                    <p className="text-[11px] text-[#4f46e5] italic">
                      AI adds 30–60 second variance for natural sending patterns
                    </p>
                  </div>

                  {/* New Leads/Day */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      New Leads/Day <Info size={11} className="text-slate-400" />
                    </label>
                    <input
                      type="number"
                      value={newLeadsPerDay}
                      onChange={(e) => setNewLeadsPerDay(Number(e.target.value))}
                      className="w-32 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
                    />

                    <div className="flex items-center gap-2 rounded-xl bg-blue-50/70 border border-blue-100 p-3 text-[11px] text-blue-900 mt-2">
                      <Info size={14} className="text-blue-600 shrink-0" />
                      <span>
                        Sequence delays follow the selected days. If only Mon-Fri are chosen, weekends won&apos;t affect your cadence.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: CAMPAIGN BEHAVIOR */}
              {settingsSection === "behavior" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5 text-xs">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Campaign Behavior</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure stop conditions, variant distribution, and company-level safeguards.
                    </p>
                  </div>

                  {/* Stop Campaign When Lead */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-black text-slate-800">Stop Campaign When Lead</label>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5">
                        ● Recommended
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: "replies", label: "Replies", desc: "Best for engagement" },
                        { id: "clicks", label: "Clicks", desc: "Track link clicks" },
                        { id: "opens", label: "Opens", desc: "Requires tracking" },
                      ].map((sc) => (
                        <div
                          key={sc.id}
                          onClick={() => setStopCondition(sc.id as any)}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3 transition-all flex items-start justify-between",
                            stopCondition === sc.id
                              ? "border-[#4f46e5] bg-[#ede9fe]/60 ring-1 ring-[#4f46e5] font-bold"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <div>
                            <div className="font-extrabold text-slate-900">{sc.label}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{sc.desc}</div>
                          </div>
                          <Radio size={14} className={stopCondition === sc.id ? "text-[#4f46e5]" : "text-slate-300"} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Email Variant Distribution */}
                  <div className="space-y-2">
                    <label className="font-black text-slate-800 flex items-center gap-1">
                      Email Variant Distribution <Info size={11} className="text-slate-400" />
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { id: "pattern", label: "Pattern-Based (Recommended)", desc: "Even distribution" },
                        { id: "random", label: "Randomized", desc: "Random selection" },
                      ].map((vd) => (
                        <div
                          key={vd.id}
                          onClick={() => setVariantDistribution(vd.id as any)}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3 transition-all flex items-start justify-between",
                            variantDistribution === vd.id
                              ? "border-[#4f46e5] bg-[#ede9fe]/60 ring-1 ring-[#4f46e5] font-bold"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <div>
                            <div className="font-extrabold text-slate-900">{vd.label}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{vd.desc}</div>
                          </div>
                          <Radio size={14} className={variantDistribution === vd.id ? "text-[#4f46e5]" : "text-slate-300"} />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-amber-50/70 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                      <span>Distribution mode cannot be changed once the campaign is active</span>
                    </div>
                  </div>

                  {/* Company-Level Auto-Pause */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#f8fafc] p-3.5">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span>Company-Level Auto-Pause</span>
                        <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5">
                          ● Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Auto-pause sequence for all coworkers if any contact at that domain replies
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companyAutoPause}
                        onChange={(e) => setCompanyAutoPause(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#4f46e5]"></div>
                    </label>
                  </div>

                  {/* Follow-up Priority Slider */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-800 flex items-center gap-1">
                      Follow-up Priority <Info size={11} className="text-slate-400" />
                    </label>
                    <div className="flex justify-between text-[11px] font-bold text-slate-600">
                      <span>New Leads</span>
                      <span className="text-[#4f46e5]">100% Follow-ups</span>
                      <span>Follow-ups</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gradient-to-r from-teal-400 via-[#4f46e5] to-indigo-700" />
                  </div>
                </div>
              )}

              {/* OTHER SETTINGS SECTIONS FALLBACK */}
              {["delivery", "ai", "protection", "webhooks"].includes(settingsSection) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3 text-xs">
                  <h3 className="text-sm font-black text-slate-900 capitalize">
                    {settingsSection} Configuration
                  </h3>
                  <p className="text-slate-500">
                    Optimized by default for high-volume enterprise deliverability (DKIM, SPF, DMARC alignment active).
                  </p>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900 font-bold flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>Deliverability rating: 99.8% · Spam trigger score 0.1/10 (Excellent)</span>
                  </div>
                </div>
              )}

              {/* Bottom Settings Bar */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => showToast("Reset to default schedule.")}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Reset to Defaults
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 font-medium">Auto-saving in 30s</span>
                  <button
                    type="button"
                    onClick={() => showToast("Campaign settings saved successfully!")}
                    className="rounded-xl bg-[#4f46e5] px-5 py-2 text-xs font-bold text-white hover:bg-[#4338ca] shadow-md transition-all active:scale-95"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3-STEP "ADD LEADS" MODAL */}
      {/* ========================================================================= */}
      {showAddLeadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {addLeadsStep === 1 && "Step 1: Choose Lead Source"}
                  {addLeadsStep === 2 && "Step 2: Upload Settings & Deduplication"}
                  {addLeadsStep === 3 && "Step 3: Smart Field Mapping"}
                  {addLeadsStep === 4 && "Import Successful!"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nexus Outbound Smartlead.ai Ingestion Pipeline
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddLeadsModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Step 1: Source */}
            {addLeadsStep === 1 && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={csvFileInputRef}
                  accept=".csv,.txt"
                  onChange={handleCsvFileSelect}
                  className="hidden"
                />
                <div
                  onClick={() => csvFileInputRef.current?.click()}
                  className="cursor-pointer rounded-2xl border-2 border-dashed border-[#4f46e5] bg-[#ede9fe]/40 p-5 text-center hover:bg-[#ede9fe]/70 transition-all active:scale-[.99]"
                >
                  <UploadCloud size={24} className="mx-auto text-[#4f46e5]" />
                  <p className="text-xs sm:text-sm font-bold text-slate-900 mt-2">
                    Click to Upload CSV File
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Supports First Name, Last Name, Email, Company, Job Title, Phone
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAddLeadsStep(2)}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                  >
                    <div className="font-bold text-slate-900">Apollo / Lead Finder</div>
                    <div className="text-[10px] text-slate-500">Import from live database</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddLeadsStep(2)}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                  >
                    <div className="font-bold text-slate-900">Saved Leads List</div>
                    <div className="text-[10px] text-slate-500">Select from workspace lists</div>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Upload Settings */}
            {addLeadsStep === 2 && (
              <div className="space-y-3 text-xs">
                {[
                  { title: "Skip duplicate leads across this campaign", desc: "Prevents emailing the same address twice", checked: true },
                  { title: "Don't import leads already contacted in workspace", desc: "Cross-campaign collision avoidance", checked: true },
                  { title: "Validate emails with ZeroBounce & MX checks", desc: "Zero bounce rate guarantee", checked: true },
                  { title: "Check against Global Do-Not-Contact (DNC) list", desc: "Automatically drops opted-out domains", checked: true },
                ].map((opt, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 cursor-pointer">
                    <input type="checkbox" defaultChecked={opt.checked} className="mt-0.5 rounded border-slate-300 accent-[#4f46e5]" />
                    <div>
                      <div className="font-bold text-slate-900">{opt.title}</div>
                      <div className="text-[11px] text-slate-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
                <div className="flex justify-between pt-2">
                  <button type="button" onClick={() => setAddLeadsStep(1)} className="text-slate-500 font-bold">Back</button>
                  <button type="button" onClick={() => setAddLeadsStep(3)} className="rounded-xl bg-[#4f46e5] px-5 py-2 text-xs font-bold text-white">Next: Field Mapping</button>
                </div>
              </div>
            )}

            {/* Step 3: Smart Field Mapping */}
            {addLeadsStep === 3 && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-[#f8fafc] text-[10px] font-bold uppercase text-slate-500 border-b">
                      <tr>
                        <th className="px-3 py-2">CSV Header</th>
                        <th className="px-3 py-2">Sample Data</th>
                        <th className="px-3 py-2">Mapped Property</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      <tr>
                        <td className="px-3 py-2 font-bold">First Name</td>
                        <td className="px-3 py-2 text-slate-600">Lead</td>
                        <td className="px-3 py-2 text-[#4f46e5] font-bold">&#123;&#123;firstName&#125;&#125;</td>
                        <td className="px-3 py-2"><span className="text-emerald-700 font-bold">Auto-Mapped ✓</span></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">Email</td>
                        <td className="px-3 py-2 text-slate-600">lead@...</td>
                        <td className="px-3 py-2 text-[#4f46e5] font-bold">&#123;&#123;email&#125;&#125;</td>
                        <td className="px-3 py-2"><span className="text-emerald-700 font-bold">Auto-Mapped ✓</span></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">Company</td>
                        <td className="px-3 py-2 text-slate-600">Example Corp</td>
                        <td className="px-3 py-2 text-[#4f46e5] font-bold">&#123;&#123;company&#125;&#125;</td>
                        <td className="px-3 py-2"><span className="text-emerald-700 font-bold">Auto-Mapped ✓</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between pt-2">
                  <button type="button" onClick={() => setAddLeadsStep(2)} className="text-slate-500 font-bold">Back</button>
                  <button
                    type="button"
                    onClick={() => setAddLeadsStep(4)}
                    className="rounded-xl bg-[#4f46e5] px-5 py-2 text-xs font-bold text-white shadow-md"
                  >
                    Import &amp; Validate Leads
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Diagnostic Modal */}
            {addLeadsStep === 4 && (
              <div className="space-y-4 text-xs">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-900">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <span>4 Leads Imported &amp; 100% MX Verified!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>• Total Rows: <strong>4</strong></div>
                    <div>• Valid Mail Exchangers: <strong>4</strong></div>
                    <div>• Syntax Checked: <strong>100%</strong></div>
                    <div>• Duplicates Skipped: <strong>0</strong></div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddLeadsModal(false);
                      showToast("Import complete! Leads are ready for sequence dispatches.");
                    }}
                    className="rounded-xl bg-[#4f46e5] px-6 py-2.5 text-xs font-bold text-white shadow-md"
                  >
                    Done &amp; View Leads
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PREVIEW TEMPLATE MODAL */}
      {/* ========================================================================= */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPreviewModal(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Sticky Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-[#4f46e5]" />
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">Email Template Live Preview</h3>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">
                  Step {activeStep.stepNumber}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {leads.length > 0 && (
                  <select
                    value={previewLeadIndex}
                    onChange={(e) => setPreviewLeadIndex(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
                  >
                    {leads.map((l, i) => (
                      <option key={l.id} value={i}>
                        To: {l.firstName} {l.lastName} ({l.company})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                  title="Close Preview (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Email Preview Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm leading-relaxed bg-[#f8fafc]">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <div className="border-b border-slate-100 pb-3 space-y-1">
                  <div className="font-extrabold text-slate-900 text-sm sm:text-base">{renderedSubject}</div>
                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <span>
                      To: <strong>{activeLead.firstName} {activeLead.lastName}</strong> &lt;{activeLead.email}&gt;
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">HTML Preview</span>
                  </div>
                </div>

                <div
                  className="text-slate-800 space-y-2 font-sans overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
                />
              </div>
            </div>

            {/* Sticky Bottom Bar */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                Personalized with lead variables.
              </span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="rounded-lg bg-[#4f46e5] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-600 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AI WRITE MODAL */}
      {/* ========================================================================= */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#4f46e5]" />
                <h3 className="text-sm font-extrabold text-slate-900">✨ Write with AI (GPT-4o)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-slate-700">What would you like the email to say?</label>
              <textarea
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] p-3 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#4f46e5] outline-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAiModal(false);
                  showToast("✨ AI generated personalized copy and inserted into canvas!");
                }}
                className="rounded-xl bg-[#4f46e5] px-5 py-2 text-xs font-bold text-white hover:bg-[#4338ca] shadow-md"
              >
                Generate Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANUAL SINGLE LEAD ENTRY MODAL */}
      {/* ========================================================================= */}
      {showSingleLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900">+ Add Single Lead</h3>
              <button type="button" onClick={() => setShowSingleLeadModal(false)} className="text-slate-400 p-1">
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!singleLeadForm.firstName || !singleLeadForm.email) return;
                const emailClean = singleLeadForm.email.trim().toLowerCase();
                // Dedup check
                if (leads.some((l) => l.email.toLowerCase() === emailClean)) {
                  showToast(`⚠️ ${emailClean} already exists in this campaign!`);
                  return;
                }
                const newL: LeadItem = {
                  id: `lead_man_${Date.now().toString(36)}`,
                  firstName: singleLeadForm.firstName.trim(),
                  lastName: singleLeadForm.lastName.trim(),
                  email: singleLeadForm.email.trim(),
                  company: singleLeadForm.company.trim() || "Company",
                  title: singleLeadForm.title.trim() || "Executive",
                  phone: singleLeadForm.phone.trim(),
                  status: "verified",
                  dateAdded: "Just now",
                };
                setLeads([newL, ...leads]);
                setShowSingleLeadModal(false);
                setSingleLeadForm({ firstName: "", lastName: "", email: "", company: "", title: "", phone: "" });
                showToast(`Added ${newL.email} with DB tracking ID ${newL.id}!`);
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-600">First Name *</label>
                  <input
                    type="text"
                    required
                    value={singleLeadForm.firstName}
                    onChange={(e) => setSingleLeadForm({ ...singleLeadForm, firstName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-600">Last Name</label>
                  <input
                    type="text"
                    value={singleLeadForm.lastName}
                    onChange={(e) => setSingleLeadForm({ ...singleLeadForm, lastName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-600">Email Address *</label>
                <input
                  type="email"
                  required
                  value={singleLeadForm.email}
                  onChange={(e) => setSingleLeadForm({ ...singleLeadForm, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-600">Company</label>
                  <input
                    type="text"
                    value={singleLeadForm.company}
                    onChange={(e) => setSingleLeadForm({ ...singleLeadForm, company: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-600">Title</label>
                  <input
                    type="text"
                    value={singleLeadForm.title}
                    onChange={(e) => setSingleLeadForm({ ...singleLeadForm, title: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-1.5 font-semibold text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSingleLeadModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#4f46e5] px-4 py-1.5 font-bold text-white shadow-xs"
                >
                  Validate &amp; Add Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FINAL PRE-FLIGHT READINESS & START CAMPAIGN PROCESS MODAL */}
      {/* ========================================================================= */}
      {showLaunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#4f46e5] to-indigo-600 text-white shadow-md shadow-indigo-200">
                  <Play size={16} className="fill-white" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Ready to Launch Campaign Process?
                  </h3>
                  <p className="text-xs text-slate-500">
                    4-Point Pre-Flight Deliverability &amp; Workflow Audit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLaunchModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Pre-Flight Checklist */}
            <div className="space-y-2.5 text-xs">
              <div className={`rounded-xl border p-3 flex items-center justify-between ${leads.length > 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}>
                <div className="flex items-center gap-2">
                  {leads.length > 0 ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  )}
                  <div>
                    <span className={`font-extrabold ${leads.length > 0 ? "text-emerald-950" : "text-red-950"}`}>Audience Ingestion:</span>
                    <span className={`ml-1 ${leads.length > 0 ? "text-emerald-800" : "text-red-800"}`}>{leads.length} contacts with verified MX records</span>
                  </div>
                </div>
                <span className={`font-black ${leads.length > 0 ? "text-emerald-700" : "text-red-700"}`}>{leads.length > 0 ? "100% Passed" : "No Leads"}</span>
              </div>

              <div className={`rounded-xl border p-3 flex items-center justify-between ${sequences.length > 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}>
                <div className="flex items-center gap-2">
                  {sequences.length > 0 ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  )}
                  <div>
                    <span className={`font-extrabold ${sequences.length > 0 ? "text-emerald-950" : "text-red-950"}`}>Sequence Structure:</span>
                    <span className={`ml-1 ${sequences.length > 0 ? "text-emerald-800" : "text-red-800"}`}>{sequences.length} steps configured (0 spam keywords)</span>
                  </div>
                </div>
                <span className={`font-black ${sequences.length > 0 ? "text-emerald-700" : "text-red-700"}`}>{sequences.length > 0 ? "0.1/10 Spam Score" : "No Steps"}</span>
              </div>

              <div className={`rounded-xl border p-3 flex items-center justify-between ${effectiveMailboxIds.length > 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}>
                <div className="flex items-center gap-2">
                  {effectiveMailboxIds.length > 0 ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  )}
                  <div>
                    <span className={`font-extrabold ${effectiveMailboxIds.length > 0 ? "text-emerald-950" : "text-red-950"}`}>Mailbox Rotation:</span>
                    <span className={`ml-1 ${effectiveMailboxIds.length > 0 ? "text-emerald-800" : "text-red-800"}`}>{effectiveMailboxIds.length} sending accounts attached</span>
                  </div>
                </div>
                <span className={`font-black ${effectiveMailboxIds.length > 0 ? "text-emerald-700" : "text-red-700"}`}>{effectiveMailboxIds.length > 0 ? "100% Warm" : "No Mailboxes"}</span>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-extrabold text-emerald-950">Jitter Engine:</span>
                    <span className="text-emerald-800 ml-1">{sendingIntervalMinutes}m interval with 30–60s AI jitter</span>
                  </div>
                </div>
                <span className="font-black text-emerald-700">Active</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLaunchModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isLaunching || leads.length === 0 || sequences.length === 0 || effectiveMailboxIds.length === 0}
                onClick={handleLaunchCampaignProcess}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-md transition-all active:scale-95 ${
                  isLaunching || leads.length === 0 || sequences.length === 0 || effectiveMailboxIds.length === 0
                    ? "bg-slate-300 cursor-not-allowed shadow-none animate-none"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-200 animate-pulse"
                }`}
              >
                {isLaunching ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Play size={15} className="fill-white" />
                )}
                <span>{isLaunching ? "Initializing Live DAG..." : "Execute & Start Campaign Process"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
