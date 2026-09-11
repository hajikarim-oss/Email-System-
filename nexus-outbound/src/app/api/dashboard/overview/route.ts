import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      totalSent,
      totalOpened,
      totalReplied,
      totalBounced,
      totalPositive,
      sentToday,
      activeMailboxes,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.emailEvent.count({ where: { eventType: "sent" } }),
      prisma.emailEvent.count({ where: { eventType: "opened" } }),
      prisma.emailEvent.count({ where: { eventType: "replied" } }),
      prisma.emailEvent.count({ where: { eventType: "bounced" } }),
      prisma.lead.count({ where: { aiSentiment: "INTERESTED" } }),
      prisma.emailEvent.count({ where: { eventType: "sent", createdAt: { gte: todayStart } } }),
      prisma.mailbox.count({ where: { status: "ACTIVE" } }),
    ]);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
    const positiveRate = totalSent > 0 ? (totalPositive / totalSent) * 100 : (totalReplied > 0 ? (totalPositive / totalReplied) * 100 : 0);
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const senderHealth = bounceRate < 2 ? 100 : bounceRate < 5 ? 90 : bounceRate < 10 ? 75 : 50;

    // Fast 7-day metric telemetry in parallel
    const dayRanges = Array.from({ length: 7 }).map((_, idx) => {
      const i = 6 - idx;
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.setHours(0, 0, 0, 0));
      const dayEnd = new Date(d.setHours(23, 59, 59, 999));
      const dateLabel = dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { dayStart, dayEnd, dateLabel };
    });

    const dayMetricsPromises = dayRanges.map(async ({ dayStart, dayEnd, dateLabel }) => {
      const [sent, opens, replies, positive] = await Promise.all([
        prisma.emailEvent.count({ where: { eventType: "sent", createdAt: { gte: dayStart, lte: dayEnd } } }),
        prisma.emailEvent.count({ where: { eventType: "opened", createdAt: { gte: dayStart, lte: dayEnd } } }),
        prisma.emailEvent.count({ where: { eventType: "replied", createdAt: { gte: dayStart, lte: dayEnd } } }),
        prisma.emailEvent.count({ where: { eventType: "replied", createdAt: { gte: dayStart, lte: dayEnd }, lead: { aiSentiment: "INTERESTED" } } }),
      ]);
      return { date: dateLabel, sent, opens, replies, positive };
    });

    const chart = await Promise.all(dayMetricsPromises);

    return NextResponse.json({
      totalLeads,
      messagesSent: totalSent,
      totalOpened,
      openRate: Number(openRate.toFixed(2)),
      replies: totalReplied,
      replyRate: Number(replyRate.toFixed(2)),
      positiveReplies: totalPositive,
      positiveReplyRate: Number(positiveRate.toFixed(2)),
      bounces: totalBounced,
      bounceRate: Number(bounceRate.toFixed(2)),
      chart,
      senderHealth,
      activeMailboxes,
      sentToday,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
