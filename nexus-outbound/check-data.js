const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const users = await prisma.user.findMany();
    const mailboxes = await prisma.mailbox.findMany();
    const campaigns = await prisma.campaign.findMany({ include: { steps: true } });
    const leads = await prisma.lead.findMany({ take: 20 });
    const leadCount = await prisma.lead.count();

    console.log("=== USERS ===");
    console.log(JSON.stringify(users, null, 2));

    console.log("=== MAILBOXES ===");
    console.log(JSON.stringify(mailboxes, null, 2));

    console.log("=== CAMPAIGNS ===");
    console.log(JSON.stringify(campaigns, null, 2));

    console.log("=== LEADS COUNT ===", leadCount);
    console.log("=== SAMPLE LEADS ===");
    console.log(JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error("Query error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
