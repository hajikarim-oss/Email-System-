import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId, webhookUrl } = body;

    if (!campaignId || !webhookUrl) {
      return NextResponse.json({ error: "campaignId and webhookUrl required" }, { status: 400 });
    }

    // Get campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { providerCampaignId: true, userId: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.providerCampaignId) {
      return NextResponse.json({ error: "Campaign not launched on Smartlead" }, { status: 400 });
    }

    // Get API key
    const campaignOwner = await prisma.user.findUnique({
      where: { id: campaign.userId },
      select: { smartleadApiKey: true },
    });
    const apiKey = campaignOwner?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(apiKey);

    // Configure per-campaign webhook
    const result = await smartlead.configureWebhook(campaign.providerCampaignId, webhookUrl);

    // Also configure user-level webhook as backup
    let userWebhookResult;
    try {
      userWebhookResult = await smartlead.configureUserWebhook(webhookUrl);
    } catch (e) {
      userWebhookResult = { error: (e as Error).message };
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      campaignWebhook: result,
      userWebhook: userWebhookResult,
      providerCampaignId: campaign.providerCampaignId,
      webhookUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
