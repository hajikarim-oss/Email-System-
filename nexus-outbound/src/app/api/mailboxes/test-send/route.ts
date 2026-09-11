import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mailboxId, toEmail, subject, body: emailBody } = body;

    if (!mailboxId || !toEmail) {
      return NextResponse.json(
        { error: "mailboxId and toEmail are required" },
        { status: 400 }
      );
    }

    // Find the mailbox
    const mailbox = await prisma.mailbox.findUnique({
      where: { id: mailboxId },
      include: { user: true },
    });

    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    if (!mailbox.providerMailboxId) {
      return NextResponse.json(
        { error: "Mailbox not linked to Smartlink. Please link it first." },
        { status: 400 }
      );
    }

    // Get API key from the mailbox owner
    let smartleadApiKey = process.env.SMARTLEAD_API_KEY;
    if (mailbox.user?.smartleadApiKey) smartleadApiKey = mailbox.user.smartleadApiKey;
    const smartlead = new SmartleadProvider(smartleadApiKey);

    // Send test email via Smartlead using the correct endpoint
    const testSubject = subject || `Test Email from ${mailbox.senderEmail}`;
    const testBody = emailBody || `Hi,

This is a test email from Nexus Outbound.

If you received this, your mailbox is working correctly!

Best,
${mailbox.senderEmail}

---
Sent via Nexus Outbound - Cold Email Outreach Platform`;

    const result = await smartlead.sendSingleEmail(
      toEmail,
      testSubject,
      testBody,
      mailbox.senderEmail,
      mailbox.user?.name || mailbox.senderEmail.split("@")[0]
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email via Smartlead" },
        { status: 500 }
      );
    }

    // Log the test send
    await prisma.auditLog.create({
      data: {
        userId: mailbox.userId,
        action: "mailbox.test_send",
        resourceType: "mailbox",
        resourceId: mailboxId,
        metadata: {
          from: mailbox.senderEmail,
          to: toEmail,
          subject: testSubject,
          smartleadTrackId: result.trackId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully via Smartlead",
      details: {
        from: mailbox.senderEmail,
        to: toEmail,
        subject: testSubject,
        smartleadMailboxId: mailbox.providerMailboxId,
        smartleadTrackId: result.trackId,
      },
    });
  } catch (error) {
    console.error("Test email error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
