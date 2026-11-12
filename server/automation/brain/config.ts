import * as fs from 'fs';
import * as path from 'path';

export interface BrainConfigFlags {
  BRAIN_DB_TARGET: 'replica3' | 'primary';
  BRAIN_ENABLED: boolean;
  RESEARCH_ENABLED: boolean;
  PLAYBOOK_RETRIEVAL_ENABLED: boolean;
  PLANNER_ENABLED: boolean;
  VALIDATOR_ENABLED: boolean;
  VALIDATOR_STRICT: boolean;
  ROUTER_ENABLED: boolean;
  SMARTLEAD_AUTO_SEND: boolean;
  LEARNING_LOOP_ENABLED: boolean;
}

export function getBrainFlags(): BrainConfigFlags {
  const bool = (key: string, defaultVal = false): boolean => {
    const raw = process.env[key];
    if (!raw) return defaultVal;
    return raw.trim().toLowerCase() === 'true' || raw.trim() === '1';
  };

  const targetRaw = (process.env.BRAIN_DB_TARGET || 'replica3').trim().toLowerCase();
  const BRAIN_DB_TARGET = targetRaw === 'primary' ? 'primary' : 'replica3';

  return {
    BRAIN_DB_TARGET,
    BRAIN_ENABLED: bool('BRAIN_ENABLED', false),
    RESEARCH_ENABLED: bool('RESEARCH_ENABLED', false),
    PLAYBOOK_RETRIEVAL_ENABLED: bool('PLAYBOOK_RETRIEVAL_ENABLED', false),
    PLANNER_ENABLED: bool('PLANNER_ENABLED', false),
    VALIDATOR_ENABLED: bool('VALIDATOR_ENABLED', false),
    VALIDATOR_STRICT: bool('VALIDATOR_STRICT', false),
    ROUTER_ENABLED: bool('ROUTER_ENABLED', false),
    SMARTLEAD_AUTO_SEND: bool('SMARTLEAD_AUTO_SEND', false),
    LEARNING_LOOP_ENABLED: bool('LEARNING_LOOP_ENABLED', false),
  };
}

/**
 * Fix #5: Single-source SQL predicate for B2B Brand Workspace isolation (`team_tbm_main`).
 * Excludes:
 * 1. Troops campaigns or leads owned by `usr_troops_*`
 * 2. Leads enrolled in any CreatorCampaign (`CreatorCampaignEnrollment`)
 * 3. Leads carrying creator-intake customData keys (`creatorHandle`, `instagramFollowers`, `youtubeSubscribers`, `troopId`, `creatorType`)
 */
export function workspaceBrandLeadSql(leadAlias = 'l'): string {
  return `(
    (${leadAlias}."campaignId" IS NULL OR ${leadAlias}."campaignId" NOT IN (
      SELECT c.id FROM "Campaign" c WHERE c."userId" LIKE 'usr_troops_%'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM "CreatorCampaignEnrollment" cce
      WHERE LOWER(cce.email) = LOWER(${leadAlias}.email)
    )
    AND NOT (
      COALESCE(${leadAlias}."customData", '{}'::jsonb) ?| ARRAY[
        'creatorHandle',
        'instagramFollowers',
        'youtubeSubscribers',
        'troopId',
        'creatorType'
      ]
    )
  )`;
}

/**
 * Fix #5: Single-source TypeScript predicate matching `workspaceBrandLeadSql` exactly.
 */
export function isWorkspaceBrandLead(lead: {
  email?: string | null;
  campaignId?: string | null;
  campaignOwnerId?: string | null;
  isCreatorEnrolled?: boolean;
  customData?: Record<string, unknown> | null;
}): boolean {
  if (lead.campaignOwnerId && lead.campaignOwnerId.startsWith('usr_troops_')) {
    return false;
  }
  if (lead.isCreatorEnrolled) {
    return false;
  }
  const emailLower = (lead.email || '').toLowerCase();
  if (emailLower.endsWith('@tbmtroop.com')) {
    return false;
  }
  const cd = lead.customData || {};
  const creatorKeys = [
    'creatorHandle',
    'instagramFollowers',
    'youtubeSubscribers',
    'troopId',
    'creatorType',
  ];
  for (const k of creatorKeys) {
    if (Object.prototype.hasOwnProperty.call(cd, k) && cd[k] !== null && cd[k] !== undefined && cd[k] !== '') {
      return false;
    }
  }
  return true;
}

