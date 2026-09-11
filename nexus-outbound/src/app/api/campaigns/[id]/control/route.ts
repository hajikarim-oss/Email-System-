import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await req.json();

    if (!["pause", "resume", "stop"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use: pause, resume, or stop" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        user: { select: { smartleadApiKey: true } },
        mailboxes: {
          include: {
            mailbox: {
              include: { user: { select: { smartleadApiKey: true } } },
            },
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!campaign.providerCampaignId) {
      return NextResponse.json({ error: "Campaign not yet launched on Smartlead" }, { status: 400 });
    }

    const smartleadApiKey = campaign.mailboxes[0]?.mailbox?.user?.smartleadApiKey || campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!smartleadApiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // State machine guards
    const currentStatus = campaign.status;
    if (action === "pause" && currentStatus !== "ACTIVE") {
      return NextResponse.json({ error: `Cannot pause campaign in ${currentStatus} status. Must be ACTIVE.` }, { status: 400 });
    }
    if (action === "resume" && currentStatus !== "PAUSED") {
      return NextResponse.json({ error: `Cannot resume campaign in ${currentStatus} status. Must be PAUSED.` }, { status: 400 });
    }
    if (action === "stop" && currentStatus !== "ACTIVE" && currentStatus !== "PAUSED") {
      return NextResponse.json({ error: `Cannot stop campaign in ${currentStatus} status. Must be ACTIVE or PAUSED.` }, { status: 400 });
    }

    switch (action) {
      case "pause":
        await smartlead.pauseCampaign(campaign.providerCampaignId);
        await prisma.campaign.update({ where: { id }, data: { status: "PAUSED" } });
        break;
      case "resume":
        await smartlead.startCampaign(campaign.providerCampaignId);
        await prisma.campaign.update({ where: { id }, data: { status: "ACTIVE" } });
        break;
      case "stop":
        await smartlead.stopCampaign(campaign.providerCampaignId);
        await prisma.campaign.update({ where: { id }, data: { status: "COMPLETED" } });
        break;
    }

    // Auto-sync: pull latest stats from Smartlead after control action
    let smartleadStats = null;
    try {
      const stats = await smartlead.getCampaignStatistics(campaign.providerCampaignId);
      smartleadStats = {
        totalSent: stats.totalSent,
        totalOpened: stats.totalOpened,
        totalReplied: stats.totalReplied,
        totalBounced: stats.totalBounced,
      };
    } catch (err) {
      console.warn("Auto-sync stats failed:", err);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: `campaign.${action}`,
        resourceType: "campaign",
        resourceId: id,
        metadata: { providerCampaignId: campaign.providerCampaignId, action },
      },
    });

    return NextResponse.json({
      success: true,
      action,
      status: action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "COMPLETED",
      smartleadStats,
    });
  } catch (error) {
    console.error("Campaign control error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
