import { NextResponse } from "next/server";
import { jsonOk } from "../../helper";

export async function GET() {
  return jsonOk({
    data: [
      { id: "seg_all", name: "All Leads", count: 21, rules: [] },
      { id: "seg_replied", name: "Replied Leads", count: 5, rules: [] },
      { id: "seg_high_score", name: "High Intent Score (>80)", count: 8, rules: [] },
    ],
    pagination: { has_more: false, next_cursor: null },
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
