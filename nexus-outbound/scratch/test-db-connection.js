const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to Supabase PostgreSQL...");
  const users = await prisma.user.count();
  const mailboxes = await prisma.mailbox.count();
  const campaigns = await prisma.campaign.count();
  const leads = await prisma.lead.count();
  console.log("Connected successfully! Records:", { users, mailboxes, campaigns, leads });
  
  const leadsWithCamp = await prisma.lead.count({ where: { campaignId: { not: null } } });
  console.log("Leads assigned to any campaign in Supabase:", leadsWithCamp);
  
  const leadSample = await prisma.lead.findFirst({ select: { id: true, email: true, firstName: true, lastName: true, company: true } });
  console.log("Sample lead in Supabase:", leadSample);
}

main()
  .catch((err) => console.error("Database connection failed:", err.message))
  .finally(() => prisma.$disconnect());
