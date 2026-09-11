import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        leads: { where: { status: "ACTIVE" } },
        mailboxes: {
          include: {
            mailbox: {
              include: {
                user: { select: { smartleadApiKey: true, email: true, name: true } },
              },
            },
          },
        },
        user: { select: { smartleadApiKey: true, email: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (campaign.steps.length === 0) {
      return NextResponse.json({ error: "Campaign has no email steps" }, { status: 400 });
    }

    if (campaign.leads.length === 0) {
      return NextResponse.json({ error: "Campaign has no active leads" }, { status: 400 });
    }

    if (campaign.mailboxes.length === 0) {
      return NextResponse.json({ error: "Campaign has no mailboxes assigned" }, { status: 400 });
    }

    // Use the FIRST selected mailbox owner's Smartlead API key
    // This ensures campaigns send from the correct Smartlead workspace
    // (not the campaign creator's workspace)
    const firstMailboxOwner = campaign.mailboxes[0]?.mailbox?.user;
    const smartleadApiKey = firstMailboxOwner?.smartleadApiKey || campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!smartleadApiKey) {
      return NextResponse.json({ error: "No Smartlead API key" }, { status: 400 });
    }
    console.log(`[Launch] Using Smartlead API key from: ${firstMailboxOwner?.email || "fallback"} (campaign: ${campaign.name})`);

    const smartleadMailboxIds = campaign.mailboxes
      .map((cm: any) => cm.mailbox?.providerMailboxId)
      .filter((id: any): id is string => !!id)
      .map((id: string) => parseInt(id, 10))
      .filter((id: number) => !isNaN(id));

    if (smartleadMailboxIds.length === 0) {
      return NextResponse.json({ error: "No linked mailboxes" }, { status: 400 });
    }

    const leadEmails = campaign.leads.map((l: any) => l.email);
    const suppressed = await prisma.suppressedEmail.findMany({
      where: { email: { in: leadEmails } },
    });
    const suppressedEmails = new Set(suppressed.map((s: any) => s.email));
    const activeLeads = campaign.leads.filter((l: any) => !suppressedEmails.has(l.email));

    if (activeLeads.length === 0) {
      return NextResponse.json({ error: "All leads suppressed" }, { status: 400 });
    }

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // If already launched, re-start
    if (campaign.providerCampaignId) {
      try {
        await smartlead.setSchedule(campaign.providerCampaignId, {
          timezone: campaign.sendTimezone || "Asia/Kolkata",
          daysOfWeek: campaign.preferredSendDays?.length ? campaign.preferredSendDays : [1, 2, 3, 4, 5],
          startHour: "09:00",
          endHour: "17:00",
          minTimeBetweenEmails: 3,
          maxNewLeadsPerDay: 50 * smartleadMailboxIds.length,
        });
        await smartlead.startCampaign(campaign.providerCampaignId);
        const webhookUrl = "https://email-system-omega.vercel.app/api/webhooks/smartlead";
        await smartlead.configureUserWebhook(webhookUrl);
        await smartlead.configureWebhook(campaign.providerCampaignId, webhookUrl);
        await prisma.campaign.update({ where: { id }, data: { status: "ACTIVE" } });
        return NextResponse.json({ id: campaign.id, name: campaign.name, status: "re-launched", message: "Campaign re-activated." });
      } catch (err) {
        return NextResponse.json({ error: `Re-launch failed: ${(err as Error).message}` }, { status: 502 });
      }
    }

    // Create campaign on Smartlead
    let providerCampaignId: string;
    try {
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/create?api_key=${smartleadApiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: campaign.name }) }
      );
      if (!res.ok) throw new Error(`Create error: ${await res.text()}`);
      const data = await res.json();
      providerCampaignId = String(data.id);
      await prisma.campaign.update({ where: { id }, data: { providerCampaignId } });
    } catch (err) {
      return NextResponse.json({ error: `Smartlead error: ${(err as Error).message}` }, { status: 502 });
    }

    // Add sequences
    try {
      const seqRes = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/sequences?api_key=${smartleadApiKey}`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequences: campaign.steps.map((s: any, idx: number) => ({
              id: null, seq_number: idx + 1,
              subject: (s.subject || "").replace(/\{\{firstName\}\}/g, "{{first_name}}").replace(/\{\{lastName\}\}/g, "{{last_name}}").replace(/\{\{CompanyName\}\}/g, "{{company}}").replace(/\{\{JobTitle\}\}/g, "{{title}}"),
              email_body: (s.bodyTemplate || "").replace(/\{\{firstName\}\}/g, "{{first_name}}").replace(/\{\{lastName\}\}/g, "{{last_name}}").replace(/\{\{CompanyName\}\}/g, "{{company}}").replace(/\{\{JobTitle\}\}/g, "{{title}}"),
              seq_delay_details: { delay_in_days: s.delayDays || 0 },
            })),
          }),
        }
      );
      if (!seqRes.ok) console.error("Sequences error:", await seqRes.text());
    } catch (e) { console.error("Sequences failed:", e); }

    // Link mailboxes
    try {
      const mbRes = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/email-accounts?api_key=${smartleadApiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email_account_ids: smartleadMailboxIds }) }
      );
      if (!mbRes.ok) console.error("Mailbox error:", await mbRes.text());
    } catch (e) { console.error("Mailbox failed:", e); }

    // Add leads in batches
    try {
      for (let i = 0; i < activeLeads.length; i += 50) {
        const batch = activeLeads.slice(i, i + 50);
        const lRes = await fetch(
          `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/leads?api_key=${smartleadApiKey}`,
          {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_list: batch.map((l: any) => ({
                email: l.email, first_name: l.firstName || l.email.split("@")[0], last_name: l.lastName || "",
              })),
            }),
          }
        );
        if (!lRes.ok) console.error("Leads error:", await lRes.text());
      }
    } catch (e) { console.error("Leads failed:", e); }

    // Set schedule
    try {
      await smartlead.setSchedule(providerCampaignId, {
        timezone: campaign.sendTimezone || "Asia/Kolkata",
        daysOfWeek: campaign.preferredSendDays?.length ? campaign.preferredSendDays : [1, 2, 3, 4, 5],
        startHour: "09:00", endHour: "17:00", minTimeBetweenEmails: 3,
        maxNewLeadsPerDay: 50 * smartleadMailboxIds.length,
      });
    } catch (e) { console.error("Schedule failed:", e); }

    // Start campaign
    try { await smartlead.startCampaign(providerCampaignId); } catch (e) { console.error("Start failed:", e); }

    // Configure webhooks — use correct Vercel domain as primary
    try {
      const webhookUrl = "https://email-system-omega.vercel.app/api/webhooks/smartlead";
      await smartlead.configureUserWebhook(webhookUrl);
      await smartlead.configureWebhook(providerCampaignId, webhookUrl);
      console.log(`[Launch] Webhooks configured for campaign ${providerCampaignId}: ${webhookUrl}`);
    } catch (e) { console.error("Webhook failed:", e); }

    // Activate in DB
    await prisma.campaign.update({ where: { id }, data: { status: "ACTIVE", templateLockedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        userId: campaign.userId, action: "campaign.launch", resourceType: "campaign", resourceId: id,
        metadata: { name: campaign.name, providerCampaignId, leadsActive: activeLeads.length, mailboxesUsed: smartleadMailboxIds.length },
      },
    });

    return NextResponse.json({
      id: campaign.id, name: campaign.name, status: "active", providerCampaignId,
      leadsActive: activeLeads.length, mailboxesUsed: smartleadMailboxIds.length,
      message: `Campaign launched (Smartlead ID: ${providerCampaignId}). ${activeLeads.length} leads queued.`,
    });
  } catch (error) {
    console.error("Campaign launch error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
