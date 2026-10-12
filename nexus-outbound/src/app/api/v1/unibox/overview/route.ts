import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("member_id");
    const isMaster = (user as any).role === "MASTER";

    // Build campaign filter for user access
    const campaignWhere: any = {};
    if (!isMaster) {
      campaignWhere.userId = user.id;
    } else if (memberId && memberId !== "all") {
      campaignWhere.userId = memberId;
    }

    // Get campaign IDs the user can see
    const campaigns = await prisma.campaign.findMany({
      where: campaignWhere,
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);

    const leadBase = campaignIds.length > 0
      ? { campaignId: { in: campaignIds } }
      : {};

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Run counts in parallel
    const [
      totalLeadsWithEvents,
      repliedLeads,
      todayEvents,
      weekEvents,
      bouncedLeads,
      awaitingReplyLeads,
      mailboxes,
    ] = await Promise.all([
      prisma.lead.count({
        where: { ...leadBase, events: { some: { eventType: { in: ["sent", "replied"] } } } },
      }),
      prisma.lead.count({
        where: { ...leadBase, status: "REPLIED" },
      }),
      prisma.emailEvent.count({
        where: {
          lead: leadBase,
          createdAt: { gte: todayStart },
          eventType: { in: ["sent", "replied"] },
        },
      }),
      prisma.emailEvent.count({
        where: {
          lead: leadBase,
          createdAt: { gte: weekStart },
          eventType: { in: ["sent", "replied"] },
        },
      }),
      prisma.lead.count({
        where: { ...leadBase, status: "BOUNCED" },
      }),
      prisma.lead.count({
        where: { ...leadBase, status: "ACTIVE", totalOutbound: { gt: 0 } },
      }),
      prisma.mailbox.findMany({
        select: { id: true, senderEmail: true, userId: true },
      }),
    ]);

    // Count events per mailbox (by fromEmail)
    const mailboxEmails = mailboxes.map((m) => m.senderEmail);
    const mailboxEventCounts = await prisma.emailEvent.groupBy({
      by: ["fromEmail"],
      where: {
        fromEmail: { in: mailboxEmails },
        lead: leadBase,
      },
      _count: true,
    });

    const eventCountMap = new Map(
      mailboxEventCounts.map((e) => [e.fromEmail, e._count]),
    );

    const mailboxSummaries = mailboxes.map((m) => ({
      id: m.id,
      email: m.senderEmail,
      name: m.senderEmail.split("@")[0],
      unread: 0,
      total: eventCountMap.get(m.senderEmail) || 0,
    }));

    // Sent count
    const sentCount = await prisma.emailEvent.count({
      where: { lead: leadBase, eventType: "sent" },
    });

    const overview = {
      total: totalLeadsWithEvents,
      unread: repliedLeads,
      today: todayEvents,
      week: weekEvents,
      snoozed: 0,
      awaiting_reply: awaitingReplyLeads,
      awaiting_agent_draft: 0,
      scheduled_pending: 0,
      scheduled_pending_max: 500,
      folders: [
        { folder: "inbox", unread: repliedLeads, total: totalLeadsWithEvents },
        { folder: "sent", unread: 0, total: sentCount },
        { folder: "drafts", unread: 0, total: 0 },
        { folder: "archive", unread: 0, total: 0 },
        { folder: "spam", unread: 0, total: 0 },
        { folder: "trash", unread: 0, total: 0 },
      ],
      mailboxes: mailboxSummaries,
      tags: [],
      categories: [
        { id: "cat_interested", title: "Interested", color: "#10b981", unread: repliedLeads, total: repliedLeads },
        { id: "cat_warm", title: "Warm Lead", color: "#f59e0b", unread: 0, total: 0 },
      ],
      generated_at: now.toISOString(),
      window_today_start: todayStart.toISOString(),
      window_week_start: weekStart.toISOString(),
    };

    return jsonOk(overview);
  } catch (err: any) {
    console.error("[unibox/overview] Error:", err);
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
