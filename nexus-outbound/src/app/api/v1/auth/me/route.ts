import { NextResponse } from "next/server";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return jsonErr("Unauthorized", 401);
    }

    const names = (user.name || "Admin User").split(" ");
    const firstName = names[0] || "Admin";
    const lastName = names.slice(1).join(" ") || "User";

    return jsonOk({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      email: user.email,
      avatar_url: user.image || null,
      referral_source: "direct",
      onboarding_completed_at: new Date("2026-01-01T00:00:00Z"),
      undo_send_seconds: 30,
      is_admin: user.role === "MASTER",
      admin_permissions: 2147483647,
      tags: [
        { id: "tag_vip", title: "VIP", color: "#38bdf8" },
        { id: "tag_tech", title: "Enterprise", color: "#818cf8" },
      ],
      categories: [
        { id: "cat_hot", title: "Hot Lead", color: "#ef4444" },
        { id: "cat_warm", title: "Warm Lead", color: "#f59e0b" },
      ],
      folders: [
        { id: "fld_q1", title: "Q1 Outbound" },
        { id: "fld_q2", title: "Scale Phase" },
      ],
      roles: [user.role.toLowerCase(), "admin", "owner"],
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);
    const body = await req.json();

    return jsonOk({
      id: user.id,
      ...body,
      updated_at: new Date(),
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
