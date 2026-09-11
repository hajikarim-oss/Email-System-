import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; leadId: string }> }
) {
  try {
    const { id, leadId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await req.json();

    if (!["stop", "resume"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use: stop or resume" }, { status: 400 });
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
      return NextResponse.json({ error: "Campaign not launched" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const smartleadApiKey = campaign.mailboxes[0]?.mailbox?.user?.smartleadApiKey || campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!smartleadApiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // Look up the numeric Smartlead lead_id from email
    const slLeads = await smartlead.getCampaignLeads(campaign.providerCampaignId);
    const slLead = slLeads.find((sl) => sl.email.toLowerCase() === lead.email.toLowerCase());

    if (!slLead) {
      return NextResponse.json({ error: `Lead ${lead.email} not found on Smartlead` }, { status: 404 });
    }

    if (action === "stop") {
      await smartlead.stopLeadInCampaign(campaign.providerCampaignId, slLead.id);
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
      });
    } else {
      await smartlead.resumeLeadInCampaign(campaign.providerCampaignId, slLead.id);
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "ACTIVE", unsubscribedAt: null },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: `lead.${action}`,
        resourceType: "lead",
        resourceId: leadId,
        metadata: { email: lead.email, smartleadLeadId: slLead.id, campaignId: id, action },
      },
    });

    return NextResponse.json({ success: true, action, leadId, email: lead.email, smartleadLeadId: slLead.id });
  } catch (error) {
    console.error("Lead control error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
