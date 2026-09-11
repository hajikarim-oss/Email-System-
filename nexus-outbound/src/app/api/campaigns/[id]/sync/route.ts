import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

/**
 * POST /api/campaigns/[id]/sync
 * 
 * Pulls latest data from Smartlead and updates local lead statuses.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        leads: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!campaign.providerCampaignId) {
      return NextResponse.json({ error: "Campaign not launched on Smartlead" }, { status: 400 });
    }

    const smartleadApiKey = campaign.mailboxes[0]?.mailbox?.user?.smartleadApiKey || campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!smartleadApiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // Fetch live data from Smartlead
    const [stats, slLeads, slDetails] = await Promise.all([
      smartlead.getCampaignStatistics(campaign.providerCampaignId),
      smartlead.getCampaignLeads(campaign.providerCampaignId),
      smartlead.getCampaignDetails(campaign.providerCampaignId),
    ]);

    // Use the BEST available stats source
    const detailsSent = slDetails?.total_sent ?? 0;
    const detailsOpened = slDetails?.total_opened ?? 0;
    const detailsReplied = slDetails?.total_replied ?? 0;
    const detailsBounced = slDetails?.total_bounced ?? 0;

    const bestStats = {
      totalSent: Math.max(stats.totalSent, detailsSent),
      totalOpened: Math.max(stats.totalOpened, detailsOpened),
      totalReplied: Math.max(stats.totalReplied, detailsReplied),
      totalBounced: Math.max(stats.totalBounced, detailsBounced),
    };

    // Build lookup maps
    const slLeadMap = new Map(slLeads.map((sl) => [sl.email.toLowerCase(), sl]));
    const localLeadEmailMap = new Map(campaign.leads.map((l) => [l.email.toLowerCase(), l]));

    let updatedCount = 0;
    const updates: Array<{ email: string; oldStatus: string; newStatus: string }> = [];

    // Update local leads with Smartlead data
    for (const [email, slLead] of slLeadMap) {
      const localLead = localLeadEmailMap.get(email);
      if (!localLead) continue;

      const slStatus = slLead.status?.toLowerCase() || "";
      let newStatus = localLead.status;

      if (slStatus === "bounced") newStatus = "BOUNCED";
      else if (slStatus === "unsubscribed") newStatus = "UNSUBSCRIBED";
      else if (slStatus === "completed" || slStatus === "finished") {
        // If Smartlead says completed but we don't have events, keep as ACTIVE
        // (sent status is tracked via email events, not lead status)
      }

      // Update steps_sent from Smartlead
      const slStepsSent = slLead.steps_sent || [];
      const maxStep = Math.max(localLead.lastStepSent, ...slStepsSent);

      if (newStatus !== localLead.status || maxStep > localLead.lastStepSent) {
        await prisma.lead.update({
          where: { id: localLead.id },
          data: {
            ...(newStatus !== localLead.status && { status: newStatus as any }),
            ...(maxStep > localLead.lastStepSent && { lastStepSent: maxStep }),
          },
        });
        updatedCount++;
        updates.push({ email, oldStatus: localLead.status, newStatus });
      }
    }

    // Update campaign stats from Smartlead
    await prisma.campaign.update({
      where: { id },
      data: {
        status: slDetails?.status === "ACTIVE" ? "ACTIVE" : slDetails?.status === "PAUSED" ? "PAUSED" : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      smartleadStatus: slDetails?.status,
      smartleadStats: {
        totalSent: bestStats.totalSent,
        totalOpened: bestStats.totalOpened,
        totalReplied: bestStats.totalReplied,
        totalBounced: bestStats.totalBounced,
      },
      // Raw data for debugging — helps identify API issues
      debug: {
        statsEndpoint: stats,
        detailsEndpoint: {
          total_sent: slDetails?.total_sent,
          total_opened: slDetails?.total_opened,
          total_replied: slDetails?.total_replied,
          total_bounced: slDetails?.total_bounced,
          status: slDetails?.status,
          schedule: slDetails?.schedule,
        },
        leadsCount: slLeads.length,
        sampleLead: slLeads[0] || null,
      },
      leadsSynced: slLeads.length,
      leadsUpdated: updatedCount,
      updates,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
