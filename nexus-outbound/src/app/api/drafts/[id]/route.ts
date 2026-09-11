import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { draft } = body;

    const existing = await prisma.aiDraft.findUnique({ where: { id } });
    if (existing) {
      const updated = await prisma.aiDraft.update({
        where: { id },
        data: {
          draftBody: draft || "",
          status: draft ? "PENDING_REVIEW" : "DISCARDED",
        },
      });

      return NextResponse.json({ id: updated.id, draft: updated.draftBody, draftStatus: updated.status.toLowerCase() });
    }

    return NextResponse.json({ id, draft, draftStatus: draft ? "saved" : "discarded" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
