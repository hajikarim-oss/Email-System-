const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const campaigns = await prisma.campaign.count();
    const emailEvents = await prisma.emailEvent.count();
    const leads = await prisma.lead.count();
    const suppressed = await prisma.suppressedEmail.count();
    
    console.log('=== DATABASE VERIFICATION ===');
    console.log(`✓ Total Campaigns: ${campaigns}`);
    console.log(`✓ Total Email Events (webhooks): ${emailEvents}`);
    console.log(`✓ Total Leads: ${leads}`);
    console.log(`✓ Total Suppressed Emails: ${suppressed}`);
    
    // Get event types
    const eventTypes = await prisma.emailEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true }
    });
    
    if (eventTypes.length > 0) {
      console.log('\n=== WEBHOOK EVENT TYPES ===');
      eventTypes.forEach(evt => {
        console.log(`${evt.eventType}: ${evt._count.eventType}`);
      });
    }
    
    // Get recent campaigns
    const recentCampaigns = await prisma.campaign.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, status: true, userId: true, createdAt: true }
    });
    
    if (recentCampaigns.length > 0) {
      console.log('\n=== RECENT CAMPAIGNS ===');
      recentCampaigns.forEach(c => {
        console.log(`${c.name} (${c.status}) - Created: ${c.createdAt.toISOString().split('T')[0]}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
