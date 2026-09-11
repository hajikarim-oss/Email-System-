import { NextResponse } from "next/server";
import { jsonOk } from "../../helper";

export async function GET() {
  return jsonOk({
    data: [
      { id: "cat_hot", name: "Hot Lead", color: "#ef4444" },
      { id: "cat_warm", name: "Warm Lead", color: "#f59e0b" },
      { id: "cat_potential", name: "Potential", color: "#10b981" },
      { id: "cat_dnc", name: "Do Not Contact", color: "#64748b" },
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
