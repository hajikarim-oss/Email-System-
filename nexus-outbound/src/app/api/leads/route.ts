import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const status = searchParams.get("status") || undefined;
    const campaignId = searchParams.get("campaignId") || undefined;

    // Only show leads from user's campaigns
    const userCampaignIds = await prisma.campaign.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const allowedIds = userCampaignIds.map((c) => c.id);

    const where: Record<string, unknown> = {
      campaignId: { in: allowedIds },
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.leadCategory = category.toUpperCase().replace(/\s+/g, "_");
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (campaignId && allowedIds.includes(campaignId)) {
      where.campaignId = campaignId;
    }

    const leads = await prisma.lead.findMany({
      where,
      include: { campaign: { select: { name: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    const formatted = leads.map((l) => ({
      id: l.id,
      name: `${l.firstName || ""} ${l.lastName || ""}`.trim() || l.email,
      email: l.email,
      company: (l.customData as { company?: string })?.company || "",
      category: l.leadCategory.toLowerCase().replace(/_/g, " "),
      status: l.status.toLowerCase(),
      sentiment: l.aiSentiment ? l.aiSentiment.toLowerCase().replace(/_/g, " ") : "neutral",
      source: l.source || "",
      firstOpenAt: l.firstOpenAt ? l.firstOpenAt.toLocaleDateString() : "",
      lastOpenAt: l.lastOpenAt ? l.lastOpenAt.toLocaleDateString() : "",
      campaign: l.campaign?.name || "",
      customData: (l.customData as Record<string, string>) || {},
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, email, company, category = "Prospect", source = "Manual", campaignId, industry, title, employees } = body;

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    // Verify campaign belongs to user
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, userId: true },
    });
    if (!campaign || (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER")) {
      return NextResponse.json({ error: "Campaign not found or access denied" }, { status: 404 });
    }

    const nameParts = (name || "").trim().split(" ");
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(" ") || "";

    const customData: Record<string, string> = {};
    if (company) customData.company = company;
    if (industry) customData.industry = industry;
    if (title) customData.title = title;
    if (employees) customData.employees = employees;

    const validCategories = ["UNCATEGORIZED", "WORKING", "NOT_WORKING", "POTENTIAL", "DO_NOT_CONTACT"];
    const cat = category.toUpperCase().replace(/\s+/g, "_");
    const leadCategory = validCategories.includes(cat) ? cat : "UNCATEGORIZED";

    const lead = await prisma.lead.create({
      data: {
        campaignId,
        email,
        firstName,
        lastName,
        source,
        customData,
        leadCategory: leadCategory as "UNCATEGORIZED",
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      id: lead.id,
      name,
      email: lead.email,
      company,
      category,
      status: "New",
      sentiment: "Neutral",
      source,
      firstOpenAt: "",
      lastOpenAt: "",
      campaign: campaignId,
      customData,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
