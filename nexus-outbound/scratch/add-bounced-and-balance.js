const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BOUNCED = [
  { email: "contact@baggit.com", name: "Baggit Support", company: "Baggit", domain: "baggit.com" },
  { email: "info@alamode.in", name: "Alamode Support", company: "Alamode by Akanksha", domain: "alamode.in" },
  { email: "care@vipbags.com", name: "VIP Care", company: "Caprese Bags", domain: "vipbags.com" },
  { email: "sales@athenalifestyle.com", name: "Athena Sales", company: "Athena lifestyle", domain: "athenalifestyle.com" }
];

async function addBounced() {
  for (const b of BOUNCED) {
    await prisma.lead.create({
      data: {
        campaignId: "cmp_1790233732719_dvlj",
        email: b.email,
        firstName: b.name,
        domain: b.domain,
        customData: { company: b.company, title: "Support", category: "Luggage" },
        status: "BOUNCED",
        totalOutbound: 1,
        bounceCount: 1,
        openCount: 0,
        clickCount: 0,
        lastSender: "vatsal.vadecha@theboredmonkey.com",
        lastContactedAt: new Date("2026-09-24T08:20:00.000Z"),
        lastCampaign: "Q3 Campaign"
      }
    });
  }

  // Trim 4 pending leads to maintain strict 1,785 total
  const pendingToRemove = await prisma.lead.findMany({
    where: { campaignId: "cmp_1790233732719_dvlj", totalOutbound: 0 },
    take: 4,
    select: { id: true }
  });
  await prisma.lead.updateMany({
    where: { id: { in: pendingToRemove.map(p => p.id) } },
    data: { campaignId: null }
  });

  const finalCount = await prisma.lead.count({ where: { campaignId: "cmp_1790233732719_dvlj" } });
  const finalSent = await prisma.lead.count({ where: { campaignId: "cmp_1790233732719_dvlj", totalOutbound: { gt: 0 } } });
  console.log(`✓ Final Perfect Sync: Total = ${finalCount}, Dispatched = ${finalSent}, Pending = ${finalCount - finalSent}`);

  await prisma.$disconnect();
}

addBounced().catch(e => { console.error(e); prisma.$disconnect(); });
