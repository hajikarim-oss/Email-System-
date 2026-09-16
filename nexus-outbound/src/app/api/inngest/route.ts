import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest";
import { processEmailEventJob } from "@/lib/jobs/process-email-event";
import { launchCampaignJob } from "@/lib/jobs/launch-campaign";
import { dailyIntelligenceRefreshJob } from "@/lib/jobs/daily-intelligence-refresh";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processEmailEventJob, launchCampaignJob, dailyIntelligenceRefreshJob],
});