function resolveDataFile(filename: string): string {
  return path.resolve(process.cwd(), 'data', filename);
}

let cachedEnterpriseDomains: Set<string> | null = null;
export function loadEnterpriseDomains(): Set<string> {
  if (cachedEnterpriseDomains) return cachedEnterpriseDomains;
  try {
    const raw = fs.readFileSync(resolveDataFile('enterprise_domains.json'), 'utf8');
    const parsed = JSON.parse(raw) as { domains?: string[] };
    cachedEnterpriseDomains = new Set((parsed.domains || []).map((d) => d.toLowerCase().trim()));
  } catch {
    cachedEnterpriseDomains = new Set();
  }
  return cachedEnterpriseDomains;
}

let cachedBannedPhrases: string[] | null = null;
export function loadBannedPhrases(): string[] {
  if (cachedBannedPhrases) return cachedBannedPhrases;
  try {
    const raw = fs.readFileSync(resolveDataFile('banned_phrases.json'), 'utf8');
    const parsed = JSON.parse(raw) as { bannedPhrases?: string[] };
    cachedBannedPhrases = (parsed.bannedPhrases || []).map((p) => p.toLowerCase().trim());
  } catch {
    cachedBannedPhrases = [];
  }
  return cachedBannedPhrases;
}

let cachedBrandAcronyms: Set<string> | null = null;
export function loadBrandAcronyms(): Set<string> {
  if (cachedBrandAcronyms) return cachedBrandAcronyms;
  try {
    const raw = fs.readFileSync(resolveDataFile('brand_acronyms.json'), 'utf8');
    const parsed = JSON.parse(raw) as { acronyms?: string[] };
    cachedBrandAcronyms = new Set((parsed.acronyms || []).map((a) => a.trim()));
  } catch {
    cachedBrandAcronyms = new Set();
  }
  return cachedBrandAcronyms;
}

let cachedSanctionedLinks: { allowedDomains: Set<string>; sanctionedLinks: Set<string> } | null = null;
export function loadSanctionedLinks(): { allowedDomains: Set<string>; sanctionedLinks: Set<string> } {
  if (cachedSanctionedLinks) return cachedSanctionedLinks;
  try {
    const raw = fs.readFileSync(resolveDataFile('sanctioned_links.json'), 'utf8');
    const parsed = JSON.parse(raw) as { allowedDomains?: string[]; sanctionedLinks?: string[] };
    cachedSanctionedLinks = {
      allowedDomains: new Set((parsed.allowedDomains || []).map((d) => d.toLowerCase().trim())),
      sanctionedLinks: new Set((parsed.sanctionedLinks || []).map((u) => u.trim())),
    };
  } catch {
    cachedSanctionedLinks = {
      allowedDomains: new Set(['theboredmonkey.in', 'www.theboredmonkey.in']),
      sanctionedLinks: new Set(['https://theboredmonkey.in']),
    };
  }
  return cachedSanctionedLinks;
}

export interface CategoryRule {
  pattern: string;
  value: string;
  exact?: boolean;
}

export interface DesignationRule {
  pattern: string;
  value: 'FOUNDER_CEO' | 'CMO_MARKETING_HEAD' | 'BRAND_MANAGER' | 'PERFORMANCE_MARKETING_MANAGER';
  exact?: boolean;
}

let cachedCategoryRules: { rules: CategoryRule[]; fallbackCategoryKey: string } | null = null;
export function loadCategoryMap(): { rules: CategoryRule[]; fallbackCategoryKey: string } {
  if (cachedCategoryRules) return cachedCategoryRules;
  const raw = fs.readFileSync(resolveDataFile('categories.map.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const rules: CategoryRule[] = Array.isArray(parsed) ? parsed : parsed.rules || [];
  cachedCategoryRules = {
    rules,
    fallbackCategoryKey: 'general_b2c',
  };
  return cachedCategoryRules;
}

let cachedDesignationRules: { rules: DesignationRule[]; fallbackDesignation: null } | null = null;
export function loadDesignationMap(): { rules: DesignationRule[]; fallbackDesignation: null } {
  if (cachedDesignationRules) return cachedDesignationRules;
  const raw = fs.readFileSync(resolveDataFile('designations.map.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const rules: DesignationRule[] = Array.isArray(parsed) ? parsed : parsed.rules || [];
  cachedDesignationRules = {
    rules,
    fallbackDesignation: null,
  };
  return cachedDesignationRules;
}
