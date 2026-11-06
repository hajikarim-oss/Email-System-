import { pgQuery } from "../server/pg";

async function breakdown() {
  console.log("==========================================================================");
  console.log("📅 DAY-BY-DAY EVENT BREAKDOWN IN EmailEvent (Past 10 Days)");
  console.log("==========================================================================\n");

  // 1. Grouped by Day and EventType
  const rows = await pgQuery<{
    day: string;
    eventType: string;
    count: number;
  }>(`
    SELECT 
      to_char("createdAt", 'YYYY-MM-DD') AS day,
      coalesce("eventType", 'UNKNOWN') AS "eventType",
      count(*)::int AS count
    FROM "EmailEvent"
    WHERE "createdAt" >= NOW() - INTERVAL '10 days'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 3 DESC
  `);

  if (rows.length === 0) {
    console.log("No EmailEvent rows found in the last 10 days.");
  } else {
    console.log("--------------------------------------------------------------------------");
    console.log("DATE        | EVENT TYPE                      | COUNT");
    console.log("--------------------------------------------------------------------------");
    rows.forEach(r => {
      console.log(
        `${r.day.padEnd(11)} | ${r.eventType.padEnd(31)} | ${r.count.toString().padStart(6)}`
      );
    });
    console.log("--------------------------------------------------------------------------");
  }

  // 2. Day-by-Day Aggregate Totals
  const dayTotals = await pgQuery<{
    day: string;
    totalEvents: number;
    sentEvents: number;
    openEvents: number;
    replyEvents: number;
    bounceEvents: number;
    otherEvents: number;
  }>(`
    SELECT 
      to_char("createdAt", 'YYYY-MM-DD') AS day,
      count(*)::int AS "totalEvents",
      count(*) FILTER (WHERE lower("eventType") IN ('sent', 'email_sent', 'emailsent'))::int AS "sentEvents",
      count(*) FILTER (WHERE lower("eventType") IN ('opened', 'open', 'email_open', 'email_opened'))::int AS "openEvents",
      count(*) FILTER (WHERE lower("eventType") IN ('replied', 'reply', 'email_reply', 'email_replied'))::int AS "replyEvents",
      count(*) FILTER (WHERE lower("eventType") IN ('bounced', 'bounce', 'email_bounce', 'hard_bounce', 'soft_bounce'))::int AS "bounceEvents",
      count(*) FILTER (WHERE lower("eventType") NOT IN (
        'sent', 'email_sent', 'emailsent',
        'opened', 'open', 'email_open', 'email_opened',
        'replied', 'reply', 'email_reply', 'email_replied',
        'bounced', 'bounce', 'email_bounce', 'hard_bounce', 'soft_bounce'
      ))::int AS "otherEvents"
    FROM "EmailEvent"
    WHERE "createdAt" >= NOW() - INTERVAL '10 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  console.log("\n==========================================================================");
  console.log("📊 SUMMARY BY DAY (Past 10 Days in EmailEvent)");
  console.log("==========================================================================");
  console.log("DATE        | TOTAL EVENTS | SENDS | OPENS | REPLIES | BOUNCES | OTHER");
  console.log("--------------------------------------------------------------------------");
  let grandTotal = 0;
  let grandSent = 0;
  let grandOpens = 0;
  let grandReplies = 0;
  let grandBounces = 0;

  dayTotals.forEach(d => {
    grandTotal += d.totalEvents;
    grandSent += d.sentEvents;
    grandOpens += d.openEvents;
    grandReplies += d.replyEvents;
    grandBounces += d.bounceEvents;

    console.log(
      `${d.day.padEnd(11)} | ` +
      `${d.totalEvents.toString().padStart(12)} | ` +
      `${d.sentEvents.toString().padStart(5)} | ` +
      `${d.openEvents.toString().padStart(5)} | ` +
      `${d.replyEvents.toString().padStart(7)} | ` +
      `${d.bounceEvents.toString().padStart(7)} | ` +
      `${d.otherEvents.toString().padStart(5)}`
    );
  });

  console.log("--------------------------------------------------------------------------");
  console.log(
    `TOTAL       | ${grandTotal.toString().padStart(12)} | ${grandSent.toString().padStart(5)} | ${grandOpens.toString().padStart(5)} | ${grandReplies.toString().padStart(7)} | ${grandBounces.toString().padStart(7)}`
  );
  console.log("==========================================================================\n");

  // 3. Distinct eventTypes present in the entire table
  const allEventTypes = await pgQuery<{ eventType: string; total: number; last10d: number }>(`
    SELECT 
      coalesce("eventType", 'NULL') AS "eventType",
      count(*)::int AS total,
      count(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '10 days')::int AS "last10d"
    FROM "EmailEvent"
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.log("All distinct eventType values in the entire EmailEvent table:");
  console.table(allEventTypes);

  process.exit(0);
}

breakdown().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

