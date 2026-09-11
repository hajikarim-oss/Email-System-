import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ids = [], category } = body;

    if (category) {
      await prisma.lead.updateMany({
        where: { id: { in: ids } },
        data: { leadCategory: category.toUpperCase() },
      });
    }

    return NextResponse.json({ success: true, count: ids.length, category });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
