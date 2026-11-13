import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { db } from './db';

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

export interface ApolloSearchParams {
  q_keywords?: string;
  person_titles?: string[];
  person_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_organization_domains?: string;
  q_organization_name?: string;
  q_organization_keyword_tags?: string[];
  organization_industry_tag_ids?: string[];
  categoryKey?: string;
  contact_email_status?: string[];
  page?: number;
  per_page?: number;
  autoVerifyAndStore?: boolean;
}

export interface ApolloPersonSearchResult {
  id: string;
  first_name: string;
  last_name_obfuscated?: string;
  title?: string;
  has_email: boolean;
  has_direct_phone?: string;
  has_city?: boolean;
  has_state?: boolean;
  has_country?: boolean;
  alreadyInDb?: boolean;
  justAutoStored?: boolean;
  status?: string;
  last_contacted_at?: string;
  last_outcome?: string;
  outreach_state?: string;
  reply_classification?: string;
  days_since_last_contact?: number | null;
  organization?: {
    name?: string;
    has_industry?: boolean;
    has_phone?: boolean;
    has_city?: boolean;
    has_country?: boolean;
    has_revenue?: boolean;
    has_employee_count?: boolean;
  };
}

// Load category mapping rules
let categoryMap: Array<{ pattern: string; value: string; exact?: boolean }> = [];
try {
  const mapPath = path.resolve(process.cwd(), 'data/categories.map.json');
  if (fs.existsSync(mapPath)) {
    categoryMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
} catch (e) {
  console.warn('[ApolloService] Warning: Could not load categories.map.json', e);
}

export const CATEGORY_TAG_PRESETS: Record<string, string[]> = {
  fashion_apparel: ['fashion', 'apparel', 'clothing', 'footwear', 'streetwear', 'luxury'],
  food_beverages: ['food', 'beverages', 'fmcg', 'packaged goods', 'snacks', 'nutrition', 'dairy'],
  beauty_personal_care: ['beauty', 'cosmetics', 'skincare', 'personal care', 'haircare', 'wellness'],
  consumer_tech: ['electronics', 'consumer tech', 'appliances', 'hardware', 'gadgets', 'audio'],
  ecommerce_retail: ['ecommerce', 'd2c', 'direct-to-consumer', 'retail', 'online shopping'],
  fitness_wellness: ['fitness', 'wellness', 'gym', 'activewear', 'health', 'sports'],
  healthcare_pharma: ['healthcare', 'pharma', 'pharmaceuticals', 'biotech', 'medical devices'],
  jewelry_accessories: ['jewelry', 'jewellery', 'luxury', 'accessories', 'watches'],
  luggage_travel: ['travel', 'luggage', 'hospitality', 'tourism', 'hotels'],
  fintech_saas: ['saas', 'software', 'fintech', 'technology', 'b2b'],
  automotive_ev: ['automotive', 'ev', 'electric vehicles', 'mobility'],
};

export const KNOWN_INDUSTRY_WORDS = new Set([
  'fashion', 'apparel', 'clothing', 'clothes', 'footwear', 'shoes', 'streetwear', 'textile', 'textiles',
  'food', 'foods', 'beverage', 'beverages', 'drink', 'drinks', 'fmcg', 'snack', 'snacks', 'nutrition', 'dairy',
  'beauty', 'cosmetic', 'cosmetics', 'skincare', 'haircare', 'makeup', 'personal care',
  'tech', 'electronics', 'gadget', 'gadgets', 'appliances', 'consumer tech', 'hardware',
  'ecommerce', 'e-commerce', 'retail', 'd2c', 'shopping', 'store',
  'fitness', 'wellness', 'gym', 'activewear', 'health',
  'pharma', 'pharmaceutical', 'pharmaceuticals', 'healthcare', 'biotech', 'medical',
  'jewelry', 'jewellery', 'luxury', 'accessories', 'watches', 'watch',
  'travel', 'luggage', 'hospitality', 'hotel', 'hotels', 'tourism',
  'saas', 'software', 'fintech', 'b2b', 'crypto', 'edtech',
  'automotive', 'auto', 'ev', 'electric vehicle', 'mobility',
]);

export const APOLLO_INDUSTRY_TAG_IDS: Record<string, string[]> = {
  food_beverages: ['5567ce1e7369643b806a0000', '5567e8a27369646ddb0b0000'], // Food & Beverages + Dairy
  fashion_apparel: ['5567cd82736964540d0b0000'], // Apparel & Fashion
  ecommerce_retail: ['5567ced173696450cb580000'], // Retail
  fintech_saas: ['5567cd4773696439b10b0000'], // Information Technology & Services
};

export const ENTERPRISE_COMPANY_MAP: Record<string, { domain: string; canonicalName: string; aliases: string[] }> = {
  'procter & gamble': { domain: 'pg.com', canonicalName: 'Procter & Gamble', aliases: ['procter & gamble', 'p&g', 'pg', 'procter and gamble'] },
  'procter and gamble': { domain: 'pg.com', canonicalName: 'Procter & Gamble', aliases: ['procter & gamble', 'p&g', 'pg', 'procter and gamble'] },
  'p&g': { domain: 'pg.com', canonicalName: 'Procter & Gamble', aliases: ['procter & gamble', 'p&g', 'pg', 'procter and gamble'] },
  'pg': { domain: 'pg.com', canonicalName: 'Procter & Gamble', aliases: ['procter & gamble', 'p&g', 'pg', 'procter and gamble'] },
  'unilever': { domain: 'unilever.com', canonicalName: 'Unilever', aliases: ['unilever', 'hul', 'hindustan unilever'] },
  'hindustan unilever': { domain: 'hul.co.in', canonicalName: 'Hindustan Unilever', aliases: ['hindustan unilever', 'hul', 'unilever'] },
  'hul': { domain: 'hul.co.in', canonicalName: 'Hindustan Unilever', aliases: ['hindustan unilever', 'hul', 'unilever'] },
  'itc': { domain: 'itcportal.com', canonicalName: 'ITC', aliases: ['itc', 'itc limited'] },
  'itc limited': { domain: 'itcportal.com', canonicalName: 'ITC Limited', aliases: ['itc', 'itc limited'] },
  'nestle': { domain: 'nestle.com', canonicalName: 'Nestle', aliases: ['nestle'] },
  'pepsi': { domain: 'pepsico.com', canonicalName: 'PepsiCo', aliases: ['pepsi', 'pepsico'] },
  'pepsico': { domain: 'pepsico.com', canonicalName: 'PepsiCo', aliases: ['pepsico', 'pepsi'] },
  'coca cola': { domain: 'coca-cola.com', canonicalName: 'The Coca-Cola Company', aliases: ['coca cola', 'coca-cola', 'coke'] },
  'coke': { domain: 'coca-cola.com', canonicalName: 'The Coca-Cola Company', aliases: ['coca cola', 'coca-cola', 'coke'] },
  'mondelez': { domain: 'mondelezinternational.com', canonicalName: 'Mondelez International', aliases: ['mondelez', 'cadbury'] },
  'cadbury': { domain: 'mondelezinternational.com', canonicalName: 'Cadbury', aliases: ['cadbury', 'mondelez'] },
  'loreal': { domain: 'loreal.com', canonicalName: "L'Oreal", aliases: ['loreal', "l'oreal"] },
  "l'oreal": { domain: 'loreal.com', canonicalName: "L'Oreal", aliases: ['loreal', "l'oreal"] },
  'johnson & johnson': { domain: 'jnj.com', canonicalName: 'Johnson & Johnson', aliases: ['johnson & johnson', 'j&j', 'jnj'] },
  'j&j': { domain: 'jnj.com', canonicalName: 'Johnson & Johnson', aliases: ['johnson & johnson', 'j&j', 'jnj'] },
};

export function resolveFuzzyQuery(raw: string): {
  type: 'domain' | 'industry_category' | 'company_name';
  domain?: string;
  industryTagIds?: string[];
  keywordTags?: string[];
  companyName?: string;
  matchedCategory?: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return { type: 'domain', domain: trimmed };
  }

  const normKey = trimmed.toLowerCase();
  if (ENTERPRISE_COMPANY_MAP[normKey]) {
    const entry = ENTERPRISE_COMPANY_MAP[normKey];
    return {
      type: 'company_name',
      companyName: entry.canonicalName,
      domain: entry.domain,
    };
  }

  const tokens = trimmed.toLowerCase().split(/[\s,&+/]+/).filter(Boolean);
  const hasIndustry = tokens.some((t) => KNOWN_INDUSTRY_WORDS.has(t));
  const catKey = mapIndustryToCategoryKey(trimmed);

  if (hasIndustry || (catKey && catKey !== 'general_b2c')) {
    const tags = new Set<string>(tokens);
    let industryTagIds: string[] = [];
    if (catKey) {
      if (APOLLO_INDUSTRY_TAG_IDS[catKey]) {
        industryTagIds = APOLLO_INDUSTRY_TAG_IDS[catKey];
      }
      if (CATEGORY_TAG_PRESETS[catKey]) {
        for (const t of CATEGORY_TAG_PRESETS[catKey]) tags.add(t);
      }
    }
    return {
      type: 'industry_category',
      matchedCategory: catKey,
      industryTagIds: industryTagIds.length > 0 ? industryTagIds : undefined,
      keywordTags: Array.from(tags),
    };
  }

  return { type: 'company_name', companyName: trimmed };
}

