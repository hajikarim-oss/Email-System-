const path = require('path');
const { PrismaClient } = require(path.resolve('./nexus-outbound/node_modules/@prisma/client'));
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true' } }
});

const newAccounts = [
  {
    email: 'vatsal.vadecha@theboredmonkey.com',
    name: 'Vatsal Vadecha',
    apiKey: '39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6',
    mailboxId: '23457457',
  },
  {
    email: 'preeti.karki@theboredmonkey.com',
    name: 'Preeti Karki',
    apiKey: 'e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt',
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
