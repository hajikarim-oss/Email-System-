import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function importInBatches<T>(
  name: string,
  filePath: string,
  batchSize: number,
  insertFn: (chunk: T[]) => Promise<number>
) {
  console.log(`\n--- Starting import for ${name} from ${filePath} ---`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const records: T[] = JSON.parse(raw);
  console.log(`Total ${name} records to process: ${records.length}`);

  let totalImported = 0;
  const startTime = Date.now();

  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const count = await insertFn(chunk);
    totalImported += count;
    const pct = Math.min(100, Math.round(((i + chunk.length) / records.length) * 100));
    process.stdout.write(`\r[${name}] Processed ${i + chunk.length}/${records.length} (${pct}%) | Inserted: ${totalImported}`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✔ Completed ${name}: ${totalImported} inserted in ${durationSec}s`);
}

async function main() {
  console.log("=================================================");
  console.log("  MIGRATING EMAIL INTELLIGENCE TO POSTGRESQL     ");
  console.log("=================================================");

  const exportsDir = path.resolve(__dirname, "../../data/exports");

  // 1. Migrate Brands
  const brandsPath = path.join(exportsDir, "brands_export.json");
  await importInBatches<any>("Brands", brandsPath, 1000, async (chunk) => {
    const result = await prisma.brand.createMany({
      data: chunk.map((b) => ({
        domain: b.domain,
        name: b.name,
        totalContacts: b.totalContacts,
        cleanContacts: b.cleanContacts,
        burnedContacts: b.burnedContacts,
        repliedContacts: b.repliedContacts,
        lastContactedAt: b.lastContactedAt ? new Date(b.lastContactedAt) : null,
        daysSinceLastContact: b.daysSinceLastContact,
        recencyBucket: b.recencyBucket,
        outreachState: b.outreachState,
        tags: b.tags,
      })),
      skipDuplicates: true,
    });
    return result.count;
  });

  // 2. Migrate Leads
  const leadsPath = path.join(exportsDir, "leads_export.json");
  await importInBatches<any>("Leads", leadsPath, 1000, async (chunk) => {
    const result = await prisma.lead.createMany({
      data: chunk.map((l) => ({
        email: l.email,
        firstName: l.firstName,
        lastName: l.lastName,
        domain: l.domain,
        source: l.source,
        status: l.status,
        lastMessageAt: l.lastMessageAt ? new Date(l.lastMessageAt) : null,
        lastSubject: l.lastSubject,
        lastBodyHook: l.lastBodyHook,
        lastSender: l.lastSender,
        lastCampaign: l.lastCampaign,
        lastOutcome: l.lastOutcome,
        totalMessages: l.totalMessages,
        totalOutbound: l.totalOutbound,
        totalInbound: l.totalInbound,
        totalReplied: l.totalReplied,
        totalBounced: l.totalBounced,
        totalSpam: l.totalSpam,
        firstContactedAt: l.firstContactedAt ? new Date(l.firstContactedAt) : null,
        lastContactedAt: l.lastContactedAt ? new Date(l.lastContactedAt) : null,
        daysSinceFirstContact: l.daysSinceFirstContact,
        daysSinceLastContact: l.daysSinceLastContact,
        recencyBucket: l.recencyBucket,
        outreachState: l.outreachState,
        isBurned: l.isBurned,
        isDormant: l.isDormant,
        isReengagementCandidate: l.isReengagementCandidate,
        replyClassification: l.replyClassification,
        tags: l.tags,
        customData: l.customData,
        intelligenceUpdatedAt: new Date(l.intelligenceUpdatedAt),
      })),
      skipDuplicates: true,
    });
    return result.count;
  });

  // 3. Migrate Messages (Layer A)
  const messagesPath = path.join(exportsDir, "messages_export.json");
  await importInBatches<any>("EmailMessages", messagesPath, 1000, async (chunk) => {
    const result = await prisma.emailMessage.createMany({
      data: chunk.map((m) => ({
        id: m.id,
        providerThreadId: m.providerThreadId,
        providerMessageId: m.providerMessageId,
        contactEmail: m.contactEmail,
        brandDomain: m.brandDomain,
        senderEmail: m.senderEmail,
        senderName: m.senderName,
        direction: m.direction,
        subjectRaw: m.subjectRaw,
        subjectNormalized: m.subjectNormalized,
        bodyHook: m.bodyHook,
        bodyFull: m.bodyFull,
        campaignRaw: m.campaignRaw,
        campaignClean: m.campaignClean,
        stepId: m.stepId,
        touchId: m.touchId,
        status: m.status,
        bounced: m.bounced,
        spamBlocked: m.spamBlocked,
        replied: m.replied,
        replyClassification: m.replyClassification,
        failureReason: m.failureReason,
        createdAt: new Date(m.createdAt),
        source: m.source,
        isExcluded: m.isExcluded,
      })),
      skipDuplicates: true,
    });
    return result.count;
  });

  // Verification Counts
  const [totalBrands, totalLeads, totalMessages, totalSuppressed] = await Promise.all([
    prisma.brand.count(),
    prisma.lead.count(),
    prisma.emailMessage.count(),
    prisma.suppressedEmail.count(),
  ]);

  console.log("\n=================================================");
  console.log("  POSTGRESQL INTELLIGENCE MIGRATION COMPLETE     ");
  console.log("=================================================");
  console.log(`  Brands in DB         : ${totalBrands}`);
  console.log(`  Leads in DB          : ${totalLeads}`);
  console.log(`  EmailMessages in DB  : ${totalMessages}`);
  console.log(`  Suppressed (Burned)  : ${totalSuppressed}`);
  console.log("=================================================");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
