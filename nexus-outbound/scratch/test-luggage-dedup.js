const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const content = fs.readFileSync('c:/Users/neola/Downloads/New Leads 101 - Luggage.csv', 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = lines.slice(1).map(l => {
    const parts = l.split(',');
    return {
      firstName: parts[0]?.trim() || '',
      title: parts[1]?.trim() || '',
      company: parts[2]?.trim() || '',
      category: parts[3]?.trim() || '',
      email: parts[parts.length - 1]?.trim().toLowerCase()
    };
  });

  const suppressed = await prisma.suppressedEmail.findMany({ select: { email: true } });
  const suppSet = new Set(suppressed.map(s => s.email.toLowerCase()));
  console.log('Total suppressed emails in DB:', suppSet.size);

  const seen = new Set();
  const valid = [];
  const blocked = [];
  rows.forEach(r => {
    if (r.email && r.email.includes('@')) {
      if (seen.has(r.email)) return;
      seen.add(r.email);
      if (suppSet.has(r.email)) {
        blocked.push(r);
      } else {
        valid.push(r);
      }
    }
  });

  console.log('Total unique in Luggage CSV:', seen.size);
  console.log('Quarantined/Suppressed in DB:', blocked.length);
  console.log('Clean valid leads after suppression:', valid.length);

  // Check if any leads have category or company filters
  const byCategory = {};
  valid.forEach(v => {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  });
  console.log('By category:', byCategory);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
