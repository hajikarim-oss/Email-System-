import { NextResponse } from "next/server";
import { jsonOk } from "../helper";

export async function GET() {
  return jsonOk({
    data: [
      {
        id: "tmpl_cold_intro",
        name: "Enterprise Intro (Cold)",
        subject: "Question regarding {{company_name}}",
        body_plain: "Hi {{first_name}},\n\nNoticed you manage outreach at {{company_name}}.",
        body_html: "<p>Hi {{first_name}},</p><p>Noticed you manage outreach at {{company_name}}.</p>",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tmpl_follow_up_1",
        name: "Gentle Follow-Up #1",
        subject: "Re: Question regarding {{company_name}}",
        body_plain: "Hi {{first_name}},\n\nWanted to make sure my last note didn't get buried.",
        body_html: "<p>Hi {{first_name}},</p><p>Wanted to make sure my last note didn't get buried.</p>",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    pagination: { has_more: false, next_cursor: null },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
