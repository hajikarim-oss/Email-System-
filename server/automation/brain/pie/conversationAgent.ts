// ============================================================================
// PIE Layer 7 — Conversation agent (reply handling with fail-safes)
//
// Given an inbound reply, decide what the system does next. Design posture is
// FAIL-SAFE / withhold: the agent auto-replies ONLY for a small set of clearly
// safe, grounded intents (templated, validator-checked). Anything that implies a
// commitment, a number we cannot ground, a meeting/booking, pricing, legal, or
// anything ambiguous is ESCALATED to a human with a notification. It never books
// meetings, never negotiates price, never invents facts, and never sends an
// auto-reply that fails the Brain validator.
//
// Actions:
//   AUTO_REPLY — send the grounded templated reply (and keep the thread open)
//   SNOOZE     — OOO / auto-responder: wait, do not reply
//   STOP       — unsubscribe / hostile: stop + suppress, no reply
//   ESCALATE   — hand to a human; a PieNotification is raised
// ============================================================================

import { validateEmailDraft } from '../validator';
import { classifyReply, type EnrichedClassification } from './replyClassifierLLM';
import { notifyUser, type NotificationCategory } from './pieNotifications';
import type { DbReplyClassification } from '../../pipeline/replyClassifier';

export type AgentAction = 'AUTO_REPLY' | 'SNOOZE' | 'STOP' | 'ESCALATE';

export interface InboundContext {
  leadId?: string | null;
  leadEmail: string;
  brandId?: string | null;
  company?: string | null;
  firstName?: string | null;
  role?: string | null;
  campaignId?: string | null;
  replyText: string;
  subject?: string | null;
  autoRepliesSoFar: number;     // how many times we've already auto-replied in this thread
  maxAutoReplies?: number;      // default 2
  turnNumber?: number;
  userId?: string | null;
  useLLM?: boolean;             // classify with the LLM (per mode) instead of deterministic-only
  precomputedClassification?: EnrichedClassification; // reuse a verdict already computed (avoids a 2nd LLM call)
}

export interface AgentDecision {
  action: AgentAction;
  classification: DbReplyClassification;
  reply?: { subject: string; body: string; valid: boolean; validationIssues: string[] };
  escalation?: { category: NotificationCategory; priority: 'HIGH' | 'NORMAL'; reason: string; notificationId?: string };
  stopReason?: string;
}

const PLAYBOOK_URL = 'https://theboredmonkey.in';

