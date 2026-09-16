import { PrismaClient, OutreachState, RecencyBucket, ReplyClass } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export interface NewEmailEventInput {
  messageId: string;
  providerThreadId?: string | null;
  providerMessageId?: string | null;
  contactEmail: string;
  senderEmail: string;
  senderName?: string | null;
  direction?: "outbound" | "inbound";
  subject: string;
  bodyHook: string;
  bodyFull?: string | null;
  campaignName?: string | null;
  stepId?: string | null;
  touchId?: string | null;
  status: "completed" | "failed" | string;
  bounced?: boolean;
  spamBlocked?: boolean;
  replied?: boolean;
  replyClassification?: ReplyClass;
  failureReason?: string | null;
  createdAt: Date | string;
  source?: string;
}

export function computeRecencyBucket(days: number | null): RecencyBucket {
  if (days === null || days < 0) return RecencyBucket.NEVER_CONTACTED;
  if (days <= 7) return RecencyBucket.TOUCHED_THIS_WEEK;
  if (days <= 30) return RecencyBucket.TOUCHED_THIS_MONTH;
  if (days <= 90) return RecencyBucket.TOUCHED_THIS_QUARTER;
  if (days <= 180) return RecencyBucket.TOUCHED_LAST_6_MONTHS;
  if (days <= 365) return RecencyBucket.TOUCHED_LAST_YEAR;
  if (days <= 730) return RecencyBucket.DORMANT_1_TO_2_YEARS;
  return RecencyBucket.DORMANT_OVER_2_YEARS;
}

export function computeOutreachState(params: {
  isBurned: boolean;
  daysSinceLastContact: number | null;
  totalReplied: number;
  bestReplyClass: ReplyClass;
}): OutreachState {
  if (params.isBurned) return OutreachState.BURNED;
  const days = params.daysSinceLastContact;
  if (days !== null && days <= 7) return OutreachState.DO_NOT_CONTACT_RECENTLY;
  if (params.totalReplied > 0) {
    if (days !== null && days <= 30) return OutreachState.WARM_ACTIVE;
    if (days !== null && days <= 180) return OutreachState.WARM_STALE;
    if (params.bestReplyClass === ReplyClass.INTERESTED) return OutreachState.DORMANT_REPLIED;
  }
  if (days !== null && days > 180) return OutreachState.COLD_REENGAGEMENT;
  return OutreachState.IN_SEQUENCE;
}

