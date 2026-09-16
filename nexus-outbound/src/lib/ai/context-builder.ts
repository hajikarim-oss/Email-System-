import { PrismaClient, OutreachState, RecencyBucket } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export interface ContactPromptContext {
  email: string;
  name: string;
  company: string;
  domain: string;
  isBurned: boolean;
  temporalState: OutreachState;
  recencyBucket: RecencyBucket;
  recencyDescription: string;
  touchCount: number;
  lastRep: {
    name: string;
    email: string;
    campaign: string;
  };
  lastMessage: {
    subject: string;
    openingHook: string;
    outcome: string;
    date: string;
  };
  contextBlock: string;
  promptGuidelines: string[];
  touchTimeline: Array<{
    step: number;
    date: string;
    rep: string;
    subject: string;
    hook: string;
  }>;
}

export async function buildContactPromptContext(
  emailOrId: string
): Promise<ContactPromptContext | null> {
  const query = emailOrId.toLowerCase().trim();

  // Find lead by email or ID
  const lead = await prisma.lead.findFirst({
    where: {
      OR: [{ email: query }, { id: query }],
    },
  });

  if (!lead) return null;

  // Retrieve message history (Layer A)
  const messages = await prisma.emailMessage.findMany({
    where: { contactEmail: lead.email, isExcluded: false },
    orderBy: { createdAt: "asc" },
  });

  const lastMsg = messages[messages.length - 1];
  const touchCount = messages.length || lead.totalMessages || 1;
  const daysSince = lead.daysSinceLastContact ?? 0;

  // Build human-friendly recency description
  let recencyDescription = "Never contacted";
  if (lead.lastContactedAt) {
    const months = Math.floor(daysSince / 30);
    if (daysSince <= 7) recencyDescription = `Contacted ${daysSince} days ago (this week)`;
    else if (daysSince <= 30) recencyDescription = `Contacted ${daysSince} days ago (this month)`;
    else if (months <= 12) recencyDescription = `Contacted ${months} months ago (${lead.lastContactedAt.toLocaleDateString()})`;
    else {
      const years = (daysSince / 365).toFixed(1);
      recencyDescription = `Contacted ${years} years ago (${lead.lastContactedAt.toLocaleDateString()})`;
    }
  }

  const company = lead.domain ? lead.domain.split(".")[0].toUpperCase() : "Company";
  const repName = lastMsg?.senderName || (lastMsg?.senderEmail?.split("@")[0]) || lead.lastSender?.split("@")[0] || "Outreach Team";
  const repEmail = lastMsg?.senderEmail || lead.lastSender || "outreach@theboredmonkey.com";
  const campaign = lastMsg?.campaignClean || lead.lastCampaign || "Outreach";
  const outcome = lead.isBurned
    ? "bounced/spam_blocked"
    : lead.totalReplied > 0
    ? "replied"
    : "delivered, never replied";

  const subject = lastMsg?.subjectRaw || lead.lastSubject || "Follow up";
  const hook = lastMsg?.bodyHook || lead.lastBodyHook || "";

  // Timeline
  const touchTimeline = messages.map((m, idx) => ({
    step: idx + 1,
    date: m.createdAt.toISOString().split("T")[0],
    rep: m.senderName || m.senderEmail.split("@")[0],
    subject: m.subjectRaw,
    hook: m.bodyHook,
  }));

  // Guidelines for LLM generator based on temporal state
  const guidelines: string[] = [];
  if (lead.isBurned) {
    guidelines.push("CRITICAL: Lead is burned. DO NOT SEND ANY OUTREACH.");
  } else if (lead.outreachState === "DO_NOT_CONTACT_RECENTLY") {
    guidelines.push("Contacted very recently (<= 7 days). Hold outreach to avoid spam fatigue.");
  } else if (lead.outreachState === "DORMANT_REPLIED") {
    guidelines.push("Lead replied positively in the past (> 180 days ago). Reference past alignment directly.");
    guidelines.push(`Acknowledge the gap respectfully (${daysSince} days since last touch).`);
    guidelines.push("Present fresh 2026 case study or update relevant to their industry.");
  } else if (lead.outreachState === "COLD_REENGAGEMENT") {
    guidelines.push(`Pitch was delivered ${daysSince} days ago without reply.`);
    guidelines.push("Do NOT say 'following up on my email from 2 years ago'.");
    guidelines.push("Use a fresh angle or new relevant asset to restart the conversation cleanly.");
  }

  // Structured Text Context Block (exactly matching brief format)
  const contextBlock = [
    `We contacted ${lead.firstName || lead.email} at ${company} on ${lead.lastContactedAt ? lead.lastContactedAt.toDateString() : "earlier"} about ${campaign}.`,
    `Subject: "${subject}"`,
    `Hook: "${hook}"`,
    `Sender: ${repName} (${repEmail})`,
    `Outcome: ${outcome}`,
    `Days since last touch: ${daysSince}`,
    `Recency: ${lead.recencyBucket.toLowerCase()}`,
    `Outreach state: ${lead.outreachState.toLowerCase()}`,
  ].join("\n");

  return {
    email: lead.email,
    name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email.split("@")[0],
    company,
    domain: lead.domain || "",
    isBurned: lead.isBurned,
    temporalState: lead.outreachState,
    recencyBucket: lead.recencyBucket,
    recencyDescription,
    touchCount,
    lastRep: {
      name: repName,
      email: repEmail,
      campaign,
    },
    lastMessage: {
      subject,
      openingHook: hook,
      outcome,
      date: lead.lastContactedAt?.toISOString() || "",
    },
    contextBlock,
    promptGuidelines: guidelines,
    touchTimeline,
  };
}
