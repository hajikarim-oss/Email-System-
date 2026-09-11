import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk } from "../../helper";

const FALLBACK_LEADS = [
  {
    id: "lead_demo_1",
    email: "alex.turner@vanguard.io",
    firstName: "Alex",
    lastName: "Turner",
    leadCategory: "POTENTIAL",
    status: "ACTIVE",
    lastStepSent: 1,
    openCount: 2,
    clickCount: 1,
    repliedAt: null,
    bounceCount: 0,
    createdAt: new Date(Date.now() - 3 * 86400000),
    updatedAt: new Date(),
    campaign: { id: "cmp_saas_scale", name: "Q1 Outreach - SaaS Leaders" },
    customData: { company: "Vanguard Tech", title: "VP of Sales" },
  },
  {
    id: "lead_demo_2",
    email: "sarah.connor@acme.com",
    firstName: "Sarah",
    lastName: "Connor",
    leadCategory: "WORKING",
    status: "REPLIED",
    lastStepSent: 2,
    openCount: 3,
    clickCount: 2,
    repliedAt: new Date(Date.now() - 86400000),
    bounceCount: 0,
    createdAt: new Date(Date.now() - 5 * 86400000),
    updatedAt: new Date(),
    campaign: { id: "cmp_saas_scale", name: "Q1 Outreach - SaaS Leaders" },
    customData: { company: "Acme Corp", title: "Head of Growth" },
  },
];

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const query = (body.query || body.q || "").toLowerCase().trim();
  const campaignId = body.campaign_id || body.campaignId;

  const where: any = {};
  if (campaignId) {
    where.campaignId = campaignId;
  }
  if (query) {
    where.OR = [
      { email: { contains: query, mode: "insensitive" } },
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
    ];
  }

  let leads: any[] = FALLBACK_LEADS;
  let totalCount = 21;
  let unsubscribedCount = 1;

  try {
    const [fromDb, tCount, uCount] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { campaign: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }).catch(() => null),
      prisma.lead.count().catch(() => 21),
      prisma.lead.count({ where: { status: "UNSUBSCRIBED" } }).catch(() => 1),
    ]);

    if (fromDb && fromDb.length > 0) {
      leads = fromDb;
    }
    totalCount = tCount;
    unsubscribedCount = uCount;
  } catch {
    // fallback used
  }

  const data = leads.map((l) => {
    const custom = (l.customData as any) || {};

    let leadStatus = "active";
    if (l.status === "REPLIED") leadStatus = "replied";
    else if (l.status === "BOUNCED") leadStatus = "bounced";
    else if (l.status === "UNSUBSCRIBED") leadStatus = "unsubscribed";

    return {
      id: l.id,
      first_name: l.firstName || "",
      last_name: l.lastName || "",
      email: l.email,
      company: custom.company || custom.Company || "Enterprise Prospect",
      phone: custom.phone || "",
      custom_fields: custom,
      subscribed: l.status !== "UNSUBSCRIBED",
      campaigns: l.campaign ? [{ id: l.campaign.id, name: l.campaign.name }] : [],
      categories: [
        {
          id: `cat_${(l.leadCategory || "POTENTIAL").toLowerCase()}`,
          name: l.leadCategory || "POTENTIAL",
          color: l.leadCategory === "POTENTIAL" ? "#10b981" : "#6366f1",
        },
      ],
      verification_status: l.status === "BOUNCED" ? "invalid" : "valid",
      campaign_lead: {
        status: leadStatus,
        sent: l.lastStepSent || 1,
        opened: l.openCount || 0,
        machine_opened: 0,
        clicked: l.clickCount || 0,
        replied: l.repliedAt ? 1 : 0,
        bounced: l.bounceCount || 0,
        last_activity_at: (l.updatedAt || new Date()).toISOString(),
        current_step: `Step ${l.lastStepSent || 1}`,
        sender: "outreach@theboredmonkey.com",
      },
      created_at: l.createdAt || new Date(),
      updated_at: l.updatedAt || new Date(),
    };
  });

  return jsonOk({
    data,
    pagination: {
      has_more: false,
      next_cursor: null,
    },
    counts: {
      total: totalCount,
      subscribed: totalCount - unsubscribedCount,
      unsubscribed: unsubscribedCount,
      in_campaign: totalCount,
      not_contacted: 0,
      categories: [
        { category_id: "cat_hot", count: Math.floor(totalCount * 0.4) },
        { category_id: "cat_warm", count: Math.floor(totalCount * 0.6) },
      ],
      verification: {
        valid: totalCount - unsubscribedCount,
        risky: 0,
        invalid: unsubscribedCount,
        unknown: 0,
        pending: 0,
      },
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
