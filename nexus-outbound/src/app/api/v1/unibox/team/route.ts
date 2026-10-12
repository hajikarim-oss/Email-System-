import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mailboxes: {
          select: { id: true, senderEmail: true, status: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Count replied leads per user (unread proxy)
    const replyCounts = await prisma.lead.groupBy({
      by: ["campaignId"],
      where: { status: "REPLIED" },
      _count: true,
    });

    const campaignOwners = await prisma.campaign.findMany({
      where: { id: { in: replyCounts.map((r) => r.campaignId).filter(Boolean) as string[] } },
      select: { id: true, userId: true },
    });

    const ownerMap = new Map(campaignOwners.map((c) => [c.id, c.userId]));
    const userUnread = new Map<string, number>();
    for (const rc of replyCounts) {
      if (!rc.campaignId) continue;
      const userId = ownerMap.get(rc.campaignId);
      if (userId) {
        userUnread.set(userId, (userUnread.get(userId) || 0) + rc._count);
      }
    }

    const members = [
      { id: "all", name: "All Team Members", email: "all", role: "Overview", mailboxIds: [] as string[], unread: 0 },
      ...users.map((u) => ({
        id: u.id,
        name: u.name || u.email.split("@")[0],
        email: u.email,
        role: u.role === "MASTER" ? "Master" : "Team Member",
        mailboxIds: u.mailboxes.map((m) => m.id),
        unread: userUnread.get(u.id) || 0,
      })),
    ];

    return jsonOk(members);
  } catch (err: any) {
    console.error("[unibox/team] Error:", err);
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
