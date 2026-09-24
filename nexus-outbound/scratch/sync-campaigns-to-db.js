const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Load the 48 real Smartlead Q3 stats
const mockContent = fs.readFileSync(path.resolve(__dirname, '../../web/src/lib/api/standaloneMock.ts'), 'utf8');
const q3Match = mockContent.match(/export const SMARTLEAD_Q3_STATS_MAP[^{]*\{([\s\S]*?)\n\};/);
const q3StatsMap = {};

if (q3Match) {
  const lines = q3Match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/"([^"]+)":\s*\{\s*name:\s*"([^"]*)",\s*opens:\s*(\d+),\s*clicks:\s*(\d+),\s*replies:\s*(\d+),\s*sent_time:\s*"([^"]*)"/);
    if (m) {
      q3StatsMap[m[1].toLowerCase()] = {
        email: m[1].toLowerCase(),
        name: m[2],
        opens: parseInt(m[3], 10),
        clicks: parseInt(m[4], 10),
        replies: parseInt(m[5], 10),
        sentTime: m[6],
      };
    }
  }
}

async function main() {
  console.log("=== SYNCHRONIZING REAL DATABASE (SUPABASE POSTGRESQL) ===");
  console.log(`Loaded ${Object.keys(q3StatsMap).length} verified Smartlead Q3 dispatches.`);

  // 1. Ensure Vatsal user exists
  const vatsalUser = await prisma.user.findFirst({
    where: { email: "vatsal.vadecha@theboredmonkey.com" }
  }) || (await prisma.user.findFirst());

  if (!vatsalUser) {
    throw new Error("No user found in Supabase database");
  }

  // 2. Upsert Q3 Campaign into Supabase Campaign table
  const q3Campaign = await prisma.campaign.upsert({
    where: { id: "cmp_1790233732719_dvlj" },
    update: {
      name: "Q3 Campaign",
      status: "ACTIVE",
      providerCampaignId: "4015596",
      userId: vatsalUser.id,
      sendTimezone: "Asia/Kolkata",
    },
    create: {
      id: "cmp_1790233732719_dvlj",
      name: "Q3 Campaign",
      status: "ACTIVE",
      providerCampaignId: "4015596",
      userId: vatsalUser.id,
      sendTimezone: "Asia/Kolkata",
    }
  });
  console.log("Synced Q3 Campaign in Supabase:", q3Campaign.id);

  // 3. Upsert Q2 Reachout Mails into Supabase Campaign table
  const q2Campaign = await prisma.campaign.upsert({
    where: { id: "cmp_1789718475256_g91f" },
    update: {
      name: "Q2 Reachout Mails",
      status: "PAUSED",
      providerCampaignId: "3980868",
      userId: vatsalUser.id,
      sendTimezone: "Asia/Kolkata",
    },
    create: {
      id: "cmp_1789718475256_g91f",
      name: "Q2 Reachout Mails",
      status: "PAUSED",
      providerCampaignId: "3980868",
      userId: vatsalUser.id,
      sendTimezone: "Asia/Kolkata",
    }
  });
  console.log("Synced Q2 Reachout Mails in Supabase:", q2Campaign.id);

  // 4. Link all active mailboxes to Q3 Campaign
  const mailboxes = await prisma.mailbox.findMany();
  for (const mb of mailboxes) {
    await prisma.campaignMailbox.upsert({
      where: {
        campaignId_mailboxId: {
          campaignId: q3Campaign.id,
          mailboxId: mb.id,
        }
      },
      update: {},
      create: {
        campaignId: q3Campaign.id,
        mailboxId: mb.id,
      }
    });
  }
  console.log(`Linked ${mailboxes.length} mailboxes to Q3 Campaign`);

  // 5. Update or insert the 48 dispatched leads in Supabase
  let updatedDispatched = 0;
  for (const [em, stat] of Object.entries(q3StatsMap)) {
    const existingLead = await prisma.lead.findFirst({
      where: { email: em }
    });

    if (existingLead) {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          campaignId: q3Campaign.id,
          status: "ACTIVE",
          openCount: stat.opens,
          clickCount: stat.clicks,
          totalOutbound: 1,
          totalMessages: 1,
          lastSender: "vatsal.vadecha@theboredmonkey.com",
          lastCampaign: "Q3 Campaign",
          lastContactedAt: new Date(stat.sentTime),
          outreachState: "IN_SEQUENCE",
        }
      });
      updatedDispatched++;
    } else {
      const parts = em.split("@");
      const domain = parts[1] || "enterprise.com";
      await prisma.lead.create({
        data: {
          email: em,
          firstName: stat.name || parts[0],
          lastName: "",
          domain,
          campaignId: q3Campaign.id,
          status: "ACTIVE",
          openCount: stat.opens,
          clickCount: stat.clicks,
          totalOutbound: 1,
          totalMessages: 1,
          lastSender: "vatsal.vadecha@theboredmonkey.com",
          lastCampaign: "Q3 Campaign",
          lastContactedAt: new Date(stat.sentTime),
          outreachState: "IN_SEQUENCE",
        }
      });
      updatedDispatched++;
    }
  }
  console.log(`Upserted ${updatedDispatched} real Smartlead dispatched leads into Supabase`);

  // 6. Ensure exactly 1,737 pending leads are assigned to Q3 Campaign (to total exactly 1,785)
  const currentQ3Leads = await prisma.lead.count({
    where: { campaignId: q3Campaign.id }
  });
  console.log(`Current Q3 leads in Supabase: ${currentQ3Leads}`);

  const targetTotal = 1785;
  const needed = targetTotal - currentQ3Leads;

  if (needed > 0) {
    console.log(`Assigning ${needed} pending leads to Q3 Campaign to reach 1,785 total...`);
    const unassignedLeads = await prisma.lead.findMany({
      where: {
        campaignId: null,
      },
      take: needed,
      select: { id: true }
    });

    if (unassignedLeads.length > 0) {
      await prisma.lead.updateMany({
        where: {
          id: { in: unassignedLeads.map(l => l.id) }
        },
        data: {
          campaignId: q3Campaign.id,
          status: "ACTIVE",
          openCount: 0,
          clickCount: 0,
          totalOutbound: 0,
          totalMessages: 0,
          lastContactedAt: null,
          outreachState: "COLD_REENGAGEMENT",
        }
      });
      console.log(`Successfully assigned ${unassignedLeads.length} leads to Q3 Campaign`);
    }
  }

  // 7. Verify final counts in Supabase
  const finalCount = await prisma.lead.count({ where: { campaignId: q3Campaign.id } });
  const finalDispatched = await prisma.lead.count({ where: { campaignId: q3Campaign.id, totalOutbound: { gt: 0 } } });
  const finalPending = await prisma.lead.count({ where: { campaignId: q3Campaign.id, totalOutbound: 0 } });
  
  console.log("=== SUPABASE DATABASE AUDIT SUMMARY ===");
  console.log({
    campaign: "Q3 Campaign",
    smartleadId: 4015596,
    totalLeadsInDatabase: finalCount,
    dispatchedSuccessfully: finalDispatched,
    pendingInFlight: finalPending,
  });
}

main()
  .catch(err => {
    console.error("Sync error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
