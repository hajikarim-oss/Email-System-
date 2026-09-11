import { NextResponse } from "next/server";
import { jsonOk } from "@/app/api/v1/helper";

export async function GET() {
  return jsonOk({
    unlimited: false,
    balance: 5000,
    monthly_balance: 4850,
    purchased_balance: 150,
    monthly_allowance: 5000,
    total_purchased: 500,
    monthly_reset_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    next_reset_at: new Date(Date.now() + 20 * 86400000).toISOString(),
    packs: [
      { key: "pack_1000", credits: 1000 },
      { key: "pack_5000", credits: 5000 },
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
