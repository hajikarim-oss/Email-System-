import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { smartlead_id, steps } = body;

    if (!smartlead_id) {
      return NextResponse.json({ error: "Missing smartlead_id" }, { status: 400 });
    }

    const apiKey = process.env.SMARTLEAD_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SMARTLEAD_API_KEY not configured" }, { status: 500 });
    }

    // Format steps for Smartlead sequences API
    const sequences = (steps || []).map((s: any, idx: number) => {
      const subject = (s.subject || "")
        .replace(/\{\{firstName\}\}/g, "{{first_name}}")
        .replace(/\{\{lastName\}\}/g, "{{last_name}}")
        .replace(/\{\{CompanyName\}\}/g, "{{company}}")
        .replace(/\{\{JobTitle\}\}/g, "{{title}}");

      const rawBody = s.body_html || s.body_plain || "";
      const email_body = rawBody
        .replace(/\{\{firstName\}\}/g, "{{first_name}}")
        .replace(/\{\{lastName\}\}/g, "{{last_name}}")
        .replace(/\{\{CompanyName\}\}/g, "{{company}}")
        .replace(/\{\{JobTitle\}\}/g, "{{title}}");

      return {
        id: null,
        seq_number: idx + 1,
        subject: idx === 0 ? subject : "", // Smartlead threads follow-ups if subject is empty
        email_body: email_body,
        seq_delay_details: {
          delay_in_days: idx === 0 ? 0 : (s.wait_after !== undefined ? s.wait_after : 3),
        },
      };
    });

    const res = await fetch(
      `https://server.smartlead.ai/api/v1/campaigns/${smartlead_id}/sequences?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequences }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Smartlead update-sequences error]", errText);
      return NextResponse.json({ error: errText }, { status: res.status });
    }

    const data = await res.json().catch(() => ({ success: true }));
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[Smartlead update-sequences exception]", error);
    return NextResponse.json({ error: error.message || "Failed to update sequences" }, { status: 500 });
  }
}
