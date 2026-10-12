/**
 * Sync a Smartlead campaign into the nexus-outbound database.
 *
 * Usage:
 *   npx tsx scripts/sync-smartlead-campaign.ts <smartlead_campaign_id> [smartlead_api_key]
 *
 * Example:
 *   npx tsx scripts/sync-smartlead-campaign.ts 4111241
 */

import { PrismaClient } from "../nexus-outbound/node_modules/@prisma/client";

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

// Resolve API key: argument > env
const campaignId = process.argv[2];
const apiKey =
  process.argv[3] ||
  process.env.SMARTLEAD_API_KEY ||
  "b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4";

if (!campaignId) {
  console.error("Usage: npx tsx scripts/sync-smartlead-campaign.ts <smartlead_campaign_id> [api_key]");
  process.exit(1);
}

const prisma = new PrismaClient();

async function smartleadGet(endpoint: string) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${SMARTLEAD_BASE}${endpoint}${sep}api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Smartlead GET ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log(`\n=== Syncing Smartlead campaign ${campaignId} ===\n`);

  // Step 1: Fetch campaign details from Smartlead
  console.log("1. Fetching campaign details from Smartlead...");
  const campaign = await smartleadGet(`/campaigns/${campaignId}`);
  console.log(`   Name: ${campaign.name}`);
  console.log(`   Status: ${campaign.status}`);
  console.log(`   Created: ${campaign.created_at}`);

  // Step 2: Fetch campaign statistics
  console.log("2. Fetching campaign statistics...");
  const stats = await smartleadGet(`/campaigns/${campaignId}/statistics`);
  console.log(`   Sent: ${stats.total_sent_count ?? 0}`);
  console.log(`   Opened: ${stats.open_count ?? 0}`);
  console.log(`   Replied: ${stats.reply_count ?? 0}`);

  // Step 3: Fetch sequences
  console.log("3. Fetching sequences...");
  let sequences: any[] = [];
  try {
    const seqData = await smartleadGet(`/campaigns/${campaignId}/sequences`);
    sequences = Array.isArray(seqData) ? seqData : (seqData.sequences ?? seqData.data ?? []);
    console.log(`   Found ${sequences.length} sequence(s)`);
  } catch (e) {
    console.log(`   Could not fetch sequences: ${(e as Error).message}`);
  }

  // Step 4: Fetch leads (paginated)
  console.log("4. Fetching leads...");
  const allLeads: any[] = [];
  let offset = 0;
  const BATCH = 100;
  let hasMore = true;
  while (hasMore) {
    const leadsResp = await smartleadGet(`/campaigns/${campaignId}/leads?offset=${offset}&limit=${BATCH}`);
    const leads = Array.isArray(leadsResp) ? leadsResp : (leadsResp.data ?? []);
    allLeads.push(...leads);
    const total = parseInt(leadsResp.total_leads || "0", 10);
    hasMore = total > 0 ? (offset + leads.length < total) : leads.length === BATCH;
    offset += BATCH;
  }
  console.log(`   Found ${allLeads.length} lead(s)`);

  // Step 5: Fetch email accounts linked to campaign
  console.log("5. Fetching linked email accounts...");
  let emailAccounts: any[] = [];
  try {
    const accData = await smartleadGet(`/campaigns/${campaignId}/email-accounts`);
    emailAccounts = Array.isArray(accData) ? accData : (accData.data ?? []);
    console.log(`   Found ${emailAccounts.length} email account(s)`);
  } catch (e) {
    console.log(`   Could not fetch email accounts: ${(e as Error).message}`);
  }

  // Step 6: Find user to assign campaign to
  // Try to find the user by matching email accounts or by name
  console.log("6. Looking up user in database...");
  let userId: string | null = null;

  // Try matching linked email accounts to mailboxes in DB
  for (const acc of emailAccounts) {
    const email = acc.from_email || acc.email;
    if (!email) continue;
    const mailbox = await prisma.mailbox.findFirst({
      where: { senderEmail: { equals: email, mode: "insensitive" } },
      select: { userId: true },
    });
    if (mailbox) {
      userId = mailbox.userId;
      console.log(`   Matched mailbox ${email} -> userId ${userId}`);
      break;
    }
  }

  // Fallback: search by campaign name containing user name
  if (!userId) {
    const campaignNameLower = (campaign.name || "").toLowerCase();
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    for (const u of users) {
      const nameParts = (u.name || "").toLowerCase().split(/\s+/);
      if (nameParts.some((part: string) => part.length > 2 && campaignNameLower.includes(part))) {
        userId = u.id;
        console.log(`   Matched user by campaign name: ${u.name} (${u.email}) -> ${u.id}`);
        break;
      }
    }
  }

  // Fallback: prompt
  if (!userId) {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } });
    console.log("\n   Available users:");
    users.forEach((u, i) => console.log(`   ${i + 1}. ${u.name} (${u.email}) [${u.role}] id=${u.id}`));
    console.error("\n   ERROR: Could not auto-match user. Pass userId manually or check mailbox mapping.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Step 7: Check if campaign already exists in DB
  console.log("7. Checking if campaign exists in database...");
  let dbCampaign = await prisma.campaign.findFirst({
    where: { providerCampaignId: String(campaignId) },
  });

  if (dbCampaign) {
    console.log(`   Campaign already exists in DB: ${dbCampaign.id}`);
    console.log(`   Updating status and metadata...`);
    dbCampaign = await prisma.campaign.update({
      where: { id: dbCampaign.id },
      data: {
        status: mapStatus(campaign.status),
        providerCampaignId: String(campaignId),
      },
    });
  } else {
    console.log(`   Campaign NOT in DB. Creating...`);

    // Check for name collision
    const nameExists = await prisma.campaign.findFirst({
      where: { userId, name: campaign.name },
    });
    const finalName = nameExists ? `${campaign.name} (synced)` : campaign.name;

    dbCampaign = await prisma.campaign.create({
      data: {
        userId,
        name: finalName,
        status: mapStatus(campaign.status),
        providerCampaignId: String(campaignId),
        sendTimezone: "Asia/Kolkata",
        preferredSendDays: [1, 2, 3, 4, 5],
        templateLockedAt: campaign.status === "STARTED" || campaign.status === "ACTIVE" ? new Date() : null,
      },
    });
    console.log(`   Created campaign: ${dbCampaign.id} (${finalName})`);
  }

  // Step 8: Sync sequences as CampaignSteps
  console.log("8. Syncing sequences as campaign steps...");
  if (sequences.length > 0) {
    // Delete existing steps and recreate
    await prisma.campaignStep.deleteMany({ where: { campaignId: dbCampaign.id } });
    for (const seq of sequences) {
      const stepNumber = seq.seq_number ?? seq.sequence_number ?? 1;
      await prisma.campaignStep.create({
        data: {
          campaignId: dbCampaign.id,
          stepNumber,
          delayDays: seq.seq_delay_details?.delay_in_days ?? seq.delay_days ?? 0,
          subject: seq.subject ?? "(no subject)",
          bodyTemplate: seq.email_body ?? seq.body ?? "",
        },
      });
    }
    console.log(`   Synced ${sequences.length} step(s)`);
  }

  // Step 9: Sync leads
  console.log("9. Syncing leads...");
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of allLeads) {
    // Smartlead nests lead data: { lead: { email, first_name, ... }, status, ... }
    const leadData = entry.lead || entry;
    const email = (leadData.email || "").toLowerCase().trim();
    if (!email) { skipped++; continue; }

    const existing = await prisma.lead.findFirst({
      where: { campaignId: dbCampaign.id, email },
    });

    const leadId = leadData.id || entry.campaign_lead_map_id;
    const entryStatus = entry.status || leadData.status || "";

    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          providerLeadId: leadId ? String(leadId) : undefined,
          status: mapLeadStatus(entryStatus),
        },
      });
      updated++;
    } else {
      await prisma.lead.create({
        data: {
          campaignId: dbCampaign.id,
          email,
          firstName: leadData.first_name || email.split("@")[0],
          lastName: leadData.last_name || "",
          source: "smartlead_sync",
          providerLeadId: leadId ? String(leadId) : null,
          status: mapLeadStatus(entryStatus),
          customData: leadData.custom_fields ? {
            company: leadData.company_name || leadData.custom_fields?.company || "",
            title: leadData.custom_fields?.title || "",
          } : undefined,
        },
      });
      created++;
    }
  }
  console.log(`   Leads: ${created} created, ${updated} updated, ${skipped} skipped`);

  // Step 10: Link mailboxes
  console.log("10. Linking mailboxes...");
  let linked = 0;
  for (const acc of emailAccounts) {
    const email = acc.from_email || acc.email;
    if (!email) continue;
    const mailbox = await prisma.mailbox.findFirst({
      where: { senderEmail: { equals: email, mode: "insensitive" } },
    });
    if (!mailbox) {
      console.log(`    Mailbox not in DB: ${email} (skipping)`);
      continue;
    }
    try {
      await prisma.campaignMailbox.upsert({
        where: { campaignId_mailboxId: { campaignId: dbCampaign.id, mailboxId: mailbox.id } },
        create: { campaignId: dbCampaign.id, mailboxId: mailbox.id },
        update: {},
      });
      linked++;
    } catch (e) {
      // Ignore duplicate
    }
  }
  console.log(`   Linked ${linked} mailbox(es)`);

  // Summary
  console.log(`\n=== SYNC COMPLETE ===`);
  console.log(`Campaign: ${dbCampaign.name}`);
  console.log(`DB ID: ${dbCampaign.id}`);
  console.log(`Smartlead ID: ${campaignId}`);
  console.log(`User: ${userId}`);
  console.log(`Status: ${dbCampaign.status}`);
  console.log(`Steps: ${sequences.length}`);
  console.log(`Leads: ${allLeads.length} (${created} new, ${updated} updated)`);
  console.log(`Mailboxes: ${linked}`);
  console.log();

  await prisma.$disconnect();
}

function mapStatus(smartleadStatus: string): "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" {
  switch ((smartleadStatus || "").toUpperCase()) {
    case "STARTED":
    case "START":
    case "ACTIVE":
      return "ACTIVE";
    case "PAUSED":
    case "PAUSE":
      return "PAUSED";
    case "STOPPED":
    case "COMPLETED":
    case "DONE":
      return "COMPLETED";
    default:
      return "DRAFT";
  }
}

function mapLeadStatus(status: string): "ACTIVE" | "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" {
  switch ((status || "").toLowerCase()) {
    case "replied":
      return "REPLIED";
    case "bounced":
    case "hard_bounced":
      return "BOUNCED";
    case "unsubscribed":
      return "UNSUBSCRIBED";
    default:
      return "ACTIVE";
  }
}

main().catch((err) => {
  console.error("SYNC ERROR:", err);
  prisma.$disconnect();
  process.exit(1);
});
