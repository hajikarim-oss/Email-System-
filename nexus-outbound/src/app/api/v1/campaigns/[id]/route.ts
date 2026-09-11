import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        _count: { select: { leads: true } },
      },
    });
    if (!campaign) return jsonErr("Campaign not found", 404);

    let statusStr = "draft";
    if (campaign.status === "ACTIVE") statusStr = "active";
    else if (campaign.status === "PAUSED") statusStr = "paused";
    else if (campaign.status === "COMPLETED") statusStr = "finished";

    return jsonOk({
      id: campaign.id,
      name: campaign.name,
      description: `Active contacts: ${campaign._count.leads}`,
      status: statusStr,
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
      start_date: campaign.createdAt,
      end_date: null,
      timezone: campaign.sendTimezone || "UTC",
      days: 31,
      start_time: "09:00",
      end_time: "18:00",
      email_tags: ["Outreach"],
      contact_order_by: "created_at",
      contact_order_dir: "desc",
      sender_strategy: "tags",
      rotation_mode: "round_robin",
      ramp_enabled: true,
      ramp_start: 10,
      ramp_increment: 10,
      ramp_ceiling: 100,
      ramp_level: 50,
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
      tracking_domain: "track.theboredmonkey.com",
      tracking_domain_verified: true,
      utm_tracking: false,
      utm_source: "nexus",
      utm_medium: "email",
      utm_campaign: campaign.name,
      created_at: campaign.createdAt,
      updated_at: campaign.updatedAt,
      analytics: null,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    let newStatus = undefined;
    if (body.status) {
      if (body.status === "active") newStatus = "ACTIVE" as const;
      else if (body.status === "paused") newStatus = "PAUSED" as const;
      else if (body.status === "draft") newStatus = "DRAFT" as const;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        name: body.name || undefined,
        status: newStatus,
        sendTimezone: body.timezone || undefined,
      },
    });

    return jsonOk({ success: true, campaign });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.campaign.delete({ where: { id } });
    return jsonOk({ success: true, message: "Campaign deleted" });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
