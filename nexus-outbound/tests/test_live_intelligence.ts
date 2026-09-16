import { PrismaClient, OutreachState, RecencyBucket, ReplyClass } from "@prisma/client";
import { ingestEmailEvent } from "../src/lib/intelligence/ingest-event";
import { buildContactPromptContext } from "../src/lib/ai/context-builder";
import { evaluateSegmentCount } from "../src/app/api/v1/contacts/segments/route";
import { runDailyRefresh } from "../scripts/daily_refresh";

const prisma = new PrismaClient();

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("  RUNNING LIVE EMAIL INTELLIGENCE TEST SUITE     ");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`• ${name}... `);
    try {
      await fn();
      console.log("PASSED ✔");
      passed++;
    } catch (err: any) {
      console.log("FAILED ✖");
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // TEST 1: Database Population & Entity Counts
  await test("Verify PostgreSQL Entity Counts and Integrity", async () => {
    const [msgCount, leadCount, brandCount, suppCount] = await Promise.all([
      prisma.emailMessage.count(),
      prisma.lead.count(),
      prisma.brand.count(),
      prisma.suppressedEmail.count(),
    ]);

    assert(msgCount >= 86301, `Expected >= 86301 messages, found ${msgCount}`);
    assert(leadCount >= 28070, `Expected >= 28070 leads, found ${leadCount}`);
    assert(brandCount >= 14900, `Expected >= 14900 brands, found ${brandCount}`);
    assert(suppCount >= 3730, `Expected >= 3730 suppressed emails, found ${suppCount}`);
  });

  // TEST 2: Strict Quarantine Isolation
  await test("Strict Quarantine Isolation: Burned leads never leak into clean prospects", async () => {
    const burnedSuppressed = await prisma.suppressedEmail.findMany({
      take: 200,
      select: { email: true },
    });

    const suppressedEmails = burnedSuppressed.map((s) => s.email.toLowerCase().trim());

    // Query active clean leads
    const leakingLeads = await prisma.lead.findMany({
      where: {
        email: { in: suppressedEmails },
        isBurned: false,
      },
    });

    assert(leakingLeads.length === 0, `Quarantine leak detected: ${leakingLeads.length} burned leads marked as clean`);
  });

  // TEST 3: Own Domain Exclusion
  await test("Own Domain Exclusion: theboredmonkey.com internal emails excluded from prospect leads", async () => {
    const internalLeads = await prisma.lead.findMany({
      where: {
        domain: { in: ["theboredmonkey.com", "theboredmonkey.in"] },
        isBurned: false,
      },
    });

    assert(internalLeads.length === 0, `Found ${internalLeads.length} internal leads in clean prospects`);
  });

  // TEST 4: Live Event Ingestion & Idempotency
  await test("Live Event Ingestion: Idempotency and State Convergence", async () => {
    const testMessageId = `test_msg_${Date.now()}`;
    const testContactEmail = `test.prospect.${Date.now()}@acme-corp.com`;

    const eventPayload = {
      messageId: testMessageId,
      contactEmail: testContactEmail,
      senderEmail: "suraj@theboredmonkey.com",
      senderName: "Suraj Maurya",
      subject: "Acme Corp Growth Strategy 2026",
      bodyHook: "Hello Acme team, following up on your Q3 marketing milestones...",
      status: "completed" as const,
      createdAt: new Date(),
    };

    // First Ingestion
    const firstResult = await ingestEmailEvent(eventPayload);
    assert(firstResult.action === "inserted", "First ingest should insert record");

    // Second Ingestion (Idempotency Check)
    const secondResult = await ingestEmailEvent(eventPayload);
    assert(secondResult.action === "skipped_duplicate", "Duplicate ingest must be skipped");

    // Verify Lead state was created
    const lead = await prisma.lead.findFirst({
      where: { email: testContactEmail },
    });
    assert(lead !== null, "Lead record must be created");
    assert(lead?.lastSubject === "Acme Corp Growth Strategy 2026", "Lead lastSubject mismatch");
    assert(lead?.outreachState === OutreachState.DO_NOT_CONTACT_RECENTLY, "Recent contact should be DO_NOT_CONTACT_RECENTLY");

    // Clean up test records
    await prisma.emailMessage.deleteMany({ where: { id: testMessageId } });
    await prisma.lead.deleteMany({ where: { email: testContactEmail } });
    await prisma.brand.deleteMany({ where: { domain: "acme-corp.com" } });
  });

  // TEST 5: Temporal State Drift Job Execution
  await test("Daily Drift Refresh: Computes temporal buckets without errors", async () => {
    const refreshResult = await runDailyRefresh();
    assert(refreshResult.leadsUpdated >= 28000, `Expected >= 28000 leads updated, got ${refreshResult.leadsUpdated}`);
    assert(refreshResult.brandsUpdated >= 14000, `Expected >= 14000 brands updated, got ${refreshResult.brandsUpdated}`);
  });

  // TEST 6: Segmentation and Parametric Filter Evaluation
  await test("Segmentation Engine: Multi-dimensional filter count evaluation", async () => {
    const dormantRepliedFilter = {
      outreach_states: [OutreachState.DORMANT_REPLIED],
      reply_classifications: [ReplyClass.INTERESTED],
      is_burned: false,
    };

    const count = await evaluateSegmentCount(dormantRepliedFilter);
    assert(count > 0, `Expected > 0 dormant replied candidates, found ${count}`);

    // Create and delete test saved segment
    const segment = await prisma.contactSegment.create({
      data: {
        name: "Test Segment Automated",
        filterJson: dormantRepliedFilter,
        lastCount: count,
        lastRunAt: new Date(),
      },
    });

    assert(segment.id !== null, "Segment creation failed");
    await prisma.contactSegment.delete({ where: { id: segment.id } });
  });

  // TEST 7: LLM Context Builder
  await test("LLM Context Builder: Generates structured context and guidelines for Atomberg", async () => {
    const context = await buildContactPromptContext("arindam@atomberg.com");
    assert(context !== null, "Context for arindam@atomberg.com returned null");
    if (!context) throw new Error("Context is null");
    assert(context.company === "ATOMBERG", `Company mismatch: ${context.company}`);
    assert(context.temporalState === OutreachState.DORMANT_REPLIED, `State mismatch: ${context.temporalState}`);
    assert(context.contextBlock.includes("Atomberg Intellon"), "Context block missing opening hook keywords");
    assert(context.contextBlock.includes("Outreach state: dormant_replied"), "Context block missing outreach state");
    assert(context.promptGuidelines.length > 0, "Prompt guidelines should not be empty");
  });

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test runner error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
