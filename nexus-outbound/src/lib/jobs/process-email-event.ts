import { inngest } from "./inngest";
import prisma from "@/lib/db/prisma";
import { classifySentiment, generateDraftReply } from "@/lib/services/ai.service";
import { sendWhatsAppAlert } from "@/lib/services/whatsapp-alert.service";
import { SmartleadProvider } from "@/lib/providers/smartlead";

const emailProvider = new SmartleadProvider();

export const processEmailEventJob = inngest.createFunction(
  {
    id: "process-email-event",
    triggers: [{ event: "email/event.received" }],
  },
  async ({ event, step }) => {
    const { eventType, providerEventId, providerLeadId, email, replyText, bounceType } = (event as any).data || {};

    // 1. Idempotency Check
    const existingEvent = await step.run("check-idempotency", async () => {
      return await prisma.emailEvent.findUnique({
        where: { providerEventId },
      });
    });

    if (existingEvent) {
      return { status: "skipped_duplicate" };
    }

    // 2. Find Lead
    const lead = await step.run("find-lead", async () => {
      if (providerLeadId) {
        return await prisma.lead.findFirst({ where: { providerLeadId } });
      }
      if (email) {
        return await prisma.lead.findFirst({ where: { email } });
      }
      return null;
    });

    if (!lead) {
      return { status: "lead_not_found" };
    }

    // 3. Store Event
    await step.run("store-event", async () => {
      await prisma.emailEvent.create({
        data: {
          leadId: lead.id,
          eventType,
          providerEventId,
          rawPayload: (event as any).data || {},
        },
      });
    });

    // 4. Handle Event Specific Business Logic
    if (eventType === "opened") {
      await step.run("handle-open-event", async () => {
        const now = new Date();
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            firstOpenAt: lead.firstOpenAt ? undefined : now,
            lastOpenAt: now,
            openCount: { increment: 1 },
            leadCategory: lead.leadCategory === "UNCATEGORIZED" || lead.leadCategory === "NOT_WORKING" ? "POTENTIAL" : undefined,
          },
        });
      });
    } else if (eventType === "replied") {
      await step.run("handle-reply-event", async () => {
        const now = new Date();

        // Update lead state
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "REPLIED",
            repliedAt: now,
            leadCategory: "WORKING",
          },
        });

        // Stop sequence in provider
        if (lead.providerLeadId) {
          await emailProvider.stopLeadSequence(lead.providerLeadId);
        }

        // AI Sentiment & Draft Generation
        if (replyText) {
          const { sentiment, confidence } = await classifySentiment(replyText);
          
          await prisma.lead.update({
            where: { id: lead.id },
            data: { aiSentiment: sentiment },
          });

          if (sentiment === "INTERESTED") {
            const draftBody = await generateDraftReply({
              originalSubject: "Outreach Followup",
              originalBody: "How Nexus Outbound optimizes outreach",
              leadReply: replyText,
              leadName: lead.firstName || undefined,
            });

            await prisma.aiDraft.create({
              data: {
                leadId: lead.id,
                draftBody,
                status: "PENDING_REVIEW",
                confidence,
              },
            });
          }
        }
      });
    } else if (eventType === "bounced") {
      await step.run("handle-bounce-event", async () => {
        const isHard = bounceType === "hard";
        const newBounceCount = lead.bounceCount + 1;

        if (isHard || newBounceCount >= 3) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: "BOUNCED",
              bounceCount: newBounceCount,
              bounceType: isHard ? "hard" : "soft",
            },
          });

          // Add email to global suppression list
          await prisma.suppressedEmail.upsert({
            where: { email: lead.email },
            update: { reason: "HARD_BOUNCE" },
            create: { email: lead.email, reason: "HARD_BOUNCE", source: "webhook_bounce" },
          });

          // Circuit breaker check on mailboxes
          const mailboxes = await prisma.mailbox.findMany({ where: { status: "ACTIVE" } });
          for (const box of mailboxes) {
            if (box.pausedReason && box.pausedReason.includes("Bounce rate threshold")) {
              await prisma.mailbox.update({
                where: { id: box.id },
                data: { status: "PAUSED", pausedReason: "Auto-paused: Bounce rate threshold >5%" },
              });
              await sendWhatsAppAlert(`🚨 [Circuit Breaker] Mailbox ${box.senderEmail} auto-paused! Bounce rate exceeded 5% threshold.`);
            }
          }
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { bounceCount: newBounceCount, bounceType: "soft" },
          });
        }
      });
    } else if (eventType === "complained" || eventType === "spam_report") {
      await step.run("handle-complaint-event", async () => {
        // Mark lead as suppressed & complained
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "UNSUBSCRIBED" },
        });

        // Add email to global suppression list immediately
        await prisma.suppressedEmail.upsert({
          where: { email: lead.email },
          update: { reason: "COMPLAINED" },
          create: { email: lead.email, reason: "COMPLAINED", source: "webhook_complaint" },
        });

        // Instant WhatsApp Alert for spam complaints
        await sendWhatsAppAlert(`⚠️ [Spam Complaint] Lead ${lead.email} submitted a spam report! Lead suppressed globally.`);
      });
    }

    return { status: "success", eventType };
  }
);
