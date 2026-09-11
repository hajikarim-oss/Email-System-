import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mailboxId, smartleadMailboxId, smartleadEmail } = body;

    if (!mailboxId || !smartleadMailboxId) {
      return NextResponse.json(
        { error: "mailboxId and smartleadMailboxId are required" },
        { status: 400 }
      );
    }

    // Find the mailbox in our database
    const mailbox = await prisma.mailbox.findUnique({
      where: { id: mailboxId },
    });

    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    // Update mailbox with Smartlead ID
    const updated = await prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        providerMailboxId: smartleadMailboxId,
        status: "ACTIVE", // Mark as active after linking
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: mailbox.userId,
        action: "mailbox.link_smartlead",
        resourceType: "mailbox",
        resourceId: mailboxId,
        metadata: {
          email: mailbox.senderEmail,
          smartleadMailboxId,
          smartleadEmail: smartleadEmail || mailbox.senderEmail,
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.senderEmail,
      smartleadMailboxId: updated.providerMailboxId,
      status: updated.status.toLowerCase(),
      message: "Mailbox linked to Smartlead successfully",
    });
  } catch (error) {
    console.error("Mailbox linking error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // List all mailboxes with their Smartlead linking status
    const mailboxes = await prisma.mailbox.findMany({
      select: {
        id: true,
        senderEmail: true,
        provider: true,
        providerMailboxId: true,
        status: true,
        dailySendLimit: true,
        warmupEmailsSent: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = mailboxes.map((m) => ({
      id: m.id,
      email: m.senderEmail,
      provider: m.provider,
      smartleadMailboxId: m.providerMailboxId || null,
      linked: !!m.providerMailboxId,
      status: m.status.toLowerCase(),
      dailyLimit: m.dailySendLimit,
      emailsSent: m.warmupEmailsSent,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
