const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  try {
    console.log('🔍 DIAGNOSING SMARTLEAD SYNC ISSUE\n');

    // 1. Check all campaigns in database
    console.log('1️⃣ CAMPAIGNS IN DATABASE:');
    const allCampaigns = await prisma.campaign.findMany({
      include: {
        user: { select: { email: true } },
        _count: { select: { leads: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (allCampaigns.length === 0) {
      console.log('   ❌ NO CAMPAIGNS FOUND');
    } else {
      allCampaigns.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name}`);
        console.log(`      Owner: ${c.user.email}`);
        console.log(`      Smartlead ID: ${c.providerCampaignId || '❌ NOT SET'}`);
        console.log(`      Leads: ${c._count.leads}`);
        console.log(`      Status: ${c.status}`);
      });
    }

    // 2. Check webhook events
    console.log('\n2️⃣ WEBHOOK EVENTS RECEIVED:');
    const eventCount = await prisma.emailEvent.count();
    console.log(`   Total events: ${eventCount}`);

    if (eventCount > 0) {
      const eventTypes = await prisma.emailEvent.groupBy({
        by: ['eventType'],
        _count: { id: true }
      });
      eventTypes.forEach(et => {
        console.log(`   - ${et.eventType}: ${et._count.id}`);
      });
    }

    // 3. Check leads
    console.log('\n3️⃣ LEADS IN DATABASE:');
    const leadCount = await prisma.lead.count();
    console.log(`   Total leads: ${leadCount}`);

    // 4. Summary
    console.log('\n📋 DIAGNOSIS:');
    if (allCampaigns.length > 0) {
      const hasSmartleadId = allCampaigns.some(c => c.providerCampaignId);
      const hasLeads = allCampaigns.some(c => c._count.leads > 0);
      const hasEvents = eventCount > 0;

      console.log(`   ✓ Campaign exists: YES`);
      console.log(`   ${hasSmartleadId ? '✓' : '❌'} Smartlead ID linked: ${hasSmartleadId ? 'YES' : 'NO'}`);
      console.log(`   ${hasLeads ? '✓' : '❌'} Leads synced: ${hasLeads ? 'YES' : 'NO'}`);
      console.log(`   ${hasEvents ? '✓' : '❌'} Webhook events received: ${hasEvents ? 'YES' : 'NO'}`);

      if (!hasLeads && eventCount === 0) {
        console.log('\n⚠️  ISSUE: Campaign created but no leads or webhook data synced');
        console.log('   ACTION: Need to manually sync leads and webhook data from Smartlead');
      }
    } else {
      console.log('   ❌ NO CAMPAIGNS IN DATABASE');
      console.log('\n⚠️  ISSUE: Campaign not saved to database');
      console.log('   ACTION: Need to create campaign record in database');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
