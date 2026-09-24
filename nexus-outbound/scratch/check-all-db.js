const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Checking DB records...");
  const campaigns = await prisma.campaign.findMany({
    include: {
      _count: {
        select: { leads: true }
      }
    }
  });
  console.log("Campaigns in DB:", campaigns.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    providerCampaignId: c.providerCampaignId,
    leadsCount: c._count.leads
  })));

  const mailboxes = await prisma.mailbox.findMany();
  console.log("Mailboxes in DB:", mailboxes.map(m => ({
    id: m.id,
    senderEmail: m.senderEmail,
    providerMailboxId: m.providerMailboxId,
    status: m.status,
    dailySendLimit: m.dailySendLimit
  })));

  // Check leads for Q3 Campaign specifically
  const q3Leads = await prisma.lead.findMany({
    where: { campaignId: "cmp_1790233732719_dvlj" },
    select: {
      id: true,
      email: true,
      status: true,
      totalOutbound: true,
      lastContactedAt: true,
      lastSender: true,
      openCount: true,
      clickCount: true
    }
  });

  const sent = q3Leads.filter(l => (l.totalOutbound && l.totalOutbound > 0) || l.lastContactedAt !== null);
  const opened = q3Leads.filter(l => (l.openCount && l.openCount > 0));
  const clicked = q3Leads.filter(l => (l.clickCount && l.clickCount > 0));

  console.log(`Q3 Campaign Total in DB: ${q3Leads.length}, Sent: ${sent.length}, Opened: ${opened.length}, Clicked: ${clicked.length}`);
  
  // Check senders among sent
  const senders = {};
  sent.forEach(s => {
    senders[s.lastSender || "unknown"] = (senders[s.lastSender || "unknown"] || 0) + 1;
  });
  console.log("Senders for sent leads:", senders);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  prisma.$disconnect();
});
