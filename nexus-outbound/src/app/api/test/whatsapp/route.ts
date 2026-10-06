import { NextResponse } from "next/server";
import { resolveUser } from "@/app/api/v1/helper";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const user = await resolveUser(req);
  if (!user || user.role !== "MASTER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
