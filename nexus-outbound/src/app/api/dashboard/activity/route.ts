import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });

    const formatted = logs.map((log) => ({
      id: log.id,
      user: log.user?.name || "System",
      action: log.action,
      resource: log.resourceType,
      detail: (log.metadata as { detail?: string })?.detail || `Action on ${log.resourceType}`,
      timestamp: log.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: log.action.includes("launch") ? "positive" : log.action.includes("pause") ? "warning" : "neutral",
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
