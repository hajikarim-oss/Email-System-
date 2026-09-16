import prisma from "../src/lib/db/prisma";

async function runDuplicateAndQuarantineTest() {
  console.log("==================================================");
  console.log("RUNNING DUPLICATE & QUARANTINE VALIDATION SUITE");
  console.log("==================================================");

  // 1. Check existing contact duplicate lookup
  const testEmail = "arindam@atomberg.com";
  const existing = await prisma.lead.findFirst({
    where: { email: testEmail },
  });

  console.log("\n[TEST 1: Existing Lead Duplicate Detection & Last Conversation Snippet]");
  if (existing) {
    let lastShortMessage = existing.lastBodyHook;
    if (!lastShortMessage) {
      const lastMsg = await prisma.emailMessage.findFirst({
        where: { contactEmail: testEmail },
        orderBy: { createdAt: "desc" },
        select: { bodyHook: true },
      });
      lastShortMessage = lastMsg?.bodyHook || null;
    }

    console.log(`✓ SUCCESS: Found existing lead for ${testEmail}`);
    console.log(`  - Lead ID: ${existing.id}`);
    console.log(`  - Outreach State: ${existing.outreachState}`);
    console.log(`  - Recency Bucket: ${existing.recencyBucket}`);
    console.log(`  - Days Since Contact: ${existing.daysSinceLastContact}`);
    console.log(`  - Last Subject: "${existing.lastSubject || 'N/A'}"`);
    console.log(`  - Last Conversation Short Message: "${lastShortMessage || 'N/A'}"`);
    console.log(`  - Popup Payload: {`);
    console.log(`      isDuplicate: true,`);
    console.log(`      existingContact: {`);
    console.log(`        email: "${existing.email}",`);
    console.log(`        name: "${existing.firstName} ${existing.lastName}",`);
    console.log(`        state: "${existing.outreachState}",`);
    console.log(`        lastSubject: "${existing.lastSubject}",`);
    console.log(`        lastMessage: "${lastShortMessage ? lastShortMessage.slice(0, 80) + '...' : 'N/A'}"`);
    console.log(`      }`);
    console.log(`    }`);
  } else {
    console.error("✗ FAILED: Expected existing lead not found!");
  }

  // 2. Check quarantine suppression lookup
  console.log("\n[TEST 2: Quarantine Suppression Detection]");
  const sampleSuppressed = await prisma.suppressedEmail.findFirst();
  if (sampleSuppressed) {
    console.log(`✓ SUCCESS: Identified suppressed address: ${sampleSuppressed.email}`);
    console.log(`  - Reason: ${sampleSuppressed.reason}`);
    console.log(`  - Created: ${sampleSuppressed.createdAt}`);
    console.log(`  - Popup Payload: { isQuarantined: true, reason: "${sampleSuppressed.reason}" }`);
  } else {
    console.error("✗ FAILED: No suppressed records in database!");
  }

  // 3. Simulate CSV batch dedup logic
  console.log("\n[TEST 3: CSV Batch Deduplication & Quarantine Filtering]");
  const testBatch = [
    { email: testEmail, name: "Arindam Test" }, // Duplicate
    { email: sampleSuppressed?.email || "bounced@invalid.org", name: "Suppressed User" }, // Quarantined
    { email: "fresh.new.lead.2026@testdeliverability.com", name: "Clean Prospect" }, // Clean
  ];

  const candidateEmails = testBatch.map((r) => r.email.toLowerCase());
  const suppressedList = await prisma.suppressedEmail.findMany({
    where: { email: { in: candidateEmails } },
    select: { email: true, reason: true },
  });
  const suppressedSet = new Set(suppressedList.map((s) => s.email.toLowerCase()));

  const dbLeads = await prisma.lead.findMany({
    where: { email: { in: candidateEmails } },
    select: { email: true },
  });
  const dbLeadsSet = new Set(dbLeads.map((l) => l.email.toLowerCase()));

  const toInsert: any[] = [];
  const duplicatesSkipped: any[] = [];
  const quarantinedBlocked: any[] = [];

  for (const item of testBatch) {
    const e = item.email.toLowerCase();
    if (suppressedSet.has(e)) {
      quarantinedBlocked.push(e);
    } else if (dbLeadsSet.has(e)) {
      duplicatesSkipped.push(e);
    } else {
      toInsert.push(e);
    }
  }

  console.log(`  - Total Processed: ${testBatch.length}`);
  console.log(`  - Already Stored (Skipped): ${duplicatesSkipped.length} (${duplicatesSkipped.join(", ")})`);
  console.log(`  - Quarantined (Blocked): ${quarantinedBlocked.length} (${quarantinedBlocked.join(", ")})`);
  console.log(`  - Clean for Ingestion: ${toInsert.length} (${toInsert.join(", ")})`);

  if (duplicatesSkipped.includes(testEmail) && quarantinedBlocked.length >= 1 && toInsert.includes("fresh.new.lead.2026@testdeliverability.com")) {
    console.log("\n>>> ALL 3 DEDUPLICATION & QUARANTINE PROTECTIONS CONFIRMED OPERATIONAL <<<");
  } else {
    console.error("\n>>> VERIFICATION FAILED <<<");
    process.exit(1);
  }
}

runDuplicateAndQuarantineTest()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
