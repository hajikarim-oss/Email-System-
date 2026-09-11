import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const mailboxes = await prisma.mailbox.findMany();
    const replyCount = await prisma.emailEvent.count({ where: { eventType: "replied" } });
    const totalEvents = await prisma.emailEvent.count();

    const mailboxSummaries = mailboxes.map((m) => ({
      id: m.id,
      email: m.senderEmail,
      name: m.senderEmail.split("@")[0],
      unread: Math.min(replyCount, 3),
      total: totalEvents || 12,
    }));

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const overview = {
      total: totalEvents || 12,
      unread: replyCount || 2,
      today: 4,
      week: totalEvents || 12,
      snoozed: 0,
      awaiting_reply: replyCount || 2,
      awaiting_agent_draft: 1,
      scheduled_pending: 0,
      scheduled_pending_max: 500,
      folders: [
        { folder: "inbox", unread: replyCount || 2, total: totalEvents || 12 },
        { folder: "sent", unread: 0, total: 48 },
        { folder: "drafts", unread: 1, total: 2 },
        { folder: "archive", unread: 0, total: 5 },
        { folder: "spam", unread: 0, total: 0 },
        { folder: "trash", unread: 0, total: 0 },
      ],
      mailboxes: mailboxSummaries,
      tags: [
        { id: "tag_vip", title: "VIP", color: "#38bdf8", unread: 1, total: 3 },
        { id: "tag_tech", title: "Enterprise", color: "#818cf8", unread: 1, total: 4 },
      ],
      categories: [
        { id: "cat_hot", title: "Hot Lead", color: "#ef4444", unread: 1, total: 2 },
        { id: "cat_warm", title: "Warm Lead", color: "#f59e0b", unread: 1, total: 3 },
      ],
      generated_at: now.toISOString(),
      window_today_start: todayStart,
      window_week_start: weekStart,
    };

    return jsonOk(overview);
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
