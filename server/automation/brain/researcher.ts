import * as crypto from 'crypto';
import { db } from '../../db';
import { logProviderUsage } from './usage';

export interface ResearchSignal {
  type: 'HERO_PRODUCT' | 'RECENT_NEWS' | 'AD_CAMPAIGN' | 'REGIONAL_PRESENCE' | 'VALUE_PROP' | 'HIRING_SIGNAL';
  claim: string; // Hard limit: ≤200 characters per Non-Negotiable Principle 7
  confidence: number; // 0.0 to 1.0
  sourceUrl?: string;
}

export interface BrandResearchResult {
  brandId: string;
  domain: string;
  companyName: string;
  categoryKey?: string;
  signals: ResearchSignal[];
  summary: string;
  status: 'OK' | 'THIN_CONTENT' | 'FAILED';
  cached: boolean;
}

export interface LeadResearchResult {
  leadId: string;
  email: string;
  designation?: string;
  signals: ResearchSignal[];
  summary: string;
  cached: boolean;
}

function stripHtmlToCleanText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaTags(html: string): { title: string; description: string; ogDescription: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);

  return {
    title: (titleMatch ? titleMatch[1] : '').trim(),
    description: (descMatch ? descMatch[1] : '').trim(),
    ogDescription: (ogDescMatch ? ogDescMatch[1] : '').trim(),
  };
}

function sanitizeClaim(raw: string, maxLen = 200): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

/**
 * Fast direct HTTP scrape with 3.0 second timeout (Principle 5 / Section 4.1).
 */
async function directHttpScrape(domain: string): Promise<{ text: string; meta: any; statusCode: number } | null> {
  const url = `https://${domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const meta = extractMetaTags(html);
    const cleanText = stripHtmlToCleanText(html);

    return {
      text: cleanText.slice(0, 15000),
      meta,
      statusCode: res.status,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Firecrawl fallback if direct scrape times out or returns thin content.
 */
async function firecrawlScrape(domain: string): Promise<{ markdown: string; metadata: any } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  const url = `https://${domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`;
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 1000,
      }),
    });

    const json = (await res.json()) as any;
    await logProviderUsage({
      kind: 'RESEARCH',
      provider: 'FIRECRAWL',
      costUsd: 0.001,
      units: 1,
      metadata: { domain, url },
    });

    if (!res.ok || !json.success) return null;
    return {
      markdown: json.data?.markdown || '',
      metadata: json.data?.metadata || {},
    };
  } catch (err: any) {
    return null;
  }
}

function extractSignalsFromText(domain: string, text: string, meta: any): ResearchSignal[] {
  const signals: ResearchSignal[] = [];

  const metaDesc = meta.description || meta.ogDescription;
  if (metaDesc && metaDesc.length > 15) {
    signals.push({
      type: 'VALUE_PROP',
      claim: sanitizeClaim(metaDesc),
      confidence: 0.9,
      sourceUrl: `https://${domain}`,
    });
  }

  const productMatches = text.match(/(?:our products|best sellers|introducing|flagship|range of)\s+([^.?!]{10,120})/i);
  if (productMatches && productMatches[1]) {
    signals.push({
      type: 'HERO_PRODUCT',
      claim: sanitizeClaim(`Hero offerings: ${productMatches[1].trim()}`),
      confidence: 0.8,
      sourceUrl: `https://${domain}`,
    });
  }

  const regionalMatch = text.match(/(?:across india|stores across|available in|pan india|chennai|bengaluru|mumbai|delhi|hyderabad)\s+([^.?!]{10,120})/i);
  if (regionalMatch && regionalMatch[0]) {
    signals.push({
      type: 'REGIONAL_PRESENCE',
      claim: sanitizeClaim(`Retail and regional footprint: ${regionalMatch[0].trim()}`),
      confidence: 0.75,
      sourceUrl: `https://${domain}`,
    });
  }

  if (signals.length === 0 && meta.title) {
    signals.push({
      type: 'VALUE_PROP',
      claim: sanitizeClaim(`Brand positioning: ${meta.title}`),
      confidence: 0.7,
      sourceUrl: `https://${domain}`,
    });
  }

  return signals;
}

