import { NextResponse } from "next/server";
import { jsonOk } from "../../../helper";

export async function POST() {
  return jsonOk({ success: true, switched: true });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
