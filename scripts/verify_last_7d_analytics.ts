import { pgQuery } from "../server/pg";
import { scopeFor } from "../server/scope";
import { getDashboard } from "../server/analytics";

async function verify() {
  console.log("=================================================");
  console.log("📊 Verifying Last 7 Days Analytics from Database");
  console.log("=================================================\n");

  // Monu in TheBoredMonkey Workspace (All Team Members view)
  const masterUser = {
    id: "cmtr9pp8t0000cygeyjpsz5lt",
    email: "monu@theboredmonkey.com",
    role: "MASTER"
  };

  const scope = scopeFor(masterUser);
  console.log("Scope Context:", scope);

  // 1. Check campaigns associated with leads contacted in last 7 days
  const leadCampaigns = await pgQuery<{ campaignId: string | null; count: number }>(`
    SELECT l."campaignId", count(*)::int as count
    FROM "Lead" l
    WHERE l."lastContactedAt" >= NOW() - INTERVAL '7 days'
    GROUP BY l."campaignId"
    ORDER BY count DESC
    LIMIT 10
  `);
  console.log("\nTop campaignId in Lead for last 7 days:");
  console.table(leadCampaigns);

  // 2. Check if those campaignIds exist in Campaign table
  const matchedCampaigns = await pgQuery<{ id: string; name: string; userId: string; providerCampaignId: string }>(`
    SELECT c.id, c.name, c."userId", c."providerCampaignId"
    FROM "Campaign" c
    WHERE c.id IN (
      SELECT DISTINCT l."campaignId" 
      FROM "Lead" l 
      WHERE l."lastContactedAt" >= NOW() - INTERVAL '7 days' AND l."campaignId" IS NOT NULL
    )
    OR c."providerCampaignId" IN (
      SELECT DISTINCT l."campaignId" 
      FROM "Lead" l 
      WHERE l."lastContactedAt" >= NOW() - INTERVAL '7 days' AND l."campaignId" IS NOT NULL
    )
    LIMIT 10
  `);
  console.log("\nMatched campaigns in Campaign table:");
  console.table(matchedCampaigns);

  // 3. Test readActivityRows via getDashboard
  console.log("\n⏳ Fetching 7-Day Dashboard Analytics via API query engine...");
  const dashboard = await getDashboard({ period: "7d" }, pgQuery, scope);

  console.log("\n-------------------------------------------------");
  console.log("📈 DASHBOARD OVERALL STATS (Last 7 Days):");
  console.log("-------------------------------------------------");
  console.log("  Total Emails Sent :", dashboard.overall_stats?.total_emails_sent);
  console.log("  Total Opens       :", dashboard.overall_stats?.total_opens, `(${dashboard.overall_stats?.open_rate}%)`);
  console.log("  Total Replies     :", dashboard.overall_stats?.total_replies, `(${dashboard.overall_stats?.reply_rate}%)`);
  console.log("  Total Bounces     :", dashboard.overall_stats?.total_bounces, `(${dashboard.overall_stats?.bounce_rate}%)`);
  console.log("  Today Sent        :", dashboard.today_sent);
  console.log("  Daily Capacity    :", dashboard.daily_capacity);

  console.log("\n-------------------------------------------------");
  console.log("📅 DAY-TO-DAY TREND (What Frontend Charts Render):");
  console.log("-------------------------------------------------");
  let weekSentSum = 0;
  dashboard.daily_trend?.forEach((day: any) => {
    weekSentSum += day.sent || 0;
    console.log(`  ${day.date} -> Sent: ${(day.sent || 0).toString().padStart(5)} | Opens: ${(day.opens || 0).toString().padStart(4)} | Replies: ${(day.replies || 0).toString().padStart(2)} | Bounces: ${(day.bounces || 0).toString().padStart(2)}`);
  });
  console.log(`\n  Sum of daily trends: ${weekSentSum} emails sent`);

  console.log("\n-------------------------------------------------");
  console.log("🔥 TOP ACTIVE CAMPAIGNS (Last 7 Days):");
  console.log("-------------------------------------------------");
  dashboard.top_campaigns?.slice(0, 5).forEach((c: any, idx: number) => {
    console.log(`  ${idx + 1}. [${c.name}] -> Sent: ${c.emails_sent} | Opens: ${c.open_rate}%`);
  });

  console.log("\n=================================================");
  console.log("✅ Check Complete!");
  console.log("=================================================");
  process.exit(0);
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
