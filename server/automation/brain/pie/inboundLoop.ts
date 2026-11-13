// ============================================================================
// PIE Layer 7 — Automated inbound-reply loop (per mailbox / team member)
//
// For the given mailboxes (e.g. snehal.maurya@…, vatsal.vadecha@…) this reads
// recent inbound replies on their campaigns, has the LLM read EACH reply
// (per REPLY_LLM_MODE), runs the fail-safe conversation agent, persists the
// classification to the learning store, and raises a notification when a human
// is needed (meeting / pricing / hostile / unclear / warm-handoff).
//
// Reads come from the app DB (pgQuery); classifications + notifications are
// written to Replica 3 (brain db). It NEVER sends email — decision + notify only,
// per the "leave as decision engine" choice. Idempotent: an EmailEvent already in
// ReplyClassification is skipped. dryRun classifies + decides but writes nothing.
// ============================================================================

import { pgQuery } from '../../../pg';
import { db } from '../../../db';
import { classifyReply, persistClassification } from './replyClassifierLLM';
import { handleInboundReply, type AgentAction } from './conversationAgent';
import { getReplyLlmMode } from '../config';

export interface InboundLoopOpts {
  mailboxes: string[];   // sender emails to process replies for
  limit?: number;        // max replies this run (default 25, cap 200)
  sinceDays?: number;    // look-back window (default 14)
  dryRun?: boolean;      // classify + decide but persist nothing
}

export interface InboundLoopItem {
  eventId: string;
  leadEmail: string;
  classification?: string;
  method?: string;
  action?: AgentAction;
  escalation?: string | null;
  notificationId?: string | null;
  skipped?: string;
}

export interface InboundLoopResult {
  owners: number;
  candidates: number;
  processed: number;
  escalations: number;
  dryRun: boolean;
  mode: string;
  items: InboundLoopItem[];
}

export async function runInboundReplyLoop(opts: InboundLoopOpts): Promise<InboundLoopResult> {
  const mailboxes = (opts.mailboxes || []).map((m) => m.toLowerCase().trim()).filter(Boolean);
  const limit = Math.min(opts.limit ?? 25, 200);
  const sinceDays = opts.sinceDays ?? 14;
  const mode = getReplyLlmMode();

  // 1. Resolve mailbox owners (userIds) from the app DB.
  const owners = await pgQuery<any>(
    `SELECT DISTINCT "userId" FROM "Mailbox" WHERE lower("senderEmail") = ANY($1::text[]) AND "userId" IS NOT NULL`,
    [mailboxes]
  );
  const userIds = owners.map((o) => o.userId).filter(Boolean);
  if (userIds.length === 0) {
    return { owners: 0, candidates: 0, processed: 0, escalations: 0, dryRun: !!opts.dryRun, mode, items: [] };
  }

  // 2. Candidate inbound replies on those owners' campaigns.
  const events = await pgQuery<any>(
    `SELECT e.id AS "eventId", e."leadId", e."rawPayload", e."createdAt",
            l.email AS "leadEmail", l."firstName", l."lastName", l."brandId", l."campaignId", l.designation,
            b.name AS company, b."categoryKey", c."userId" AS "ownerId"
     FROM "EmailEvent" e
     JOIN "Lead" l ON l.id = e."leadId"
     LEFT JOIN "Brand" b ON b.id = l."brandId"
     LEFT JOIN "Campaign" c ON c.id = l."campaignId"
     WHERE e."eventType" = 'replied'
       AND c."userId" = ANY($1::text[])
       AND e."createdAt" >= NOW() - ($2 || ' days')::interval
     ORDER BY e."createdAt" DESC
     LIMIT $3`,
    [userIds, String(sinceDays), limit]
  );

  // 3. Skip events already processed (idempotent) — ReplyClassification on Replica 3.
  const eventIds = events.map((e) => e.eventId);
  const doneSet = new Set<string>();
  if (eventIds.length) {
    const done = await db.query(
      `SELECT "repliedEventId" FROM "ReplyClassification" WHERE "repliedEventId" = ANY($1::text[])`,
      [eventIds]
    );
    for (const r of done.rows) if (r.repliedEventId) doneSet.add(r.repliedEventId);
  }

  const items: InboundLoopItem[] = [];
  let processed = 0, escalations = 0;

  for (const e of events) {
    if (doneSet.has(e.eventId)) { items.push({ eventId: e.eventId, leadEmail: e.leadEmail, skipped: 'already_processed' }); continue; }

    const raw = (e.rawPayload || {}) as any;
    const text = (raw.reply_message && (raw.reply_message.text || raw.reply_message.html)) || raw.reply_body || raw.preview_text || '';
    const subject = raw.subject || '';
    if (!text || String(text).trim().length < 2) { items.push({ eventId: e.eventId, leadEmail: e.leadEmail, skipped: 'empty_body' }); continue; }

    // LLM reads the reply once (per mode); reuse the verdict for the decision.
    const enriched = await classifyReply(
      { text, subject, contactEmail: e.leadEmail, leadId: e.leadId },
      {}
    );

    const decision = await handleInboundReply({
      leadId: e.leadId, leadEmail: e.leadEmail, brandId: e.brandId, company: e.company,
      firstName: e.firstName, role: e.designation, campaignId: e.campaignId,
      replyText: text, subject, autoRepliesSoFar: 0, turnNumber: 1, userId: e.ownerId,
      precomputedClassification: enriched,
    });

    if (!opts.dryRun) {
      await persistClassification(
        { text, subject, contactEmail: e.leadEmail, leadId: e.leadId, campaignId: e.campaignId, repliedEventId: e.eventId },
        enriched
      );
    }
    if (decision.escalation) escalations++;
    processed++;
    items.push({
      eventId: e.eventId, leadEmail: e.leadEmail,
      classification: enriched.dbClassification, method: enriched.method,
      action: decision.action, escalation: decision.escalation?.category ?? null,
      notificationId: decision.escalation?.notificationId ?? null,
    });
  }

  return { owners: userIds.length, candidates: events.length, processed, escalations, dryRun: !!opts.dryRun, mode, items };
}
