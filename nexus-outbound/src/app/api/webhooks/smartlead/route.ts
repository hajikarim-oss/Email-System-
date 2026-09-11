import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { verifyHmacSignature } from "@/lib/encryption";

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
      if (signature) {
        const body = await req.text();
        if (!verifyHmacSignature(body, signature, webhookSecret)) {
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
        payload = JSON.parse(body);
      } else {
        payload = await req.json();
      }
    } else {
      payload = await req.json();
    }

    // Debug: log the full payload to see what Smartlead sends
    console.log("=== SMARTLEAD WEBHOOK RECEIVED ===");
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

    // Smartlead event types map to our internal event types
    const eventType = payload.event_type || payload.type || "unknown";
    const email = payload.email || payload.lead_email || payload.to_email || "";
    const campaignId = payload.email_campaign_id || payload.campaign_id;
    const providerEventId = payload.event_id || payload.id || `sl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const providerLeadId = payload.lead_id || payload.provider_lead_id;

    // Map Smartlead event types to our internal types
    const eventMap: Record<string, string> = {
      EMAIL_SENT: "sent",
      FIRST_EMAIL_SENT: "sent",
      EMAIL_OPENED: "opened",
      EMAIL_CLICKED: "clicked",
      EMAIL_REPLIED: "replied",
      EMAIL_BOUNCED: "bounced",
      LEAD_UNSUBSCRIBED: "unsubscribed",
      LEAD_CATEGORY_UPDATED: "category_updated",
      CAMPAIGN_STATUS_CHANGED: "campaign_status_changed",
      MANUAL_STEP_REACHED: "manual_step_reached",
      MANUAL_REPLY_SENT: "manual_reply_sent",
      UNTRACKED_REPLIES: "untracked_reply",
    };
    const internalEventType = eventMap[eventType] || eventType.toLowerCase();

    // Idempotency check
    const existing = await prisma.emailEvent.findFirst({
      where: { providerEventId },
    });
    if (existing) {
      return NextResponse.json({ received: true, note: "duplicate" });
    }

    // Find lead by email or provider lead ID
    let lead = null;
    if (providerLeadId) {
      lead = await prisma.lead.findFirst({ where: { providerLeadId: String(providerLeadId) } });
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

      // For other events, just log and return
      console.warn(`Smartlead webhook: lead not found for email=${email}, leadId=${providerLeadId}, event=${eventType}`);
      console.warn(`Full payload for lead_not_found:`, JSON.stringify(payload, null, 2));
      return NextResponse.json({ received: true, note: "lead_not_found", debug: { email, providerLeadId, eventType } });
    }

    // Safety: if lead is still null for any reason, don't crash
    if (!lead) {
      console.warn(`Smartlead webhook: lead is null after all lookups. event=${eventType}, email=${email}`);
      return NextResponse.json({ received: true, note: "lead_null_safety" });
    }

    // Store the event with fromEmail for live tracking
    const fromEmail = payload.from_email || payload.sender_email || payload.from || "";
    await prisma.emailEvent.create({
      data: {
        leadId: lead.id,
        eventType: internalEventType,
        providerEventId,
        fromEmail: fromEmail || null,
        rawPayload: payload,
      },
    });

    // Update lead status based on event type
    const now = new Date();

    switch (internalEventType) {
      case "sent": {
        // Track which step was sent from the raw payload
        const step = payload.step || payload.sequence_number || payload.email_sequence_number;
        const stepNum = typeof step === "number" ? step : parseInt(step);
        if (!isNaN(stepNum) && stepNum > lead.lastStepSent) {
          await prisma.lead.update({ where: { id: lead.id }, data: { lastStepSent: stepNum } });
        }
        break;
      }

      case "opened":
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

      case "clicked":
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

      case "replied":
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "REPLIED",
            repliedAt: now,
            leadCategory: "WORKING",
          },
        });

        // Create notification for the campaign owner
        if (campaignId) {
          try {
            const campaign = await prisma.campaign.findUnique({
              where: { id: campaignId },
              select: { userId: true, name: true },
            });
            if (campaign) {
              // Find which mailbox received the reply (from payload or lead's campaign)
              const clientEmail = payload.to_email || payload.recipient_email || "";

              await prisma.notification.create({
                data: {
                  userId: campaign.userId,
                  type: "reply",
                  title: "New Reply Received",
                  message: `${email} replied to ${campaign.name}`,
                  campaignId,
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
            const campaignRecord = await prisma.campaign.findUnique({
              where: { id: campaignId },
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
            },
          });

          await prisma.suppressedEmail.upsert({
            where: { email: lead.email },
            update: { reason: "HARD_BOUNCE" },
            create: { email: lead.email, reason: "HARD_BOUNCE", source: "smartlead_webhook" },
          });
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { bounceCount: newBounceCount, bounceType: "soft" },
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
