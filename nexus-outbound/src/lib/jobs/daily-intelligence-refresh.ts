import { inngest } from "./inngest";
import { runDailyRefresh } from "../../../scripts/daily_refresh";

/**
 * Daily Temporal Drift Refresh Function
 * 
 * Scheduled to run every day at 00:05 UTC.
 * Recomputes daysSinceLastContact, advances recency buckets,
 * transitions outreach states, and updates saved segment counts.
 */
export const dailyIntelligenceRefreshJob = inngest.createFunction(
  {
    id: "daily-intelligence-refresh",
    name: "Daily Email Intelligence Drift Refresh",
    retries: 3,
    triggers: [{ cron: "TZ=UTC 5 0 * * *" }],
  },
  async ({ step }: any) => {
    const result = await step.run("refresh-temporal-drift", async () => {
      console.log("[Inngest] Starting automated daily temporal intelligence refresh...");
      const stats = await runDailyRefresh();
      console.log("[Inngest] Daily refresh complete:", stats);
      return stats;
    });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      stats: result,
    };
  }
);