/**
 * Main research entry point for a Brand.
 * Matches exact schema of BrandResearch table (brandId, categoryKey, signals, summary, status, expiresAt).
 */
export async function researchBrand(brandId: string): Promise<BrandResearchResult> {
  // 1. Check existing cached research
  const cachedRes = await db.query(
    `
    SELECT "brandId", "categoryKey", signals, summary, status, "expiresAt"
    FROM "BrandResearch"
    WHERE "brandId" = $1 AND "expiresAt" > NOW()
    LIMIT 1
    `,
    [brandId]
  );

  // Fetch Brand details
  const brandRow = await db.query(
    `SELECT id, LOWER(domain) as domain, name, "categoryKey" FROM "Brand" WHERE id = $1`,
    [brandId]
  );
  if (brandRow.rows.length === 0) {
    throw new Error(`Brand with id ${brandId} not found`);
  }
  const { domain, name: companyName, categoryKey: brandCat } = brandRow.rows[0];

  if (cachedRes.rows.length > 0) {
    const r = cachedRes.rows[0];
    return {
      brandId: r.brandId,
      domain: domain || '',
      companyName: companyName || '',
      categoryKey: r.categoryKey || brandCat,
      signals: (r.signals as ResearchSignal[]) || [],
      summary: r.summary || '',
      status: (r.status as any) || 'OK',
      cached: true,
    };
  }

  let signals: ResearchSignal[] = [];
  let status: 'OK' | 'THIN_CONTENT' | 'FAILED' = 'OK';
  let summary = `${companyName} (${domain}) operating in ${brandCat || 'consumer products'}.`;

  if (domain && !domain.includes('gmail.') && !domain.includes('yahoo.')) {
    const direct = await directHttpScrape(domain);
    if (direct && direct.text.length > 200) {
      signals = extractSignalsFromText(domain, direct.text, direct.meta);
    } else {
      const firecrawl = await firecrawlScrape(domain);
      if (firecrawl && firecrawl.markdown.length > 100) {
        signals = extractSignalsFromText(domain, firecrawl.markdown, firecrawl.metadata);
      } else {
        status = 'THIN_CONTENT';
      }
    }
  }

  if (signals.length > 0) {
    summary = signals.map((s) => s.claim).join(' ');
  }

  const id = `br_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await db.query(
    `
    INSERT INTO "BrandResearch" (
      id, "brandId", "categoryKey", signals, summary, status, "expiresAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
    ON CONFLICT ("brandId") DO UPDATE SET
      "categoryKey" = EXCLUDED."categoryKey",
      signals = EXCLUDED.signals,
      summary = EXCLUDED.summary,
      status = EXCLUDED.status,
      "expiresAt" = NOW() + INTERVAL '30 days'
    `,
    [id, brandId, brandCat || null, JSON.stringify(signals), summary, status]
  );

  return {
    brandId,
    domain: domain || '',
    companyName: companyName || '',
    categoryKey: brandCat,
    signals,
    summary,
    status,
    cached: false,
  };
}

/**
 * Main research entry point for a Lead.
 * Reads directly from Lead table's structured fields.
 */
export async function researchLead(leadId: string): Promise<LeadResearchResult> {
  const leadRes = await db.query(
    `SELECT id, email, designation, "designationRaw", "customData" FROM "Lead" WHERE id = $1`,
    [leadId]
  );
  if (leadRes.rows.length === 0) {
    throw new Error(`Lead with id ${leadId} not found`);
  }

  const lead = leadRes.rows[0];
  const cd = lead.customData || {};
  const signals: ResearchSignal[] = [];

  const rawTitle = lead.designationRaw || cd.title || cd.role || cd.designation || '';
  if (rawTitle) {
    signals.push({
      type: 'HIRING_SIGNAL',
      claim: sanitizeClaim(`Seniority profile: ${rawTitle}`),
      confidence: 0.95,
    });
  }

  const summary = `Lead ${lead.email} serves as ${lead.designation || rawTitle || 'decision maker'}.`;

  return {
    leadId,
    email: lead.email,
    designation: lead.designation || undefined,
    signals,
    summary,
    cached: false,
  };
}
