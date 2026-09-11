import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { jsonOk, jsonErr } from "../../../helper";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const steps = await prisma.campaignStep.findMany({
      where: { campaignId: id },
      orderBy: { stepNumber: "asc" },
    });

    const data = steps.map((s) => ({
      id: s.id,
      name: `Step ${s.stepNumber}`,
      subject: s.subject,
      body_plain: s.bodyTemplate.replace(/<[^>]*>?/gm, ""),
      body_html: s.bodyTemplate,
      body_sync: true,
      body_code: false,
      wait_after: s.delayDays * 24 * 60, // in minutes
      x: 0,
      y: (s.stepNumber - 1) * 200,
      kind: "email" as const,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    }));

    return jsonOk(data);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existingCount = await prisma.campaignStep.count({ where: { campaignId: id } });
    const nextStepNum = existingCount + 1;

    const step = await prisma.campaignStep.create({
      data: {
        campaignId: id,
        stepNumber: nextStepNum,
        delayDays: nextStepNum === 1 ? 0 : 3,
        subject: `Follow-up #${nextStepNum - 1}: {{first_name}}`,
        bodyTemplate: "<p>Hi {{first_name}},</p><p>Following up on my previous message to see if you had any thoughts?</p><p>Best regards,</p>",
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
    }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
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
