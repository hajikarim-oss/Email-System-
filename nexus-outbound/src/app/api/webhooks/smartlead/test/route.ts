import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventType, email } = await req.json();

    const testEmail = email || "test-lead@example.com";
    const testEventType = eventType || "EMAIL_OPENED";

    const testPayload = {
      event_type: testEventType,
      email: testEmail,
      email_campaign_id: "test_campaign_123",
      event_id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      lead_id: null,
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: "This is a test webhook event from Nexus Outbound",
      },
    };

    // Use correct Vercel domain for webhook URL
    const webhookUrl = "https://email-system-omega.vercel.app/api/webhooks/smartlead";

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      webhookUrl,
      testPayload,
      response: result,
      statusCode: response.status,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const eventCount = await prisma.emailEvent.count();
    const recentEvents = await prisma.emailEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        eventType: true,
        providerEventId: true,
        createdAt: true,
        lead: { select: { email: true } },
      },
    });

    return NextResponse.json({
      status: "ok",
      endpoint: "/api/webhooks/smartlead",
      totalEventsStored: eventCount,
      recentEvents: recentEvents.map((e) => ({
        type: e.eventType,
        email: e.lead?.email || "unknown",
        eventId: e.providerEventId,
        receivedAt: e.createdAt,
      })),
      supportedEvents: [
        "EMAIL_SENT", "FIRST_EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED",
        "EMAIL_REPLIED", "EMAIL_BOUNCED", "LEAD_UNSUBSCRIBED",
        "LEAD_CATEGORY_UPDATED", "CAMPAIGN_STATUS_CHANGED",
        "MANUAL_STEP_REACHED", "MANUAL_REPLY_SENT", "UNTRACKED_REPLIES",
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
