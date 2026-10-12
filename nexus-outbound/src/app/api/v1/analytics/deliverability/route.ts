import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { jsonOk } from "../../helper";

export async function GET() {
  const mailboxes = await prisma.mailbox.findMany({
    select: { senderEmail: true, status: true },
  }).catch(() => []);

  const domains = [...new Set(mailboxes.map((m) => m.senderEmail.split("@")[1]).filter(Boolean))];

  return jsonOk({
    score: 0,
    status: domains.length > 0 ? "unknown" : "no_mailboxes",
    spf_pass_pct: 0,
    dkim_pass_pct: 0,
    dmarc_pass_pct: 0,
    inbox_placement_pct: 0,
    spam_placement_pct: 0,
    missing_pct: 0,
    domains: domains.map((d) => ({
      domain: d,
      spf: false,
      dkim: false,
      dmarc: false,
      reputation: "unknown",
      inbox_placement: 0,
    })),
  });
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
