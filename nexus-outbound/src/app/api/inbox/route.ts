import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only show drafts from user's campaigns
    const userCampaignIds = await prisma.campaign.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const allowedCampaignIds = userCampaignIds.map((c) => c.id);

    const drafts = await prisma.aiDraft.findMany({
      where: { lead: { campaignId: { in: allowedCampaignIds } } },
      include: {
        lead: {
          include: {
            campaign: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = drafts.map((d) => ({
      id: d.id,
      lead: `${d.lead.firstName || ""} ${d.lead.lastName || ""}`.trim() || d.lead.email,
      email: d.lead.email,
      company: (d.lead.customData as { company?: string })?.company || "",
      received: d.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sentiment: d.lead.aiSentiment ? d.lead.aiSentiment.toLowerCase().replace(/_/g, " ") : "neutral",
      reply: "",
      draft: d.draftBody,
      draftStatus: d.status.toLowerCase(),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
