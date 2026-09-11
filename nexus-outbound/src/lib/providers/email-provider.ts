import type { EmailProviderCampaignInput, EmailProviderCampaignResult } from "@/types";

export interface EmailProvider {
  createCampaign(input: EmailProviderCampaignInput): Promise<EmailProviderCampaignResult>;
  addLeadsToCampaign(providerCampaignId: string, leads: Array<{ email: string; firstName?: string; lastName?: string; unsubscribeLink?: string }>): Promise<void>;
  stopLeadSequence(providerLeadId: string): Promise<void>;
  sendReply(mailboxId: string, toEmail: string, subject: string, body: string): Promise<void>;
  connectMailbox(authCode: string): Promise<{ providerMailboxId: string; email: string }>;
}
