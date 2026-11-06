import { pgQuery } from "../server/pg";

async function check() {
  console.log("Analyzing EmailMessage table...");
  const total = await pgQuery<{ count: number }>(`SELECT count(*)::int as count FROM "EmailMessage"`);
  console.log("Total EmailMessage rows:", total[0]?.count);

  const senders = await pgQuery<{ senderEmail: string; count: number }>(`
    SELECT "senderEmail", count(*)::int as count 
    FROM "EmailMessage" 
    GROUP BY "senderEmail" 
    ORDER BY count DESC 
    LIMIT 20
  `);
  console.log("\nTop 20 senderEmail values in EmailMessage:");
  console.table(senders);

  const nonTroop = await pgQuery<{ count: number }>(`
    SELECT count(*)::int as count 
    FROM "EmailMessage" 
    WHERE lower("senderEmail") NOT LIKE '%@tbmtroop%'
  `);
  console.log("\nEmailMessage where lower(senderEmail) NOT LIKE '%@tbmtroop%':", nonTroop[0]?.count);

  const nullSender = await pgQuery<{ count: number }>(`
    SELECT count(*)::int as count 
    FROM "EmailMessage" 
    WHERE "senderEmail" IS NULL OR "senderEmail" = ''
  `);
  console.log("EmailMessage where senderEmail IS NULL or empty:", nullSender[0]?.count);

  const dateStats = await pgQuery<{ min_date: string; max_date: string; last_7d: number }>(`
    SELECT min("createdAt")::text as min_date,
           max("createdAt")::text as max_date,
           count(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days')::int as last_7d
    FROM "EmailMessage"
  `);
  console.log("\nEmailMessage Date distribution:", dateStats[0]);

  // Now check Lead lastContactedAt
  const leadStats = await pgQuery<{ min_date: string; max_date: string; last_7d: number }>(`
    SELECT min("lastContactedAt")::text as min_date,
           max("lastContactedAt")::text as max_date,
           count(*) FILTER (WHERE "lastContactedAt" >= NOW() - INTERVAL '7 days')::int as last_7d
    FROM "Lead"
  `);
  console.log("\nLead lastContactedAt distribution:", leadStats[0]);

  // Now check EmailEvent
  const eventStats = await pgQuery<{ count: number; last_7d: number }>(`
    SELECT count(*)::int as count,
           count(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days')::int as last_7d
    FROM "EmailEvent"
  `);
  console.log("\nEmailEvent distribution:", eventStats[0]);

  process.exit(0);
}

check().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

