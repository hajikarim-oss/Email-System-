import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("subject")?.toLowerCase();
    const emailIds = searchParams.get("email_ids")?.split(",").filter(Boolean);
    const campaignId = searchParams.get("campaign_id");
    const memberId = searchParams.get("member_id");
    const since = searchParams.get("since");
    const until = searchParams.get("until");
    const unseen = searchParams.get("unseen") === "true";
    const awaitingReply = searchParams.get("awaiting_reply") === "true";
    const folder = searchParams.get("folder");
    const categoryIds = searchParams.get("category_ids")?.split(",").filter(Boolean);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const cursor = searchParams.get("cursor");

    const isMaster = (user as any).role === "MASTER";

    // Build campaign filter
    const campaignWhere: any = {};
    if (!isMaster) {
      campaignWhere.userId = user.id;
    } else if (memberId && memberId !== "all") {
      campaignWhere.userId = memberId;
    }

    if (emailIds && emailIds.length > 0) {
      campaignWhere.mailboxes = { some: { mailboxId: { in: emailIds } } };
    }

    // Build lead filter
    const leadWhere: any = {
      campaignId: { not: null },
      events: { some: { eventType: { in: ["sent", "replied"] } } },
    };

    if (Object.keys(campaignWhere).length > 0) {
      leadWhere.campaign = campaignWhere;
    }

    if (campaignId && campaignId !== "all") {
      leadWhere.campaignId = campaignId;
    }

    if (unseen) {
      leadWhere.status = "REPLIED";
    }

    if (awaitingReply) {
      leadWhere.status = "ACTIVE";
      leadWhere.totalOutbound = { gt: 0 };
    }

    if (folder === "inbox") {
      leadWhere.status = "REPLIED";
    } else if (folder === "sent") {
      leadWhere.totalOutbound = { gt: 0 };
    }

    if (categoryIds && categoryIds.length > 0) {
      const catMap: Record<string, string[]> = {
        cat_interested: ["WORKING"],
        cat_hot: ["WORKING"],
        cat_warm: ["POTENTIAL"],
        cat_bounced: ["DO_NOT_CONTACT"],
      };
      const cats = categoryIds.flatMap((id) => catMap[id] || []);
      if (cats.length > 0) {
        leadWhere.leadCategory = { in: cats };
      }
    }

    if (since) {
      leadWhere.updatedAt = { ...(leadWhere.updatedAt || {}), gte: new Date(since) };
    }
    if (until) {
      leadWhere.updatedAt = { ...(leadWhere.updatedAt || {}), lte: new Date(until + "T23:59:59.999Z") };
    }

    if (cursor) {
      leadWhere.updatedAt = { ...(leadWhere.updatedAt || {}), lt: new Date(cursor) };
    }

    const leads = await prisma.lead.findMany({
      where: leadWhere,
      include: {
        campaign: { select: { id: true, name: true, userId: true } },
        events: {
          where: { eventType: { in: ["sent", "replied"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
    });

    const hasMore = leads.length > limit;
    const items = hasMore ? leads.slice(0, limit) : leads;

    const rows = items.map((lead) => {
      const latestEvent = lead.events[0];
      const raw = (latestEvent?.rawPayload || {}) as Record<string, any>;

      const isReply = latestEvent?.eventType === "replied";

      const subject =
        raw.subject ||
        raw.email_subject ||
        (isReply
          ? `Re: ${lead.campaign?.name || "Outreach"}`
          : `Outreach to ${lead.firstName || lead.email}`);

      const snippetRaw =
        raw.reply_text || raw.body || raw.email_body || raw.snippet || "";
      const snippet = String(snippetRaw).replace(/<[^>]*>/g, "").slice(0, 300);

      const fromEmail = latestEvent?.fromEmail || "";
      const fromAddr = isReply ? [lead.email] : [fromEmail || "outreach@theboredmonkey.com"];
      const toAddr = isReply ? [fromEmail || "outreach@theboredmonkey.com"] : [lead.email];

      const hasUnread = lead.status === "REPLIED";
      const messageCount = (lead.totalOutbound || 0) + (lead.totalInbound || 0) || 1;

      const labels: { id: string; title: string; color: string }[] = [];
      if (lead.leadCategory === "WORKING" || lead.status === "REPLIED") {
        labels.push({ id: "cat_interested", title: "Interested", color: "#10b981" });
      } else if (lead.leadCategory === "POTENTIAL") {
        labels.push({ id: "cat_warm", title: "Warm", color: "#f59e0b" });
      } else if (lead.status === "BOUNCED") {
        labels.push({ id: "cat_bounced", title: "Bounced", color: "#ef4444" });
      }

      return {
        id: `msg_${lead.id}`,
        email_id: "mb_default",
        thread_id: `th_${lead.id}`,
        from_addr: fromAddr,
        to_addr: toAddr,
        subject: subject.slice(0, 200),
        snippet,
        internal_date: (latestEvent?.createdAt || lead.updatedAt).toISOString(),
        seen: !hasUnread,
        message_count: messageCount,
        has_unread: hasUnread,
        labels,
        campaign_id: lead.campaignId,
        campaign_name: lead.campaign?.name,
      };
    });

    // Subject/text search post-filter
    const filtered = query
      ? rows.filter(
          (r) =>
            r.subject.toLowerCase().includes(query) ||
            r.snippet.toLowerCase().includes(query) ||
            r.from_addr.some((a) => a.toLowerCase().includes(query)) ||
            r.to_addr.some((a) => a.toLowerCase().includes(query)),
        )
      : rows;

    return jsonOk({
      data: filtered,
      pagination: {
        has_more: hasMore,
        next_cursor: hasMore ? items[items.length - 1]?.updatedAt.toISOString() : null,
      },
    });
  } catch (err: any) {
    console.error("[unibox] Error:", err);
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
