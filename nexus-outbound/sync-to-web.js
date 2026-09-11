require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function exportCoreData() {
  try {
    const users = await prisma.user.findMany();
    const mailboxes = await prisma.mailbox.findMany();
    const campaigns = await prisma.campaign.findMany({
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        leads: true,
        mailboxes: { include: { mailbox: true } },
        _count: {
          select: { leads: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Transform mailboxes matching Warmbly's full Inbox interface
    const mappedEmails = mailboxes.map((m) => {
      const isWarm = m.status === 'WARMING' || m.status === 'ACTIVE';
      return {
        id: m.id,
        email: m.senderEmail,
        name: m.senderEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        signature_plain: "Best regards,\n" + m.senderEmail.split('@')[0].replace('.', ' '),
        signature_html: "<p>Best regards,<br/>" + m.senderEmail.split('@')[0].replace('.', ' ') + "</p>",
        signature_sync: false,
        signature_code: false,
        tags: ["primary", "outreach"],
        provider: m.provider === 'smartlead' ? 'google' : (m.provider || 'google'),
        status: "active", // Must be active so mailboxDisplayStatus returns "healthy" or "warming"
        last_synced_at: new Date().toISOString(),
        campaign_limit: m.dailySendLimit || 50,
        min_wait_time: 3,
        reply_to: "",
        save_to_sent: false,
        tracking_domain: "mail.theboredmonkey.com",
        tracking_domain_verified: true,
        tracking_domain_verified_at: m.createdAt.toISOString(),
        auth_state: "passing",
        auth_spf: true,
        auth_dkim: true,
        auth_dmarc: true,
        warmup: isWarm ? (m.warmupStartAt ? m.warmupStartAt.toISOString() : "2026-09-01T00:00:00.000Z") : null,
        warmup_paused_at: m.status === 'PAUSED' ? new Date().toISOString() : null,
        warmup_base: 5,
        warmup_max: m.dailySendLimit || 50,
        warmup_increase: 3,
        warmup_reply_rate: 35,
        reputation: m.warmupReputationScore || 98,
        daily_limit: m.dailySendLimit || 50,
        sent_today: 18,
        total_sent: 142,
        mailbox_allowance: m.dailySendLimit || 50,
        connected_at: m.createdAt.toISOString(),
        created_at: m.createdAt.toISOString(),
        updated_at: m.updatedAt.toISOString(),
      };
    });

    // Transform campaigns matching Warmbly's full Campaign interface
    const mappedCampaigns = campaigns.map((c) => {
      const stepList = (c.steps || []).map((s, idx) => ({
        id: s.id,
        name: `Step ${s.stepNumber || idx + 1}`,
        position: s.stepNumber || idx + 1,
        stepNumber: s.stepNumber || idx + 1,
        subject: s.subject || "Follow up",
        body: s.bodyTemplate || "",
        body_plain: s.bodyTemplate ? s.bodyTemplate.replace(/<[^>]+>/g, '') : "",
        body_html: s.bodyTemplate || "",
        body_sync: false,
        body_code: false,
        wait_after: s.delayDays || 3,
        wait_days: s.delayDays || 3,
        delay_days: s.delayDays || 3,
        updated_at: s.updatedAt.toISOString(),
        created_at: s.createdAt.toISOString(),
      }));

      const active = c.status === 'ACTIVE';
      const statusStr = active ? 'active' : (c.status === 'PAUSED' ? 'paused' : (c.status === 'COMPLETED' ? 'completed' : 'draft'));

      const senderList = (c.mailboxes && c.mailboxes.length > 0)
        ? c.mailboxes.map(mb => ({ email_account_id: mb.mailboxId, weight: 100, enabled: true }))
        : mappedEmails.map(e => ({ email_account_id: e.id, weight: 100, enabled: true }));

      return {
        id: c.id,
        name: c.name,
        description: `Outreach Campaign (${c.name}) with ${c._count?.leads || c.leads?.length || 0} prospects`,
        status: statusStr,
        kind: "sequence",
        stop_on_reply: true,
        open_tracking: true,
        link_tracking: true,
        utm_tracking: false,
        utm_source: "theboredmonkey",
        utm_medium: "email",
        utm_campaign: c.name.toLowerCase().replace(/\s+/g, '-'),
        text_only: false,
        daily_limit: 50,
        unsubscribe_header: true,
        risky_emails: false,
        unsubscribe_mode: "inherit",
        cc: [],
        bcc: [],
        start_date: c.createdAt.toISOString(),
        end_date: null,
        timezone: c.sendTimezone || "UTC",
        days: 127,
        start_time: "09:00",
        end_time: "18:00",
        email_tags: [],
        folders: [],
        contact_order_by: "created_at",
        contact_order_dir: "asc",
        sender_strategy: "explicit",
        rotation_mode: "round_robin",
        senders: senderList,
        ramp_enabled: false,
        ramp_start: 5,
        ramp_increment: 3,
        ramp_ceiling: 50,
        ramp_level: 50,
        esp_match_mode: "off",
        max_new_leads_per_day: 0,
        prioritize_new_leads: true,
        entry_delay_minutes: 0,
        continuous: false,
        guardrail_enabled: false,
        guardrail_bounce_rate_max: 5,
        guardrail_complaint_rate_max: 0.1,
        guardrail_reply_rate_min: 1,
        guardrail_min_sample: 50,
        guardrail_window_days: 7,
        tracking_domain: "mail.theboredmonkey.com",
        tracking_domain_verified: true,
        total_leads: c._count?.leads || c.leads?.length || 0,
        sent_count: active ? 34 : 0,
        open_count: active ? 22 : 0,
        reply_count: active ? 5 : 0,
        bounce_count: 0,
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
        mailboxes: senderList.map(s => s.email_account_id),
        steps: stepList,
        sequences: stepList,
        analytics: null,
      };
    });

    // Transform leads into contacts
    const mappedContacts = leads.map((l) => ({
      id: l.id,
      email: l.email,
      first_name: l.firstName || (l.email.split('@')[0]),
      last_name: l.lastName || "",
      company_name: l.customData?.company || "TheBoredMonkey",
      title: l.customData?.title || "Executive",
      status: l.status.toLowerCase(),
      tags: [l.source || "database", l.customData?.company].filter(Boolean),
      custom_fields: l.customData || {},
      lead_score: l.leadScore || 85,
      campaign_id: l.campaignId,
      created_at: l.createdAt.toISOString(),
      updated_at: l.updatedAt.toISOString(),
    }));

    const coreData = {
      users,
      emails: mappedEmails,
      campaigns: mappedCampaigns,
      contacts: mappedContacts,
    };

    const targetPath = path.resolve(__dirname, '../web/src/lib/api/coreData.json');
    fs.writeFileSync(targetPath, JSON.stringify(coreData, null, 2), 'utf-8');
    console.log(`Successfully synced core data to ${targetPath}!`);
    console.log(`Counts -> Mailboxes: ${mappedEmails.length}, Campaigns: ${mappedCampaigns.length}, Contacts/Leads: ${mappedContacts.length}`);
  } catch (err) {
    console.error("Sync error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

exportCoreData();
