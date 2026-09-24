const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const leads = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    skip: 45,
    take: 15,
    select: { id: true, email: true, firstName: true, domain: true, status: true, totalOutbound: true }
  });
  console.log('Current DB leads 45-60:');
  console.log(leads);
  await prisma.$disconnect();
}
check().catch(err => { console.error(err); prisma.$disconnect(); });
