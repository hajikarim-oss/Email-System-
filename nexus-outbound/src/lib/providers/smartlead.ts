import type { EmailProvider } from "./email-provider";
import type { EmailProviderCampaignInput, EmailProviderCampaignResult } from "@/types";

export class SmartleadProvider implements EmailProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SMARTLEAD_API_KEY || "";
    this.baseUrl = process.env.SMARTLEAD_API_URL || "https://server.smartlead.ai/api/v1";
  }

  private getUrl(endpoint: string): string {
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${this.baseUrl}${endpoint}${separator}api_key=${this.apiKey}`;
  }

  // Translate Nexus camelCase variables to Smartlead snake_case format
  // Smartlead uses: {{first_name}}, {{last_name}}, {{company}}, {{title}}
  // Nexus uses: {{firstName}}, {{lastName}}, {{company}}, {{title}}
  private static translateVariables(text: string): string {
    return text
      .replace(/\{\{firstName\}\}/g, "{{first_name}}")
      .replace(/\{\{lastName\}\}/g, "{{last_name}}")
      .replace(/\{\{CompanyName\}\}/g, "{{company}}")
      .replace(/\{\{JobTitle\}\}/g, "{{title}}");
  }

  async createCampaign(input: EmailProviderCampaignInput): Promise<EmailProviderCampaignResult> {
    // Step 1: Create campaign with name only
    const createResponse = await fetch(this.getUrl("/campaigns/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Smartlead create campaign error: ${error}`);
    }

    const createData = await createResponse.json();
    const providerCampaignId = createData.id;

    // Step 2: Add sequences (if provided)
    if (input.sequences && input.sequences.length > 0) {
      const seqResponse = await fetch(this.getUrl(`/campaigns/${providerCampaignId}/sequences`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequences: input.sequences.map((s, idx) => ({
            id: null,
            seq_number: idx + 1,
            subject: SmartleadProvider.translateVariables(s.subject),
            email_body: SmartleadProvider.translateVariables(s.body),
            seq_delay_details: { delay_in_days: s.delayDays || 0 },
          })),
        }),
      });

      if (!seqResponse.ok) {
        const error = await seqResponse.text();
        throw new Error(`Smartlead sequences error: ${error}`);
      }
    }

    // Step 3: Link email accounts (required - campaign won't send without them)
    if (!input.mailboxIds || input.mailboxIds.length === 0) {
      throw new Error("No mailbox IDs provided. Campaign cannot send without at least one email account.");
    }

    const numericIds = input.mailboxIds
      .map((id) => parseInt(String(id), 10))
      .filter((id) => !isNaN(id));

    if (numericIds.length === 0) {
      throw new Error("All mailbox IDs are invalid. Expected numeric Smartlead email account IDs.");
    }

    const mailboxResponse = await fetch(this.getUrl(`/campaigns/${providerCampaignId}/email-accounts`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_account_ids: numericIds,
      }),
    });

    if (!mailboxResponse.ok) {
      const error = await mailboxResponse.text();
      throw new Error(`Smartlead mailbox linking error: ${error}`);
    }

    // Step 4: Add leads (if provided)
    const leadProviderIds: Record<string, string> = {};
    if (input.leads && input.leads.length > 0) {
      const leadsResponse = await fetch(this.getUrl(`/campaigns/${providerCampaignId}/leads`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_list: input.leads.map((l) => ({
            email: l.email,
            first_name: l.firstName || "",
            last_name: l.lastName || "",
          })),
        }),
      });

      if (!leadsResponse.ok) {
        const error = await leadsResponse.text();
        throw new Error(`Smartlead leads error: ${error}`);
      }

      // Smartlead doesn't return lead IDs in bulk add, so we track by email
      input.leads.forEach((l) => {
        leadProviderIds[l.email] = l.email;
      });
    }

    return {
      providerCampaignId: String(providerCampaignId),
      leadProviderIds,
    };
  }

  async addLeadsToCampaign(
    providerCampaignId: string,
    leads: Array<{ email: string; firstName?: string; lastName?: string; unsubscribeLink?: string }>
  ): Promise<void> {
    const response = await fetch(this.getUrl(`/campaigns/${providerCampaignId}/leads`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_list: leads.map((l) => ({
          email: l.email,
          first_name: l.firstName || "",
          last_name: l.lastName || "",
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead API error: ${error}`);
    }
  }

  async stopLeadSequence(providerLeadId: string): Promise<void> {
    const response = await fetch(this.getUrl(`/campaigns/leads/${providerLeadId}/stop`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead API error: ${error}`);
    }
  }

  async sendReply(
    mailboxId: string,
    toEmail: string,
    subject: string,
    body: string
  ): Promise<void> {
    const response = await fetch(this.getUrl(`/email-accounts/${mailboxId}/send-reply`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_email: toEmail,
        subject,
        email_body: body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead API error: ${error}`);
    }
  }

  async sendSingleEmail(
    toEmail: string,
    subject: string,
    body: string,
    fromEmail?: string,
    fromName?: string
  ): Promise<{ success: boolean; trackId?: string; error?: string }> {
    try {
      const payload: Record<string, unknown> = {
        to: toEmail,
        subject,
        body,
      };

      if (fromEmail) {
        payload.fromEmail = fromEmail;
      }

      if (fromName) {
        payload.fromName = fromName;
      }

      const response = await fetch(this.getUrl("/send-email/initiate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || "Failed to send email" };
      }

      return {
        success: true,
        trackId: data.data?.trackId,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async connectMailbox(authCode: string): Promise<{ providerMailboxId: string; email: string }> {
    const response = await fetch(this.getUrl("/email-accounts/oauth/callback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: authCode }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead API error: ${error}`);
    }

    const data = await response.json();
    return {
      providerMailboxId: data.id,
      email: data.email,
    };
  }

  // Pull real campaign statistics directly from Smartlead
  // Endpoint: GET /campaigns/{id}/statistics
  // Returns: sent, opened, replied, bounced, positive reply counts
  async getCampaignStatistics(providerCampaignId: string): Promise<{
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    totalBounced: number;
    totalPositiveReply: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
    positiveReplyRate: number;
  }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/statistics`)
    );

    if (!response.ok) {
      // Return zeros instead of throwing — campaign may not have started yet
      return {
        totalSent: 0, totalOpened: 0, totalReplied: 0,
        totalBounced: 0, totalPositiveReply: 0,
        openRate: 0, replyRate: 0, bounceRate: 0, positiveReplyRate: 0,
      };
    }

    const data = await response.json();

    // Smartlead returns various field names depending on endpoint
    // Try all known variations to maximize compatibility
    const sent = data.total_sent_count ?? data.sent_count ?? data.total_sent ?? data.sent ?? 0;
    const opened = data.open_count ?? data.opened_count ?? data.total_opened ?? data.opened ?? 0;
    const replied = data.reply_count ?? data.replied_count ?? data.total_replied ?? data.replied ?? 0;
    const bounced = data.bounce_count ?? data.bounced_count ?? data.total_bounced ?? data.bounced ?? 0;
    const positive = data.positive_reply_count ?? data.positive_reply ?? 0;

    return {
      totalSent: sent,
      totalOpened: opened,
      totalReplied: replied,
      totalBounced: bounced,
      totalPositiveReply: positive,
      openRate: sent > 0 ? parseFloat(((opened / sent) * 100).toFixed(2)) : 0,
      replyRate: sent > 0 ? parseFloat(((replied / sent) * 100).toFixed(2)) : 0,
      bounceRate: sent > 0 ? parseFloat(((bounced / sent) * 100).toFixed(2)) : 0,
      positiveReplyRate: replied > 0 ? parseFloat(((positive / replied) * 100).toFixed(2)) : 0,
    };
  }

  // Pull stats for ALL campaigns at once
  async getAllCampaignsStats(): Promise<Array<{
    providerCampaignId: string;
    name: string;
    status: string;
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    totalBounced: number;
    totalPositiveReply: number;
  }>> {
    const response = await fetch(this.getUrl("/campaigns?limit=100&offset=0"));
    if (!response.ok) return [];

    const campaigns = await response.json();
    const list = Array.isArray(campaigns) ? campaigns : (campaigns.data ?? []);

    return list.map((c: any) => ({
      providerCampaignId: String(c.id),
      name: c.name ?? "",
      status: c.status ?? "UNKNOWN",
      totalSent: c.total_sent_count ?? 0,
      totalOpened: c.open_count ?? 0,
      totalReplied: c.reply_count ?? 0,
      totalBounced: c.bounce_count ?? 0,
      totalPositiveReply: c.positive_reply_count ?? 0,
    }));
  }

  // Configure webhook URL for a specific campaign
  // Smartlead sends events: opened, replied, bounced, complained, unsubscribed
  async configureWebhook(
    providerCampaignId: string,
    webhookUrl: string
  ): Promise<{ success: boolean; message?: string }> {
    // Use per-campaign webhook: POST /v1/campaigns/{id}/webhooks
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/webhooks`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: null,
          name: "Nexus Outbound Webhook",
          webhook_url: webhookUrl,
          event_types: [
            "EMAIL_SENT",
            "EMAIL_OPENED",
            "EMAIL_CLICKED",
            "EMAIL_REPLIED",
            "EMAIL_BOUNCED",
            "LEAD_UNSUBSCRIBED",
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: error };
    }

    return { success: true };
  }

  // Configure a user-level webhook (covers ALL campaigns)
  async configureUserWebhook(
    webhookUrl: string
  ): Promise<{ success: boolean; webhookId?: number }> {
    const response = await fetch(
      this.getUrl("/webhook/create"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nexus Outbound - All Campaigns",
          webhook_url: webhookUrl,
          association_type: 1, // 1=user, 2=client, 3=campaign
          event_type_map: {
            EMAIL_SENT: true,
            EMAIL_OPENED: true,
            EMAIL_CLICKED: true,
            EMAIL_REPLIED: true,
            EMAIL_BOUNCED: true,
            LEAD_UNSUBSCRIBED: true,
            LEAD_CATEGORY_UPDATED: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead webhook error: ${error}`);
    }

    const data = await response.json();
    return { success: true, webhookId: data.webhook_id };
  }

  // Set sending schedule for a campaign (required before starting)
  // Smartlead rotates across linked mailboxes — with 2 mailboxes and 1min interval,
  // effective speed is ~1 email every 30-40 seconds
  async setSchedule(
    providerCampaignId: string,
    schedule: {
      timezone?: string;
      daysOfWeek?: number[]; // 1=Mon through 7=Sun
      startHour?: string;    // "09:00"
      endHour?: string;      // "17:00"
      minTimeBetweenEmails?: number; // minutes (Smartlead min: 1)
      maxNewLeadsPerDay?: number;
    }
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/schedule`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: schedule.timezone ?? "UTC",
          days_of_the_week: schedule.daysOfWeek ?? [1, 2, 3, 4, 5],
          start_hour: schedule.startHour ?? "09:00",
          end_hour: schedule.endHour ?? "17:00",
          min_time_btw_emails: schedule.minTimeBetweenEmails ?? 3,
          max_new_leads_per_day: schedule.maxNewLeadsPerDay ?? 50,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead schedule error: ${error}`);
    }

    return { success: true };
  }

  // Start/activate a campaign (call after setting schedule)
  async startCampaign(
    providerCampaignId: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/status`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "START" }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead start error: ${error}`);
    }

    return { success: true };
  }

  // Pause a campaign
  async pauseCampaign(
    providerCampaignId: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/status`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead pause error: ${error}`);
    }

    return { success: true };
  }

  // Stop a campaign completely
  async stopCampaign(
    providerCampaignId: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/status`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "STOPPED" }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead stop error: ${error}`);
    }

    return { success: true };
  }

  // Stop a single lead in a campaign (pause by numeric lead_id)
  async stopLeadInCampaign(
    providerCampaignId: string,
    smartleadLeadId: number
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/leads/${smartleadLeadId}/pause`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead stop lead error: ${error}`);
    }

    return { success: true };
  }

  // Resume a single lead in a campaign (resume by numeric lead_id)
  async resumeLeadInCampaign(
    providerCampaignId: string,
    smartleadLeadId: number
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      this.getUrl(`/campaigns/${providerCampaignId}/leads/${smartleadLeadId}/resume`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Smartlead resume lead error: ${error}`);
    }

    return { success: true };
  }

  // Get campaign leads with their status from Smartlead
  async getCampaignLeads(
    providerCampaignId: string
  ): Promise<Array<{
    id: number;
    email: string;
    first_name: string;
    status: string;
    steps_sent: number[];
    last_activity: string;
  }>> {
    const allLeads: Array<{
      id: number;
      email: string;
      first_name: string;
      status: string;
      steps_sent: number[];
      last_activity: string;
    }> = [];
    let page = 1;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        this.getUrl(`/campaigns/${providerCampaignId}/leads?page=${page}&limit=${limit}`)
      );

      if (!response.ok) break;

      const data = await response.json();
      const leads = Array.isArray(data) ? data : (data.data ?? []);
      
      for (const l of leads) {
        allLeads.push({
          id: l.id,
          email: l.email ?? "",
          first_name: l.first_name ?? "",
          status: l.status ?? "active",
          steps_sent: l.steps_sent ?? [],
          last_activity: l.last_activity ?? "",
        });
      }

      // If we got fewer than limit, we've reached the end
      hasMore = leads.length === limit;
      page++;
    }

    return allLeads;
  }

  // Get full campaign details from Smartlead (status, stats, schedule)
  async getCampaignDetails(
    providerCampaignId: string
  ): Promise<{
    id: number;
    name: string;
    status: string;
    total_sent: number;
    total_opened: number;
    total_replied: number;
    total_bounced: number;
    total_positive_reply: number;
    schedule: any;
    created_at: string;
  } | null> {
    try {
      const response = await fetch(
        this.getUrl(`/campaigns/${providerCampaignId}`)
      );
      if (!response.ok) return null;
      const data = await response.json();
      return {
        id: data.id,
        name: data.name ?? "",
        status: data.status ?? "UNKNOWN",
        total_sent: data.total_sent_count ?? 0,
        total_opened: data.open_count ?? 0,
        total_replied: data.reply_count ?? 0,
        total_bounced: data.bounce_count ?? 0,
        total_positive_reply: data.positive_reply_count ?? 0,
        schedule: data.schedule ?? null,
        created_at: data.created_at ?? "",
      };
    } catch {
      return null;
    }
  }
}
