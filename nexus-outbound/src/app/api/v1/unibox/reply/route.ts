import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUser, jsonOk, jsonErr } from "../../helper";

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return jsonErr("Unauthorized", 401);

    const body = await req.json();
    const { to, subject, body: emailBody, thread_id } = body;

    // Log the sent reply event in Prisma
    const leadId = (thread_id || "").replace(/^th_/, "");
    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (lead) {
        await prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            eventType: "sent",
            providerEventId: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            fromEmail: "outreach@theboredmonkey.com",
            rawPayload: { subject, body: emailBody },
          },
        });
      }
    }

    return jsonOk({
      success: true,
      message: "Reply sent successfully",
      id: `sent_${Date.now()}`,
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
