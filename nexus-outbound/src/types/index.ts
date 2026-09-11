import type { Role, LeadStatus, LeadCategory, Sentiment, CampaignStatus, MailboxStatus, DraftStatus } from "@prisma/client";

// ─────────────────────────────────────────────
// Session types
// ─────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: Role;
}

// ─────────────────────────────────────────────
// API request/response types
// ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─────────────────────────────────────────────
// Campaign types
// ─────────────────────────────────────────────

export interface CampaignCreateInput {
  name: string;
  mailboxIds: string[];
  sendTimezone?: string;
  preferredSendHour?: number;
  preferredSendDays?: number[];
  steps: CampaignStepInput[];
}

export interface CampaignStepInput {
  stepNumber: number;
  delayDays: number;
  subject: string;
  bodyTemplate: string;
  abVariantOf?: string;
  abSplitPct?: number;
}

// ─────────────────────────────────────────────
// Lead types
// ─────────────────────────────────────────────

export interface LeadImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedSuppressed: number;
  errors: string[];
}

export interface CsvColumnMapping {
  csvColumn: string;
  leadField: "email" | "firstName" | "lastName" | "timezone" | "custom";
}

export interface CsvPreviewRow {
  [columnName: string]: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  category?: LeadCategory;
  sentiment?: Sentiment;
  search?: string;
}

export interface BulkUpdateInput {
  leadIds: string[];
  category?: LeadCategory;
  status?: LeadStatus;
}

// ─────────────────────────────────────────────
// Analytics types
// ─────────────────────────────────────────────

export interface OverviewStats {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  sentimentBreakdown: {
    interested: number;
    notInterested: number;
    wrongPerson: number;
  };
}

export interface TimeSeriesDataPoint {
  date: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}

export interface LeadCategoryDistribution {
  category: LeadCategory;
  count: number;
  percentage: number;
}

export interface OpenTimeDistribution {
  hour: number;
  day: number; // 0=Sun, 6=Sat
  count: number;
}

// ─────────────────────────────────────────────
// Navigation types
// ─────────────────────────────────────────────

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: Role[];
  badge?: string;
}

// ─────────────────────────────────────────────
// Webhook types
// ─────────────────────────────────────────────

export interface WebhookPayload {
  event_type: string;
  provider_event_id: string;
  campaign_id?: string;
  lead_id?: string;
  email?: string;
  reply_text?: string;
  bounce_type?: "soft" | "hard";
  timestamp: string;
  raw: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// Email provider types
// ─────────────────────────────────────────────

export interface EmailProviderCampaignInput {
  name: string;
  sequences: Array<{
    subject: string;
    body: string;
    delayDays: number;
  }>;
  mailboxIds: string[];
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    unsubscribeLink?: string;
  }>;
}

export interface EmailProviderCampaignResult {
  providerCampaignId: string;
  leadProviderIds: Record<string, string>; // email -> providerLeadId
}
