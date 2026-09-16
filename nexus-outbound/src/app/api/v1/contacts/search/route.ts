import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";
import { OutreachState, RecencyBucket, ReplyClass } from "@prisma/client";

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const query = (body.query || body.q || "").toLowerCase().trim();
  const page = Math.max(1, parseInt(body.page || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(body.limit || "50", 10)));
  const skip = (page - 1) * limit;

  // Build multi-dimensional where filter
  const where: any = {};

  // 1. Text Search across email, name, domain, company, lastSubject
  if (query) {
    where.OR = [
      { email: { contains: query, mode: "insensitive" } },
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
      { domain: { contains: query, mode: "insensitive" } },
      { lastSubject: { contains: query, mode: "insensitive" } },
    ];
  }

  // 2. Campaign filter
  const campaignId = body.campaign_id || body.campaignId;
  if (campaignId) {
    where.campaignId = campaignId;
  }

  // 3. Temporal filters (Recency & Outreach State)
  const recencyBuckets = body.recency_buckets || (body.recencyBucket ? [body.recencyBucket] : null);
  if (Array.isArray(recencyBuckets) && recencyBuckets.length > 0) {
    where.recencyBucket = { in: recencyBuckets as RecencyBucket[] };
  }

  const outreachStates = body.outreach_states || (body.outreachState ? [body.outreachState] : null);
  if (Array.isArray(outreachStates) && outreachStates.length > 0) {
    where.outreachState = { in: outreachStates as OutreachState[] };
  }

  if (body.days_since_contact_min !== undefined || body.days_since_contact_max !== undefined) {
    where.daysSinceLastContact = {};
    if (body.days_since_contact_min !== undefined) {
      where.daysSinceLastContact.gte = parseInt(body.days_since_contact_min, 10);
    }
    if (body.days_since_contact_max !== undefined) {
      where.daysSinceLastContact.lte = parseInt(body.days_since_contact_max, 10);
    }
  }

  if (body.contacted_date_range) {
    const { start, end } = body.contacted_date_range;
    where.lastContactedAt = {};
    if (start) where.lastContactedAt.gte = new Date(start);
    if (end) where.lastContactedAt.lte = new Date(end);
  }

  // 4. Engagement & Reply filters
  if (body.replied !== undefined) {
    if (body.replied === true || body.replied === "true") {
      where.totalReplied = { gt: 0 };
    } else {
      where.totalReplied = 0;
    }
  }

  const replyClassifications = body.reply_classifications || (body.replyClassification ? [body.replyClassification] : null);
  if (Array.isArray(replyClassifications) && replyClassifications.length > 0) {
    where.replyClassification = { in: replyClassifications as ReplyClass[] };
  }

  if (body.total_messages_min !== undefined || body.total_messages_max !== undefined) {
    where.totalMessages = {};
    if (body.total_messages_min !== undefined) where.totalMessages.gte = parseInt(body.total_messages_min, 10);
    if (body.total_messages_max !== undefined) where.totalMessages.lte = parseInt(body.total_messages_max, 10);
  }

  // 5. Deliverability & Quarantine Isolation (CRITICAL NON-NEGOTIABLE)
  if (body.is_burned !== undefined) {
    where.isBurned = body.is_burned === true || body.is_burned === "true";
  } else if (!body.include_burned && !body.quarantine_only) {
    // Default: strict quarantine isolation — burned leads never appear in regular queries
    where.isBurned = false;
  }

  if (body.is_dormant !== undefined) {
    where.isDormant = body.is_dormant === true || body.is_dormant === "true";
  }

  if (body.is_reengagement_candidate !== undefined) {
    where.isReengagementCandidate = body.is_reengagement_candidate === true || body.is_reengagement_candidate === "true";
  }

  // 6. Domain / Brand filters
  const domains = body.domains || (body.domain ? [body.domain] : null);
  if (Array.isArray(domains) && domains.length > 0) {
    where.domain = { in: domains.map((d: string) => d.toLowerCase().trim()) };
  }

  // 7. Campaign & Sender filters
  const campaigns = body.campaigns || (body.last_campaign ? [body.last_campaign] : null);
  if (Array.isArray(campaigns) && campaigns.length > 0) {
    where.lastCampaign = { in: campaigns };
  }

  const senders = body.senders || (body.last_sender ? [body.last_sender] : null);
  if (Array.isArray(senders) && senders.length > 0) {
    where.lastSender = { in: senders.map((s: string) => s.toLowerCase().trim()) };
  }

  // 8. Content filters
  if (body.subject_contains) {
    where.lastSubject = { contains: body.subject_contains, mode: "insensitive" };
  }

  if (body.body_hook_contains) {
    where.lastBodyHook = { contains: body.body_hook_contains, mode: "insensitive" };
  }

  // 9. Tag vocabulary filter
  if (Array.isArray(body.tags) && body.tags.length > 0) {
    where.tags = { hasSome: body.tags };
  }

  try {
    const [leads, totalMatching, totalInDb, totalBurned, totalRepliedCount, totalDormantCount] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { campaign: { select: { id: true, name: true } } },
        orderBy: [{ lastContactedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.lead.count({ where }),
      prisma.lead.count(),
      prisma.lead.count({ where: { isBurned: true } }),
      prisma.lead.count({ where: { totalReplied: { gt: 0 } } }),
      prisma.lead.count({ where: { isDormant: true } }),
    ]);

    const data = leads.map((l) => {
      const custom = (l.customData as any) || {};

      let leadStatus = "active";
      if (l.outreachState === "BURNED" || l.isBurned) leadStatus = "bounced";
      else if (l.totalReplied > 0) leadStatus = "replied";
      else if (l.status === "UNSUBSCRIBED") leadStatus = "unsubscribed";

      return {
        id: l.id,
        first_name: l.firstName || "",
        last_name: l.lastName || "",
        email: l.email,
        company: custom.company || l.domain || "Enterprise Prospect",
        domain: l.domain || "",
        phone: custom.phone || "",
        custom_fields: custom,
        subscribed: !l.isBurned && l.status !== "UNSUBSCRIBED",
        campaigns: l.campaign ? [{ id: l.campaign.id, name: l.campaign.name }] : [],
        verification_status: l.isBurned ? "invalid" : "valid",
        
        // Extended Intelligence Fields
        temporal_state: {
          recency_bucket: l.recencyBucket,
          outreach_state: l.outreachState,
          days_since_last_contact: l.daysSinceLastContact,
          first_contacted_at: l.firstContactedAt,
          last_contacted_at: l.lastContactedAt,
          is_dormant: l.isDormant,
          is_reengagement_candidate: l.isReengagementCandidate,
        },
        engagement_state: {
          total_messages: l.totalMessages,
          total_replied: l.totalReplied,
          reply_classification: l.replyClassification,
        },
        last_message_context: {
          id: l.lastMessageId,
          subject: l.lastSubject || "",
          body_hook: l.lastBodyHook || "",
          sender: l.lastSender || "",
          campaign: l.lastCampaign || "",
          outcome: l.lastOutcome || "delivered",
          date: l.lastMessageAt,
        },
        tags: l.tags || [],
        
        campaign_lead: {
          status: leadStatus,
          sent: l.totalMessages || 1,
          opened: l.openCount || 0,
          machine_opened: 0,
          clicked: l.clickCount || 0,
          replied: l.totalReplied > 0 ? 1 : 0,
          bounced: l.totalBounced || (l.isBurned ? 1 : 0),
          last_activity_at: (l.lastContactedAt || l.updatedAt || new Date()).toISOString(),
          current_step: `Touch ${l.totalMessages || 1}`,
          sender: l.lastSender || "outreach@theboredmonkey.com",
        },
        created_at: l.createdAt || new Date(),
        updated_at: l.updatedAt || new Date(),
      };
    });

    return jsonOk({
      data,
      pagination: {
        page,
        limit,
        total_matching: totalMatching,
        total_pages: Math.ceil(totalMatching / limit),
        has_more: skip + leads.length < totalMatching,
      },
      counts: {
        matching: totalMatching,
        total_in_db: totalInDb,
        clean_prospects: totalInDb - totalBurned,
        burned_quarantine: totalBurned,
        replied_leads: totalRepliedCount,
        dormant_leads: totalDormantCount,
      },
    });
  } catch (err: any) {
    return jsonErr(`Search query failed: ${err.message}`, 500);
  }
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
