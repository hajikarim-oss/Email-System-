import { inngest } from "./inngest";
import prisma from "@/lib/db/prisma";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export const launchCampaignJob = inngest.createFunction(
  {
    id: "launch-campaign",
    retries: 2,
    triggers: [{ event: "campaign/launch.requested" }],
  },
  async ({ event, step }) => {
    const { campaignId } = event.data as { campaignId: string };

    // Step 1: Load campaign data
    const campaign = await step.run("load-campaign", async () => {
      return await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
          leads: { where: { status: "ACTIVE" } },
          mailboxes: { include: { mailbox: true } },
          user: { select: { smartleadApiKey: true, email: true } },
        },
      });
    });

    if (!campaign) return { status: "error", message: "Campaign not found" };
    if (campaign.steps.length === 0) return { status: "error", message: "No email steps" };
    if (campaign.leads.length === 0) return { status: "error", message: "No active leads" };
    if (campaign.mailboxes.length === 0) return { status: "error", message: "No mailboxes assigned" };

    const smartleadApiKey = campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
    if (!smartleadApiKey) return { status: "error", message: "No Smartlead API key" };

    const smartleadMailboxIds = campaign.mailboxes
      .map((cm: any) => cm.mailbox?.providerMailboxId)
      .filter((id: any): id is string => !!id)
      .map((id: string) => parseInt(id, 10))
      .filter((id: number) => !isNaN(id));

    if (smartleadMailboxIds.length === 0) return { status: "error", message: "No linked mailboxes" };

    const leadEmails = campaign.leads.map((l: any) => l.email);
    const suppressed = await prisma.suppressedEmail.findMany({
      where: { email: { in: leadEmails } },
    });
    const suppressedEmails = new Set(suppressed.map((s: any) => s.email));
    const activeLeads = campaign.leads.filter((l: any) => !suppressedEmails.has(l.email));

    if (activeLeads.length === 0) return { status: "error", message: "All leads suppressed" };

    const smartlead = new SmartleadProvider(smartleadApiKey);

    // If already launched, re-start
    if (campaign.providerCampaignId) {
      await step.run("re-launch", async () => {
        try {
          await smartlead.setSchedule(campaign.providerCampaignId!, {
            timezone: campaign.sendTimezone || "Asia/Kolkata",
            daysOfWeek: campaign.preferredSendDays?.length ? campaign.preferredSendDays : [1, 2, 3, 4, 5],
            startHour: "09:00",
            endHour: "17:00",
            minTimeBetweenEmails: 3,
            maxNewLeadsPerDay: 50 * smartleadMailboxIds.length,
          });
          await smartlead.startCampaign(campaign.providerCampaignId!);

          const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
          if (baseUrl) {
            const webhookUrl = `${baseUrl}/api/webhooks/smartlead`;
            await smartlead.configureUserWebhook(webhookUrl);
            await smartlead.configureWebhook(campaign.providerCampaignId!, webhookUrl);
          }
        } catch (e) {
          console.error("Re-launch error:", e);
        }
      });

      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
      return { status: "re-launched", campaignId };
    }

    // Step 2: Create campaign on Smartlead
    let providerCampaignId: string;
    const created = await step.run("create-campaign", async () => {
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/create?api_key=${smartleadApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: campaign.name }),
        }
      );
      if (!res.ok) throw new Error(`Smartlead create error: ${await res.text()}`);
      const data = await res.json();
      return String(data.id);
    });
    providerCampaignId = created;

    await step.run("save-provider-id", async () => {
      await prisma.campaign.update({ where: { id: campaignId }, data: { providerCampaignId } });
    });

    // Step 3: Add sequences
    await step.run("add-sequences", async () => {
      if (campaign.steps.length === 0) return;
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/sequences?api_key=${smartleadApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequences: campaign.steps.map((s: any, idx: number) => ({
              id: null,
              seq_number: idx + 1,
              subject: (s.subject || "")
                .replace(/\{\{firstName\}\}/g, "{{first_name}}")
                .replace(/\{\{lastName\}\}/g, "{{last_name}}")
                .replace(/\{\{CompanyName\}\}/g, "{{company}}")
                .replace(/\{\{JobTitle\}\}/g, "{{title}}"),
              email_body: (s.bodyTemplate || "")
                .replace(/\{\{firstName\}\}/g, "{{first_name}}")
                .replace(/\{\{lastName\}\}/g, "{{last_name}}")
                .replace(/\{\{CompanyName\}\}/g, "{{company}}")
                .replace(/\{\{JobTitle\}\}/g, "{{title}}"),
              seq_delay_details: { delay_in_days: s.delayDays || 0 },
            })),
          }),
        }
      );
      if (!res.ok) console.error("Sequences error:", await res.text());
    });

    // Step 4: Link mailboxes
    await step.run("link-mailboxes", async () => {
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/email-accounts?api_key=${smartleadApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_account_ids: smartleadMailboxIds }),
        }
      );
      if (!res.ok) console.error("Mailbox linking error:", await res.text());
    });

    // Step 5: Add leads in batches of 50
    await step.run("add-leads", async () => {
      const BATCH_SIZE = 50;
      for (let i = 0; i < activeLeads.length; i += BATCH_SIZE) {
        const batch = activeLeads.slice(i, i + BATCH_SIZE);
        const res = await fetch(
          `https://server.smartlead.ai/api/v1/campaigns/${providerCampaignId}/leads?api_key=${smartleadApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_list: batch.map((l: any) => ({
                email: l.email,
                first_name: l.firstName || l.email.split("@")[0],
                last_name: l.lastName || "",
              })),
            }),
          }
        );
        if (!res.ok) console.error(`Leads batch error:`, await res.text());
      }
    });

    // Step 6: Set schedule
    await step.run("set-schedule", async () => {
      await smartlead.setSchedule(providerCampaignId, {
        timezone: campaign.sendTimezone || "Asia/Kolkata",
        daysOfWeek: campaign.preferredSendDays?.length ? campaign.preferredSendDays : [1, 2, 3, 4, 5],
        startHour: "09:00",
        endHour: "17:00",
        minTimeBetweenEmails: 3,
        maxNewLeadsPerDay: 50 * smartleadMailboxIds.length,
      });
    });

    // Step 7: Start campaign
    await step.run("start-campaign", async () => {
      await smartlead.startCampaign(providerCampaignId);
    });

    // Step 8: Configure webhooks
    await step.run("configure-webhooks", async () => {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
      if (baseUrl) {
        const webhookUrl = `${baseUrl}/api/webhooks/smartlead`;
        await smartlead.configureUserWebhook(webhookUrl);
        await smartlead.configureWebhook(providerCampaignId, webhookUrl);
      }
    });

    // Activate in DB
    await step.run("activate-campaign", async () => {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "ACTIVE", templateLockedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          userId: campaign.userId,
          action: "campaign.launch",
          resourceType: "campaign",
          resourceId: campaignId,
          metadata: {
            name: campaign.name,
            providerCampaignId,
            leadsActive: activeLeads.length,
            stepsCount: campaign.steps.length,
            mailboxesUsed: smartleadMailboxIds.length,
          },
        },
      });
    });

    return {
      status: "launched",
      campaignId,
      providerCampaignId,
      leadsActive: activeLeads.length,
      mailboxesUsed: smartleadMailboxIds.length,
    };
  }
);
