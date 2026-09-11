import { NextResponse } from "next/server";
import { jsonOk } from "../helper";

const TIMEZONES = [
  { name: "UTC", display_name: "(UTC+00:00) UTC" },
  { name: "America/New_York", display_name: "(UTC-05:00) Eastern Time (US & Canada)" },
  { name: "America/Chicago", display_name: "(UTC-06:00) Central Time (US & Canada)" },
  { name: "America/Denver", display_name: "(UTC-07:00) Mountain Time (US & Canada)" },
  { name: "America/Los_Angeles", display_name: "(UTC-08:00) Pacific Time (US & Canada)" },
  { name: "Europe/London", display_name: "(UTC+00:00) London, Edinburgh, Dublin" },
  { name: "Europe/Paris", display_name: "(UTC+01:00) Paris, Berlin, Rome, Madrid" },
  { name: "Asia/Dubai", display_name: "(UTC+04:00) Dubai, Abu Dhabi, Muscat" },
  { name: "Asia/Kolkata", display_name: "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi" },
  { name: "Asia/Singapore", display_name: "(UTC+08:00) Singapore, Kuala Lumpur" },
  { name: "Asia/Tokyo", display_name: "(UTC+09:00) Tokyo, Osaka, Sapporo" },
  { name: "Australia/Sydney", display_name: "(UTC+10:00) Sydney, Melbourne, Brisbane" },
];

export async function GET() {
  return jsonOk(TIMEZONES);
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
