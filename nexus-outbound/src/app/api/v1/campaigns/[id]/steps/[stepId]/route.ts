import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { jsonOk, jsonErr } from "../../../../helper";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const { stepId } = await params;
    const body = await req.json();

    const delayDays = body.wait_after !== undefined ? Math.floor(body.wait_after / (24 * 60)) : undefined;

    const step = await prisma.campaignStep.update({
      where: { id: stepId },
      data: {
        subject: body.subject !== undefined ? body.subject : undefined,
        bodyTemplate: body.body_html !== undefined ? body.body_html : body.body_plain !== undefined ? body.body_plain : undefined,
        delayDays: delayDays,
      },
    });

    return jsonOk({
      id: step.id,
      name: `Step ${step.stepNumber}`,
      subject: step.subject,
      body_plain: step.bodyTemplate.replace(/<[^>]*>?/gm, ""),
      body_html: step.bodyTemplate,
      body_sync: true,
      body_code: false,
      wait_after: step.delayDays * 24 * 60,
      x: 0,
      y: (step.stepNumber - 1) * 200,
      kind: "email",
      created_at: step.createdAt,
      updated_at: step.updatedAt,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const { stepId } = await params;
    await prisma.campaignStep.delete({ where: { id: stepId } });
    return jsonOk({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
