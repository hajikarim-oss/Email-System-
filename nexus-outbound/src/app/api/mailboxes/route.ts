import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mailboxes = await prisma.mailbox.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Get today's start
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count sent emails today per mailbox from email events
    const sentTodayCounts = await prisma.emailEvent.groupBy({
      by: ["fromEmail"],
      where: {
        eventType: "sent",
        createdAt: { gte: todayStart },
        fromEmail: { not: null },
      },
      _count: { id: true },
    });

    // Build lookup map: fromEmail -> count
    const sentCountMap = new Map<string, number>();
    for (const row of sentTodayCounts) {
      if (row.fromEmail) {
        sentCountMap.set(row.fromEmail.toLowerCase(), row._count.id);
      }
    }

    const formatted = mailboxes.map((m) => {
      const emailKey = m.senderEmail?.toLowerCase() || "";
      const sentToday = sentCountMap.get(emailKey) || 0;

      return {
        id: m.id,
        senderEmail: m.senderEmail,
        email: m.senderEmail,
        owner: m.user?.name || m.user?.email || "Unknown",
        provider: m.provider,
        status: m.status.toLowerCase(),
        health: m.status === "ACTIVE" ? 98 : m.status === "WARMING" ? 92 : 65,
        sentToday,
        dailyLimit: m.dailySendLimit,
        warmupReputationScore: m.warmupReputationScore || 100,
        warmupDays: m.warmupStartAt
          ? Math.floor((Date.now() - new Date(m.warmupStartAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        bounceRate: 0,
        pausedReason: m.pausedReason || "",
        providerMailboxId: m.providerMailboxId || null,
        linked: !!m.providerMailboxId,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { email, provider = "smartlead" } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const existing = await prisma.mailbox.findUnique({ where: { senderEmail: email } });
    if (existing) {
      return NextResponse.json({ error: "Mailbox already exists" }, { status: 409 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const mailbox = await prisma.mailbox.create({
      data: {
        userId: user.id,
        senderEmail: email,
        provider,
        status: "WARMING",
        dailySendLimit: 50,
        warmupStartAt: new Date(),
        warmupTargetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      id: mailbox.id,
      email: mailbox.senderEmail,
      owner: user.name,
      status: mailbox.status.toLowerCase(),
      health: 92,
      sentToday: 0,
      dailyLimit: mailbox.dailySendLimit,
      bounceRate: 0,
      warmupDays: 0,
      pausedReason: "",
      message: "Mailbox created successfully. Connect via Smartlead OAuth to start sending.",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Mailbox ID is required" }, { status: 400 });
    }

    const mailbox = await prisma.mailbox.findUnique({ where: { id } });
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    if (mailbox.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.mailbox.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Mailbox deleted" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
