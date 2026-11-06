import { pgQuery } from "../server/pg";
import https from "https";

const SMARTLEAD_KEY_PRIMARY = process.env.SMARTLEAD_API_KEY || "b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4";
const SMARTLEAD_KEY_SECONDARY = process.env.SMARTLEAD_SECONDARY_API_KEY || "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt";

function smartleadGet(path: string, apiKey: string): Promise<any> {
  return new Promise((resolve) => {
    const url = `https://server.smartlead.ai/api/v1${path}${path.includes("?") ? "&" : "?"}api_key=${apiKey}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

async function run() {
  console.log("=========================================================");
  console.log("🔍 INVESTIGATING 2,000+ MAILS PER DAY SENDING TELEMETRY");
  console.log("=========================================================\n");

  // 1. Database EmailEvent breakdown day by day
  console.log("1. EmailEvent counts by calendar day (last 10 days):");
  const eventsByDay = await pgQuery<{ day: string; eventType: string; count: number }>(`
    SELECT 
      to_char("createdAt", 'YYYY-MM-DD') AS day,
      "eventType",
      count(*)::int AS count
    FROM "EmailEvent"
    WHERE "createdAt" >= NOW() - INTERVAL '10 days'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 3 DESC
  `);
  console.table(eventsByDay);

  // 2. Database Lead lastContactedAt breakdown day by day
  console.log("\n2. Lead lastContactedAt counts by calendar day (last 10 days):");
  const leadsByDay = await pgQuery<{ day: string; count: number }>(`
    SELECT 
      to_char("lastContactedAt", 'YYYY-MM-DD') AS day,
      count(*)::int AS count
    FROM "Lead"
    WHERE "lastContactedAt" >= NOW() - INTERVAL '10 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);
  console.table(leadsByDay);

  // 3. Mailbox daily sending limits & sent_today
  console.log("\n3. Mailbox pool capacity and sends today:");
  const mailboxes = await pgQuery<{ email: string; limit: number; sent_today: number; status: string }>(`
    SELECT "senderEmail" as email, "dailySendLimit" as limit, "status"
    FROM "Mailbox"
    WHERE "status" = 'ACTIVE'
    ORDER BY 1
  `);
  console.table(mailboxes);
  const totalLimit = mailboxes.reduce((acc, m) => acc + (m.limit || 0), 0);
  console.log(`Total configured daily sending limit across all mailboxes: ${totalLimit}`);

  // 4. Query Smartlead API directly to see real Smartlead numbers
  console.log("\n4. Querying Smartlead API for active campaigns & statistics...");
  for (const [idx, key] of [SMARTLEAD_KEY_PRIMARY, SMARTLEAD_KEY_SECONDARY].entries()) {
    const keyLabel = idx === 0 ? "Primary (TBM)" : "Secondary (Troops/Preeti)";
    console.log(`\nChecking Smartlead Account: ${keyLabel}...`);
    const campaigns = await smartleadGet("/campaigns", key);
    if (Array.isArray(campaigns)) {
      console.log(`  Found ${campaigns.length} campaigns on Smartlead.`);
      const active = campaigns.filter((c: any) => c.status === "ACTIVE" || c.status === "START");
      console.log(`  Active campaigns: ${active.length}`);
      
      const statsList: any[] = [];
      for (const c of active.slice(0, 10)) {
        const stats = await smartleadGet(`/campaigns/${c.id}/analytics`, key);
        statsList.push({
          id: c.id,
          name: c.name?.slice(0, 30),
          status: c.status,
          sent: stats?.sent_count || 0,
          opens: stats?.open_count || 0,
          replies: stats?.reply_count || 0,
        });
      }
      console.table(statsList);
    } else {
      console.log("  Could not fetch campaigns (check API key or network).");
    }
  }

  process.exit(0);
}

run().catch(err => {
  console.error("Investigation error:", err);
  process.exit(1);
});

