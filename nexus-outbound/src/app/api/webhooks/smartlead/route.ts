import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { verifyHmacSignature } from "@/lib/encryption";
import { ingestEmailEvent } from "@/lib/intelligence/ingest-event";

/**
 * POST /api/webhooks/smartlead
 * 
 * Receives email events from Smartlead.
 * Smartlead event types: EMAIL_SENT, EMAIL_OPENED, EMAIL_CLICKED, EMAIL_REPLIED, EMAIL_BOUNCED, LEAD_UNSUBSCRIBED
 */
export async function POST(req: Request) {
  try {
    let payload: any;

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.SMARTLEAD_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-smartlead-signature");
      if (!signature) {
        return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
      }
      const body = await req.text();
      if (!verifyHmacSignature(body, signature, webhookSecret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      payload = JSON.parse(body);
    } else {
      payload = await req.json();
    }

    // Debug: log the full payload to see what Smartlead sends
    console.log("=== SMARTLEAD WEBHOOK RECEIVED ===");
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

    // Smartlead event types map to our internal event types
    const eventType = payload.event_type || payload.type || "unknown";
    const email = payload.email || payload.lead_email || payload.to_email || payload.lead?.email || payload.recipient_email || "";
    const campaignId = payload.email_campaign_id || payload.campaign_id;
    const providerEventId = payload.event_id || payload.id || payload.message_id || payload.webhook_id
      || `sl:${eventType}:${email}:${campaignId || ""}:${payload.timestamp ?? payload.created_at ?? payload.sent_at ?? Date.now()}`;
    const providerLeadId = payload.lead_id || payload.provider_lead_id;

    // Map Smartlead event types to our internal types
    const eventMap: Record<string, string> = {
      EMAIL_SENT: "sent",
      FIRST_EMAIL_SENT: "sent",
      EMAIL_OPENED: "opened",
      EMAIL_OPEN: "opened",
      EMAIL_CLICKED: "clicked",
      EMAIL_LINK_CLICK: "clicked",
      EMAIL_REPLIED: "replied",
      EMAIL_REPLY: "replied",
      EMAIL_BOUNCED: "bounced",
      EMAIL_BOUNCE: "bounced",
      LEAD_UNSUBSCRIBED: "unsubscribed",
      LEAD_CATEGORY_UPDATED: "category_updated",
      CAMPAIGN_STATUS_CHANGED: "campaign_status_changed",
      MANUAL_STEP_REACHED: "manual_step_reached",
      MANUAL_REPLY_SENT: "manual_reply_sent",
      UNTRACKED_REPLIES: "untracked_reply",
    };
    const internalEventType = eventMap[eventType.toUpperCase()] || eventType.toLowerCase();

    // Idempotency check
    const existing = await prisma.emailEvent.findFirst({
      where: { providerEventId },
    });
    if (existing) {
      return NextResponse.json({ received: true, note: "duplicate" });
    }

    // Find lead by provider lead ID, then by email scoped to campaign, then by email globally
    let lead = null;
    if (providerLeadId) {
      lead = await prisma.lead.findFirst({ where: { providerLeadId: String(providerLeadId) } });
    }
    if (!lead && email && campaignId) {
      const camp = await prisma.campaign.findFirst({
        where: { OR: [{ providerCampaignId: String(campaignId) }, { id: String(campaignId) }] },
        select: { id: true },
      });
      if (camp) {
        lead = await prisma.lead.findFirst({ where: { email: email.toLowerCase(), campaignId: camp.id } });
      }
    }
    if (!lead && email) {
      lead = await prisma.lead.findFirst({ where: { email: email.toLowerCase() } });
    }

    // For bounces and unsubscribes, suppress the email even if lead not in our DB
    if (!lead && email) {
      if (internalEventType === "bounced") {
        // Try harder to find the lead — search by email across ALL leads (not just this campaign)
        const allMatches = await prisma.lead.findMany({ where: { email: email.toLowerCase() } });
        if (allMatches.length > 0) {
          lead = allMatches[0]; // Use the first match
        } else {
          // No lead in DB at all — suppress anyway
          await prisma.suppressedEmail.upsert({
            where: { email: email.toLowerCase() },
            update: { reason: "HARD_BOUNCE" },
            create: { email: email.toLowerCase(), reason: "HARD_BOUNCE", source: "smartlead_webhook" },
          });
          return NextResponse.json({ received: true, eventType: internalEventType, note: "email_suppressed_no_lead" });
        }
      }

      if (internalEventType === "unsubscribed") {
        const allMatches = await prisma.lead.findMany({ where: { email: email.toLowerCase() } });
        if (allMatches.length > 0) {
          lead = allMatches[0];
        } else {
          await prisma.suppressedEmail.upsert({
            where: { email: email.toLowerCase() },
            update: { reason: "UNSUBSCRIBED" },
            create: { email: email.toLowerCase(), reason: "UNSUBSCRIBED", source: "smartlead_webhook" },
          });
          return NextResponse.json({ received: true, eventType: internalEventType, note: "email_suppressed_no_lead" });
        }
      }

      // Auto-enroll: if a lead doesn't exist but we know the campaign, create the lead
      // so events are never silently dropped
      if (campaignId) {
        const campaign = await prisma.campaign.findFirst({
          where: { OR: [{ providerCampaignId: String(campaignId) }, { id: String(campaignId) }] },
          select: { id: true, userId: true },
        });
        if (campaign) {
          const firstName = String(payload.first_name || payload.lead?.first_name || email.split("@")[0] || "").slice(0, 100);
          const lastName = String(payload.last_name || payload.lead?.last_name || "").slice(0, 100);
          try {
            lead = await prisma.lead.create({
              data: {
                campaignId: campaign.id,
                email: email.toLowerCase(),
                firstName: firstName || null,
                lastName: lastName || null,
                providerLeadId: providerLeadId ? String(providerLeadId) : null,
                source: "smartlead",
                status: "ACTIVE",
              },
            });
            console.log(`[Webhook] Auto-enrolled lead ${email} into campaign ${campaign.id}`);
          } catch {
            lead = await prisma.lead.findFirst({
              where: { email: email.toLowerCase(), campaignId: campaign.id },
            });
          }
        }
      }

      if (!lead) {
        console.warn(`Smartlead webhook: lead not found for email=${email}, leadId=${providerLeadId}, event=${eventType}`);
        return NextResponse.json({ received: true, note: "lead_not_found", debug: { email, providerLeadId, eventType } });
      }
    }

    // Safety: if lead is still null for any reason, don't crash
    if (!lead) {
      console.warn(`Smartlead webhook: lead is null after all lookups. event=${eventType}, email=${email}`);
      return NextResponse.json({ received: true, note: "lead_null_safety" });
    }

    // Sync providerLeadId if we have it and the lead doesn't
    if (providerLeadId && !lead.providerLeadId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { providerLeadId: String(providerLeadId) },
      }).catch(() => {});
    }

    // Store the event with fromEmail for live tracking
    const fromEmail = payload.from_email || payload.sender_email || payload.from || "";
    try {
      await prisma.emailEvent.create({
        data: {
          leadId: lead.id,
          eventType: internalEventType,
          providerEventId,
          fromEmail: fromEmail || null,
          rawPayload: payload,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return NextResponse.json({ received: true, note: "duplicate" });
      }
      throw e;
    }

    // Update lead status based on event type
    const now = new Date();

    switch (internalEventType) {
      case "sent": {
        const step = payload.step || payload.sequence_number || payload.email_sequence_number;
        const stepNum = typeof step === "number" ? step : parseInt(step);
        const sentUpdate: Record<string, any> = {
          totalOutbound: { increment: 1 },
          totalMessages: { increment: 1 },
          lastContactedAt: now,
          lastDeliveredAt: now,
          lastOutcome: "delivered",
        };
        if (!isNaN(stepNum) && stepNum > lead.lastStepSent) {
          sentUpdate.lastStepSent = stepNum;
        }
        if (!lead.firstContactedAt) {
          sentUpdate.firstContactedAt = now;
        }
        await prisma.lead.update({ where: { id: lead.id }, data: sentUpdate });

        // Live Intelligence Ingestion
        await ingestEmailEvent({
          messageId: providerEventId,
          contactEmail: email,
          senderEmail: fromEmail || "outreach@theboredmonkey.com",
          direction: "outbound",
          subject: payload.subject || "",
          bodyHook: (payload.body || "").slice(0, 201),
          status: "completed",
          createdAt: now,
          source: "smartlead_webhook",
        }).catch((err) => console.warn("[Intelligence] Ingest sent error:", err));
        break;
      }

      case "opened": {
        // Smart Filter: Ensure this is a genuine client open, not CC/BCC or internal team preview
        const openerEmail = (payload.email || payload.lead_email || payload.opened_by || "").toLowerCase();
        const bccEmail = (payload.bcc || payload.bcc_email || "").toLowerCase();
        const fromEmail = (payload.from_email || payload.sender_email || "").toLowerCase();

        const isInternalTeam = 
          openerEmail.endsWith("@theboredmonkey.com") ||
          openerEmail.includes("haji.karim") ||
          openerEmail.includes("vatsal.vadecha") ||
          openerEmail.includes("snehal.maurya") ||
          openerEmail.includes("preeti.karki");

        const isBccOrSender = 
          (fromEmail && openerEmail === fromEmail) ||
          (bccEmail && openerEmail === bccEmail) ||
          (lead.email && openerEmail && openerEmail !== lead.email.toLowerCase());

        if (isInternalTeam || isBccOrSender) {
          console.log(`[SmartFilter] Ignored non-client/BCC open event for lead=${lead.email}, opener=${openerEmail}`);
          break;
        }

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            firstOpenAt: lead.firstOpenAt ? undefined : now,
            lastOpenAt: now,
            openCount: { increment: 1 },
            leadCategory:
              lead.leadCategory === "UNCATEGORIZED" || lead.leadCategory === "NOT_WORKING"
                ? "POTENTIAL"
                : undefined,
          },
        });
        break;
      }

      case "clicked": {
        const clickerEmail = (payload.email || payload.lead_email || "").toLowerCase();
        if (clickerEmail.endsWith("@theboredmonkey.com")) {
          console.log(`[SmartFilter] Ignored internal team click from ${clickerEmail}`);
          break;
        }
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            clickCount: { increment: 1 },
            leadCategory:
              lead.leadCategory === "UNCATEGORIZED" || lead.leadCategory === "NOT_WORKING"
                ? "POTENTIAL"
                : undefined,
          },
        });
        break;
      }

      case "replied":
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "REPLIED",
            repliedAt: now,
            lastRepliedAt: now,
            leadCategory: "WORKING",
            totalInbound: { increment: 1 },
            totalReplied: { increment: 1 },
            totalMessages: { increment: 1 },
            lastContactedAt: now,
          },
        });

        // Live Intelligence Ingestion
        await ingestEmailEvent({
          messageId: providerEventId,
          contactEmail: email,
          senderEmail: fromEmail || "outreach@theboredmonkey.com",
          direction: "inbound",
          subject: payload.subject || "Reply",
          bodyHook: (payload.reply_text || payload.body || "").slice(0, 201),
          bodyFull: payload.reply_text || payload.body || null,
          status: "completed",
          replied: true,
          createdAt: now,
          source: "smartlead_webhook",
        }).catch((err) => console.warn("[Intelligence] Ingest reply error:", err));

        // Create notification for the campaign owner
        if (campaignId) {
          try {
            const campaign = await prisma.campaign.findFirst({
              where: { providerCampaignId: String(campaignId) },
              select: { id: true, userId: true, name: true },
            });
            if (campaign) {
              const clientEmail = payload.to_email || payload.recipient_email || "";

              await prisma.notification.create({
                data: {
                  userId: campaign.userId,
                  type: "reply",
                  title: "New Reply Received",
                  message: `${email} replied to ${campaign.name}`,
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                  leadEmail: email,
                  clientEmail: clientEmail || undefined,
                  metadata: {
                    replyText: payload.reply_text || payload.body || "",
                    sentiment: payload.sentiment || "unknown",
                    subject: payload.subject || "",
                  },
                },
              });
            }
          } catch (e) {
            console.warn("Failed to create reply notification:", e);
          }
        }

        // Safety: also pause this lead in Smartlead to prevent any further emails
        // (Smartlead already stops on reply, but this is an extra safeguard)
        if (lead.providerLeadId && campaignId) {
          try {
            // Find the correct Smartlead API key from the campaign's mailbox owner
            const campaignRecord = await prisma.campaign.findFirst({
              where: { providerCampaignId: String(campaignId) },
              include: {
                mailboxes: {
                  include: {
                    mailbox: {
                      include: { user: { select: { smartleadApiKey: true } } },
                    },
                  },
                },
                user: { select: { smartleadApiKey: true } },
              },
            });
            const smartleadApiKey = campaignRecord?.mailboxes[0]?.mailbox?.user?.smartleadApiKey
              || campaignRecord?.user?.smartleadApiKey
              || process.env.SMARTLEAD_API_KEY;
            if (smartleadApiKey) {
              const smartleadLeadId = parseInt(String(lead.providerLeadId), 10);
              if (!isNaN(smartleadLeadId)) {
                await fetch(
                  `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/leads/${smartleadLeadId}/pause?api_key=${smartleadApiKey}`,
                  { method: "POST" }
                );
              }
            }
          } catch (e) {
            console.warn("Failed to pause lead in Smartlead after reply:", e);
          }
        }
        break;

      case "bounced":
        const bounceType = payload.bounce_type || payload.type || "hard";
        const isHard = bounceType === "hard" || bounceType === "HARD";
        const newBounceCount = lead.bounceCount + 1;

        if (isHard || newBounceCount >= 3) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: "BOUNCED",
              bounceCount: newBounceCount,
              bounceType: isHard ? "hard" : "soft",
              totalBounced: { increment: 1 },
              lastBouncedAt: now,
              lastOutcome: "bounced",
            },
          });

          await prisma.suppressedEmail.upsert({
            where: { email: lead.email },
            update: { reason: "HARD_BOUNCE" },
            create: { email: lead.email, reason: "HARD_BOUNCE", source: "smartlead_webhook" },
          });

          // Live Intelligence Ingestion for Bounce
          await ingestEmailEvent({
            messageId: providerEventId,
            contactEmail: email,
            senderEmail: fromEmail || "outreach@theboredmonkey.com",
            direction: "outbound",
            subject: payload.subject || "",
            bodyHook: "",
            status: "failed",
            bounced: true,
            createdAt: now,
            source: "smartlead_webhook",
          }).catch((err) => console.warn("[Intelligence] Ingest bounce error:", err));
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              bounceCount: newBounceCount,
              bounceType: "soft",
              totalBounced: { increment: 1 },
              lastBouncedAt: now,
            },
          });
        }
        break;

      case "unsubscribed":
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "UNSUBSCRIBED" },
        });

        await prisma.suppressedEmail.upsert({
          where: { email: lead.email },
          update: { reason: "UNSUBSCRIBED" },
          create: { email: lead.email, reason: "UNSUBSCRIBED", source: "smartlead_webhook" },
        });
        break;

      case "campaign_status_changed":
        // Update campaign status if we have a campaign ID
        if (campaignId) {
          const smartleadStatus = payload.status || payload.campaign_status;
          const statusMap: Record<string, string> = {
            ACTIVE: "ACTIVE",
            PAUSED: "PAUSED",
            COMPLETED: "COMPLETED",
            STOPPED: "COMPLETED",
          };
          const newStatus = statusMap[smartleadStatus?.toUpperCase()] || undefined;
          if (newStatus) {
            await prisma.campaign.updateMany({
              where: { providerCampaignId: String(campaignId) },
              data: { status: newStatus as any },
            });
          }
        }
        break;
    }

    return NextResponse.json({ received: true, eventType: internalEventType, leadId: lead.id });
  } catch (error) {
    console.error("Smartlead webhook error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/**
 * GET /api/webhooks/smartlead
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Smartlead webhook receiver",
    events: [
      "EMAIL_SENT", "FIRST_EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED",
      "EMAIL_REPLIED", "EMAIL_BOUNCED", "LEAD_UNSUBSCRIBED",
      "LEAD_CATEGORY_UPDATED", "CAMPAIGN_STATUS_CHANGED",
      "MANUAL_STEP_REACHED", "MANUAL_REPLY_SENT", "UNTRACKED_REPLIES",
    ],
  });
}
