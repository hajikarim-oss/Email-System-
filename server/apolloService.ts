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
  page?: number;
  per_page?: number;
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
  if (params.q_organization_domains?.trim()) {
    payload.q_organization_domains = params.q_organization_domains.trim();
  }

  const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
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

  const data = await response.json();
  return {
    total: data.total_entries || 0,
    page: data.page || page,
    per_page: data.per_page || per_page,
    people: (data.people || []) as ApolloPersonSearchResult[],
  };
}

/**
 * Match/reveal full person details from Apollo and persist permanently into DB (Lead + Brand).
 */
export async function enrichAndSavePerson(apolloId: string, overrides: { categoryKey?: string; tags?: string[] } = {}) {
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
      reveal_personal_emails: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Apollo Match Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
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

  // Store rich Apollo fields permanently so we never have to query Apollo again
  const customData = {
    apolloId: person.id,
    linkedin_url: person.linkedin_url || null,
    photo_url: person.photo_url || null,
    headline: person.headline || null,
    city: person.city || null,
    state: person.state || null,
    country: person.country || null,
    time_zone: person.time_zone || null,
    email_status: person.email_status || 'verified',
    company: brandName,
    companyDomain: domain,
    companyIndustry: org.industry || null,
    companyEmployees: org.estimated_num_employees || null,
    companyRevenue: org.annual_revenue_printed || null,
    companyTechnologies: Array.isArray(org.technology_names) ? org.technology_names.slice(0, 20) : [],
    companyLinkedin: org.linkedin_url || null,
    companyWebsite: org.website_url || null,
    rawApolloPerson: {
      id: person.id,
      name: person.name,
      title: person.title,
      email: person.email,
      departments: person.departments || [],
      subdepartments: person.subdepartments || [],
      seniority: person.seniority || null,
      functions: person.functions || [],
    },
  };

  // 3. Upsert Lead
  const existingLead = await db.query(
    `SELECT id, "customData" FROM "Lead" WHERE LOWER(email) = $1 LIMIT 1`,
    [email]
  );

  let leadId: string;
  if (existingLead.rows.length > 0) {
    leadId = existingLead.rows[0].id;
    await db.query(
      `UPDATE "Lead" 
       SET "firstName" = COALESCE($1, "firstName"),
           "lastName" = COALESCE($2, "lastName"),
           designation = COALESCE($3, designation),
           "categoryKey" = COALESCE($4, "categoryKey"),
           "brandId" = COALESCE("brandId", $5),
           domain = COALESCE(domain, $6),
           "customData" = $7::jsonb,
           "updatedAt" = NOW()
       WHERE id = $8`,
      [firstName, lastName, designation, categoryKey, brandId, domain, JSON.stringify(customData), leadId]
    );
  } else {
    leadId = `lead_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await db.query(
      `INSERT INTO "Lead" (
         id, email, "firstName", "lastName", designation, source, status,
         "categoryKey", "brandId", domain, "customData", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, 'apollo', 'ACTIVE', $6, $7, $8, $9::jsonb, NOW(), NOW())`,
      [leadId, email, firstName, lastName, designation, categoryKey, brandId, domain, JSON.stringify(customData)]
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
 */
export async function enrichAndSaveBatch(apolloIds: string[], overrides: { categoryKey?: string; tags?: string[] } = {}) {
  const results: any[] = [];
  const errors: any[] = [];

  for (const id of apolloIds) {
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

  const conditions: string[] = [`l.source = 'apollo'`];
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
    limit,
    offset,
    leads: dataRes.rows,
  };
}
