const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
  console.log('--- FIRST 10 LEADS (ORDERED BY lastContactedAt asc, createdAt asc) ---');
  const first10 = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    take: 10,
    orderBy: [{ lastContactedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, firstName: true, lastName: true, email: true, domain: true, customData: true, status: true, totalOutbound: true, lastSender: true }
  });
  first10.forEach((l, i) => {
    const comp = l.customData?.company || l.domain;
    console.log(`${i+1}. ${l.firstName || ''} ${l.lastName || ''} | ${l.email} | ${comp} | status: ${l.status} | sender: ${l.lastSender}`);
  });

  console.log('\n--- BOUNDARY LEADS (INDEX 44 to 53) ---');
  const boundary = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    skip: 44,
    take: 10,
    orderBy: [{ lastContactedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, firstName: true, lastName: true, email: true, domain: true, customData: true, status: true, totalOutbound: true, lastSender: true }
  });
  boundary.forEach((l, i) => {
    const comp = l.customData?.company || l.domain;
    console.log(`${i+45}. ${l.firstName || ''} ${l.lastName || ''} | ${l.email} | ${comp} | status: ${l.status} | sender: ${l.lastSender}`);
  });

  console.log('\n--- RANDOM PENDING LEADS (INDEX 100 to 110) ---');
  const pendingSample = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    skip: 100,
    take: 10,
    orderBy: [{ lastContactedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, firstName: true, lastName: true, email: true, domain: true, customData: true, status: true, totalOutbound: true, lastSender: true }
  });
  pendingSample.forEach((l, i) => {
    const comp = l.customData?.company || l.domain;
    console.log(`${i+101}. ${l.firstName || ''} ${l.lastName || ''} | ${l.email} | ${comp} | status: ${l.status} | sender: ${l.lastSender}`);
  });

  const total = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj' } });
  const completed = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj', status: 'COMPLETED' } });
  const bounced = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj', status: 'BOUNCED' } });
  const queued = await prisma.lead.count({ where: { campaignId: 'cmp_1790233732719_dvlj', status: 'QUEUED' } });

  console.log(`\nTotals: Total=${total}, Completed=${completed}, Bounced=${bounced}, Queued=${queued}, Total Dispatched=${completed+bounced}`);

  await prisma.$disconnect();
}

inspect().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
