const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function exportQ3() {
  const leads = await prisma.lead.findMany({
    where: { campaignId: 'cmp_1790233732719_dvlj' },
    orderBy: [
      { lastContactedAt: 'asc' },
      { createdAt: 'asc' }
    ]
  });
  console.log('Fetched Q3 leads from DB:', leads.length);
  
  const formatted = leads.map(l => {
    const isBounced = l.status === 'BOUNCED';
    const isCompleted = l.status === 'COMPLETED' || (l.totalOutbound > 0 && !isBounced);
    const isDispatched = isCompleted || isBounced;
    const cd = (l.customData && typeof l.customData === 'object') ? l.customData : {};
    const company = cd.company || l.domain || '';
    
    return {
      id: l.id,
      email: l.email,
      first_name: l.firstName || '',
      last_name: l.lastName || '',
      company: company,
      company_name: company,
      domain: l.domain || company,
      title: cd.title || 'Decision Maker',
      category: cd.category || 'Luggage',
      status: isCompleted ? 'completed' : isBounced ? 'bounced' : 'pending',
      tags: l.tags || ['outreach', 'luggage'],
      campaign_id: 'cmp_1790233732719_dvlj',
      campaigns: ['cmp_1790233732719_dvlj'],
      open_count: l.openCount || 0,
      click_count: l.clickCount || 0,
      reply_count: l.totalReplied || 0,
      bounce_count: l.bounceCount || 0,
      sent_by_mailbox: isDispatched ? (l.lastSender || 'vatsal.vadecha@theboredmonkey.com') : undefined,
      assigned_mailbox_id: isDispatched ? '23457457' : undefined,
      current_step: isDispatched ? 'Step 1 (Outreach)' : 'Ready for delivery',
      last_contacted_at: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
      custom_fields: {
        company: company,
        title: cd.title || 'Decision Maker',
        category: cd.category || 'Luggage'
      },
      campaign_lead: {
        status: isCompleted ? 'completed' : isBounced ? 'bounced' : 'pending',
        sent: isDispatched ? 1 : 0,
        opened: l.openCount || 0,
        machine_opened: 0,
        clicked: l.clickCount || 0,
        replied: l.totalReplied || 0,
        bounced: isBounced ? 1 : 0,
        current_step: isDispatched ? 'Step 1 (Outreach)' : 'Ready for delivery',
        sender: isDispatched ? (l.lastSender || 'vatsal.vadecha@theboredmonkey.com') : undefined,
        last_activity_at: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
        reply_snippet: null
      }
    };
  });

  fs.writeFileSync('web/src/lib/api/q3LuggageLeads.json', JSON.stringify(formatted, null, 2), 'utf8');
  console.log('Successfully wrote web/src/lib/api/q3LuggageLeads.json with', formatted.length, 'leads.');
  await prisma.$disconnect();
}

exportQ3().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
