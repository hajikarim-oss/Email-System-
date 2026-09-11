import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const existing = await prisma.aiDraft.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (existing) {
      await prisma.aiDraft.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });

      // Log action
      let user = await prisma.user.findFirst();
      if (user) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "draft.send",
            resourceType: "draft",
            resourceId: id,
            metadata: { leadEmail: existing.lead.email },
          },
        });
      }

      return NextResponse.json({ id, draftStatus: "sent", sentAt: new Date().toISOString() });
    }

    return NextResponse.json({ id, draftStatus: "sent", sentAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
