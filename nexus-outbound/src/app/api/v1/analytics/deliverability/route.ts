import { NextResponse } from "next/server";
import { jsonOk } from "../../helper";

export async function GET() {
  return jsonOk({
    score: 98,
    status: "optimal",
    spf_pass_pct: 100,
    dkim_pass_pct: 100,
    dmarc_pass_pct: 100,
    inbox_placement_pct: 96,
    spam_placement_pct: 3,
    missing_pct: 1,
    domains: [
      {
        domain: "theboredmonkey.com",
        spf: true,
        dkim: true,
        dmarc: true,
        reputation: "high",
        inbox_placement: 98,
      },
    ],
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
