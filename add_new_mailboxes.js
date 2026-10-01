const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.resolve('./nexus-outbound/node_modules/@prisma/client'));

// Secrets live in .env (git-ignored), never in this script.
function envOrFile(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env', 'nexus-outbound/.env.local', 'nexus-outbound/.env']) {
    try {
      const m = fs.readFileSync(path.resolve(f), 'utf8').match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+)\\s*$', 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch (e) { /* no env file here */ }
  }
  return '';
}

const prisma = new PrismaClient({
  datasources: { db: { url: envOrFile('DATABASE_URL') || undefined } }
});

const newAccounts = [
  {
    email: 'vatsal.vadecha@theboredmonkey.com',
    name: 'Vatsal Vadecha',
    apiKey: envOrFile('SMARTLEAD_API_KEY'),
    mailboxId: '23457457',
  },
  {
    email: 'preeti.karki@theboredmonkey.com',
    name: 'Preeti Karki',
    apiKey: envOrFile('SMARTLEAD_SECONDARY_API_KEY'),
    mailboxId: '23458016',
  }
];

async function main() {
  console.log('Upserting new mail accounts into Database...');
  
  for (const acc of newAccounts) {
    // 1. Upsert User
    const user = await prisma.user.upsert({
      where: { email: acc.email.toLowerCase() },
      update: {
        name: acc.name,
        smartleadApiKey: acc.apiKey,
      },
      create: {
        email: acc.email.toLowerCase(),
        name: acc.name,
        smartleadApiKey: acc.apiKey,
        role: 'TEAM_MEMBER',
      }
    });
    console.log(`[User] ${user.name} (${user.email}) -> ID: ${user.id}`);

    // 2. Upsert Mailbox
    const mailbox = await prisma.mailbox.upsert({
      where: { senderEmail: acc.email.toLowerCase() },
      update: {
        userId: user.id,
        provider: 'smartlead',
        providerMailboxId: acc.mailboxId,
        status: 'ACTIVE',
        dailySendLimit: 50,
      },
      create: {
        userId: user.id,
        senderEmail: acc.email.toLowerCase(),
        provider: 'smartlead',
        providerMailboxId: acc.mailboxId,
        status: 'ACTIVE',
        dailySendLimit: 50,
      }
    });
    console.log(`[Mailbox] ${mailbox.senderEmail} -> Smartlead ID: ${mailbox.providerMailboxId}, Status: ${mailbox.status}`);
  }

  // Display all active mailboxes in DB
  const allMailboxes = await prisma.mailbox.findMany({
    include: { user: { select: { name: true, email: true } } }
  });
  console.log('\n--- All Active Mailboxes in Database ---');
  allMailboxes.forEach(m => {
    console.log(`- ${m.user.name} <${m.senderEmail}> | Provider: ${m.provider} | Smartlead ID: ${m.providerMailboxId} | Limit: ${m.dailySendLimit}/day | Status: ${m.status}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
