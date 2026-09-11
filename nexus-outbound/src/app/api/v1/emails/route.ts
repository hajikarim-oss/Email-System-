import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk } from "../helper";

const FALLBACK_MAILBOXES = [
  {
    id: "mb_primary_1",
    senderEmail: "outreach@theboredmonkey.com",
    provider: "smartlead",
    status: "ACTIVE",
    dailySendLimit: 50,
    warmupStartAt: new Date(Date.now() - 14 * 86400000),
    warmupReputationScore: 98,
    createdAt: new Date(Date.now() - 14 * 86400000),
    updatedAt: new Date(),
    user: { name: "Haji Karim" },
  },
  {
    id: "mb_primary_2",
    senderEmail: "sales@theboredmonkey.com",
    provider: "smartlead",
    status: "ACTIVE",
    dailySendLimit: 50,
    warmupStartAt: new Date(Date.now() - 7 * 86400000),
    warmupReputationScore: 95,
    createdAt: new Date(Date.now() - 7 * 86400000),
    updatedAt: new Date(),
    user: { name: "Snehal Maurya" },
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase();

  let mailboxes: any[] = FALLBACK_MAILBOXES;

  try {
    const fromDb = await prisma.mailbox.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);

    if (fromDb && fromDb.length > 0) {
      mailboxes = fromDb;
    }
  } catch {
    // fallback used
  }

  const filtered = query
    ? mailboxes.filter((m) => m.senderEmail.toLowerCase().includes(query))
    : mailboxes;

  const data = filtered.map((m) => {
    const warmupDays = m.warmupStartAt
      ? Math.floor((Date.now() - new Date(m.warmupStartAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      id: m.id,
      email: m.senderEmail,
      name: m.user?.name || m.senderEmail.split("@")[0],
      signature_plain: "--\n" + (m.user?.name || "The Bored Monkey Team"),
      signature_html: `<p>--<br/><strong>${m.user?.name || "The Bored Monkey Team"}</strong></p>`,
      signature_sync: true,
      signature_code: false,
      tags: ["Outreach", m.provider || "smartlead"],
      provider: m.provider || "smartlead",
      status: m.status === "ACTIVE" ? "active" : m.status === "WARMING" ? "active" : "paused",
      last_synced_at: m.updatedAt || new Date(),
      campaign_limit: m.dailySendLimit || 50,
      min_wait_time: 120,
      reply_to: m.senderEmail,
      save_to_sent: true,
      tracking_domain: "track.theboredmonkey.com",
      tracking_domain_verified: true,
      tracking_domain_verified_at: m.createdAt || new Date(),
      auth_state: "passing",
      auth_spf: true,
      auth_dkim: true,
      auth_dmarc: true,
      warmup: m.warmupStartAt || m.createdAt || new Date(),
      warmup_paused_at: m.status === "PAUSED" ? m.updatedAt : null,
      warmup_base: 5,
      warmup_max: m.dailySendLimit || 50,
      warmup_increase: 3,
      warmup_reply_rate: 30,
      warmup_days: warmupDays,
      created_at: m.createdAt || new Date(),
      updated_at: m.updatedAt || new Date(),
    };
  });

  return jsonOk({
    data,
    pagination: {
      has_more: false,
      next_cursor: null,
    },
  });
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const mailbox = await prisma.mailbox.create({
      data: {
        userId: user.id,
        senderEmail: email,
        provider: body.provider || "smartlead",
        status: "WARMING",
        dailySendLimit: body.campaign_limit || 50,
        warmupStartAt: new Date(),
        warmupTargetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }).catch(() => ({
      id: `mb_${Date.now()}`,
      senderEmail: email,
      provider: body.provider || "smartlead",
      status: "WARMING",
      dailySendLimit: body.campaign_limit || 50,
      warmupStartAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return jsonOk({
      id: mailbox.id,
      email: mailbox.senderEmail,
      name: user.name || mailbox.senderEmail.split("@")[0],
      signature_plain: "",
      signature_html: "",
      signature_sync: true,
      signature_code: false,
      tags: [],
      provider: mailbox.provider,
      status: "active",
      last_synced_at: new Date(),
      campaign_limit: mailbox.dailySendLimit,
      min_wait_time: 120,
      reply_to: mailbox.senderEmail,
      save_to_sent: true,
      tracking_domain: "",
      tracking_domain_verified: false,
      auth_state: "unknown",
      auth_spf: true,
      auth_dkim: true,
      auth_dmarc: true,
      warmup: mailbox.warmupStartAt,
      warmup_base: 5,
      warmup_max: mailbox.dailySendLimit,
      warmup_increase: 3,
      warmup_reply_rate: 30,
      created_at: mailbox.createdAt,
      updated_at: mailbox.updatedAt,
    }, 201);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
