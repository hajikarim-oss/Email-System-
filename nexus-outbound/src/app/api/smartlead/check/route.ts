import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.SMARTLEAD_API_KEY;
    const baseUrl = process.env.SMARTLEAD_API_URL || "https://server.smartlead.ai/api/v1";

    const response = await fetch(`${baseUrl}/email-accounts?api_key=${apiKey}`);
    const mailboxes = await response.json();

    const isConnected = Array.isArray(mailboxes) && mailboxes.length > 0;

    return NextResponse.json({
      status: isConnected ? "connected" : "not_connected",
      apiKeyConfigured: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "not set",
      mailboxesFound: Array.isArray(mailboxes) ? mailboxes.length : 0,
      mailboxes: Array.isArray(mailboxes) ? mailboxes.map((m: { id: number; from_email?: string; username?: string; email?: string; from_name?: string }) => ({
        id: m.id,
        email: m.from_email || m.username || m.email || "unknown",
        name: m.from_name || "",
      })) : [],
      setupGuide: {
        title: "How to Connect Your Email to Smartlead",
        steps: [
          {
            step: 1,
            title: "Open Smartlead Dashboard",
            description: "Go to https://app.smartlead.ai and login",
            url: "https://app.smartlead.ai",
          },
          {
            step: 2,
            title: "Navigate to Email Accounts",
            description: "Click 'Email Accounts' in the left sidebar",
          },
          {
            step: 3,
            title: "Add Email Account",
            description: "Click the 'Add Email Account' button",
          },
          {
            step: 4,
            title: "Choose Connection Method",
            description: "Select 'Connect Google' for Gmail/Google Workspace",
          },
          {
            step: 5,
            title: "Authorize Smartlead",
            description: "Complete the Google OAuth flow to allow Smartlead to send emails on your behalf",
          },
          {
            step: 6,
            title: "Verify Connection",
            description: "After connecting, your email will appear in the list with a status of 'Connected'",
          },
          {
            step: 7,
            title: "Get Mailbox ID",
            description: "Click on your email to see the Mailbox ID (a number like 12345)",
          },
          {
            step: 8,
            title: "Update This App",
            description: "Use POST /api/mailboxes/link with your Mailbox ID to link it",
          },
        ],
        afterSetup: {
          description: "After connecting your email to Smartlead, run this endpoint again to see your mailboxes.",
          checkUrl: "/api/smartlead/check",
          linkEndpoint: "POST /api/mailboxes/link",
        },
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: (error as Error).message,
      apiKeyConfigured: !!process.env.SMARTLEAD_API_KEY,
      connected: false,
    }, { status: 500 });
  }
}
