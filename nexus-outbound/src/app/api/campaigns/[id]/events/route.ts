import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const leadId = url.searchParams.get("leadId");

    const leads = await prisma.lead.findMany({
      where: { campaignId: id },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const leadIds = leadId ? [leadId] : leads.map((l) => l.id);

    const events = await prisma.emailEvent.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        leadId: true,
        eventType: true,
        providerEventId: true,
        rawPayload: true,
        createdAt: true,
      },
    });

    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const enrichedEvents = events.map((e) => ({
      ...e,
      lead: leadMap.get(e.leadId) || null,
    }));

    const eventCounts = await prisma.emailEvent.groupBy({
      by: ["eventType"],
      where: { leadId: { in: leads.map((l) => l.id) } },
      _count: { id: true },
    });

    return NextResponse.json({
      events: enrichedEvents,
      counts: eventCounts.reduce((acc, ec) => {
        acc[ec.eventType] = ec._count.id;
        return acc;
      }, {} as Record<string, number>),
      total: events.length,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
