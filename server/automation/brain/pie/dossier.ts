// ============================================================================
// PIE Layer 2 — Brand Intelligence (dossier builder)
// Reuses the Brain researcher (researchBrand: direct HTTP + Firecrawl + 30-day
// cache) and layers the STRUCTURED, CITED dossier on top. Every filled field is
// recorded in fieldCitations (field -> sourceUrl) and backed by a ResearchSource
// row. Ad-library is isolated behind a provider seam + flag with graceful
// degradation (pre-committed fallback: no ad-lib => lower completeness, not a stall).
// Writes only to Replica 3 via server/db.ts.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import { researchBrand } from '../researcher';
import { getPieFlags } from './config';
import type { AdLibrarySnapshot, BrandDossier } from './types';

const pieId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

// Required dossier fields for the completeness score. adLibrarySnapshot is
// required only when AD_LIBRARY_SCRAPE_ENABLED is on (else it does not count).
const BASE_REQUIRED = ['categoryKey', 'positioning', 'channelMix', 'contentFormats', 'competitorSet'] as const;

// ---------------------------------------------------------------------------
// Ad-library provider seam. Returns a STRUCTURED snapshot or null. The real
// Meta/Google Ad Library scraper is wired here behind the flag; until then this
// degrades gracefully (null) so the pipeline never stalls on it.
// ---------------------------------------------------------------------------
export interface AdLibraryProvider {
  fetch(brand: { brandId: string; domain: string; name: string }): Promise<AdLibrarySnapshot | null>;
}

let adLibraryProvider: AdLibraryProvider | null = null;
export function registerAdLibraryProvider(p: AdLibraryProvider) {
  adLibraryProvider = p;
}

async function fetchAdLibrary(brand: { brandId: string; domain: string; name: string }): Promise<AdLibrarySnapshot | null> {
  const flags = getPieFlags();
  if (!flags.AD_LIBRARY_SCRAPE_ENABLED || !adLibraryProvider) return null;
  try {
    return await adLibraryProvider.fetch(brand);
  } catch (err) {
    console.warn('[PIE dossier] ad-library fetch failed (degrading to null):', err);
    return null; // pre-committed fallback: degrade, never stall
  }
}

export interface DossierResult {
  dossier: BrandDossier;
  cached: boolean;
  completeness: number;
}

/**
 * Build or refresh the structured, cited dossier for one brand.
 */
