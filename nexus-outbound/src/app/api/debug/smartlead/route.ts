import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");

    // Get API key
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { smartleadApiKey: true },
    });
    const apiKey = user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }

    const baseUrl = "https://server.smartlead.ai/api/v1";
    const results: Record<string, unknown> = {};

    // Test 1: List all campaigns
    try {
      const listRes = await fetch(`${baseUrl}/campaigns?limit=10&offset=0&api_key=${apiKey}`);
      const listData = await listRes.json();
      results.campaignList = {
        status: listRes.status,
        totalCampaigns: Array.isArray(listData) ? listData.length : (listData.data?.length ?? 0),
        campaigns: (Array.isArray(listData) ? listData : (listData.data ?? [])).map((c: any) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          total_sent_count: c.total_sent_count,
          open_count: c.open_count,
          reply_count: c.reply_count,
          bounce_count: c.bounce_count,
        })),
      };
    } catch (e) {
      results.campaignList = { error: (e as Error).message };
    }

    // Test 2: Get specific campaign details
    if (campaignId) {
      try {
        const detailRes = await fetch(`${baseUrl}/campaigns/${campaignId}?api_key=${apiKey}`);
        const detailData = await detailRes.json();
        results.campaignDetail = {
          status: detailRes.status,
          raw: detailData,
        };
      } catch (e) {
        results.campaignDetail = { error: (e as Error).message };
      }

      // Test 3: Get campaign statistics
      try {
        const statsRes = await fetch(`${baseUrl}/campaigns/${campaignId}/statistics?api_key=${apiKey}`);
        const statsData = await statsRes.json();
        results.campaignStatistics = {
          status: statsRes.status,
          raw: statsData,
        };
      } catch (e) {
        results.campaignStatistics = { error: (e as Error).message };
      }

      // Test 4: Get campaign leads
      try {
        const leadsRes = await fetch(`${baseUrl}/campaigns/${campaignId}/leads?page=1&limit=10&api_key=${apiKey}`);
        const leadsData = await leadsRes.json();
        results.campaignLeads = {
          status: leadsRes.status,
          raw: leadsData,
        };
      } catch (e) {
        results.campaignLeads = { error: (e as Error).message };
      }

      // Test 5: Get campaign webhooks
      try {
        const whRes = await fetch(`${baseUrl}/campaigns/${campaignId}/webhooks?api_key=${apiKey}`);
        const whData = await whRes.json();
        results.campaignWebhooks = {
          status: whRes.status,
          raw: whData,
        };
      } catch (e) {
        results.campaignWebhooks = { error: (e as Error).message };
      }
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