export function mapIndustryToCategoryKey(industryText?: string | null): string {
  if (!industryText) return 'general_b2c';
  const norm = industryText.trim().toLowerCase();
  for (const rule of categoryMap) {
    if (rule.exact) {
      if (norm === rule.pattern) return rule.value;
    } else {
      if (norm.includes(rule.pattern)) return rule.value;
    }
  }
  return 'general_b2c';
}

function getApolloApiKey(): string {
  if (process.env.APOLLO_API_KEY?.trim()) return process.env.APOLLO_API_KEY.trim();

  const envFiles = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const f of envFiles) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('APOLLO_API_KEY=')) {
          const val = trimmed.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim();
          if (val) return val;
        }
      }
    }
  }

  throw new Error('APOLLO_API_KEY is not configured in environment or .env file.');
}

/**
 * Search people in Apollo using the official mixed_people/api_search endpoint.
 */
export async function searchApolloPeople(params: ApolloSearchParams) {
  const apiKey = getApolloApiKey();
  const page = params.page || 1;
  const per_page = Math.min(params.per_page || 25, 100);

  const payload: any = {
    page,
    per_page,
    contact_email_status: params.contact_email_status || ['verified'],
  };

  if (params.q_keywords?.trim()) {
    payload.q_keywords = params.q_keywords.trim();
  }
  if (params.person_titles && params.person_titles.length > 0) {
    payload.person_titles = params.person_titles;
  }
  if (params.person_locations && params.person_locations.length > 0) {
    payload.person_locations = params.person_locations;
  }
  if (params.organization_num_employees_ranges && params.organization_num_employees_ranges.length > 0) {
    payload.organization_num_employees_ranges = params.organization_num_employees_ranges;
  }
  if (params.q_organization_name?.trim()) {
    payload.q_organization_name = params.q_organization_name.trim();
  }
  let fuzzyResolution: ReturnType<typeof resolveFuzzyQuery> | null = null;
  if (params.q_organization_domains?.trim()) {
    fuzzyResolution = resolveFuzzyQuery(params.q_organization_domains.trim());
    if (fuzzyResolution.type === 'domain') {
      payload.q_organization_domains = fuzzyResolution.domain;
    } else if (fuzzyResolution.type === 'industry_category') {
      if (fuzzyResolution.industryTagIds && fuzzyResolution.industryTagIds.length > 0) {
        payload.organization_industry_tag_ids = fuzzyResolution.industryTagIds;
      } else {
        payload.q_organization_keyword_tags = fuzzyResolution.keywordTags;
      }
    } else {
      if (fuzzyResolution.domain) {
        payload.q_organization_domains = fuzzyResolution.domain;
      } else {
        payload.q_organization_name = fuzzyResolution.companyName;
      }
    }
  }

  // Handle explicitly provided Industry Tag IDs
  if (params.organization_industry_tag_ids && params.organization_industry_tag_ids.length > 0) {
    payload.organization_industry_tag_ids = params.organization_industry_tag_ids;
  } else if (params.categoryKey && APOLLO_INDUSTRY_TAG_IDS[params.categoryKey]) {
    payload.organization_industry_tag_ids = APOLLO_INDUSTRY_TAG_IDS[params.categoryKey];
  }

  // Handle explicitly provided Industry Category & Keyword Tags
  const allKeywordTags = new Set<string>(payload.q_organization_keyword_tags || []);
  if (params.categoryKey && CATEGORY_TAG_PRESETS[params.categoryKey]) {
    for (const t of CATEGORY_TAG_PRESETS[params.categoryKey]) {
      allKeywordTags.add(t.toLowerCase().trim());
    }
  }
  if (Array.isArray(params.q_organization_keyword_tags)) {
    for (const t of params.q_organization_keyword_tags) {
      if (t && typeof t === 'string' && t.trim()) {
        allKeywordTags.add(t.toLowerCase().trim());
      }
    }
  }
  if (allKeywordTags.size > 0) {
    payload.q_organization_keyword_tags = Array.from(allKeywordTags);
  }

  // Step 1: Query Local PostgreSQL Database FIRST (0 API Credits, <10ms)
  let localDbMatches: ApolloPersonSearchResult[] = [];
  const localMatchEmails = new Set<string>();
  const localMatchApolloIds = new Set<string>();

  if (page === 1) {
    try {
      const localConditions: string[] = [];
      const localValues: any[] = [];
      let pIdx = 1;

      if (params.q_organization_domains?.trim()) {
        const q = params.q_organization_domains.trim().toLowerCase();
        const aliasEntry = ENTERPRISE_COMPANY_MAP[q];
        if (aliasEntry) {
          localConditions.push(`(
            LOWER(b.domain) LIKE $${pIdx} 
            OR LOWER(b.name) LIKE $${pIdx + 1}
            OR LOWER(l.email) LIKE $${pIdx + 2}
            OR LOWER(l.domain) LIKE $${pIdx + 3}
          )`);
          localValues.push(`%${aliasEntry.domain}%`, `%${aliasEntry.canonicalName.toLowerCase()}%`, `%@${aliasEntry.domain}%`, `%${aliasEntry.domain}%`);
          pIdx += 4;
        } else if (q.includes('.') && !q.includes(' ')) {
          localConditions.push(`(LOWER(b.domain) LIKE $${pIdx} OR LOWER(l.email) LIKE $${pIdx + 1})`);
          localValues.push(`%${q}%`, `%@${q}%`);
          pIdx += 2;
        } else {
          const catKey = mapIndustryToCategoryKey(q);
          if (catKey && catKey !== 'general_b2c') {
            localConditions.push(`(b."categoryKey" = $${pIdx} OR LOWER(b.name) LIKE $${pIdx + 1})`);
            localValues.push(catKey, `%${q}%`);
            pIdx += 2;
          } else {
            const tokens = q.split(/[\s,&+/]+/).filter(Boolean);
            if (tokens.length > 1) {
              const tokenClauses = tokens.map((tk) => {
                localValues.push(`%${tk}%`);
                return `LOWER(b.name) LIKE $${pIdx++}`;
              });
              localConditions.push(`((${tokenClauses.join(' AND ')}) OR LOWER(b.domain) LIKE $${pIdx} OR LOWER(b.name) LIKE $${pIdx + 1})`);
              localValues.push(`%${tokens.join('')}%`, `%${q}%`);
              pIdx += 2;
            } else {
              localConditions.push(`(LOWER(b.name) LIKE $${pIdx} OR LOWER(b.domain) LIKE $${pIdx} OR LOWER(l.email) LIKE $${pIdx})`);
              localValues.push(`%${q}%`);
              pIdx++;
            }
          }
        }
      }

      if (params.person_titles && params.person_titles.length > 0) {
        const titleClauses = params.person_titles.map((t) => {
          const cleanT = t.trim().toLowerCase();
          localValues.push(`%${cleanT}%`);
          if (cleanT === 'cmo' || cleanT.includes('marketing')) {
            localValues.push('%marketing%');
            const c1 = `LOWER(l.designation) LIKE $${pIdx++}`;
            const c2 = `LOWER(l.designation) LIKE $${pIdx++}`;
            return `(${c1} OR ${c2})`;
          }
          return `LOWER(l.designation) LIKE $${pIdx++}`;
        });
        localConditions.push(`(${titleClauses.join(' OR ')})`);
      }

      if (localConditions.length > 0) {
        const localSql = `
          SELECT DISTINCT ON (LOWER(l.email))
                 l.id, l.email, l."firstName", l."lastName", l.designation,
                 b.name as brand_name, b.domain, b."categoryKey",
                 l.status, l."lastContactedAt", l."lastOutcome", l."outreachState",
                 l."replyClassification", l."daysSinceLastContact",
                 l."customData"->>'apolloId' as apollo_id,
                 l."customData"->>'city' as city,
                 l."customData"->>'country' as country,
                 l."customData"->>'phone' as phone
          FROM "Lead" l
          LEFT JOIN "Brand" b ON b.id = l."brandId"
          WHERE ${localConditions.join(' AND ')}
          ORDER BY LOWER(l.email), l."createdAt" DESC
          LIMIT 10
        `;
        const localRes = await db.query(localSql, localValues);
        for (const row of localRes.rows) {
          if (row.email) localMatchEmails.add(row.email.toLowerCase());
          if (row.apollo_id) localMatchApolloIds.add(row.apollo_id);

          localDbMatches.push({
            id: row.apollo_id || row.id,
            first_name: row.firstName || '',
            last_name_obfuscated: row.lastName || '',
            title: row.designation || undefined,
            has_email: Boolean(row.email),
            has_direct_phone: row.phone || undefined,
            alreadyInDb: true,
            status: row.status,
            last_contacted_at: row.lastContactedAt ? new Date(row.lastContactedAt).toISOString() : undefined,
            last_outcome: row.lastOutcome || undefined,
            outreach_state: row.outreachState || undefined,
            reply_classification: row.replyClassification || undefined,
            days_since_last_contact: row.daysSinceLastContact != null ? Number(row.daysSinceLastContact) : null,
            organization: {
              name: row.brand_name || row.domain,
              has_industry: Boolean(row.categoryKey),
              has_phone: true,
              has_city: Boolean(row.city),
              has_country: Boolean(row.country),
            },
          });
        }
      }
    } catch (err) {
      console.warn('[ApolloService] Local-first DB search warning:', err);
    }
  }

  // Step 2: Query Apollo Global Network
  let response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo Search Error (${response.status}): ${errorText}`);
  }

  let data: any = await response.json();
  let rawPeople = (data.people || []) as ApolloPersonSearchResult[];

  // Intelligent Fuzzy Fallback:
  // If company_name query returned 0, fallback to keyword tags
  if (rawPeople.length === 0 && fuzzyResolution?.type === 'company_name' && fuzzyResolution.companyName) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.q_organization_name;
    fallbackPayload.q_organization_keyword_tags = fuzzyResolution.companyName.toLowerCase().split(/[\s,]+/).filter(Boolean);
    try {
      const fbRes = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apiKey },
        body: JSON.stringify(fallbackPayload),
      });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if ((fbData.people || []).length > 0) {
          data = fbData;
          rawPeople = fbData.people as ApolloPersonSearchResult[];
        }
      }
    } catch (e) {
      console.warn('[ApolloService] Fuzzy fallback warning:', e);
    }
  }
  const apolloIds = rawPeople.map((p) => p.id).filter(Boolean);

  // 1. Local Deduplication Check: Identify which prospects already exist in our DB
  let existingApolloIds = new Set<string>();
  if (apolloIds.length > 0) {
    try {
      const existingRes = await db.query(
        `SELECT "customData"->>'apolloId' as apollo_id FROM "Lead" 
         WHERE "customData"->>'apolloId' = ANY($1::text[])`,
        [apolloIds]
      );
      existingApolloIds = new Set(existingRes.rows.map((r: any) => r.apollo_id).filter(Boolean));
    } catch (e) {
      console.warn('[ApolloService] Warning checking existing leads:', e);
    }
  }

  // 2. Tag with alreadyInDb status
  let peopleWithStatus: ApolloPersonSearchResult[] = rawPeople.map((p) => ({
    ...p,
    alreadyInDb: existingApolloIds.has(p.id) || localMatchApolloIds.has(p.id),
  }));

  // 3. Merge: Local DB Contacts First -> Deduplicated Apollo Network Prospects Second
  const filteredApolloPeople = peopleWithStatus.filter(
    (p) => !localMatchApolloIds.has(p.id)
  );
  const combinedPeople: ApolloPersonSearchResult[] = [
    ...localDbMatches,
    ...filteredApolloPeople,
  ];

  // 4. Auto-Store: Automatically persist all fresh Apollo prospects into PostgreSQL (Brand + Lead)
  let autoStoredCount = 0;
  for (const p of filteredApolloPeople) {
    if (!p.alreadyInDb) {
      try {
        const storedLeadId = await autoStoreApolloSearchLead(p, params.categoryKey);
        if (storedLeadId) {
          p.alreadyInDb = true;
          p.justAutoStored = true;
          p.status = 'ACTIVE';
          p.days_since_last_contact = null;
          p.last_contacted_at = undefined;
          autoStoredCount++;
        }
      } catch (err) {
        console.warn(`[ApolloService] Auto-store lead failed for ${p.id}:`, err);
      }
    }
  }

  return {
    total: (data.total_entries || 0) + localDbMatches.length,
    page: data.page || page,
    per_page: data.per_page || per_page,
    localDbCount: localDbMatches.length,
    autoStoredCount,
    people: combinedPeople,
  };
}

/**
 * Auto-stores an Apollo search prospect into PostgreSQL (Brand + Lead) without consuming enrich credits.
 */
export async function autoStoreApolloSearchLead(
  p: ApolloPersonSearchResult,
  categoryKey?: string
): Promise<string | null> {
  try {
    // 0. Check if lead already exists in DB by apolloId
    const existing = await db.query(
      `SELECT id FROM "Lead" WHERE "customData"->>'apolloId' = $1 LIMIT 1`,
      [p.id]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    const orgName = (p.organization?.name || 'Unknown Company').trim();
    const cleanOrg = orgName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domainSlug = cleanOrg ? `${cleanOrg}.com` : `apollo-${p.id.slice(0, 8)}.io`;
    const resolvedCat = categoryKey || mapIndustryToCategoryKey(orgName);

    // 1. Upsert Brand
    let brandId: string;
    const brandRes = await db.query(
      `SELECT id FROM "Brand" WHERE LOWER(name) = LOWER($1) OR LOWER(domain) = LOWER($2) LIMIT 1`,
      [orgName, domainSlug]
    );
    if (brandRes.rows.length > 0) {
      brandId = brandRes.rows[0].id;
    } else {
      brandId = `brnd_ap_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await db.query(
        `INSERT INTO "Brand" (id, domain, name, "categoryKey", tags, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::text[], NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [brandId, domainSlug, orgName, resolvedCat, ['apollo_search_auto_ingest']]
      );
    }

    // 2. Insert Lead
    const leadId = `lead_ap_${p.id}`;
    const cleanFirst = (p.first_name || 'Prospect').trim();
    const cleanLast = (p.last_name_obfuscated || '').replace(/\*/g, '').trim();
    const syntheticEmail = `${cleanFirst.toLowerCase()}.${cleanLast.toLowerCase() || 'contact'}@${domainSlug}`;

    await db.query(
      `INSERT INTO "Lead" (
         id, email, "firstName", "lastName", designation,
         "brandId", domain, "categoryKey", status,
         "customData", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, 'ACTIVE',
         $9::jsonb, NOW(), NOW()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        leadId,
        syntheticEmail,
        cleanFirst,
        p.last_name_obfuscated || '',
        p.title || 'Decision Maker',
        brandId,
        domainSlug,
        resolvedCat,
        JSON.stringify({
          apolloId: p.id,
          name: `${cleanFirst} ${p.last_name_obfuscated || ''}`.trim(),
          title: p.title,
          company: orgName,
          has_email: p.has_email,
          has_direct_phone: p.has_direct_phone,
          autoStored: true,
          storedAt: new Date().toISOString(),
          source: 'apollo_search_auto_ingest',
        }),
      ]
    );

    return leadId;
  } catch (err) {
    console.warn(`[ApolloService] Auto-store lead failed for ${p.id}:`, err);
    return null;
  }
}

