import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mailbox = await prisma.mailbox.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!mailbox) return jsonErr("Mailbox not found", 404);

    return jsonOk({
      id: mailbox.id,
      email: mailbox.senderEmail,
      name: mailbox.user?.name || mailbox.senderEmail.split("@")[0],
      signature_plain: "--\n" + (mailbox.user?.name || "The Bored Monkey Team"),
      signature_html: `<p>--<br/><strong>${mailbox.user?.name || "The Bored Monkey Team"}</strong></p>`,
      signature_sync: true,
      signature_code: false,
      tags: ["Outreach", mailbox.provider],
      provider: mailbox.provider || "smartlead",
      status: mailbox.status === "ACTIVE" ? "active" : mailbox.status === "WARMING" ? "active" : "paused",
      last_synced_at: mailbox.updatedAt,
      campaign_limit: mailbox.dailySendLimit || 50,
      min_wait_time: 120,
      reply_to: mailbox.senderEmail,
      save_to_sent: true,
      tracking_domain: "track.theboredmonkey.com",
      tracking_domain_verified: true,
      auth_state: "passing",
      auth_spf: true,
      auth_dkim: true,
      auth_dmarc: true,
      warmup: mailbox.warmupStartAt || mailbox.createdAt,
      warmup_base: 5,
      warmup_max: mailbox.dailySendLimit || 50,
      warmup_increase: 3,
      warmup_reply_rate: 30,
      created_at: mailbox.createdAt,
      updated_at: mailbox.updatedAt,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const mailbox = await prisma.mailbox.update({
      where: { id },
      data: {
        dailySendLimit: body.campaign_limit !== undefined ? body.campaign_limit : undefined,
        status: body.status ? (body.status.toUpperCase() === "PAUSED" ? "PAUSED" : "ACTIVE") : undefined,
      },
    });

    return jsonOk({ success: true, mailbox });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.mailbox.delete({ where: { id } });
    return jsonOk({ success: true, message: "Mailbox deleted" });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
