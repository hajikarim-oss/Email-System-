import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { jsonOk, jsonErr } from "../../helper";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email?.toLowerCase()?.trim();

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (!user) {
      // Find MASTER or first user
      user = await prisma.user.findFirst({ where: { role: "MASTER" } }) || await prisma.user.findFirst();
    }

    if (!user) {
      return jsonErr("No user accounts found. Please run db seed.", 404);
    }

    // Generate session token
    const tokenStr = "nex_" + crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Save session in DB
    await prisma.session.create({
      data: {
        sessionToken: tokenStr,
        userId: user.id,
        expires: expiresAt,
      },
    });

    const token = {
      access_token: tokenStr,
      access_token_expires_at: expiresAt,
      refresh_token: tokenStr,
      refresh_token_expires_at: expiresAt,
    };

    return jsonOk({
      code_required: false,
      token,
    });
  } catch (err: any) {
    return jsonErr(err.message || "Login failed", 500);
  }
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
