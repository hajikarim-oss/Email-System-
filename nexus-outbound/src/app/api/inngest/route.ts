import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest";
import { processEmailEventJob } from "@/lib/jobs/process-email-event";
import { launchCampaignJob } from "@/lib/jobs/launch-campaign";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processEmailEventJob, launchCampaignJob],
});
