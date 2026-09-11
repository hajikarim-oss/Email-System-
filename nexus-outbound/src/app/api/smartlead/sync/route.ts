import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Smartlead API key
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { smartleadApiKey: true, id: true },
    });

    const apiKey = user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "No Smartlead API key configured. Please add your API key in Settings.",
      }, { status: 400 });
    }

    const baseUrl = process.env.SMARTLEAD_API_URL || "https://server.smartlead.ai/api/v1";
    const response = await fetch(`${baseUrl}/email-accounts?api_key=${apiKey}`);
    const smartleadMailboxes = await response.json();

    if (!Array.isArray(smartleadMailboxes) || smartleadMailboxes.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No mailboxes found in Smartlead. Please connect your email first.",
        setupUrl: "https://app.smartlead.ai",
        instructions: [
          "1. Go to https://app.smartlead.ai",
          "2. Click 'Email Accounts' in left sidebar",
          "3. Click 'Add Email Account'",
          "4. Select 'Connect Google'",
          "5. Complete OAuth flow",
          "6. Run this endpoint again",
        ],
      });
    }

    const synced = [];
    const skipped = [];

    for (const slMailbox of smartleadMailboxes) {
      const email = slMailbox.from_email || slMailbox.username || slMailbox.email;
      const smartleadId = String(slMailbox.id);

      const existing = await prisma.mailbox.findUnique({
        where: { senderEmail: email },
      });

      if (existing) {
        if (!existing.providerMailboxId) {
          await prisma.mailbox.update({
            where: { id: existing.id },
            data: {
              providerMailboxId: smartleadId,
              status: "ACTIVE",
            },
          });
          synced.push({ email, smartleadId, action: "updated" });
        } else {
          skipped.push({ email, reason: "already linked" });
        }
      } else {
        const newMailbox = await prisma.mailbox.create({
          data: {
            userId: user!.id,
            senderEmail: email,
            provider: "smartlead",
            providerMailboxId: smartleadId,
            status: "ACTIVE",
            dailySendLimit: 50,
            warmupStartAt: new Date(),
            warmupTargetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
        synced.push({ email, smartleadId, mailboxId: newMailbox.id, action: "created" });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${synced.length} mailboxes from Smartlead`,
      synced,
      skipped,
      total: smartleadMailboxes.length,
    });
  } catch (error) {
    console.error("Smartlead sync error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
