import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../../../helper";
import { OutreachState, RecencyBucket, ReplyClass } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    });

    if (!campaign) {
      return jsonErr(`Campaign ${campaignId} not found`, 404);
    }

    const body = await req.json().catch(() => ({}));
    let filter = body.filter;

    if (body.segment_id || body.segmentId) {
      const segId = body.segment_id || body.segmentId;
      const segment = await prisma.contactSegment.findUnique({
        where: { id: segId },
      });
      if (!segment) {
        return jsonErr(`Segment ${segId} not found`, 404);
      }
      filter = segment.filterJson as any;
    }

    filter = filter || {};

    // Strict non-negotiable: NEVER import burned or suppressed leads into a campaign
    const where: any = {
      isBurned: false,
    };

    if (filter.recency_buckets?.length) where.recencyBucket = { in: filter.recency_buckets as RecencyBucket[] };
    if (filter.outreach_states?.length) where.outreachState = { in: filter.outreach_states as OutreachState[] };
    if (filter.reply_classifications?.length) where.replyClassification = { in: filter.reply_classifications as ReplyClass[] };
    if (filter.domains?.length) where.domain = { in: filter.domains };
    if (filter.campaigns?.length) where.lastCampaign = { in: filter.campaigns };
    if (filter.replied !== undefined) where.totalReplied = filter.replied ? { gt: 0 } : 0;
    if (filter.days_since_contact_min !== undefined || filter.days_since_contact_max !== undefined) {
      where.daysSinceLastContact = {};
      if (filter.days_since_contact_min !== undefined) where.daysSinceLastContact.gte = parseInt(filter.days_since_contact_min, 10);
      if (filter.days_since_contact_max !== undefined) where.daysSinceLastContact.lte = parseInt(filter.days_since_contact_max, 10);
    }

    const maxLeads = Math.min(5000, parseInt(body.max_leads || "1000", 10));

    // Get candidate lead IDs
    const matchingLeads = await prisma.lead.findMany({
      where,
      select: { id: true, email: true },
      take: maxLeads,
    });

    if (matchingLeads.length === 0) {
      return jsonOk({
        success: true,
        campaignId,
        importedCount: 0,
        message: "No clean leads matched segment criteria",
      });
    }

    const leadIds = matchingLeads.map((l) => l.id);

    // Attach leads to this campaign
    const updateResult = await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: {
        campaignId,
        status: "ACTIVE",
        lastStepSent: 0,
      },
    });

    return jsonOk({
      success: true,
      campaignId,
      campaignName: campaign.name,
      matchedCount: matchingLeads.length,
      importedCount: updateResult.count,
    });
  } catch (err: any) {
    return jsonErr(`Failed to import segment into campaign: ${err.message}`, 500);
  }
}
