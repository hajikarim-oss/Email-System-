import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function runDailyRefresh(): Promise<{
  leadsUpdated: number;
  brandsUpdated: number;
  segmentsRefreshed: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  console.log("=== EXECUTING DAILY TEMPORAL DRIFT REFRESH JOB ===");

  // 1. Recompute daysSinceLastContact, recencyBucket, and outreachState drift on Leads
  const updateLeadsSql = `
    UPDATE "Lead"
    SET 
      "daysSinceLastContact" = FLOOR(EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400)::integer,
      "recencyBucket" = CASE
        WHEN "lastContactedAt" IS NULL THEN 'NEVER_CONTACTED'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 7 THEN 'TOUCHED_THIS_WEEK'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 30 THEN 'TOUCHED_THIS_MONTH'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 90 THEN 'TOUCHED_THIS_QUARTER'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 180 THEN 'TOUCHED_LAST_6_MONTHS'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 365 THEN 'TOUCHED_LAST_YEAR'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 730 THEN 'DORMANT_1_TO_2_YEARS'::"RecencyBucket"
        ELSE 'DORMANT_OVER_2_YEARS'::"RecencyBucket"
      END,
      "outreachState" = CASE
        WHEN "isBurned" = true OR "bounceCount" > 0 OR "status" = 'BOUNCED' THEN 'BURNED'::"OutreachState"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 7 THEN 'DO_NOT_CONTACT_RECENTLY'::"OutreachState"
        WHEN "totalReplied" > 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 30 THEN 'WARM_ACTIVE'::"OutreachState"
        WHEN "totalReplied" > 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 180 THEN 'WARM_STALE'::"OutreachState"
        WHEN "totalReplied" > 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) > 180 AND "replyClassification" = 'INTERESTED' THEN 'DORMANT_REPLIED'::"OutreachState"
        WHEN "totalReplied" = 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) > 180 THEN 'COLD_REENGAGEMENT'::"OutreachState"
        WHEN "totalReplied" = 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 180 THEN 'IN_SEQUENCE'::"OutreachState"
        ELSE "outreachState"
      END,
      "isDormant" = CASE
        WHEN "lastContactedAt" IS NOT NULL AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) > 180 THEN true
        ELSE false
      END,
      "isReengagementCandidate" = CASE
        WHEN "isBurned" = true THEN false
        WHEN "totalReplied" > 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) > 180 AND "replyClassification" = 'INTERESTED' THEN true
        WHEN "totalReplied" = 0 AND (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) > 180 THEN true
        ELSE false
      END,
      "intelligenceUpdatedAt" = NOW()
    WHERE "lastContactedAt" IS NOT NULL;
  `;

  const leadsUpdated = await prisma.$executeRawUnsafe(updateLeadsSql);
  console.log(`[Daily Refresh] Updated temporal state for ${leadsUpdated} leads.`);

  // 2. Recompute Brand daysSinceLastContact, recencyBucket, outreachState
  const updateBrandsSql = `
    UPDATE "Brand"
    SET 
      "daysSinceLastContact" = FLOOR(EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400)::integer,
      "recencyBucket" = CASE
        WHEN "lastContactedAt" IS NULL THEN 'NEVER_CONTACTED'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 7 THEN 'TOUCHED_THIS_WEEK'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 30 THEN 'TOUCHED_THIS_MONTH'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 90 THEN 'TOUCHED_THIS_QUARTER'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 180 THEN 'TOUCHED_LAST_6_MONTHS'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 365 THEN 'TOUCHED_LAST_YEAR'::"RecencyBucket"
        WHEN (EXTRACT(EPOCH FROM (NOW() - "lastContactedAt")) / 86400) <= 730 THEN 'DORMANT_1_TO_2_YEARS'::"RecencyBucket"
        ELSE 'DORMANT_OVER_2_YEARS'::"RecencyBucket"
      END,
      "updatedAt" = NOW()
    WHERE "lastContactedAt" IS NOT NULL;
  `;
  const brandsUpdated = await prisma.$executeRawUnsafe(updateBrandsSql);
  console.log(`[Daily Refresh] Updated temporal state for ${brandsUpdated} brands.`);

  // 3. Refresh saved segment counts
  const segments = await prisma.contactSegment.findMany();
  let segmentsRefreshed = 0;
  for (const seg of segments) {
    try {
      // Re-evaluate count for segment
      const filter = seg.filterJson as any;
      const where: any = {};
      if (filter.recencyBuckets?.length) where.recencyBucket = { in: filter.recencyBuckets };
      if (filter.outreachStates?.length) where.outreachState = { in: filter.outreachStates };
      if (filter.replyClassifications?.length) where.replyClassification = { in: filter.replyClassifications };
      if (filter.isBurned !== undefined) where.isBurned = filter.isBurned;
      if (filter.isReengagementCandidate !== undefined) where.isReengagementCandidate = filter.isReengagementCandidate;
      
      const count = await prisma.lead.count({ where });
      await prisma.contactSegment.update({
        where: { id: seg.id },
        data: { lastCount: count, lastRunAt: new Date() },
      });
      segmentsRefreshed++;
    } catch (err) {
      console.error(`Failed to refresh segment ${seg.name}:`, err);
    }
  }
  console.log(`[Daily Refresh] Refreshed counts for ${segmentsRefreshed} saved segments.`);

  const durationMs = Date.now() - startTime;
  console.log(`✔ Daily refresh completed successfully in ${durationMs}ms.`);

  return {
    leadsUpdated,
    brandsUpdated,
    segmentsRefreshed,
    durationMs,
  };
}

if (require.main === module) {
  runDailyRefresh()
    .catch((err) => {
      console.error("Daily refresh error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
