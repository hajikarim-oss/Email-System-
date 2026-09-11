import { NextResponse } from "next/server";

export async function GET() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: "NEXTAUTH_URL not configured" }, { status: 500 });
    }
    const webhookUrl = `${baseUrl}/api/webhooks/smartlead`;
    const webhookSecret = process.env.SMARTLEAD_WEBHOOK_SECRET || "not configured";

    return NextResponse.json({
      webhookUrl,
      webhookSecret,
      instructions: {
        step1: "Login to Smartlead Dashboard (https://app.smartlead.ai)",
        step2: "Go to Settings → Webhooks",
        step3: "Add Webhook URL: " + webhookUrl,
        step4: "Enter Webhook Secret: " + webhookSecret,
        step5: "Select Events: email.opened, email.replied, email.bounced, email.unsubscribed",
        step6: "Save and Test",
      },
      eventTypes: [
        { event: "email.sent", description: "Email was sent successfully" },
        { event: "email.opened", description: "Recipient opened the email" },
        { event: "email.replied", description: "Recipient replied to the email" },
        { event: "email.bounced", description: "Email bounced (soft or hard)" },
        { event: "email.unsubscribed", description: "Recipient unsubscribed" },
        { event: "email.clicked", description: "Recipient clicked a link" },
        { event: "email.complained", description: "Recipient marked as spam" },
      ],
      environmentVariables: {
        SMARTLEAD_WEBHOOK_SECRET: webhookSecret,
        NEXTAUTH_URL: baseUrl,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
