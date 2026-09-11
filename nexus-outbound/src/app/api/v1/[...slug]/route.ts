import { NextResponse } from "next/server";
import { jsonOk } from "../helper";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join("/");

  // Special cases for specific endpoints
  if (path === "notifications") {
    return jsonOk({ data: [], unread_count: 0 });
  }

  if (path === "getaway") {
    return jsonOk({ url: "ws://localhost:3000/api/ws" });
  }

  return jsonOk({
    data: [],
    pagination: { has_more: false, next_cursor: null },
    success: true,
    path,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join("/");

  if (path === "getaway") {
    return jsonOk({ url: "ws://localhost:3000/api/ws" });
  }

  return jsonOk({
    data: {},
    success: true,
    path,
  });
}

export async function PUT() {
  return jsonOk({ success: true });
}

export async function PATCH() {
  return jsonOk({ success: true });
}

export async function DELETE() {
  return jsonOk({ success: true });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
