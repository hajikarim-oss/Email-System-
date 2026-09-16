import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { OutreachState, RecencyBucket, ReplyClass } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const format = (body.format || "csv").toLowerCase();

    // Re-use same filter logic
    const where: any = {};
    if (body.recency_buckets?.length) where.recencyBucket = { in: body.recency_buckets as RecencyBucket[] };
    if (body.outreach_states?.length) where.outreachState = { in: body.outreach_states as OutreachState[] };
    if (body.reply_classifications?.length) where.replyClassification = { in: body.reply_classifications as ReplyClass[] };
    if (body.domains?.length) where.domain = { in: body.domains };
    if (body.campaigns?.length) where.lastCampaign = { in: body.campaigns };
    if (body.is_burned !== undefined) {
      where.isBurned = Boolean(body.is_burned);
    } else {
      where.isBurned = false; // quarantine isolation default
    }
    if (body.replied !== undefined) {
      where.totalReplied = body.replied ? { gt: 0 } : 0;
    }

    const limit = Math.min(50000, parseInt(body.limit || "5000", 10));

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { lastContactedAt: "desc" },
      take: limit,
      select: {
        email: true,
        firstName: true,
        lastName: true,
        domain: true,
        totalMessages: true,
        totalReplied: true,
        recencyBucket: true,
        outreachState: true,
        daysSinceLastContact: true,
        lastSubject: true,
        lastBodyHook: true,
        lastSender: true,
        lastCampaign: true,
        lastOutcome: true,
        replyClassification: true,
        lastContactedAt: true,
      },
    });

    if (format === "json") {
      return new NextResponse(JSON.stringify(leads, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=contacts_export.json",
        },
      });
    }

    // Generate CSV
    const headers = [
      "email",
      "firstName",
      "lastName",
      "domain",
      "totalMessages",
      "totalReplied",
      "recencyBucket",
      "outreachState",
      "daysSinceLastContact",
      "replyClassification",
      "lastSubject",
      "lastSender",
      "lastCampaign",
      "lastContactedAt",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(",")];
    for (const l of leads) {
      csvRows.push(
        [
          escapeCsv(l.email),
          escapeCsv(l.firstName),
          escapeCsv(l.lastName),
          escapeCsv(l.domain),
          l.totalMessages,
          l.totalReplied,
          escapeCsv(l.recencyBucket),
          escapeCsv(l.outreachState),
          l.daysSinceLastContact ?? "",
          escapeCsv(l.replyClassification),
          escapeCsv(l.lastSubject),
          escapeCsv(l.lastSender),
          escapeCsv(l.lastCampaign),
          escapeCsv(l.lastContactedAt?.toISOString()),
        ].join(",")
      );
    }

    return new NextResponse(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts_export_${Date.now()}.csv"`,
      },
    });
  } catch (err: any) {
    return new NextResponse(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
