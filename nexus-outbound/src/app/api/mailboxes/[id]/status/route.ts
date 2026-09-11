import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, pausedReason } = body;

    const existing = await prisma.mailbox.findUnique({ where: { id } });
    if (existing) {
      const updated = await prisma.mailbox.update({
        where: { id },
        data: {
          status: status.toUpperCase(),
          pausedReason: pausedReason || (status === "paused" ? "Paused by operator" : null),
        },
      });

      return NextResponse.json({
        id: updated.id,
        email: updated.senderEmail,
        status: updated.status.toLowerCase(),
        pausedReason: updated.pausedReason || "",
      });
    }

    return NextResponse.json({ id, status, pausedReason: pausedReason || "" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
