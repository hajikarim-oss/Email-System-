import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { webhookUrl, campaignId } = await req.json();

    // Find the session user's Smartlead API key
    let smartleadApiKey: string | null = null;

    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { userId: true },
      });
      if (!campaign || (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER")) {
        return NextResponse.json({ error: "Campaign not found or access denied" }, { status: 404 });
      }
    }

    // Get API key from session user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { smartleadApiKey: true },
    });
    smartleadApiKey = user?.smartleadApiKey || null;

    if (!smartleadApiKey) {
      return NextResponse.json({ error: "No Smartlead API key configured. Set it in Settings." }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // Use the provided webhook URL or build from NEXTAUTH_URL
    // Force correct domain for webhook delivery
    const defaultWebhookUrl = "https://email-system-omega.vercel.app/api/webhooks/smartlead";
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
    const fallbackUrl = baseUrl ? `${baseUrl}/api/webhooks/smartlead` : defaultWebhookUrl;
    const finalWebhookUrl = webhookUrl || fallbackUrl;

    console.log(`[Webhook Config] Configuring webhook URL: ${finalWebhookUrl}`);

    // Configure user-level webhook (covers all campaigns)
    const userResult = await smartlead.configureUserWebhook(finalWebhookUrl);

    // Also configure per-campaign webhooks if campaignId is provided
    let campaignResults: Array<{ campaignId: string; success: boolean; message?: string }> = [];
    if (campaignId) {
      // Get all active campaigns to configure webhooks for each
      const campaigns = await prisma.campaign.findMany({
        where: { providerCampaignId: { not: null }, status: "ACTIVE" },
        select: { providerCampaignId: true, name: true },
      });

      for (const c of campaigns) {
        if (!c.providerCampaignId) continue;
        try {
          const result = await smartlead.configureWebhook(c.providerCampaignId, finalWebhookUrl);
          campaignResults.push({ campaignId: c.providerCampaignId, success: result.success, message: result.message });
        } catch (e) {
          campaignResults.push({ campaignId: c.providerCampaignId, success: false, message: (e as Error).message });
        }
      }
    }

    return NextResponse.json({
      success: true,
      webhookId: userResult.webhookId,
      webhookUrl: finalWebhookUrl,
      campaignWebhooks: campaignResults,
      message: `Webhook configured: ${finalWebhookUrl}. User-level webhook ID: ${userResult.webhookId}. ${campaignResults.length} campaign webhooks configured.`,
      events: ["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "EMAIL_REPLIED", "EMAIL_BOUNCED", "LEAD_UNSUBSCRIBED"],
    });
  } catch (error) {
    console.error("Webhook config error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { userId: session.user.id, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        providerCampaignId: true,
      },
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        providerCampaignId: c.providerCampaignId,
        launched: !!c.providerCampaignId,
      })),
      webhookEndpoint: "/api/webhooks/smartlead",
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