export async function buildBrandDossier(
  brandId: string,
  opts: { forceRefresh?: boolean; adLibrarySnapshot?: AdLibrarySnapshot } = {}
): Promise<DossierResult> {
  // 0. Serve a fresh cached dossier unless forced.
  if (!opts.forceRefresh) {
    const cached = await db.query(
      `SELECT * FROM "BrandDossier" WHERE "brandId" = $1 AND ("refreshDueAt" IS NULL OR "refreshDueAt" > NOW()) LIMIT 1`,
      [brandId]
    );
    if (cached.rows.length > 0) {
      const d = cached.rows[0] as BrandDossier;
      return { dossier: d, cached: true, completeness: d.completeness };
    }
  }

  // 1. Brand row + reuse the Brain researcher for signals (scrape + cache).
  const brandRow = await db.query(
    `SELECT id, LOWER(domain) AS domain, name, "categoryKey" FROM "Brand" WHERE id = $1`,
    [brandId]
  );
  if (brandRow.rows.length === 0) throw new Error(`Brand ${brandId} not found`);
  const brand = brandRow.rows[0];
  const domain: string = brand.domain || '';
  const research = await researchBrand(brandId);

  const fieldCitations: Record<string, string> = {};
  const usedSources: { type: string; url: string; fields: string[] }[] = [];
  const siteUrl = domain ? `https://${domain}` : '';

  // 2. Map researcher signals -> structured dossier fields (cited only).
  let positioning: string | null = null;
  const contentFormats: Record<string, unknown> = {};
  const recentLaunches: string[] = [];
  const hiringSignals: string[] = [];

  for (const s of research.signals) {
    const src = s.sourceUrl || siteUrl;
    if (!src) continue;
    if (s.type === 'VALUE_PROP' && !positioning) {
      positioning = s.claim;
      fieldCitations['positioning'] = src;
    } else if (s.type === 'RECENT_NEWS') {
      recentLaunches.push(s.claim);
      fieldCitations['recentLaunches'] = src;
    } else if (s.type === 'HIRING_SIGNAL') {
      hiringSignals.push(s.claim);
      fieldCitations['hiringSignals'] = src;
    }
  }
  if (siteUrl) usedSources.push({ type: 'website', url: siteUrl, fields: Object.keys(fieldCitations) });

  const categoryKey: string | null = research.categoryKey || brand.categoryKey || null;
  if (categoryKey) fieldCitations['categoryKey'] = siteUrl || 'brand.categoryKey';

  // 3. Ad-library (structured counts): owner/seed-supplied snapshot wins (manual
  //    data, no flag needed); else the scrape provider behind AD_LIBRARY_SCRAPE_ENABLED;
  //    else null (graceful degradation — lower completeness, never a stall).
  const snapshot = opts.adLibrarySnapshot ?? (await fetchAdLibrary({ brandId, domain, name: brand.name }));
  let channelMix: Record<string, unknown> | null = null;
  if (snapshot) {
    (contentFormats as any).adLibrary = {
      activeCount: snapshot.activeCount,
      staticCount: snapshot.staticCount,
      videoCount: snapshot.videoCount,
    };
    channelMix = { paidSocialActiveAds: snapshot.activeCount };
    fieldCitations['contentFormats'] = snapshot.capturedFrom;
    fieldCitations['channelMix'] = snapshot.capturedFrom;
    fieldCitations['adLibrarySnapshot'] = snapshot.capturedFrom;
    usedSources.push({ type: 'ad_library', url: snapshot.capturedFrom, fields: ['contentFormats', 'channelMix', 'adLibrarySnapshot'] });
  }

  // 4. Completeness = filled-and-cited required fields / required fields.
  const required = [...BASE_REQUIRED, ...(getPieFlags().AD_LIBRARY_SCRAPE_ENABLED ? (['adLibrarySnapshot'] as const) : [])];
  const filled = required.filter((f) => !!fieldCitations[f]).length;
  const completeness = Number((filled / required.length).toFixed(3));

  // 5. Persist ResearchSource provenance rows.
  for (const s of usedSources) {
    await db.query(
      `INSERT INTO "ResearchSource" (id,"brandId","sourceType",url,"usedForFields") VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [pieId('rs'), brandId, s.type, s.url, JSON.stringify(s.fields)]
    );
  }

  // 6. Upsert the dossier (gated by nothing — dossiers are evidence, not claims).
  const id = pieId('bd');
  const dossierRow = {
    id,
    brandId,
    categoryKey,
    positioning,
    channelMix: channelMix ? JSON.stringify(channelMix) : null,
    contentFormats: Object.keys(contentFormats).length ? JSON.stringify(contentFormats) : null,
    hiringSignals: hiringSignals.length ? JSON.stringify(hiringSignals) : null,
    recentLaunches: recentLaunches.length ? JSON.stringify(recentLaunches) : null,
    adLibrarySnapshot: snapshot ? JSON.stringify(snapshot) : null,
    fieldCitations: JSON.stringify(fieldCitations),
    completeness,
  };
  await db.query(
    `INSERT INTO "BrandDossier"
       (id,"brandId","categoryKey",positioning,"channelMix","contentFormats","hiringSignals","recentLaunches","adLibrarySnapshot","fieldCitations",completeness,"researchedAt","refreshDueAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,NOW(),NOW() + INTERVAL '30 days')
     ON CONFLICT ("brandId") DO UPDATE SET
       "categoryKey"=EXCLUDED."categoryKey",positioning=EXCLUDED.positioning,"channelMix"=EXCLUDED."channelMix",
       "contentFormats"=EXCLUDED."contentFormats","hiringSignals"=EXCLUDED."hiringSignals","recentLaunches"=EXCLUDED."recentLaunches",
       "adLibrarySnapshot"=EXCLUDED."adLibrarySnapshot","fieldCitations"=EXCLUDED."fieldCitations",completeness=EXCLUDED.completeness,
       "researchedAt"=NOW(),"refreshDueAt"=NOW() + INTERVAL '30 days'`,
    [
      dossierRow.id, dossierRow.brandId, dossierRow.categoryKey, dossierRow.positioning, dossierRow.channelMix,
      dossierRow.contentFormats, dossierRow.hiringSignals, dossierRow.recentLaunches, dossierRow.adLibrarySnapshot,
      dossierRow.fieldCitations, dossierRow.completeness,
    ]
  );

  // Link Brand -> dossier.
  await db.query(`UPDATE "Brand" SET "dossierId" = $1 WHERE id = $2`, [id, brandId]);

  const out: BrandDossier = {
    id,
    brandId,
    categoryKey,
    positioning,
    channelMix: channelMix || undefined,
    contentFormats: Object.keys(contentFormats).length ? contentFormats : undefined,
    hiringSignals: hiringSignals.length ? { items: hiringSignals } : undefined,
    recentLaunches: recentLaunches.length ? { items: recentLaunches } : undefined,
    adLibrarySnapshot: snapshot,
    fieldCitations,
    completeness,
  };
  return { dossier: out, cached: false, completeness };
}
