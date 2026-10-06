import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function resolveUser(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7).trim();
    if (!token) return null;

    const dbSession = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    }).catch(() => null);

    if (dbSession?.user && dbSession.user.isActive && dbSession.expires > new Date()) {
      return dbSession.user;
    }
  } catch (err) {
    console.warn("[resolveUser] Session validation error:", err);
  }

  return null;
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export function jsonErr(message: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json(
    { error: message, message, code, status },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
