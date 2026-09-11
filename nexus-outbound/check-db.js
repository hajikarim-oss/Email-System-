require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } });
  console.log("Users:", users);

  const mailboxes = await prisma.mailbox.findMany();
  console.log("Mailboxes count:", mailboxes.length);
  mailboxes.forEach(m => console.log(`- Mailbox: ${m.senderEmail} | status: ${m.status} | provider: ${m.provider} | id: ${m.id} | providerId: ${m.providerMailboxId}`));

  const campaigns = await prisma.campaign.findMany({
    include: {
      steps: true,
      mailboxes: { include: { mailbox: true } },
      _count: { select: { leads: true } }
    }
  });
  console.log("Campaigns count:", campaigns.length);
  campaigns.forEach(c => {
    console.log(`- Campaign: ${c.name} | status: ${c.status} | leads: ${c._count.leads} | steps: ${c.steps.length} | mailboxes: ${c.mailboxes.map(m => m.mailbox.senderEmail).join(', ')}`);
  });

  const leadsCount = await prisma.lead.count();
  console.log("Total leads count:", leadsCount);

  const sampleLeads = await prisma.lead.findMany({ take: 5 });
  console.log("Sample leads:", sampleLeads.map(l => ({ email: l.email, firstName: l.firstName, lastName: l.lastName, campaignId: l.campaignId, status: l.status })));

  const eventsCount = await prisma.emailEvent.count();
  console.log("Email events count:", eventsCount);

  const draftsCount = await prisma.aiDraft.count();
  console.log("AiDrafts count:", draftsCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
