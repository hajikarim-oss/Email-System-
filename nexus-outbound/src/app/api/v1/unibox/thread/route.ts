import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("thread_id") || "";
    const leadId = threadId.replace(/^th_/, "");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

    if (!leadId) return jsonErr("thread_id is required", 400);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            userId: true,
            steps: { select: { stepNumber: true, subject: true, bodyTemplate: true }, orderBy: { stepNumber: "asc" } },
          },
        },
      },
    });

    if (!lead) {
      return jsonOk({ data: [], pagination: { has_more: false, next_cursor: null } });
    }

    // Access control: non-master users can only see their own campaign leads
    const isMaster = (user as any).role === "MASTER";
    if (!isMaster && lead.campaign?.userId !== user.id) {
      return jsonErr("Forbidden", 403);
    }

    // Get all sent + replied events for this lead, ordered chronologically
    const events = await prisma.emailEvent.findMany({
      where: {
        leadId: lead.id,
        eventType: { in: ["sent", "replied"] },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const messages = events.map((event, idx) => {
      const raw = (event.rawPayload || {}) as Record<string, any>;
      const isReply = event.eventType === "replied";

      // Extract subject from payload or campaign step
      let subject = raw.subject || raw.email_subject || "";
      if (!subject && !isReply) {
        const stepNum = raw.step || raw.sequence_number || raw.email_sequence_number;
        const step = lead.campaign?.steps.find((s) => s.stepNumber === Number(stepNum));
        subject = step?.subject || `Outreach to ${lead.firstName || lead.email}`;
      }
      if (!subject && isReply) {
        subject = `Re: ${lead.campaign?.name || "Outreach"}`;
      }

      // Extract body content
      let body = "";
      if (isReply) {
        body = raw.reply_text || raw.body || raw.email_body || "";
      } else {
        body = raw.body || raw.email_body || "";
        if (!body) {
          const stepNum = raw.step || raw.sequence_number || raw.email_sequence_number;
          const step = lead.campaign?.steps.find((s) => s.stepNumber === Number(stepNum));
          body = step?.bodyTemplate || "";
        }
      }

      const snippet = String(body).replace(/<[^>]*>/g, "").slice(0, 2000);

      const senderEmail = event.fromEmail || "outreach@theboredmonkey.com";
      const fromAddr = isReply ? [lead.email] : [senderEmail];
      const toAddr = isReply ? [senderEmail] : [lead.email];

      return {
        id: `msg_${event.id}`,
        email_id: "mb_default",
        thread_id: threadId,
        from_addr: fromAddr,
        to_addr: toAddr,
        subject,
        snippet,
        internal_date: event.createdAt.toISOString(),
        seen: true,
      };
    });

    // If no events exist yet, show campaign step data as a placeholder
    if (messages.length === 0 && lead.campaign?.steps.length) {
      const step = lead.campaign.steps[0];
      messages.push({
        id: `msg_${lead.id}_step1`,
        email_id: "mb_default",
        thread_id: threadId,
        from_addr: ["outreach@theboredmonkey.com"],
        to_addr: [lead.email],
        subject: step.subject || `Outreach to ${lead.firstName || lead.email}`,
        snippet: step.bodyTemplate.replace(/<[^>]*>/g, "").slice(0, 2000),
        internal_date: lead.createdAt.toISOString(),
        seen: true,
      });
    }

    return jsonOk({
      data: messages,
      pagination: { has_more: false, next_cursor: null },
    });
  } catch (err: any) {
    console.error("[unibox/thread] Error:", err);
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
