import { NextResponse } from "next/server";
import { jsonOk } from "@/app/api/v1/helper";

export async function GET() {
  return jsonOk({
    spent_today: 12,
    spent_week: 85,
    spent_month: 150,
    limit_daily: null,
    limit_weekly: null,
    limit_monthly: null,
    series: [],
    by_reason: [],
    by_model: [],
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
