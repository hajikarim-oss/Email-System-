import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("=== IMPORTING SUPPRESSION LIST TO NEXUS-OUTBOUND ===");
  const filePath = path.resolve(__dirname, "../../data/exports/suppression_list.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const records = JSON.parse(rawData);
  console.log(`Loaded ${records.length} records from ${filePath}`);

  // Test import first batch of 50 or full upsert
  let imported = 0;
  let skipped = 0;

  // Process in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const result = await prisma.suppressedEmail.createMany({
      data: chunk.map((r: any) => ({
        email: r.email.toLowerCase().trim(),
        reason: r.reason,
        source: r.source || "apollo_intelligence_quarantine",
        createdAt: new Date(r.createdAt || Date.now())
      })),
      skipDuplicates: true
    });
    imported += result.count;
  }

  console.log(`Successfully imported/verified ${imported} suppressed emails into Prisma!`);
  const totalInDb = await prisma.suppressedEmail.count();
  console.log(`Total SuppressedEmail records in database: ${totalInDb}`);
}

main()
  .catch((e) => {
    console.error("Import error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
