import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, company, category, status } = body;

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (existing) {
      const updated = await prisma.lead.update({
        where: { id },
        data: {
          ...(category && { leadCategory: category.toUpperCase() }),
          ...(status && { status: status.toUpperCase() }),
        },
      });

      return NextResponse.json({
        id: updated.id,
        name: `${updated.firstName || ""} ${updated.lastName || ""}`.trim(),
        email: updated.email,
        category: updated.leadCategory.toLowerCase(),
        status: updated.status.toLowerCase(),
      });
    }

    return NextResponse.json({ id, name, company, category, status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
