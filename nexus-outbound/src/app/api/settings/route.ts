import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        smartleadApiKey: true,
      },
    });

    return NextResponse.json({
      id: user?.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      smartleadApiKey: user?.smartleadApiKey || "",
      hasSmartleadKey: !!user?.smartleadApiKey,
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { smartleadApiKey, name } = body;

    const updateData: Record<string, any> = {};
    if (smartleadApiKey !== undefined) updateData.smartleadApiKey = smartleadApiKey || null;
    if (name !== undefined) updateData.name = name;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        smartleadApiKey: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasSmartleadKey: !!user.smartleadApiKey,
      },
    });
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
