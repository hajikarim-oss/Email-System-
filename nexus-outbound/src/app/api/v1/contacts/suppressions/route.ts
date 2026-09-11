import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { jsonOk, jsonErr } from "../../helper";

export async function GET() {
  try {
    const suppressions = await prisma.suppressedEmail.findMany({
      orderBy: { createdAt: "desc" },
    });

    const data = suppressions.map((s) => ({
      id: s.id,
      email: s.email,
      reason: s.reason.toLowerCase(),
      source: s.source || "system",
      created_at: s.createdAt,
    }));

    return jsonOk({ data, pagination: { has_more: false, next_cursor: null } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();
    if (!email) return jsonErr("Email is required", 400);

    const sup = await prisma.suppressedEmail.upsert({
      where: { email },
      update: {},
      create: {
        email,
        reason: "MANUAL",
        source: "dashboard",
      },
    });

    return jsonOk({ id: sup.id, email: sup.email, reason: "manual", created_at: sup.createdAt }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