/**
 * Match/reveal full person details from Apollo and persist permanently into DB (Lead + Brand).
 * If the prospect was already enriched and stored in our PostgreSQL database, bypasses Apollo API entirely.
 */
export async function enrichAndSavePerson(apolloId: string, overrides: { categoryKey?: string; tags?: string[] } = {}) {
  // 0. Cache Check: If prospect is already saved in PostgreSQL, bypass Apollo API and return immediately (0 credits consumed!)
  try {
    const existingLead = await db.query(
      `SELECT l.id, l.email, l."firstName", l."lastName", l.designation, l."categoryKey", 
              l."brandId", l.domain, b.name as "brandName", l."customData"
       FROM "Lead" l
       LEFT JOIN "Brand" b ON b.id = l."brandId"
       WHERE l."customData"->>'apolloId' = $1 LIMIT 1`,
      [apolloId]
    );

    if (existingLead.rows.length > 0) {
      const row = existingLead.rows[0];
      return {
        leadId: row.id,
        brandId: row.brandId,
        email: row.email,
        name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
        title: row.designation,
        company: row.brandName,
        domain: row.domain,
        categoryKey: row.categoryKey,
        linkedin_url: row.customData?.linkedin_url,
        city: row.customData?.city,
        country: row.customData?.country,
        companyEmployees: row.customData?.companyEmployees,
        companyTechnologies: row.customData?.companyTechnologies,
        apolloId,
        alreadyStored: true,
      };
    }
  } catch (err) {
    console.warn('[ApolloService] Warning checking existing lead in enrichAndSavePerson:', err);
  }

  const apiKey = getApolloApiKey();

  const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      id: apolloId,
      reveal_personal_emails: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    try {
      const errJson = JSON.parse(errText);
      if (
        errJson.error_details?.code === 'BILLING.LIMIT.CREDITS_EXHAUSTED' ||
        errJson.error?.toLowerCase().includes('insufficient credits')
      ) {
        throw new Error('Apollo API: Insufficient credits! Your team has used all lead credits for this billing cycle (0 balance).');
      }
      throw new Error(`Apollo Error: ${errJson.error || errJson.message || errText}`);
    } catch (e: any) {
      if (e.message?.startsWith('Apollo')) throw e;
      throw new Error(`Apollo Match Error (${response.status}): ${errText}`);
    }
  }

  const data: any = await response.json();
  const person = data.person;
  if (!person) {
    throw new Error(`Person with Apollo ID ${apolloId} not found or matched`);
  }

  const org = person.organization || {};
  const rawDomain = org.primary_domain || org.domain || person.email?.split('@')[1] || '';
  const domain = rawDomain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const brandName = org.name || person.organization_name || (domain ? domain.split('.')[0] : 'Unknown');
  const orgIndustry = org.industry || org.sanitized_phone || '';
  const categoryKey = overrides.categoryKey || mapIndustryToCategoryKey(orgIndustry);

  // 1. Upsert Brand
  let brandId: string;
  if (domain) {
    const existingBrand = await db.query(
      `SELECT id, "categoryKey" FROM "Brand" WHERE LOWER(domain) = $1 LIMIT 1`,
      [domain]
    );

    if (existingBrand.rows.length > 0) {
      brandId = existingBrand.rows[0].id;
      // Update categoryKey if previously generic
      if (!existingBrand.rows[0].categoryKey || existingBrand.rows[0].categoryKey === 'general_b2c') {
        await db.query(`UPDATE "Brand" SET "categoryKey" = $1, "updatedAt" = NOW() WHERE id = $2`, [
          categoryKey,
          brandId,
        ]);
      }
    } else {
      brandId = `brnd_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      await db.query(
        `INSERT INTO "Brand" (id, domain, name, "categoryKey", tags, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::text[], NOW(), NOW())`,
        [brandId, domain, brandName, categoryKey, overrides.tags || ['apollo_import']]
      );
    }
  } else {
    brandId = `brnd_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await db.query(
      `INSERT INTO "Brand" (id, domain, name, "categoryKey", tags, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::text[], NOW(), NOW())`,
      [brandId, domain || `nodomain-${Date.now()}`, brandName, categoryKey, overrides.tags || ['apollo_import']]
    );
  }

  // 2. Prepare Lead details
  const email = (person.email || '').toLowerCase().trim();
  if (!email) {
    throw new Error(`Person ${person.name || apolloId} does not have a revealed email address.`);
  }

  const firstName = person.first_name || '';
  const lastName = person.last_name || '';
  const designation = person.title || '';

  // Store every available field from Apollo permanently so we build the ultimate enriched database
  const phoneList = Array.isArray(person.phone_numbers)
    ? person.phone_numbers.map((p: any) => ({
        number: p.sanitized_number || p.raw_number,
        type: p.type,
      }))
    : [];

  const employmentHistory = Array.isArray(person.employment_history)
    ? person.employment_history.slice(0, 10).map((h: any) => ({
        company: h.organization_name,
        title: h.title,
        startDate: h.start_date,
        endDate: h.end_date,
        current: h.current,
      }))
    : [];

  const companyTech = Array.isArray(org.technology_names) ? org.technology_names : [];
  const companyKeywords = Array.isArray(org.keywords) ? org.keywords.slice(0, 30) : [];

  const customData = {
    apolloId: person.id,
    name: person.name || `${firstName} ${lastName}`.trim(),
    headline: person.headline || null,
    title: designation,
    linkedin_url: person.linkedin_url || null,
    photo_url: person.photo_url || null,
    twitter_url: person.twitter_url || null,
    github_url: person.github_url || null,
    facebook_url: person.facebook_url || null,
    city: person.city || null,
    state: person.state || null,
    country: person.country || null,
    postalCode: person.postal_code || null,
    formattedAddress: person.formatted_address || null,
    time_zone: person.time_zone || null,
    email_status: person.email_status || 'verified',
    extrapolated_confidence: person.extrapolated_email_confidence || null,
    seniority: person.seniority || null,
    departments: person.departments || [],
    subdepartments: person.subdepartments || [],
    functions: person.functions || [],
    phones: phoneList,
    primaryPhone: person.sanitized_phone || phoneList[0]?.number || null,
    employmentHistory,
    company: brandName,
    companyDomain: domain,
    companyIndustry: org.industry || null,
    companyDescription: org.short_description || org.seo_description || null,
    companyEmployees: org.estimated_num_employees || null,
    companyRevenue: org.annual_revenue_printed || org.annual_revenue || null,
    companyFunding: org.total_funding ? `$${(org.total_funding / 1e6).toFixed(1)}M` : null,
    companyFundingStage: org.latest_funding_stage || null,
    companyFundingDate: org.latest_funding_round_date || null,
    companyTechnologies: companyTech,
    companyKeywords,
    companyLogo: org.logo_url || null,
    companyLinkedin: org.linkedin_url || null,
    companyWebsite: org.website_url || (domain ? `https://${domain}` : null),
    growth6m: org.organization_headcount_six_month_growth || null,
    growth12m: org.organization_headcount_twelve_month_growth || null,
    growth24m: org.organization_headcount_twenty_four_month_growth || null,
    enrichedAt: new Date().toISOString(),
  };

  // 3. Robust Deduplication and Lead Upsert
  // Check 1: By lowercased email
  // Check 2: By apolloId in customData
  // Check 3: By brandId + firstName + lastName
  const existingByEmail = await db.query(
    `SELECT id, "customData", status, "campaignId" FROM "Lead" WHERE LOWER(email) = $1 LIMIT 1`,
    [email]
  );

  let existingLeadRow = existingByEmail.rows[0];

  if (!existingLeadRow && person.id) {
    const existingByApolloId = await db.query(
      `SELECT id, "customData", status, "campaignId" FROM "Lead" WHERE "customData"->>'apolloId' = $1 LIMIT 1`,
      [person.id]
    );
    existingLeadRow = existingByApolloId.rows[0];
  }

  if (!existingLeadRow && brandId && firstName && lastName) {
    const existingByName = await db.query(
      `SELECT id, "customData", status, "campaignId" FROM "Lead" 
       WHERE "brandId" = $1 AND LOWER("firstName") = $2 AND LOWER("lastName") = $3 LIMIT 1`,
      [brandId, firstName.toLowerCase(), lastName.toLowerCase()]
    );
    existingLeadRow = existingByName.rows[0];
  }

  let leadId: string;
  if (existingLeadRow) {
    leadId = existingLeadRow.id;
    // Merge existing customData with newly fetched Apollo enrichment so no prior data is lost
    const mergedCustomData = {
      ...(existingLeadRow.customData || {}),
      ...customData,
    };

    await db.query(
      `UPDATE "Lead" 
       SET email = COALESCE(NULLIF(email, ''), $1),
           "firstName" = COALESCE(NULLIF($2, ''), "firstName"),
           "lastName" = COALESCE(NULLIF($3, ''), "lastName"),
           designation = COALESCE(NULLIF($4, ''), designation),
           "categoryKey" = COALESCE(NULLIF($5, ''), "categoryKey"),
           "brandId" = COALESCE("brandId", $6),
           domain = COALESCE(domain, $7),
           "customData" = $8::jsonb,
           "updatedAt" = NOW()
       WHERE id = $9`,
      [
        email,
        firstName,
        lastName,
        designation,
        categoryKey,
        brandId,
        domain,
        JSON.stringify(mergedCustomData),
        leadId,
      ]
    );
  } else {
    leadId = `lead_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await db.query(
      `INSERT INTO "Lead" (
         id, email, "firstName", "lastName", designation, source, status,
         "categoryKey", "brandId", domain, "customData", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, 'apollo', 'ACTIVE', $6, $7, $8, $9::jsonb, NOW(), NOW())`,
      [
        leadId,
        email,
        firstName,
        lastName,
        designation,
        categoryKey,
        brandId,
        domain,
        JSON.stringify(customData),
      ]
    );
  }

  return {
    leadId,
    brandId,
    email,
    name: `${firstName} ${lastName}`.trim(),
    title: designation,
    company: brandName,
    domain,
    categoryKey,
    linkedin_url: customData.linkedin_url,
    city: customData.city,
    country: customData.country,
  };
}

/**
 * Bulk enrich and save a list of Apollo Person IDs.
 * Checks PostgreSQL first: any lead already in the database is returned immediately (0 credits).
 * Only un-enriched leads trigger Apollo's match API.
 */
export async function enrichAndSaveBatch(apolloIds: string[], overrides: { categoryKey?: string; tags?: string[] } = {}) {
  const results: any[] = [];
  const errors: any[] = [];

  // 1. Batch check existing leads in PostgreSQL
  const existingMap = new Map<string, any>();
  if (apolloIds.length > 0) {
    try {
      const existingRes = await db.query(
        `SELECT l.id, l.email, l."firstName", l."lastName", l.designation, l."categoryKey", 
                l."brandId", l.domain, b.name as "brandName", l."customData"
         FROM "Lead" l
         LEFT JOIN "Brand" b ON b.id = l."brandId"
         WHERE l."customData"->>'apolloId' = ANY($1::text[])`,
        [apolloIds]
      );
      for (const r of existingRes.rows) {
        const aId = r.customData?.apolloId;
        if (aId) existingMap.set(aId, r);
      }
    } catch (err) {
      console.warn('[ApolloService] Error checking existing leads batch:', err);
    }
  }

  for (const id of apolloIds) {
    const existing = existingMap.get(id);
    if (existing) {
      results.push({
        leadId: existing.id,
        brandId: existing.brandId,
        email: existing.email,
        name: `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
        title: existing.designation,
        company: existing.brandName,
        domain: existing.domain,
        categoryKey: existing.categoryKey,
        linkedin_url: existing.customData?.linkedin_url,
        city: existing.customData?.city,
        country: existing.customData?.country,
        companyEmployees: existing.customData?.companyEmployees,
        companyTechnologies: existing.customData?.companyTechnologies,
        apolloId: id,
        alreadyStored: true,
      });
      continue;
    }

    try {
      const res = await enrichAndSavePerson(id, overrides);
      results.push(res);
    } catch (err: any) {
      errors.push({ id, error: err.message || String(err) });
    }
  }

  return {
    savedCount: results.length,
    failedCount: errors.length,
    saved: results,
    errors,
  };
}

