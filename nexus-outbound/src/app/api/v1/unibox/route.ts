import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("subject")?.toLowerCase();

    // Query leads who have replied or have events
    const repliedLeads = await prisma.lead.findMany({
      include: {
        campaign: { select: { id: true, name: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const mailboxes = await prisma.mailbox.findMany({ take: 1 });
    const defaultSender = mailboxes[0]?.senderEmail || "outreach@theboredmonkey.com";
    const defaultMailboxId = mailboxes[0]?.id || "mb_default";

    const rows = repliedLeads.map((l, index) => {
      const isReplied = l.status === "REPLIED" || !!l.repliedAt;
      const latestEvent = l.events[0];
      const snippet = isReplied
        ? `Thanks for reaching out! Let's schedule a call on Tuesday at 2 PM.`
        : `Sent sequence step #${l.lastStepSent || 1} regarding cold outreach automation.`;

      const subject = isReplied
        ? `Re: Connecting regarding outreach infrastructure`
        : `Quick question for ${l.firstName || "you"}`;

      return {
        id: `msg_${l.id}`,
        email_id: defaultMailboxId,
        thread_id: `th_${l.id}`,
        from_addr: isReplied ? [l.email] : [defaultSender],
        to_addr: isReplied ? [defaultSender] : [l.email],
        subject,
        snippet,
        internal_date: (l.repliedAt || l.updatedAt).toISOString(),
        seen: index > 2,
        message_count: isReplied ? 2 : 1,
        has_unread: index <= 2,
        labels: isReplied
          ? [{ id: "cat_hot", title: "Interested", color: "#10b981" }]
          : [{ id: "cat_warm", title: "In Sequence", color: "#6366f1" }],
      };
    });

    const filtered = query
      ? rows.filter((r) => r.subject.toLowerCase().includes(query) || r.snippet.toLowerCase().includes(query))
      : rows;

    return jsonOk({
      data: filtered,
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
