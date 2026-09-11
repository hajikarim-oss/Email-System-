import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("thread_id") || "th_default";
    const leadId = threadId.replace(/^th_/, "");

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { campaign: true, events: true },
    });

    const mailboxes = await prisma.mailbox.findMany({ take: 1 });
    const defaultSender = mailboxes[0]?.senderEmail || "outreach@theboredmonkey.com";
    const defaultMailboxId = mailboxes[0]?.id || "mb_default";

    const messages = [];

    if (lead) {
      // Message 1: Initial sequence email
      messages.push({
        id: `msg_${lead.id}_1`,
        email_id: defaultMailboxId,
        thread_id: threadId,
        from_addr: [defaultSender],
        to_addr: [lead.email],
        subject: `Quick question regarding outbound systems`,
        snippet: `Hi ${lead.firstName || "there"},\n\nI noticed your team was scaling sales outreach and wanted to see if you have considered AI warmup and deliverability automations?\n\nBest,\nNexus Outbound Team`,
        internal_date: lead.createdAt.toISOString(),
        seen: true,
      });

      // Message 2: Lead reply
      if (lead.status === "REPLIED" || lead.repliedAt) {
        messages.push({
          id: `msg_${lead.id}_2`,
          email_id: defaultMailboxId,
          thread_id: threadId,
          from_addr: [lead.email],
          to_addr: [defaultSender],
          subject: `Re: Quick question regarding outbound systems`,
          snippet: `Hey! Thanks for reaching out. Yes, we are actually looking into modernizing our outreach stack this quarter. Can we do a brief 15-minute call Tuesday at 2 PM?\n\nBest regards,\n${lead.firstName || "Lead"}`,
          internal_date: (lead.repliedAt || lead.updatedAt).toISOString(),
          seen: true,
        });
      }
    } else {
      messages.push({
        id: "msg_sample_1",
        email_id: defaultMailboxId,
        thread_id: threadId,
        from_addr: [defaultSender],
        to_addr: ["contact@company.com"],
        subject: "Outreach Discussion",
        snippet: "Hi, following up on our email discussion.",
        internal_date: new Date().toISOString(),
        seen: true,
      });
    }

    return jsonOk({
      data: messages,
      pagination: {
        has_more: false,
        next_cursor: null,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