/**
 * List all saved Apollo leads from PostgreSQL with brand and cached metadata.
 */
export async function getSavedApolloLeads(options: { limit?: number; offset?: number; search?: string; categoryKey?: string } = {}) {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const conditions: string[] = [`(l.source = 'apollo' OR l."customData"->>'apolloId' IS NOT NULL)`];
  const params: any[] = [];
  let paramIdx = 1;

  if (options.search?.trim()) {
    conditions.push(`(
      l.email ILIKE $${paramIdx} 
      OR l."firstName" ILIKE $${paramIdx} 
      OR l."lastName" ILIKE $${paramIdx} 
      OR l.designation ILIKE $${paramIdx} 
      OR b.name ILIKE $${paramIdx} 
      OR l.domain ILIKE $${paramIdx}
    )`);
    params.push(`%${options.search.trim()}%`);
    paramIdx++;
  }

  if (options.categoryKey && options.categoryKey !== 'ALL') {
    conditions.push(`l."categoryKey" = $${paramIdx}`);
    params.push(options.categoryKey);
    paramIdx++;
  }

  const whereStr = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await db.query(
    `SELECT count(*)::int as total
     FROM "Lead" l
     LEFT JOIN "Brand" b ON b.id = l."brandId"
     ${whereStr}`,
    params
  );
  const total = countRes.rows[0]?.total || 0;

  const totalDbRes = await db.query(`SELECT count(*)::int as total FROM "Lead"`);
  const totalDatabaseContacts = totalDbRes.rows[0]?.total || 0;

  const dataRes = await db.query(
    `SELECT 
       l.id,
       l.email,
       l."firstName",
       l."lastName",
       l.designation,
       l."categoryKey",
       l.status,
       l.domain,
       l."brandId",
       b.name as "brandName",
       b.tier as "brandTier",
       l."customData",
       l."createdAt",
       l."lastContactedAt",
       l."lastOutcome",
       l."outreachState",
       l."replyClassification",
       l."daysSinceLastContact",
       (SELECT id FROM "PartnershipThesis" pt WHERE pt."brandId" = l."brandId" LIMIT 1) as "thesisId"
     FROM "Lead" l
     LEFT JOIN "Brand" b ON b.id = l."brandId"
     ${whereStr}
     ORDER BY l."createdAt" DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    total,
    totalDatabaseContacts,
    limit,
    offset,
    leads: dataRes.rows,
  };
}

/**
 * Fetch email templates and sequences saved in Apollo account.
 */
export async function getApolloTemplatesAndSequences() {
  const apiKey = getApolloApiKey();

  // 1. Fetch individual email templates
  let templates: any[] = [];
  try {
    const tRes = await fetch(`${APOLLO_API_BASE}/emailer_templates/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ page: 1, per_page: 50 }),
    });
    if (tRes.ok) {
      const tData: any = await tRes.json();
      templates = (tData.emailer_templates || []).map((t: any) => ({
        id: t.id,
        name: t.name || 'Untitled Template',
        subject: t.subject || '',
        bodyText: t.body_text || '',
        bodyHtml: t.body_html || '',
        createdAt: t.created_at,
      }));
    }
  } catch (err) {
    console.warn('[ApolloService] Error fetching templates:', err);
  }

  // 2. Fetch emailer campaigns/sequences
  let sequences: any[] = [];
  try {
    const cRes = await fetch(`${APOLLO_API_BASE}/emailer_campaigns/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ page: 1, per_page: 50 }),
    });
    if (cRes.ok) {
      const cData: any = await cRes.json();
      sequences = (cData.emailer_campaigns || []).map((s: any) => ({
        id: s.id,
        name: s.name || 'Untitled Sequence',
        numSteps: s.num_steps || (s.emailer_steps || []).length || 0,
        createdAt: s.created_at,
        active: s.active,
        steps: (s.emailer_steps || []).map((st: any) => ({
          id: st.id,
          position: st.position,
          waitDays: st.wait_time,
          type: st.type,
        })),
      }));
    }
  } catch (err) {
    console.warn('[ApolloService] Error fetching sequences:', err);
  }

  return {
    templates,
    sequences,
  };
}

/**
 * Fetch detailed steps and email templates for an Apollo sequence/campaign.
 */
export async function getApolloCampaignDetails(campaignId: string) {
  const apiKey = getApolloApiKey();
  const res = await fetch(`${APOLLO_API_BASE}/emailer_campaigns/${campaignId}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch campaign details from Apollo (${res.status})`);
  }

  const data: any = await res.json();
  const templateMap = new Map((data.emailer_templates || []).map((t: any) => [t.id, t]));
  const touchMap = new Map((data.emailer_touches || []).map((tch: any) => [tch.emailer_step_id, tch]));

  const steps = (data.emailer_steps || [])
    .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
    .map((st: any) => {
      const touch: any = touchMap.get(st.id);
      const tmpl: any = touch ? templateMap.get(touch.emailer_template_id) : null;
      return {
        stepId: st.id,
        stepNumber: st.position,
        waitDays: st.wait_time,
        type: st.type,
        subject: tmpl?.subject || '',
        bodyText: tmpl?.body_text || '',
        bodyHtml: tmpl?.body_html || '',
      };
    });

  return {
    id: data.emailer_campaign?.id,
    name: data.emailer_campaign?.name,
    active: data.emailer_campaign?.active,
    steps,
  };
}
