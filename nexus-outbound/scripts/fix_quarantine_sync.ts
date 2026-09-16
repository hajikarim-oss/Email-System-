import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== SYNCHRONIZING QUARANTINE BURNED LEADS IN POSTGRESQL ===");

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Lead"
    SET 
      "isBurned" = true,
      "outreachState" = 'BURNED'::"OutreachState",
      "status" = 'BOUNCED'::"LeadStatus"
    WHERE "email" IN (SELECT "email" FROM "SuppressedEmail");
  `);

  console.log(`Successfully marked ${updated} leads as quarantined (isBurned = true).`);

  const cleanCount = await prisma.lead.count({ where: { isBurned: false } });
  const burnedCount = await prisma.lead.count({ where: { isBurned: true } });

  console.log(`Clean Active Prospects in Lead DB : ${cleanCount}`);
  console.log(`Quarantined Burned in Lead DB      : ${burnedCount}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
