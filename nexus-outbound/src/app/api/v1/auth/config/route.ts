import { NextResponse } from "next/server";
import { jsonOk } from "../../helper";

export async function GET() {
  return jsonOk({
    captcha: false,
    password_login: true,
    login_code: "off",
    registration: "true",
    email_verification: false,
    mail_delivers: true,
    passkeys: false,
    providers: [],
    self_hosted: true,
    billing_enabled: false,
    setup_required: false,
    invites_required: false,
    docs_url: "https://theboredmonkey.com/docs",
    brand: {
      name: "TheBoredMonkey Outreach",
      website_url: "https://theboredmonkey.com",
      website_label: "TheBoredMonkey Outreach",
    },
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
