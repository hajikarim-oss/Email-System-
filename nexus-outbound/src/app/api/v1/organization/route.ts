import { NextResponse } from "next/server";
import { jsonOk } from "../helper";

export async function GET() {
  const org = {
    id: "org_nexus_default",
    name: "Nexus Outbound",
    avatar: null,
    avatar_url: null,
    plan: "enterprise",
    role: "owner",
    permissions: 2147483647,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  return jsonOk([org]);
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
