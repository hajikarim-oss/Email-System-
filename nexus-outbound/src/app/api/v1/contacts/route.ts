import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../helper";

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const body = await req.json();
    const contacts = Array.isArray(body) ? body : body.contacts ? body.contacts : [body];
    const targetCampaignId = body.campaign_id || (Array.isArray(body.campaigns) && body.campaigns[0]) || null;

    let fallbackCampaignId = targetCampaignId;
    if (!fallbackCampaignId) {
      const defaultCampaign = await prisma.campaign.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (!defaultCampaign) {
        return jsonErr("No campaign available to attach contacts", 400);
      }
      fallbackCampaignId = defaultCampaign.id;
    }

    const created = [];
    for (const c of contacts) {
      if (!c.email) continue;
      const email = c.email.trim().toLowerCase();
      const campId = c.campaign_id || (Array.isArray(c.campaigns) && c.campaigns[0]) || fallbackCampaignId;

      const lead = await prisma.lead.upsert({
        where: { id: c.id || "non_existent_id" },
        update: {
          firstName: c.first_name || c.firstName,
          lastName: c.last_name || c.lastName,
          customData: c.custom_fields || c.customData || {},
        },
        create: {
          campaignId: campId,
          email,
          firstName: c.first_name || c.firstName,
          lastName: c.last_name || c.lastName,
          source: "web_import",
          status: "ACTIVE",
          customData: c.custom_fields || c.customData || {},
        },
      });
      created.push(lead);
    }

    return jsonOk({ success: true, count: created.length, contacts: created });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function GET(req: Request) {
  try {
    const leads = await prisma.lead.findMany({
      include: { campaign: true },
      take: 100,
    });
    return jsonOk({ data: leads, pagination: { has_more: false, next_cursor: null } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
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
