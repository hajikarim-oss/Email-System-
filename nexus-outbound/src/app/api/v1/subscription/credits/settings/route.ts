import { NextResponse } from "next/server";
import { jsonOk } from "@/app/api/v1/helper";

export async function GET() {
  return jsonOk({
    org_id: "org_nexus_default",
    spend_limit_daily: null,
    spend_limit_weekly: null,
    spend_limit_monthly: null,
    member_limit_daily: null,
    member_limit_weekly: null,
    member_limit_monthly: null,
    low_balance_threshold: 25,
    low_balance_notified_at: null,
    auto_topup_enabled: false,
    auto_topup_pack: "",
    auto_topup_threshold: 100,
    auto_topup_max_per_month: 5,
  });
}

export async function PATCH() {
  return jsonOk({ success: true });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
