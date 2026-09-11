import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    const recipientPhone = process.env.WHATSAPP_ALERT_PHONE;

    if (!apiUrl || !apiToken || !recipientPhone) {
      return NextResponse.json({
        success: false,
        error: "WhatsApp credentials not configured",
        env: {
          url: !!apiUrl,
          token: !!apiToken,
          phone: !!recipientPhone,
        },
      });
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientPhone.replace("+", ""),
        type: "text",
        text: {
          body: "[NEXUS TEST] WhatsApp integration is working! You will receive operational alerts here.",
        },
      }),
    });

    const data = await response.json();

    return NextResponse.json({
      success: response.ok,
      data,
      recipient: recipientPhone,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
