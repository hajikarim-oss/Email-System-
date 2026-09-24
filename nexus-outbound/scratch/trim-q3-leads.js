const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function trim() {
  const allLeads = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    select: { id: true, totalOutbound: true }
  });
  console.log('Total currently in Q3:', allLeads.length);
  if (allLeads.length > 1785) {
    const toRemove = allLeads.filter(l => l.totalOutbound === 0).slice(0, allLeads.length - 1785);
    await prisma.lead.updateMany({
      where: { id: { in: toRemove.map(l => l.id) } },
      data: { campaignId: null }
    });
  }
  const final = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj' } });
  const sent = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj', totalOutbound: { gt: 0 } } });
  console.log('Final Q3 leads count:', final, 'Dispatched:', sent, 'Pending:', final - sent);
  await prisma.$disconnect();
}
trim().catch(err => { console.error(err); prisma.$disconnect(); });
