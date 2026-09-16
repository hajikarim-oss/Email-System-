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

    let campaignIdFinal = campaignId;
    if (!campaignIdFinal) {
      const firstCampaign = await prisma.campaign.findFirst({
        where: { userId: session.user.id },
      }) || await prisma.campaign.findFirst();
      campaignIdFinal = firstCampaign?.id;
    }

    if (!campaignIdFinal) {
      const defaultUser = await prisma.user.findFirst();
      const newCamp = await prisma.campaign.create({
        data: {
          name: "Outreach Pool #1",
          userId: defaultUser?.id || session.user.id,
          status: "ACTIVE",
        },
      });
      campaignIdFinal = newCamp.id;
    }

    const nameParts = (name || "").trim().split(" ");
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(" ") || "";

    const customData: Record<string, string> = {};
    if (company) customData.company = company;
    if (industry) customData.industry = industry;
    if (title) customData.title = title;
    if (employees) customData.employees = employees;

    const cleanEmail = (email || "").toLowerCase().trim();
    if (!cleanEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 1. Check if email is on global suppression list (quarantined)
    const isSuppressed = await prisma.suppressedEmail.findUnique({
      where: { email: cleanEmail },
    });
    if (isSuppressed) {
      return NextResponse.json({
        error: `Quarantine Alert: ${cleanEmail} is on the global suppression list (${isSuppressed.reason}). Cannot add to active outreach.`,
        isQuarantined: true,
        reason: isSuppressed.reason,
      }, { status: 409 });
    }

    // 2. Check if contact already exists in database
    const existingLead = await prisma.lead.findFirst({
      where: { email: cleanEmail },
    });
    if (existingLead) {
      let lastShortMessage = existingLead.lastBodyHook;
      if (!lastShortMessage) {
        const lastMsg = await prisma.emailMessage.findFirst({
          where: { contactEmail: cleanEmail },
          orderBy: { createdAt: "desc" },
          select: { bodyHook: true },
        });
        lastShortMessage = lastMsg?.bodyHook || null;
      }

      return NextResponse.json({
        error: `Contact Already Stored: We already have ${cleanEmail} in your database.`,
        isDuplicate: true,
        existingContact: {
          id: existingLead.id,
          name: `${existingLead.firstName || ""} ${existingLead.lastName || ""}`.trim() || cleanEmail,
          email: existingLead.email,
          domain: existingLead.domain,
          outreachState: existingLead.outreachState,
          recencyBucket: existingLead.recencyBucket,
          daysSinceLastContact: existingLead.daysSinceLastContact,
          lastSubject: existingLead.lastSubject,
          lastOutcome: existingLead.lastOutcome,
          lastMessage: lastShortMessage,
        },
      }, { status: 409 });
    }

    const domain = cleanEmail.includes("@") ? cleanEmail.split("@")[1] : null;

    const leadCategory = (category ? category.toUpperCase().replace(/\s+/g, "_") : "UNCATEGORIZED") as any;

    const lead = await prisma.lead.create({
      data: {
        campaignId: campaignIdFinal,
        email: cleanEmail,
        domain,
        firstName,
        lastName,
        source,
        customData,
        leadCategory: leadCategory,
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
      campaign: campaignIdFinal,
      customData,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
