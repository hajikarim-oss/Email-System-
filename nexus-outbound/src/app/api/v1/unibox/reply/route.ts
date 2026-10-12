import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const body = await req.json();
    const { to, subject, body: emailBody, thread_id } = body;

    if (!to || !emailBody) {
      return jsonErr("'to' and 'body' are required", 400);
    }

    const leadId = (thread_id || "").replace(/^th_/, "");
    let lead = null;
    let campaign = null;

    if (leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          campaign: {
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
          },
        },
      });
      campaign = lead?.campaign;
    }

    // Resolve the Smartlead API key and mailbox for sending
    const smartleadApiKey =
      campaign?.mailboxes[0]?.mailbox?.user?.smartleadApiKey ||
      campaign?.user?.smartleadApiKey ||
      process.env.SMARTLEAD_API_KEY;

    const senderMailbox = campaign?.mailboxes[0]?.mailbox;
    const fromEmail = senderMailbox?.senderEmail || "outreach@theboredmonkey.com";

    // Send via Smartlead API if we have a provider mailbox ID
    let sentViaProvider = false;
    if (smartleadApiKey && senderMailbox?.providerMailboxId) {
      try {
        const smartlead = new SmartleadProvider(smartleadApiKey);
        await smartlead.sendReply(
          senderMailbox.providerMailboxId,
          to,
          subject || "Re: Outreach",
          emailBody,
        );
        sentViaProvider = true;
      } catch (err: any) {
        console.warn("[unibox/reply] Smartlead send failed, logging locally:", err.message);
      }
    }

    // Log the reply as an EmailEvent
    const providerEventId = `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (lead) {
      await prisma.emailEvent.create({
        data: {
          leadId: lead.id,
          eventType: "sent",
          providerEventId,
          fromEmail,
          rawPayload: { subject, body: emailBody, reply_to: to, sent_via: sentViaProvider ? "smartlead" : "local" },
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          totalOutbound: { increment: 1 },
          totalMessages: { increment: 1 },
          lastContactedAt: new Date(),
        },
      });
    }

    return jsonOk({
      success: true,
      message: sentViaProvider ? "Reply sent via Smartlead" : "Reply logged (manual send)",
      id: providerEventId,
      sent_via: sentViaProvider ? "smartlead" : "local",
    });
  } catch (err: any) {
    console.error("[unibox/reply] Error:", err);
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