// Intent detectors (deterministic, auditable).
const MEETING_RX = /\b(calendar|cal\.com|calendly|book(?:ing)?\b|schedule|google meet|zoom|teams call|send (?:an? )?invite|set up a (?:call|meeting|time)|available (?:on|this|next|tomorrow)|what times?|free (?:on|this|next|tomorrow)|let'?s (?:meet|hop|jump|catch up)|jump on)\b/i;
const RISK_RX = /\b(price|pricing|cost|costs|quote|budget|retainer|proposal|contract|scope of work|\bsow\b|legal|nda|terms|invoice|payment|discount|rate card|rates?|guarantee|guaranteed|refund)\b/i;

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function htmlOf(plain: string) {
  return '<p>' + plain.split(/\n\n+/).map((seg) => esc(seg).replace(/\n/g, '<br/>')).join('</p><p>') + '</p>';
}

// Grounded, low-friction templated replies (no numbers, no meeting ask, sanctioned link only).
function replyTemplate(kind: 'DETAILS' | 'NUDGE' | 'WRONG_PERSON', firstName: string, company: string): { subject: string; body: string } {
  const fn = firstName || 'there';
  const co = company || 'your team';
  if (kind === 'DETAILS') {
    // Engage, don't just deflect: ask which dimension matters, then offer the right
    // part. Both options are real capability areas (not fabricated specifics), and
    // there is no number and no meeting ask, so it stays inside the grounding contract.
    return {
      subject: 'Re: your note',
      body: `Hi ${fn},\n\nHappy to. Are you more focused on the creator mix or the CPV side for ${co}? I will send the part that is most useful, and the full breakdown is in our Growth Playbook: ${PLAYBOOK_URL}\n\nTell me which is closer and I will tailor it.`,
    };
  }
  if (kind === 'NUDGE') {
    return {
      subject: 'Re: your note',
      body: `Hi ${fn},\n\nUnderstood, no rush at all. Whenever creator-led growth is on the table for ${co}, the Growth Playbook has the specifics: ${PLAYBOOK_URL}\n\nNo need to reply if now is not the time.`,
    };
  }
  return {
    subject: 'Re: your note',
    body: `Hi ${fn},\n\nApologies for the mix-up. Who on your side looks after creator or performance marketing? Happy to take this off your plate and reach out to them directly.`,
  };
}

/**
 * Decide the next action for one inbound reply, and raise a notification on
 * escalation / stop-for-human cases. Pure decision + optional notify; it does not
 * send email (the caller / Smartlead handles sending the returned reply).
 */
export async function handleInboundReply(ctx: InboundContext): Promise<AgentDecision> {
  const maxAuto = ctx.maxAutoReplies ?? 2;
  const firstName = (ctx.firstName || '').trim();
  const company = (ctx.company || '').trim();

  // 1. Classify. Use a precomputed verdict if supplied (e.g. the inbound loop
  //    already ran the LLM), else classify here — LLM when useLLM is set (per
  //    mode), otherwise deterministic for a predictable hot path.
  const c = ctx.precomputedClassification
    ?? (await classifyReply(
      { text: ctx.replyText, subject: ctx.subject, contactEmail: ctx.leadEmail },
      ctx.useLLM ? {} : { noLLM: true }
    ));
  const cls = c.dbClassification;

  const text = ctx.replyText || '';
  const meetingIntent = MEETING_RX.test(text);
  const riskIntent = RISK_RX.test(text);

  const escalate = async (category: NotificationCategory, priority: 'HIGH' | 'NORMAL', reason: string, title: string, body: string): Promise<AgentDecision> => {
    const n = await notifyUser({
      userId: ctx.userId, leadId: ctx.leadId, leadEmail: ctx.leadEmail, campaignId: ctx.campaignId,
      category, priority, title, body, reason, conversationId: ctx.leadEmail, turnNumber: ctx.turnNumber,
    });
    return { action: 'ESCALATE', classification: cls, escalation: { category, priority, reason, notificationId: n.id } };
  };

  // 2. Hard stops first (safety overrides everything).
  if (cls === 'UNSUBSCRIBE') {
    await notifyUser({ userId: ctx.userId, leadId: ctx.leadId, leadEmail: ctx.leadEmail, campaignId: ctx.campaignId,
      category: 'UNSUBSCRIBE', priority: 'NORMAL', title: `Unsubscribe: ${ctx.leadEmail}`, body: 'Lead opted out. Suppressed; no further contact.', reason: 'opt_out', conversationId: ctx.leadEmail, turnNumber: ctx.turnNumber });
    return { action: 'STOP', classification: cls, stopReason: 'unsubscribe_suppress' };
  }
  if (c.auditLabel === 'hostile') {
    return escalate('HOSTILE', 'HIGH', 'hostile_reply', `Hostile reply: ${ctx.leadEmail}`, 'Lead reacted negatively. Paused for human review — do not auto-reply.');
  }

  // 3. Non-signal: OOO / auto-responder -> wait, never reply.
  if (cls === 'OOO' || cls === 'AUTO_RESPONDER') {
    return { action: 'SNOOZE', classification: cls, stopReason: cls.toLowerCase() };
  }

  // 4. Commitment / unverifiable territory -> always a human (fail-safe).
  if (riskIntent) {
    return escalate('PRICING', 'HIGH', 'pricing_or_commercial_terms', `Pricing/terms question: ${ctx.leadEmail}`, 'Lead asked about price, contract or terms. Needs a human — the agent never quotes or negotiates.');
  }
  // Any meeting/booking ask escalates on its own — regardless of classification.
  if (meetingIntent) {
    return escalate('MEETING_REQUEST', 'HIGH', 'meeting_intent_detected', `Meeting request: ${ctx.leadEmail}`, 'Lead wants to meet / book time. Human takes over — the agent never books meetings.');
  }

  // 5. Interested, just wants info -> auto-reply once (grounded), then hand off.
  if (cls === 'INTERESTED') {
    if (ctx.autoRepliesSoFar >= maxAuto) {
      return escalate('HUMAN_HANDOFF', 'HIGH', 'max_auto_replies_reached', `Warm lead needs you: ${ctx.leadEmail}`, 'Engaged lead past the auto-reply limit. Handing to a human to carry it forward.');
    }
    const t = replyTemplate('DETAILS', firstName, company);
    const v = validateEmailDraft({ subject: t.subject, body: t.body, stepNumber: 2, isSendTime: true, strictOverride: true });
    if (!v.valid) {
      return escalate('HUMAN_HANDOFF', 'NORMAL', 'auto_reply_failed_validation', `Needs you: ${ctx.leadEmail}`, 'Could not produce a safe auto-reply; handed to a human.');
    }
    return { action: 'AUTO_REPLY', classification: cls, reply: { ...t, valid: v.valid, validationIssues: v.issues.map((i) => `[${i.code}] ${i.message}`) } };
  }

  // 6. Not now -> one polite nudge, then stop.
  if (cls === 'NOT_NOW') {
    if (ctx.autoRepliesSoFar >= 1) return { action: 'STOP', classification: cls, stopReason: 'declined_after_nudge' };
    const t = replyTemplate('NUDGE', firstName, company);
    const v = validateEmailDraft({ subject: t.subject, body: t.body, stepNumber: 2, isSendTime: true, strictOverride: true });
    if (!v.valid) return { action: 'STOP', classification: cls, stopReason: 'declined' };
    return { action: 'AUTO_REPLY', classification: cls, reply: { ...t, valid: v.valid, validationIssues: v.issues.map((i) => `[${i.code}] ${i.message}`) } };
  }

  // 7. Wrong person -> ask for the right contact once, else escalate.
  if (cls === 'WRONG_PERSON') {
    if (ctx.autoRepliesSoFar >= 1) {
      return escalate('HUMAN_HANDOFF', 'NORMAL', 'wrong_person_unresolved', `Routing help: ${ctx.leadEmail}`, 'Reached the wrong person and no redirect yet. Needs a human to re-route.');
    }
    const t = replyTemplate('WRONG_PERSON', firstName, company);
    const v = validateEmailDraft({ subject: t.subject, body: t.body, stepNumber: 2, isSendTime: true, strictOverride: true });
    if (!v.valid) return escalate('HUMAN_HANDOFF', 'NORMAL', 'auto_reply_failed_validation', `Needs you: ${ctx.leadEmail}`, 'Could not produce a safe auto-reply; handed to a human.');
    return { action: 'AUTO_REPLY', classification: cls, reply: { ...t, valid: v.valid, validationIssues: v.issues.map((i) => `[${i.code}] ${i.message}`) } };
  }

  // 8. Everything else (NONE / ambiguous human message) -> escalate. Never guess.
  return escalate('LOW_CONFIDENCE', 'NORMAL', 'unclassified_human_reply', `Unclear reply: ${ctx.leadEmail}`, 'A human reply the agent could not classify with confidence. Handed over rather than guessing.');
}
