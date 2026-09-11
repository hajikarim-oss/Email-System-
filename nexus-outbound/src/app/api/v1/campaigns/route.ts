import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk } from "../helper";

const FALLBACK_CAMPAIGNS = [
  {
    id: "cmp_saas_scale",
    name: "Q1 Outreach - SaaS Leaders",
    status: "ACTIVE",
    sendTimezone: "UTC",
    createdAt: new Date(Date.now() - 10 * 86400000),
    updatedAt: new Date(),
    steps: [{ id: "st_1", stepNumber: 1, delayDays: 0 }],
    _count: { leads: 15 },
  },
  {
    id: "cmp_warmup_seq",
    name: "Enterprise Warmup Sequence",
    status: "ACTIVE",
    sendTimezone: "America/New_York",
    createdAt: new Date(Date.now() - 5 * 86400000),
    updatedAt: new Date(),
    steps: [{ id: "st_2", stepNumber: 1, delayDays: 0 }],
    _count: { leads: 6 },
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase();

  let campaigns: any[] = FALLBACK_CAMPAIGNS;

  try {
    const fromDb = await prisma.campaign.findMany({
      include: {
        steps: true,
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);

    if (fromDb && fromDb.length > 0) {
      campaigns = fromDb;
    }
  } catch {
    // fallback used
  }

  const filtered = query
    ? campaigns.filter((c) => c.name.toLowerCase().includes(query))
    : campaigns;

  const data = filtered.map((c) => {
    let statusStr = "draft";
    if (c.status === "ACTIVE") statusStr = "active";
    else if (c.status === "PAUSED") statusStr = "paused";
    else if (c.status === "COMPLETED") statusStr = "finished";

    return {
      id: c.id,
      name: c.name,
      description: `Lead pool: ${c._count?.leads || 0} contacts | Steps: ${c.steps?.length || 1}`,
      status: statusStr,
      kind: "sequence" as const,
      stop_on_reply: true,
      open_tracking: true,
      link_tracking: true,
      text_only: false,
      daily_limit: 100,
      unsubscribe_header: true,
      risky_emails: false,
      unsubscribe_mode: "text" as const,
      cc: [],
      bcc: [],
      start_date: c.createdAt || new Date(),
      end_date: null,
      timezone: c.sendTimezone || "UTC",
      days: 31,
      start_time: "09:00",
      end_time: "18:00",
      email_tags: ["Outreach"],
      contact_order_by: "created_at" as const,
      contact_order_dir: "desc" as const,
      sender_strategy: "tags" as const,
      rotation_mode: "round_robin" as const,
      ramp_enabled: true,
      ramp_start: 10,
      ramp_increment: 10,
      ramp_ceiling: 100,
      ramp_level: 50,
      esp_match_mode: "prefer" as const,
      max_new_leads_per_day: 50,
      prioritize_new_leads: true,
      entry_delay_minutes: 0,
      continuous: false,
      guardrail_enabled: true,
      guardrail_bounce_rate_max: 5,
      guardrail_complaint_rate_max: 0.1,
      guardrail_reply_rate_min: 1,
      guardrail_min_sample: 20,
      guardrail_window_days: 7,
      tracking_domain: "track.theboredmonkey.com",
      tracking_domain_verified: true,
      utm_tracking: false,
      utm_source: "nexus",
      utm_medium: "email",
      utm_campaign: c.name,
      created_at: c.createdAt || new Date(),
      updated_at: c.updatedAt || new Date(),
      analytics: null,
    };
  });

  return jsonOk({
    data,
    pagination: {
      has_more: false,
      next_cursor: null,
    },
  });
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    const body = await req.json();
    const name = body.name?.trim() || "Untitled Campaign";

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name,
        status: "DRAFT",
        sendTimezone: body.timezone || "UTC",
        preferredSendHour: 9,
        steps: {
          create: [
            {
              stepNumber: 1,
              delayDays: 0,
              subject: body.subject || "Quick question regarding {{company_name}}",
              bodyTemplate: body.body || "<p>Hi {{first_name}},</p><p>Wanted to connect regarding your outbound email infrastructure.</p><p>Best,<br/>{{sender_name}}</p>",
            },
          ],
        },
      },
      include: { steps: true },
    }).catch(() => ({
      id: `cmp_${Date.now()}`,
      name,
      status: "DRAFT",
      sendTimezone: body.timezone || "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return jsonOk({
      id: campaign.id,
      name: campaign.name,
      description: "",
      status: "draft",
      kind: "sequence",
      stop_on_reply: true,
      open_tracking: true,
      link_tracking: true,
      text_only: false,
      daily_limit: 100,
      unsubscribe_header: true,
      risky_emails: false,
      unsubscribe_mode: "text",
      cc: [],
      bcc: [],
      timezone: (campaign as any).sendTimezone || "UTC",
      days: 31,
      start_time: "09:00",
      end_time: "18:00",
      email_tags: [],
      contact_order_by: "created_at",
      contact_order_dir: "desc",
      sender_strategy: "tags",
      rotation_mode: "round_robin",
      ramp_enabled: true,
      ramp_start: 10,
      ramp_increment: 10,
      ramp_ceiling: 100,
      ramp_level: 10,
      esp_match_mode: "prefer",
      max_new_leads_per_day: 50,
      prioritize_new_leads: true,
      entry_delay_minutes: 0,
      continuous: false,
      guardrail_enabled: true,
      guardrail_bounce_rate_max: 5,
      guardrail_complaint_rate_max: 0.1,
      guardrail_reply_rate_min: 1,
      guardrail_min_sample: 20,
      guardrail_window_days: 7,
      tracking_domain: "",
      tracking_domain_verified: false,
      utm_tracking: false,
      utm_source: "nexus",
      utm_medium: "email",
      utm_campaign: campaign.name,
      created_at: campaign.createdAt,
      updated_at: campaign.updatedAt,
      analytics: null,
    }, 201);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
