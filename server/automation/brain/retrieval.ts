import { db } from '../../db';

export interface RetrievedPlaybook {
  id: string;
  categoryKey: string;
  designation: string;
  angleKey: string;
  angleName: string;
  description: string;
  dos: string[];
  donts: string[];
  ctaOptions: string[];
  toneNotes: string | null;
}

export interface RetrievedProofPoint {
  id: string;
  title: string;
  clientName: string | null;
  summary: string;
  metrics: Record<string, any>;
  categories: string[];
}

export interface RetrievedExemplar {
  id: string;
  subject: string;
  body: string;
  replyClassification: string;
  metrics?: Record<string, any>;
}

export interface ContextRetrievalResult {
  categoryKey: string;
  designation: string;
  playbook: RetrievedPlaybook | null;
  proofPoints: RetrievedProofPoint[];
  positiveExemplars: RetrievedExemplar[];
  knowledgeChunks: string[];
}

/**
 * Fix #1 & Fix #3: Retrieve Context for the Writer Engine.
 *
 * STRICT SAFETY CONDITIONS:
 * - Playbook MUST have `status = 'ACTIVE'` (never DRAFT or SYSTEM_PROPOSAL).
 * - ProofPoint MUST have `approvedToMention = true AND active = true` (never unapproved).
 * - Exemplars MUST have `replyClassification = 'INTERESTED'` strictly on workspace brand leads.
 */
export async function retrieveContext(params: {
  categoryKey: string;
  designation: string;
  brandTier?: string;
  limitProofPoints?: number;
}): Promise<ContextRetrievalResult> {
  const { categoryKey, designation, limitProofPoints = 2 } = params;

  // 1. Retrieve Active Playbook matching categoryKey and designation (with fallback to categoryKey)
  const pbRes = await db.query(
    `
    SELECT
      id, "categoryKey", designation, "angleKey", "angleName",
      description, dos, donts, "ctaOptions", "toneNotes"
    FROM "Playbook"
    WHERE status = 'ACTIVE'
      AND "categoryKey" = $1
      AND (designation = $2 OR designation = 'ANY' OR designation IS NULL)
    ORDER BY (designation = $2) DESC, version DESC
    LIMIT 1
    `,
    [categoryKey, designation]
  );

  let playbook: RetrievedPlaybook | null = null;
  if (pbRes.rows.length > 0) {
    const r = pbRes.rows[0];
    playbook = {
      id: r.id,
      categoryKey: r.categoryKey,
      designation: r.designation,
      angleKey: r.angleKey,
      angleName: r.angleName,
      description: r.description,
      dos: r.dos || [],
      donts: r.donts || [],
      ctaOptions: r.ctaOptions || [],
      toneNotes: r.toneNotes || null,
    };
  }

  // 2. Retrieve Approved & Active ProofPoints strictly matching category or super-category (Fix Problem 2)
  const allowedCategories = [
    categoryKey,
    ...(categoryKey === 'luggage_travel' ? ['travel'] : []),
    ...(categoryKey === 'food_beverages' ? ['fmcg'] : []),
    ...(categoryKey === 'fashion_apparel' ? ['apparel', 'fashion'] : []),
    ...(categoryKey === 'beauty_personal_care' ? ['personal_care', 'cosmetics'] : []),
    ...(categoryKey === 'fitness_wellness' ? ['wellness', 'health'] : []),
    ...(categoryKey === 'healthcare_pharma' ? ['health', 'pharma'] : []),
    ...(categoryKey === 'consumer_tech' ? ['tech', 'electronics'] : []),
  ];

  const ppRes = await db.query(
    `
    SELECT id, title, "clientName", summary, metrics, categories
    FROM "ProofPoint"
    WHERE "approvedToMention" = true
      AND active = true
      AND categories && $1::text[]
    ORDER BY (categories @> ARRAY[$2]::text[]) DESC, "verifiedAt" DESC NULLS LAST
    LIMIT $3
    `,
    [allowedCategories, categoryKey, limitProofPoints]
  );

  const proofPoints: RetrievedProofPoint[] = ppRes.rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    clientName: r.clientName,
    summary: r.summary,
    metrics: (r.metrics as Record<string, any>) || {},
    categories: r.categories || [],
  }));

  // 3. Retrieve Clean Positive Exemplars from DraftGeneration (Fix #3 single-source DQ-02)
  const exemplarRes = await db.query(
    `
    SELECT id, subject, body, "replyClassification"
    FROM "DraftGeneration"
    WHERE "replyClassification" = 'INTERESTED'
      AND "categoryKey" = $1
      AND (designation = $2 OR designation IS NULL)
    ORDER BY "createdAt" DESC
    LIMIT 2
    `,
    [categoryKey, designation]
  );

  let positiveExemplars: RetrievedExemplar[] = exemplarRes.rows.map((r: any) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    replyClassification: r.replyClassification,
  }));

  // Fallback to cleaned historical EmailMessage if DraftGeneration has no live exemplars yet
  if (positiveExemplars.length === 0) {
    const fallbackExemplars = await db.query(
      `
      SELECT id, "subjectRaw" as subject, "bodyHook" as body, "replyClassification"
      FROM "EmailMessage"
      WHERE "replyClassification" = 'INTERESTED'
        AND COALESCE("isExcluded", false) = false
        AND "bodyHook" IS NOT NULL
        AND LENGTH("bodyHook") > 40
      ORDER BY "createdAt" DESC
      LIMIT 2
      `
    );
    positiveExemplars = fallbackExemplars.rows.map((r: any) => ({
      id: r.id,
      subject: r.subject || '',
      body: r.body || '',
      replyClassification: r.replyClassification,
    }));
  }

  // 4. Retrieve Active KnowledgeChunks (agency capability facts)
  const kcRes = await db.query(
    `
    SELECT text
    FROM "KnowledgeChunk"
    WHERE active = true
    LIMIT 3
    `
  );
  const knowledgeChunks: string[] = kcRes.rows.map((r: any) => r.text);

  return {
    categoryKey,
    designation,
    playbook,
    proofPoints,
    positiveExemplars,
    knowledgeChunks,
  };
}

