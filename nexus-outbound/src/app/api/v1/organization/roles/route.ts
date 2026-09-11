import { NextResponse } from "next/server";
import { jsonOk } from "../../helper";

export async function GET() {
  return jsonOk({
    data: [
      { id: "role_owner", name: "Owner", permissions: 2147483647 },
      { id: "role_admin", name: "Admin", permissions: 1048575 },
      { id: "role_member", name: "Member", permissions: 65535 },
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
