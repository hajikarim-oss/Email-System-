/**
 * server/automation/brain/history.ts
 * 
 * Lead Historical Outreach & Context Audit Engine
 * 
 * Inspects all historical touchpoints across EmailEvent, EmailMessage, and DraftGeneration
 * for a lead or brand. Computes:
 * - Time elapsed since last touchpoint (months/days)
 * - Past subject lines, angles, and proof points used
 * - Past engagement profile (FRESH, HIGH_INTENT_LURKER, UNRESPONSIVE_COLD, PREVIOUS_REPLIER)
 * - Strategic angle pivot guidance for the LLM writer
 */

import { db } from '../../db';

export interface LeadOutreachHistory {
  hasHistory: boolean;
  totalTouches: number;
  firstContactedAt: string | null;
  lastContactedAt: string | null;
  monthsSinceLastContact: number | null;
  daysSinceLastContact: number | null;
  engagementTier: 'FRESH' | 'HIGH_INTENT_LURKER' | 'UNRESPONSIVE_COLD' | 'PREVIOUS_REPLIER';
  pastSubjects: string[];
  pastAngles: string[];
  pastProofPoints: string[];
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  lastReplySnippet: string | null;
  contextSummary: string;
  recommendedWriterGuidance: string;
}

export async function getLeadOutreachHistory(params: {
  leadId: string;
  email: string;
}): Promise<LeadOutreachHistory> {
  const { leadId, email } = params;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Query EmailEvent (Smartlead live tracking events)
  const eventRes = await db.query<{
    eventType: string;
    createdAt: Date;
    rawPayload: any;
  }>(
    `
    SELECT "eventType", "createdAt", "rawPayload"
    FROM "EmailEvent"
    WHERE "leadId" = $1 OR lower("fromEmail") = $2
    ORDER BY "createdAt" ASC
    `,
    [leadId, cleanEmail]
  );

  // 2. Query EmailMessage (historical 86k campaign records)
  const messageRes = await db.query<{
    subjectRaw: string;
    bodyHook: string;
    direction: string;
    replied: boolean;
    createdAt: Date;
  }>(
    `
    SELECT "subjectRaw", "bodyHook", "direction", "replied", "createdAt"
    FROM "EmailMessage"
    WHERE lower("contactEmail") = $1
    ORDER BY "createdAt" ASC
    `,
    [cleanEmail]
  );

  // 3. Query DraftGeneration (past Brain generations)
  const draftRes = await db.query<{
    sequenceStep: number;
    angleKey: string;
    primaryProofId: string;
    subject: string;
    createdAt: Date;
  }>(
    `
    SELECT "sequenceStep", "angleKey", "primaryProofId", subject, "createdAt"
    FROM "DraftGeneration"
    WHERE "leadId" = $1 OR lower("leadEmail") = $2
    ORDER BY "createdAt" ASC
    `,
    [leadId, cleanEmail]
  );

  // Aggregate metrics
  const allDates: Date[] = [];
  const subjectsSet = new Set<string>();
  const anglesSet = new Set<string>();
  const proofsSet = new Set<string>();
  let sentCount = 0;
  let openedCount = 0;
  let clickedCount = 0;
  let repliedCount = 0;
  let lastReplySnippet: string | null = null;

  for (const ev of eventRes.rows) {
    allDates.push(new Date(ev.createdAt));
    if (ev.eventType === 'sent' || ev.eventType === 'SENT') sentCount++;
    if (ev.eventType === 'opened' || ev.eventType === 'email_open') openedCount++;
    if (ev.eventType === 'clicked') clickedCount++;
    if (ev.eventType === 'replied' || ev.eventType === 'email_reply') {
      repliedCount++;
      const body = ev.rawPayload?.body || ev.rawPayload?.reply_body;
      if (body && typeof body === 'string') {
        const cleanBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        lastReplySnippet = cleanBody.slice(0, 160);
      }
    }
  }

  for (const msg of messageRes.rows) {
    allDates.push(new Date(msg.createdAt));
    sentCount++;
    if (msg.subjectRaw) subjectsSet.add(msg.subjectRaw.trim());
    if (msg.replied || msg.direction === 'INBOUND') {
      repliedCount++;
      if (msg.bodyHook) lastReplySnippet = msg.bodyHook.slice(0, 160);
    }
  }

  for (const d of draftRes.rows) {
    allDates.push(new Date(d.createdAt));
    if (d.subject) subjectsSet.add(d.subject.trim());
    if (d.angleKey) anglesSet.add(d.angleKey);
    if (d.primaryProofId) proofsSet.add(d.primaryProofId);
  }

  const hasHistory = allDates.length > 0;
  if (!hasHistory) {
    return {
      hasHistory: false,
      totalTouches: 0,
      firstContactedAt: null,
      lastContactedAt: null,
      monthsSinceLastContact: null,
      daysSinceLastContact: null,
      engagementTier: 'FRESH',
      pastSubjects: [],
      pastAngles: [],
      pastProofPoints: [],
      openedCount: 0,
      clickedCount: 0,
      repliedCount: 0,
      lastReplySnippet: null,
      contextSummary: 'Fresh lead. No prior outreach history recorded.',
      recommendedWriterGuidance: 'Brand new lead. Standard cold sequence with fresh hook, verified metric, and permission CTA.',
    };
  }

  allDates.sort((a, b) => a.getTime() - b.getTime());
  const firstContact = allDates[0];
  const lastContact = allDates[allDates.length - 1];
  const now = new Date();
  const diffMs = now.getTime() - lastContact.getTime();
  const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const monthsSince = Math.max(1, Math.floor(daysSince / 30));

  // Determine Engagement Tier
  let engagementTier: LeadOutreachHistory['engagementTier'] = 'UNRESPONSIVE_COLD';
  if (repliedCount > 0) {
    engagementTier = 'PREVIOUS_REPLIER';
  } else if (clickedCount > 0 || openedCount >= 3) {
    engagementTier = 'HIGH_INTENT_LURKER';
  } else {
    engagementTier = 'UNRESPONSIVE_COLD';
  }

  const pastSubjects = Array.from(subjectsSet).slice(-3);
  const pastAngles = Array.from(anglesSet);
  const pastProofPoints = Array.from(proofsSet);

  // Formulate Context Summary & Writer Guidance
  let contextSummary = '';
  let recommendedWriterGuidance = '';

  if (engagementTier === 'PREVIOUS_REPLIER') {
    contextSummary = `Prospect replied previously (${monthsSince} month(s) ago). Last reply note: "${lastReplySnippet || 'Inbound engagement recorded'}".`;
    recommendedWriterGuidance = `This prospect previously replied. Do NOT write a cold intro. Seamlessly reconnect referencing past timing (e.g., "Circling back following up on our previous note..."). Propose a fresh low-friction permission ask.`;
  } else if (engagementTier === 'HIGH_INTENT_LURKER') {
    contextSummary = `Prospect was contacted ${monthsSince} month(s) ago (${daysSince} days ago). They showed high intent (${openedCount} opens, ${clickedCount} clicks), but never replied.`;
    recommendedWriterGuidance = `Prospect engaged deeply with past outreach but did not reply. Do NOT repeat the old angle (${pastAngles.join(', ') || 'initial pitch'}). Deliver a fresh angle and offer a concrete low-friction asset (e.g. 90-second category teardown or comparison).`;
  } else {
    contextSummary = `Prospect was contacted ${monthsSince} month(s) ago (${daysSince} days ago) across ${sentCount} touchpoint(s). Did not convert. Past subjects: ${pastSubjects.join(' | ') || 'None'}.`;
    recommendedWriterGuidance = `Cold re-engagement (${monthsSince} month(s) since last touch). The previous angle was ignored. You MUST PIVOT to a completely different angle and cite a fresh case study. Avoid repeating past subjects: [${pastSubjects.join(', ')}].`;
  }

  return {
    hasHistory: true,
    totalTouches: sentCount,
    firstContactedAt: firstContact.toISOString(),
    lastContactedAt: lastContact.toISOString(),
    monthsSinceLastContact: monthsSince,
    daysSinceLastContact: daysSince,
    engagementTier,
    pastSubjects,
    pastAngles,
    pastProofPoints,
    openedCount,
    clickedCount,
    repliedCount,
    lastReplySnippet,
    contextSummary,
    recommendedWriterGuidance,
  };
}

