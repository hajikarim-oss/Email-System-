import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

// Helper to count leads matching a segment filter
export async function evaluateSegmentCount(filter: any): Promise<number> {
  const where: any = {};

  if (filter.recency_buckets?.length) where.recencyBucket = { in: filter.recency_buckets };
  if (filter.outreach_states?.length) where.outreachState = { in: filter.outreach_states };
  if (filter.reply_classifications?.length) where.replyClassification = { in: filter.reply_classifications };
  
  if (filter.days_since_contact_min !== undefined || filter.days_since_contact_max !== undefined) {
    where.daysSinceLastContact = {};
    if (filter.days_since_contact_min !== undefined) where.daysSinceLastContact.gte = parseInt(filter.days_since_contact_min, 10);
    if (filter.days_since_contact_max !== undefined) where.daysSinceLastContact.lte = parseInt(filter.days_since_contact_max, 10);
  }

  if (filter.replied !== undefined) {
    where.totalReplied = filter.replied ? { gt: 0 } : 0;
  }

  if (filter.is_burned !== undefined) {
    where.isBurned = Boolean(filter.is_burned);
  } else {
    where.isBurned = false;
  }

  if (filter.domains?.length) where.domain = { in: filter.domains };
  if (filter.campaigns?.length) where.lastCampaign = { in: filter.campaigns };
  if (filter.tags?.length) where.tags = { hasSome: filter.tags };

  return prisma.lead.count({ where });
}

export async function GET(req: Request) {
  try {
    let segments = await prisma.contactSegment.findMany({
      orderBy: { createdAt: "desc" },
    });

    // If no segments exist yet, seed canonical standard segments
    if (segments.length === 0) {
      const canonical = [
        {
          name: "Hot Replies (Interested)",
          description: "All contacts who replied with verified interested classification",
          filterJson: {
            reply_classifications: ["INTERESTED"],
            is_burned: false,
          },
        },
        {
          name: "Dormant Re-Engagement Candidates",
          description: "Clean leads contacted >180 days ago that showed positive reply signal",
          filterJson: {
            outreach_states: ["DORMANT_REPLIED"],
            days_since_contact_min: 180,
            is_burned: false,
          },
        },
        {
          name: "Cold Re-Engagement Prospects",
          description: "Clean leads pitched >180 days ago without reply ready for re-pitch",
          filterJson: {
            outreach_states: ["COLD_REENGAGEMENT"],
            days_since_contact_min: 180,
            is_burned: false,
          },
        },
        {
          name: "Burned / Quarantined Leads",
          description: "Suppressed contacts with bounces or spam flags (do not contact)",
          filterJson: {
            is_burned: true,
          },
        },
      ];

      for (const item of canonical) {
        const count = await evaluateSegmentCount(item.filterJson);
        const created = await prisma.contactSegment.create({
          data: {
            name: item.name,
            description: item.description,
            filterJson: item.filterJson,
            createdBy: "system",
            lastCount: count,
            lastRunAt: new Date(),
          },
        });
        segments.push(created);
      }
    }

    const data = segments.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      filter: s.filterJson,
      count: s.lastCount,
      last_run_at: s.lastRunAt,
      created_at: s.createdAt,
    }));

    return jsonOk({ data, pagination: { has_more: false, next_cursor: null } });
  } catch (err: any) {
    return jsonErr(`Failed to load segments: ${err.message}`, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, filter } = body;

    if (!name) {
      return jsonErr("Segment name is required", 400);
    }

    const filterObj = filter || {};
    const count = await evaluateSegmentCount(filterObj);

    const segment = await prisma.contactSegment.create({
      data: {
        name,
        description: description || null,
        filterJson: filterObj,
        createdBy: body.created_by || "user",
        lastCount: count,
        lastRunAt: new Date(),
      },
    });

    return jsonOk({
      success: true,
      segment: {
        id: segment.id,
        name: segment.name,
        description: segment.description,
        filter: segment.filterJson,
        count: segment.lastCount,
        last_run_at: segment.lastRunAt,
      },
    });
  } catch (err: any) {
    return jsonErr(`Failed to create segment: ${err.message}`, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonErr("Segment id is required", 400);

    await prisma.contactSegment.delete({ where: { id } });
    return jsonOk({ success: true, message: "Segment deleted" });
  } catch (err: any) {
    return jsonErr(`Failed to delete segment: ${err.message}`, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
