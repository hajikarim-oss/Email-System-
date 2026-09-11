import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, firstName, lastName, company, category = "UNCATEGORIZED", source = "Manual" } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Lead already exists" }, { status: 409 });
    }

    // Get or create default campaign
    let campaign = await prisma.campaign.findFirst();
    if (!campaign) {
      let user = await prisma.user.findFirst();
      if (!user) {
        return NextResponse.json({ error: "No user found. Please sign in first." }, { status: 400 });
      }
      campaign = await prisma.campaign.create({
        data: { name: "General Outreach", userId: user.id, status: "ACTIVE" },
      });
    }

    // Create lead
    const lead = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        email,
        firstName: firstName || email.split("@")[0],
        lastName: lastName || "",
        source,
        customData: company ? { company } : undefined,
        leadCategory: category.toUpperCase() as "UNCATEGORIZED",
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      id: lead.id,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      status: lead.status.toLowerCase(),
      category: lead.leadCategory.toLowerCase(),
      message: "Test lead created successfully",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