export async function ingestEmailEvent(event: NewEmailEventInput): Promise<{
  action: "inserted" | "skipped_duplicate";
  messageId: string;
  contactEmail: string;
  outreachState?: OutreachState;
}> {
  const email = event.contactEmail.toLowerCase().trim();
  const domain = email.includes("@") ? email.split("@")[1] : null;

  // 1. Idempotency Check
  const existing = await prisma.emailMessage.findUnique({
    where: { id: event.messageId },
    select: { id: true },
  });

  if (existing) {
    return { action: "skipped_duplicate", messageId: event.messageId, contactEmail: email };
  }

  const createdAt = typeof event.createdAt === "string" ? new Date(event.createdAt) : event.createdAt;
  const replyClass = event.replyClassification || ReplyClass.NONE;

  // 2. Exclusion Check for own domain
  const isExcluded = domain ? ["theboredmonkey.com", "theboredmonkey.in"].includes(domain) : false;

  // 3. Insert into EmailMessage (Layer A)
  await prisma.emailMessage.create({
    data: {
      id: event.messageId,
      providerThreadId: event.providerThreadId,
      providerMessageId: event.providerMessageId,
      contactEmail: email,
      brandDomain: domain,
      senderEmail: event.senderEmail.toLowerCase().trim(),
      senderName: event.senderName,
      direction: event.direction || "outbound",
      subjectRaw: event.subject,
      subjectNormalized: event.subject.toLowerCase().trim(),
      bodyHook: event.bodyHook.slice(0, 201),
      bodyFull: event.bodyFull,
      campaignRaw: event.campaignName,
      campaignClean: event.campaignName?.trim(),
      stepId: event.stepId,
      touchId: event.touchId,
      status: event.status,
      bounced: Boolean(event.bounced),
      spamBlocked: Boolean(event.spamBlocked),
      replied: Boolean(event.replied),
      replyClassification: replyClass,
      failureReason: event.failureReason,
      createdAt,
      source: event.source || "api",
      isExcluded,
    },
  });

  // If excluded, do not link to prospect directory
  if (isExcluded) {
    return { action: "inserted", messageId: event.messageId, contactEmail: email };
  }

  // Handle suppression quarantine if bounced or spam blocked
  if (event.bounced || event.spamBlocked) {
    await prisma.suppressedEmail.upsert({
      where: { email },
      update: {},
      create: {
        email,
        reason: event.bounced ? "HARD_BOUNCE" : "COMPLAINED",
        source: `email_event:${event.messageId}`,
      },
    });
  }

  // 4. Recompute Contact State (Layer B)
  const contactMessages = await prisma.emailMessage.findMany({
    where: { contactEmail: email, isExcluded: false },
    orderBy: { createdAt: "asc" },
  });

  const totalMessages = contactMessages.length;
  const totalOutbound = contactMessages.filter((m) => m.direction === "outbound").length;
  const totalInbound = contactMessages.filter((m) => m.direction === "inbound").length;
  const totalReplied = contactMessages.filter((m) => m.replied).length;
  const totalBounced = contactMessages.filter((m) => m.bounced).length;
  const totalSpam = contactMessages.filter((m) => m.spamBlocked).length;

  const firstMsg = contactMessages[0];
  const lastMsg = contactMessages[contactMessages.length - 1];

  const firstContactedAt = firstMsg?.createdAt || createdAt;
  const lastContactedAt = lastMsg?.createdAt || createdAt;

  const nowMs = Date.now();
  const daysSinceLastContact = Math.max(0, Math.floor((nowMs - lastContactedAt.getTime()) / 86400000));
  const daysSinceFirstContact = Math.max(0, Math.floor((nowMs - firstContactedAt.getTime()) / 86400000));

  const isBurned = totalBounced > 0 || totalSpam > 0;
  let bestReplyClass: ReplyClass = ReplyClass.NONE;
  for (const m of contactMessages) {
    if (m.replyClassification === ReplyClass.INTERESTED) {
      bestReplyClass = ReplyClass.INTERESTED;
      break;
    }
    if (m.replyClassification !== ReplyClass.NONE && bestReplyClass === ReplyClass.NONE) {
      bestReplyClass = m.replyClassification;
    }
  }

  const recencyBucket = computeRecencyBucket(daysSinceLastContact);
  const outreachState = computeOutreachState({
    isBurned,
    daysSinceLastContact,
    totalReplied,
    bestReplyClass,
  });

  const isDormant = daysSinceLastContact > 180;
  const isReengagementCandidate = !isBurned && (outreachState === OutreachState.DORMANT_REPLIED || outreachState === OutreachState.COLD_REENGAGEMENT);

  const tags = [
    isBurned ? "burned" : "clean",
    "prospect",
    `recency:${recencyBucket.toLowerCase()}`,
    `outreach:${outreachState.toLowerCase()}`,
  ];
  if (bestReplyClass !== ReplyClass.NONE) {
    tags.push(`reply:${bestReplyClass.toLowerCase()}`);
  }

  await prisma.lead.upsert({
    where: { id: email }, // if searching by custom, let's findFirst or upsert
    create: {
      email,
      domain,
      status: isBurned ? "BOUNCED" : totalReplied > 0 ? "REPLIED" : "ACTIVE",
      lastMessageId: lastMsg?.id,
      lastMessageAt: lastContactedAt,
      lastSubject: lastMsg?.subjectRaw,
      lastBodyHook: lastMsg?.bodyHook,
      lastSender: lastMsg?.senderEmail,
      lastCampaign: lastMsg?.campaignRaw,
      lastOutcome: lastMsg?.bounced ? "bounced" : lastMsg?.replied ? "replied" : "delivered",
      totalMessages,
      totalOutbound,
      totalInbound,
      totalReplied,
      totalBounced,
      totalSpam,
      firstContactedAt,
      lastContactedAt,
      daysSinceFirstContact,
      daysSinceLastContact,
      recencyBucket,
      outreachState,
      isBurned,
      isDormant,
      isReengagementCandidate,
      replyClassification: bestReplyClass,
      tags,
      intelligenceUpdatedAt: new Date(),
    },
    update: {
      domain,
      status: isBurned ? "BOUNCED" : totalReplied > 0 ? "REPLIED" : "ACTIVE",
      lastMessageId: lastMsg?.id,
      lastMessageAt: lastContactedAt,
      lastSubject: lastMsg?.subjectRaw,
      lastBodyHook: lastMsg?.bodyHook,
      lastSender: lastMsg?.senderEmail,
      lastCampaign: lastMsg?.campaignRaw,
      lastOutcome: lastMsg?.bounced ? "bounced" : lastMsg?.replied ? "replied" : "delivered",
      totalMessages,
      totalOutbound,
      totalInbound,
      totalReplied,
      totalBounced,
      totalSpam,
      firstContactedAt,
      lastContactedAt,
      daysSinceFirstContact,
      daysSinceLastContact,
      recencyBucket,
      outreachState,
      isBurned,
      isDormant,
      isReengagementCandidate,
      replyClassification: bestReplyClass,
      tags,
      intelligenceUpdatedAt: new Date(),
    },
  }).catch(async () => {
    // If id upsert is not matched because id is cuid, find lead by email
    const existingLead = await prisma.lead.findFirst({ where: { email } });
    if (existingLead) {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          lastMessageId: lastMsg?.id,
          lastMessageAt: lastContactedAt,
          lastSubject: lastMsg?.subjectRaw,
          lastBodyHook: lastMsg?.bodyHook,
          lastSender: lastMsg?.senderEmail,
          lastCampaign: lastMsg?.campaignRaw,
          lastOutcome: lastMsg?.bounced ? "bounced" : lastMsg?.replied ? "replied" : "delivered",
          totalMessages,
          totalOutbound,
          totalInbound,
          totalReplied,
          totalBounced,
          totalSpam,
          firstContactedAt,
          lastContactedAt,
          daysSinceFirstContact,
          daysSinceLastContact,
          recencyBucket,
          outreachState,
          isBurned,
          isDormant,
          isReengagementCandidate,
          replyClassification: bestReplyClass,
          tags,
          intelligenceUpdatedAt: new Date(),
        },
      });
    } else {
      await prisma.lead.create({
        data: {
          email,
          domain,
          status: isBurned ? "BOUNCED" : totalReplied > 0 ? "REPLIED" : "ACTIVE",
          lastMessageId: lastMsg?.id,
          lastMessageAt: lastContactedAt,
          lastSubject: lastMsg?.subjectRaw,
          lastBodyHook: lastMsg?.bodyHook,
          lastSender: lastMsg?.senderEmail,
          lastCampaign: lastMsg?.campaignRaw,
          lastOutcome: lastMsg?.bounced ? "bounced" : lastMsg?.replied ? "replied" : "delivered",
          totalMessages,
          totalOutbound,
          totalInbound,
          totalReplied,
          totalBounced,
          totalSpam,
          firstContactedAt,
          lastContactedAt,
          daysSinceFirstContact,
          daysSinceLastContact,
          recencyBucket,
          outreachState,
          isBurned,
          isDormant,
          isReengagementCandidate,
          replyClassification: bestReplyClass,
          tags,
          intelligenceUpdatedAt: new Date(),
        },
      });
    }
  });

  // 5. Recompute Brand State (Layer C)
  if (domain) {
    const leadsInBrand = await prisma.lead.findMany({
      where: { domain },
      select: { isBurned: true, totalReplied: true, lastContactedAt: true, daysSinceLastContact: true },
    });

    const totalContacts = leadsInBrand.length;
    const cleanContacts = leadsInBrand.filter((l) => !l.isBurned).length;
    const burnedContacts = leadsInBrand.filter((l) => l.isBurned).length;
    const repliedContacts = leadsInBrand.filter((l) => l.totalReplied > 0).length;

    let minDays: number | null = null;
    let maxLastDate: Date | null = null;
    for (const l of leadsInBrand) {
      if (l.daysSinceLastContact !== null) {
        if (minDays === null || l.daysSinceLastContact < minDays) minDays = l.daysSinceLastContact;
      }
      if (l.lastContactedAt) {
        if (!maxLastDate || l.lastContactedAt > maxLastDate) maxLastDate = l.lastContactedAt;
      }
    }

    const brandRecencyBucket = computeRecencyBucket(minDays);
    const brandOutreachState = repliedContacts > 0 ? OutreachState.DORMANT_REPLIED : (minDays && minDays > 180) ? OutreachState.COLD_REENGAGEMENT : OutreachState.IN_SEQUENCE;

    await prisma.brand.upsert({
      where: { domain },
      create: {
        domain,
        name: domain.split(".")[0].toUpperCase(),
        totalContacts,
        cleanContacts,
        burnedContacts,
        repliedContacts,
        lastContactedAt: maxLastDate,
        daysSinceLastContact: minDays,
        recencyBucket: brandRecencyBucket,
        outreachState: brandOutreachState,
        tags: [`domain:${domain}`],
      },
      update: {
        totalContacts,
        cleanContacts,
        burnedContacts,
        repliedContacts,
        lastContactedAt: maxLastDate,
        daysSinceLastContact: minDays,
        recencyBucket: brandRecencyBucket,
        outreachState: brandOutreachState,
      },
    });
  }

  return {
    action: "inserted",
    messageId: event.messageId,
    contactEmail: email,
    outreachState,
  };
}
